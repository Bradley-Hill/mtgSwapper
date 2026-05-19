"""
Views for Card management (CRUD + Scryfall integration).
"""

import base64
import io
import logging
import re

import numpy as np
import pytesseract
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Card
from .serializers import (
    CardSerializer,
    CardCreateFromScryfallSerializer,
    CardAutocompleteSerializer,
    CardGlobalSearchSerializer,
    CardListSerializer,
    DecklistImportSerializer,
)
from .scryfall_service import ScryfallService

logger = logging.getLogger(__name__)


# Matches: "4 Black Lotus" or "4 Black Lotus (VMA)" or "4 Black Lotus (VMA) 123"
# Group 1 → quantity, Group 2 → card name (everything up to optional set code in parens)
_DECKLIST_LINE_RE = re.compile(r"^(\d+)\s+([^(]+?)(?:\s*\(.*)?$")


def _find_card_top(img: Image.Image) -> int:
    """
    Locate the y-coordinate where the card's bright interior begins.

    MTG cards have a prominent black outer border (~20–40 greyscale). The card
    interior (including the name bar background) is always significantly
    brighter (>140). Scanning row means from the top of the image finds the
    first row where the average pixel value crosses that threshold.

    We only search the top third of the image: the card top can never be
    further down than that in any reasonable hand-held photo.

    Why numpy?
    arr.mean(axis=1) computes all row means in a single vectorised C operation
    (~0.5ms for a 4K image). The pure-Python equivalent — iterating rows with
    PIL ImageStat — would take ~100ms due to Python loop overhead.
    """
    grey = np.array(img.convert("L"))
    row_means = grey.mean(axis=1)  # shape: (height,)
    search_limit = max(1, len(row_means) // 3)
    for y in range(search_limit):
        if row_means[y] > 140:
            return y
    return 0  # fallback: assume card starts at the very top


def _extract_confident_words(img, config: str) -> str:
    """
    Run Tesseract via image_to_data and return only the words Tesseract
    is confident about (confidence score >= 40).

    image_to_data performs the exact same OCR pass as image_to_string —
    Tesseract already computes a per-word confidence score internally as part
    of the LSTM decode step. image_to_string simply discards those scores
    before returning. image_to_data exposes them, so there is zero extra
    compute cost: we get smarter filtering for free.

    Confidence scale:
      -1  : whitespace / block separator (never real text)
       0–39: Tesseract is guessing — typically frame decorations, mana cost
             symbols, noise artifacts that happen to look vaguely letter-shaped
      40–100: Tesseract saw clear glyph evidence — almost always real text

    Why 40 as the threshold?
    Empirically, card name characters read from a properly preprocessed strip
    score 60–99. Noise tokens from the green-channel preprocessed image score
    0–30. The gap between 30 and 60 is wide enough that 40 cleanly separates
    them without needing fine-tuning.

    Args:
        img: preprocessed PIL Image (green channel, contrast-enhanced, sharpened)
        config: Tesseract CLI flags string (e.g. "--psm 7 --oem 1")

    Returns:
        Space-joined string of high-confidence words only
    """
    data = pytesseract.image_to_data(
        img, config=config, output_type=pytesseract.Output.DICT
    )
    all_words = list(zip(data["text"], data["conf"]))
    logger.debug("[scan] %s all words+conf: %r", config, all_words)

    words = [
        text
        for text, conf in all_words
        if int(conf) >= 40 and text.strip()
    ]
    return " ".join(words)


def _preprocess_and_extract_text(image_bytes: bytes) -> str:
    """
    Preprocess card image and extract the card name using Tesseract OCR.

    Process:
    1. Load image from bytes and correct EXIF rotation (handles mobile photos)
    2. Crop to the name bar region — two paths depending on input:
       a. Pre-cropped strip (height < width × 0.5): the frontend guide already
          cropped to the name bar; use the full image as-is.
       b. Full card photo: use _find_card_top() to locate the card's top edge
          via row brightness scan, then crop to the top ~10% of card height.
    3. Normalise to 200px height — Tesseract LSTM works best when text is
       30–80px tall. Scaling ensures consistent input regardless of camera
       resolution or how far away the card was when photographed.
    4. Green channel extraction — replaces standard luminance greyscale.
       Red card frames and coloured backgrounds have high R, low G values
       and go very dark in the green channel. The cream name bar has high G
       (~215) and stays bright. Black text has low G and stays dark. This
       creates far cleaner contrast for Tesseract than a flat greyscale.
    5. Contrast ×1.5 + sharpen — widens the histogram gap and sharpens edges.
    6. Run Tesseract with --psm 7 (single text line) + --oem 1 (LSTM engine).
       Falls back to --psm 11 (sparse text) if psm 7 returns nothing.

    Why Tesseract instead of a deep-learning OCR engine?
    PaddleOCR 3.x (transformers engine) requires PyTorch + Torchvision
    at inference time. Neither is installed on Render free tier (512MB RAM).
    Tesseract is a C binary (~10MB apt package) that runs in ~50MB RAM,
    with no model downloads on cold start. MTG card names use a clean,
    consistent printed font — exactly the use case Tesseract excels at.

    Args:
        image_bytes: Raw image bytes from the uploaded photo

    Returns:
        Extracted card name text, or empty string if nothing detected
    """
    # PIL decode errors are intentionally NOT caught here — if the bytes
    # aren't a valid image, Image.open() raises and the exception propagates
    # up to scan(), which returns "Could not decode the uploaded image".
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)  # Auto-correct mobile EXIF rotation
    img = img.convert("RGB")

    width, height = img.size
    logger.info("[scan] Image loaded: size=%sx%s", width, height)

    # Determine whether we have a pre-cropped strip or a full card photo.
    #
    # The frontend guide crops the canvas to just the name bar band before
    # sending — that strip has height << width (typically height/width ≈ 0.16).
    # A full card photo held in portrait has height > width (ratio ≈ 1.3).
    # Threshold of 0.5 leaves comfortable separation between the two cases.
    if height < width * 0.5:
        # Already a name bar strip — no further cropping needed.
        logger.info("[scan] Pre-cropped strip detected (%sx%s), skipping card detection", width, height)
    else:
        # Full photo: find where the card interior begins, then crop the
        # top ~10% of the card (covers the name bar with some margin).
        card_top = _find_card_top(img)
        card_height = int(height * 0.80)  # card typically fills ~80% of frame
        name_bar_bottom = min(card_top + int(card_height * 0.10), height)
        img = img.crop((0, card_top, width, name_bar_bottom))
        logger.info("[scan] Card top y=%s, name bar crop to y=%s", card_top, name_bar_bottom)

    # Normalise to 200px height for consistent Tesseract input.
    crop_w, crop_h = img.size
    new_w = max(1, int(crop_w * 200 / crop_h))
    img = img.resize((new_w, 200), Image.LANCZOS)
    logger.info("[scan] Resized: %sx200", new_w)

    # Trim left border decoration (~4%) and right mana cost symbol (~16%).
    #
    # On a standard MTG card the name text occupies the middle ~80% of the
    # name bar. The leftmost strip is the coloured frame corner arc; the
    # rightmost strip is the mana cost circle(s). Both appear as bright
    # coloured blobs in the green channel and are the two most common sources
    # of false-positive OCR tokens ('W', '{3}', decorative glyphs, etc.).
    #
    # Doing this after the resize-to-200px step means the crop coordinates
    # are consistent regardless of the source photo resolution or aspect ratio.
    trim_l = int(new_w * 0.04)
    trim_r = int(new_w * 0.84)
    if trim_r > trim_l:
        img = img.crop((trim_l, 0, trim_r, 200))
        logger.info(
            "[scan] Horizontal trim: x=%s\u2013%s (width %spx \u2192 %spx)",
            trim_l, trim_r, new_w, trim_r - trim_l,
        )

    # Green channel — suppresses red card frames and coloured backgrounds.
    # Red objects (card frame, fabric, hands) have high R, low G (~60–80) and
    # appear very dark. The cream name bar has high G (~215) and stays bright.
    # Black text has low G and stays dark. Result: the name bar is a bright
    # horizontal band surrounded by dark regions — ideal for PSM 7.
    img = img.split()[1]  # index 1 = Green channel of (R, G, B)
    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = img.filter(ImageFilter.SHARPEN)

    # Emit the exact pixel data being fed to Tesseract so you can inspect it
    # during a tuning session. Gated on DEBUG level — costs nothing in
    # production (isEnabledFor is a single integer comparison).
    # To enable: temporarily set 'level': 'DEBUG' for cards.views in settings.py
    # LOGGING config, then paste the logged data: URI into any browser address bar.
    if logger.isEnabledFor(logging.DEBUG):
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        logger.debug(
            "[scan] preprocessed image: data:image/png;base64,%s",
            base64.b64encode(buf.getvalue()).decode(),
        )

    logger.info("[scan] Preprocessing done, running Tesseract...")

    try:
        # _extract_confident_words uses image_to_data instead of image_to_string.
        # Same OCR computation, but filters to words with confidence >= 40,
        # discarding noise tokens (frame decorations, mana symbols) that
        # Tesseract itself is uncertain about.
        raw_text = _extract_confident_words(img, "--psm 7 --oem 1")
        logger.info("[scan] PSM 7 confident words: %r", raw_text)

        if not raw_text:
            # PSM 11 (sparse text) finds text regardless of layout — useful
            # for cards with ornate name bars (e.g. Mystical Archive series)
            # where PSM 7's strict single-line assumption fails.
            raw_text = _extract_confident_words(img, "--psm 11 --oem 1")
            logger.info("[scan] PSM 11 fallback confident words: %r", raw_text)
    except Exception as e:
        logger.error("[scan] Tesseract raised: %s", e, exc_info=True)
        return ""

    return raw_text


def _filter_ocr_tokens(text: str) -> str:
    """
    Strip OCR noise tokens from extracted text.

    PSM 11 (sparse text) often picks up mana cost digits and 1-2 character
    frame decorations alongside the card name. Keeping only alphabetic tokens
    of length >= 3 removes these while preserving every word of the actual
    card name (the shortest meaningful part of any MTG card name is >= 3 chars).

    Example: "Se ee Squawkroaster 3 e" → "Squawkroaster"
    """
    tokens = [t for t in text.split() if re.match(r"^[A-Za-z''\-\.]{3,}$", t)]
    return " ".join(tokens)


def _parse_decklist(text):
    """
    Parse a Moxfield / MTG Arena style decklist into (quantity, card_name) pairs.

    Handles:
    - "4 Black Lotus"          → (4, "Black Lotus")
    - "4 Black Lotus (VMA)"    → (4, "Black Lotus")  — set code stripped
    - "4 Black Lotus (VMA) 1"  → (4, "Black Lotus")  — collector number stripped
    - Blank lines              → skipped
    - Comment lines (//)       → skipped
    - Section headers (Deck, Sideboard, etc.) → skipped (no leading digit)
    """
    entries = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("//"):
            continue
        match = _DECKLIST_LINE_RE.match(line)
        if match:
            quantity = int(match.group(1))
            card_name = match.group(2).strip()
            if card_name:
                entries.append((quantity, card_name))
    return entries


class CardViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing cards in a user's collection.

    Endpoints:
    - POST   /api/cards/                    → Create card (add to collection)
    - GET    /api/cards/                    → List user's cards
    - GET    /api/cards/{id}/               → Get card details
    - PUT    /api/cards/{id}/               → Update card
    - PATCH  /api/cards/{id}/               → Partial update
    - DELETE /api/cards/{id}/               → Delete card
    - POST   /api/cards/autocomplete/         → Get card name suggestions
    - POST   /api/cards/add_from_scryfall/    → Create card from Scryfall search
    - POST   /api/cards/bulk_import/          → Import a full decklist at once
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CardSerializer

    def get_queryset(self):
        """
        Return only cards belonging to the authenticated user.

        Security: Users can only see and modify their own cards.
        """
        return Card.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        """
        Use different serializers for different actions.
        """
        if self.action == "list":
            return CardListSerializer
        elif self.action == "add_from_scryfall":
            return CardCreateFromScryfallSerializer
        elif self.action == "autocomplete":
            return CardAutocompleteSerializer
        elif self.action == "bulk_import":
            return DecklistImportSerializer

        return CardSerializer

    def perform_create(self, serializer):
        """
        Save the card with the authenticated user as the owner.
        """
        serializer.save(user=self.request.user)

    def _card_in_active_offer(self, card):
        """
        Return True if the card is part of any pending or accepted offer.

        Why inline import?
        swaps.models imports cards.models (swaps depends on cards). Importing
        swaps at the top of cards/views.py would create a circular import at
        module load time. Importing inside the method defers it to runtime,
        after both apps are fully loaded — a standard Django pattern for
        cross-app references.
        """
        from swaps.models import Offer

        return Offer.objects.filter(
            items__card=card,
            status__in=["pending", "accepted"],
        ).exists()

    def destroy(self, request, *args, **kwargs):
        """Block deletion if the card is in an active offer."""
        card = self.get_object()
        if self._card_in_active_offer(card):
            return Response(
                {"error": "Cannot delete a card that is part of an active offer."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Block marking a card unavailable if it is in an active offer."""
        if request.data.get("is_available") is False:
            card = self.get_object()
            if self._card_in_active_offer(card):
                return Response(
                    {
                        "error": "Cannot mark a card unavailable while it is part of an active offer."
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def autocomplete(self, request):
        """
        Get card name autocomplete suggestions from Scryfall.

        POST /api/cards/autocomplete/
        {
            "query": "black"
        }

        Response:
        {
            "suggestions": ["Black Lotus", "Black Vise", "Blackcleave Cliffs", ...]
        }
        """
        serializer = CardAutocompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        query = serializer.validated_data["query"]
        suggestions = ScryfallService.autocomplete(query)

        return Response({"suggestions": suggestions}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"])
    def add_from_scryfall(self, request):
        """
        Create a card by searching Scryfall.

        Accepts a card name and optional attributes,
        looks up the card on Scryfall, and adds it to the user's collection.

        POST /api/cards/add_from_scryfall/
        {
            "card_name": "Black Lotus",
            "set_code": "LEA",
            "condition": "unused",
            "is_foil": false,
            "language": "English",
            "quantity": 1
        }

        Response:
        {
            "id": "...",
            "card_name": "Black Lotus",
            "set_code": "LEA",
            "set_name": "Limited Edition Alpha",
            ...
        }
        """
        serializer = CardCreateFromScryfallSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        card = serializer.save()

        # Return full card details
        return_serializer = CardSerializer(card)
        return Response(return_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def search(self, request):
        """
        Search user's collection by card name.

        GET /api/cards/search/?q=black

        Returns a list of cards matching the search query.
        """
        query = request.query_params.get("q", "")

        if not query or len(query) < 2:
            return Response(
                {"error": "Query must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Case-insensitive search on card_name
        cards = (
            self.get_queryset().filter(card_name__icontains=query).order_by("card_name")
        )

        serializer = CardListSerializer(cards, many=True)

        return Response(
            {"count": cards.count(), "results": serializer.data},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="global_search")
    def global_search(self, request):
        """
        Search cards across ALL users' collections.

        GET /api/cards/global_search/?q=lightning

        Only returns cards where is_available=True — unavailable cards are
        private to their owner and should not appear in search results.
        select_related('user') avoids N+1 queries: one JOIN fetches owner
        username alongside every card row.
        """
        query = request.query_params.get("q", "").strip()

        if len(query) < 2:
            return Response(
                {"error": "Query must be at least 2 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cards = (
            Card.objects.select_related("user")
            .filter(card_name__icontains=query, is_available=True)
            .order_by("card_name", "user__username")
        )

        serializer = CardGlobalSearchSerializer(cards, many=True)
        return Response(
            {
                "count": cards.count(),
                "results": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"])
    def bulk_import(self, request):
        """
        Import a collection from a plain-text decklist.

        Accepts the Moxfield / MTG Arena export format — one card per line:
            4 Black Lotus
            3 Lightning Bolt
            1 Sol Ring (NEO)   ← set code in parens is stripped before search

        All cards are given the same condition/language/is_foil from the request.
        Bad rows are skipped; successfully imported cards are saved.

        POST /api/cards/bulk_import/
        {
            "decklist": "4 Black Lotus\n3 Lightning Bolt",
            "condition": "played",
            "language": "French",
            "is_foil": false
        }

        Response:
        {
            "imported": 2,
            "failed": 0,
            "results": [
                {"card_name": "Black Lotus", "quantity": 4, "status": "ok"},
                {"card_name": "Lightning Bolt", "quantity": 3, "status": "ok"}
            ]
        }
        """
        serializer = DecklistImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        entries = _parse_decklist(data["decklist"])
        if not entries:
            return Response(
                {"error": 'No valid lines found. Expected format: "4 Card Name"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Batch lookup via /cards/collection (up to 75 per request) ---
        # Extract unique names from all parsed lines and fetch them all at
        # once rather than making one HTTP round trip per card.  For a typical
        # 100-card decklist this is 2 request instead of 100.
        unique_names = list({name for _, name in entries})
        found_cards, _ = ScryfallService.collection_search(unique_names)

        results = []
        imported_count = 0
        failed_count = 0

        for quantity, card_name in entries:
            scryfall_card = found_cards.get(card_name.lower())

            if not scryfall_card:
                failed_count += 1
                results.append(
                    {
                        "card_name": card_name,
                        "quantity": quantity,
                        "status": "error",
                        "reason": f"'{card_name}' not found on Scryfall.",
                    }
                )
                continue

            metadata = ScryfallService.extract_card_metadata(scryfall_card)
            Card.objects.create(
                user=request.user,
                quantity=quantity,
                condition=data["condition"],
                language=data["language"],
                is_foil=data["is_foil"],
                **metadata,
            )
            imported_count += 1
            results.append(
                {
                    "card_name": metadata["card_name"],
                    "quantity": quantity,
                    "status": "ok",
                }
            )

        response_status = (
            status.HTTP_200_OK if imported_count > 0 else status.HTTP_400_BAD_REQUEST
        )
        return Response(
            {
                "imported": imported_count,
                "failed": failed_count,
                "results": results,
            },
            status=response_status,
        )

    @action(detail=False, methods=["get"])
    def available(self, request):
        """
        Get only available cards (for swapping).

        GET /api/cards/available/

        Returns cards marked as is_available=True.
        """
        cards = self.get_queryset().filter(is_available=True)
        serializer = CardListSerializer(cards, many=True)

        return Response(
            {"count": cards.count(), "results": serializer.data},
            status=status.HTTP_200_OK,
        )

    # ── Image Scan ────────────────────────────────────────────────────────────

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="scan",
    )
    def scan(self, request):
        """
        POST /api/cards/scan/
        Content-Type: multipart/form-data
        Body field: image (JPEG or PNG)

        Accepts a photo of an MTG card, runs Tesseract OCR on the name bar region,
        then does a fuzzy Scryfall lookup on the extracted text.

        Why Tesseract instead of a deep-learning OCR engine?
        - Lightweight C binary (~10MB apt package, ~50MB RAM at runtime)
        - No model downloads on cold start (critical for Render free tier)
        - MTG card names use a clean, consistent printed font Tesseract handles well
        - PaddleOCR 3.x requires PyTorch/Torchvision (400MB+, unavailable on Render)

        Returns card metadata for the caller to review before adding to their
        collection — this endpoint NEVER creates a Card row itself. The caller
        passes the result through the normal add_from_scryfall flow after review.

        Why not create the card directly?
        OCR is imperfect. Returning a "staging" result lets the user correct a
        mis-read name before it ends up in their collection. The staging list
        on the frontend is the safety net.

        Response 200:
        {
            "card_name": "Black Lotus",
            "set_name": "Limited Edition Beta",
            "set_code": "leb",
            "card_type": "Artifact",
            "mana_cost": "{0}",
            "scryfall_id": "e0e0d...",
            "raw_ocr_text": "Black Lotus"
        }

        Errors:
            400 — no image uploaded, or no text detected
            404 — Scryfall couldn't match the OCR text to any card
        """
        image_file = request.FILES.get("image")
        if not image_file:
            return Response(
                {
                    "error": 'No image uploaded. Send a JPEG or PNG as the "image" field.'
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        image_bytes = image_file.read()

        # Preprocess and OCR the image to extract the card name
        try:
            raw_text = _preprocess_and_extract_text(image_bytes)
        except Exception:
            return Response(
                {"error": "Could not decode the uploaded image. Use JPEG or PNG."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not raw_text:
            return Response(
                {
                    "error": "No text detected in the image. Try better lighting or a closer shot."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Clean up common OCR noise (leading/trailing punctuation, extra spaces)
        cleaned = re.sub(r"[^\w\s\',\-]", "", raw_text).strip()

        card_data = ScryfallService.search(cleaned)
        if card_data is None:
            # Pass 2 — strip noise tokens and retry.
            # Confidence filtering already removed most low-conf tokens, but
            # _filter_ocr_tokens catches any alphabetic-but-short fragments
            # that still slipped through (e.g. frame corner decorations).
            filtered = _filter_ocr_tokens(cleaned)
            if filtered and filtered != cleaned:
                logger.info(
                    "[scan] Fuzzy miss on %r, retrying with filtered tokens: %r",
                    cleaned,
                    filtered,
                )
                card_data = ScryfallService.search(filtered)
                if card_data:
                    cleaned = filtered

            # Pass 3 — autocomplete on the longest confident token.
            #
            # Handles partial OCR reads: if Tesseract read "Squawkroaste"
            # (confident but clipped at the edge), passes 1 and 2 both miss
            # because neither fuzzy nor token-filtered search can match a
            # non-existent truncated name. Autocomplete can match on a prefix.
            #
            # Why exactly-one guard?
            # A short token like "Fire" autocompletes to dozens of cards —
            # picking one arbitrarily would give a wrong result. We only
            # act when the token unambiguously resolves to a single card name.
            #
            # Why len >= 4?
            # Prevents firing off network requests for very short tokens
            # where we know the result set will be huge. Autocomplete is
            # cached, but the guard keeps the logic intentional.
            if card_data is None and filtered:
                longest = max(filtered.split(), key=len, default="")
                if len(longest) >= 4:
                    suggestions = ScryfallService.autocomplete(longest)
                    if len(suggestions) == 1:
                        logger.info(
                            "[scan] Autocomplete resolved %r → %r",
                            longest,
                            suggestions[0],
                        )
                        card_data = ScryfallService.search(suggestions[0])
                        if card_data:
                            cleaned = suggestions[0]

        if not card_data:
            return Response(
                {
                    "error": f'No card found matching "{cleaned}". Try retaking the photo.',
                    "raw_ocr_text": raw_text,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        metadata = ScryfallService.extract_card_metadata(card_data)
        return Response(
            {
                "card_name": metadata["card_name"],
                "set_name": metadata.get("set_name", ""),
                "set_code": metadata.get("set_code", ""),
                "card_type": metadata.get("card_type", ""),
                "mana_cost": metadata.get("mana_cost", ""),
                "scryfall_id": metadata["scryfall_id"],
                "raw_ocr_text": raw_text,
            },
            status=status.HTTP_200_OK,
        )
