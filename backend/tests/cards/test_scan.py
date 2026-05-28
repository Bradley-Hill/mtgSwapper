"""
Tests for POST /api/cards/scan/

Strategy: mock both _preprocess_and_extract_text (our PaddleOCR wrapper) and
ScryfallService.search so tests run deterministically without needing a GPU
or network access.

Why mock at these two boundaries?
- _preprocess_and_extract_text: the PaddleOCR call — we can't control what
  the OCR engine returns without real card images. Mocking lets us test every
  code path (no text, bad text, good text) deterministically.
- ScryfallService.search: already tested in its own unit tests. Mocking here
  keeps this test focused on the scan endpoint's logic, not Scryfall's HTTP layer.

Test classes:
  ScanEndpointAuthTests   — unauthenticated requests rejected
  ScanEndpointInputTests  — missing/bad input (no file, bad image bytes)
  ScanEndpointOCRTests    — OCR result paths (no text, text found, not on Scryfall)
  ScanEndpointSuccessTests — happy path response shape
"""

import io
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

FAKE_SCRYFALL_CARD = {
    "id": "abc-123",
    "name": "Black Lotus",
    "lang": "en",
    "set": "vma",
    "set_name": "Vintage Masters",
    "type_line": "Artifact",
    "mana_cost": "{0}",
}

FAKE_SCRYFALL_CARD_FR = {
    "id": "def-456",
    "name": "Black Lotus",       
    "lang": "fr",
    "printed_name": "Lotus Noir", 
    "set": "vma",
    "set_name": "Vintage Masters",
    "type_line": "Artifact",
    "mana_cost": "{0}",
}

SCAN_URL = "/api/cards/scan/"


def _make_jpeg_bytes() -> bytes:
    """Return minimal valid JPEG bytes using Pillow — no real card needed."""
    buf = io.BytesIO()
    Image.new("RGB", (100, 200), color=(30, 30, 30)).save(buf, format="JPEG")
    return buf.getvalue()


class ScanEndpointAuthTests(APITestCase):

    def test_unauthenticated_request_rejected(self):
        resp = self.client.post(SCAN_URL, {}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ScanEndpointInputTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="scanner", email="scanner@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)

    def test_missing_image_field_returns_400(self):
        resp = self.client.post(SCAN_URL, {}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No image uploaded", resp.data["error"])

    def test_invalid_image_bytes_returns_400(self):
        """Sending garbage bytes that Pillow can't decode returns 400."""
        fake_file = io.BytesIO(b"this is not an image")
        fake_file.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": fake_file}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Could not decode", resp.data["error"])


class ScanEndpointOCRTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="scanner", email="scanner@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.jpeg = _make_jpeg_bytes()

    @patch("cards.views._preprocess_and_extract_text", return_value="")
    def test_empty_ocr_output_returns_400(self, _mock_ocr):
        """PaddleOCR finds nothing → 400 with helpful message."""
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("No text detected", resp.data["error"])

    @patch("cards.views.ScryfallService.autocomplete", return_value=[])
    @patch("cards.views.ScryfallService.search_multilingual", return_value=None)
    @patch("cards.views.ScryfallService.search", return_value=None)
    @patch("cards.views._preprocess_and_extract_text", return_value="Blacc Lotuz")
    def test_ocr_text_not_on_scryfall_returns_404(self, _mock_ocr, _mock_search, _mock_multi, _mock_auto):
        """OCR returns something but Scryfall fuzzy search finds nothing → 404."""
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("raw_ocr_text", resp.data)

    @patch(
        "cards.views.ScryfallService.search",
        return_value=FAKE_SCRYFALL_CARD,
    )
    @patch(
        "cards.views.ScryfallService.extract_card_metadata",
        return_value={
            "scryfall_id": "abc-123",
            "card_name": "Black Lotus",
            "set_code": "vma",
            "set_name": "Vintage Masters",
            "card_type": "Artifact",
            "mana_cost": "{0}",
            "language": "English",
        },
    )
    @patch("cards.views._preprocess_and_extract_text", return_value="Black Lotus")
    def test_successful_scan_returns_200_and_no_card_created(
        self, _mock_ocr, _mock_meta, _mock_search
    ):
        """
        Happy path: OCR reads the name, Scryfall confirms it.
        Response has the expected shape AND no Card row is created.
        """
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Shape check — language must be present
        for key in ("card_name", "set_name", "set_code", "scryfall_id", "language", "raw_ocr_text"):
            self.assertIn(key, resp.data)

        self.assertEqual(resp.data["card_name"], "Black Lotus")
        self.assertEqual(resp.data["language"], "English")
        self.assertEqual(resp.data["raw_ocr_text"], "Black Lotus")

        # Confirm no Card was persisted
        from cards.models import Card
        self.assertEqual(Card.objects.count(), 0)

    @patch(
        "cards.views.ScryfallService.search",
        return_value=FAKE_SCRYFALL_CARD,
    )
    @patch(
        "cards.views.ScryfallService.extract_card_metadata",
        return_value={
            "scryfall_id": "abc-123",
            "card_name": "Black Lotus",
            "set_code": "vma",
            "set_name": "Vintage Masters",
            "card_type": "Artifact",
            "mana_cost": "{0}",
            "language": "English",
        },
    )
    @patch("cards.views._preprocess_and_extract_text", return_value="  Black Lotus!  ")
    def test_ocr_noise_is_stripped_before_scryfall_lookup(
        self, _mock_ocr, _mock_meta, mock_search
    ):
        """
        Raw OCR text with punctuation/whitespace noise is cleaned before
        the Scryfall fuzzy search — 'Black Lotus!' becomes 'Black Lotus'.
        """
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        self.client.post(SCAN_URL, {"image": f}, format="multipart")
        # The search call should receive the cleaned string
        mock_search.assert_called_once_with("Black Lotus")


class ScanEndpointMultilingualTests(APITestCase):
    """
    Tests for the multilingual scan fallback path (Pass 2.5).

    A French user scanning "Lotus Noir" will get a 404 from /cards/named
    (which only matches English names). The multilingual pass retries via
    /cards/search?q=!"Lotus Noir", which searches all printed names across
    all languages and returns the card with lang:"fr".

    These tests verify that:
    - When /cards/named fails but search_multilingual succeeds, a 200 is returned
    - The response contains language:"French" (not "English")
    - card_name is the canonical English name (Scryfall always returns this)
    - search_multilingual is NOT called when /cards/named already succeeds
      (i.e. no wasted API call for English cards)
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="fr_scanner", email="fr@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.jpeg = _make_jpeg_bytes()

    @patch(
        "cards.views.ScryfallService.extract_card_metadata",
        return_value={
            "scryfall_id": "def-456",
            "card_name": "Black Lotus",   # canonical English name from Scryfall
            "set_code": "VMA",
            "set_name": "Vintage Masters",
            "card_type": "Artifact",
            "mana_cost": "{0}",
            "language": "French",
        },
    )
    @patch(
        "cards.views.ScryfallService.search_multilingual",
        return_value=FAKE_SCRYFALL_CARD_FR,
    )
    @patch("cards.views.ScryfallService.search", return_value=None)
    @patch("cards.views._preprocess_and_extract_text", return_value="Lotus Noir")
    def test_french_card_name_falls_back_to_multilingual_search(
        self, _mock_ocr, _mock_search, mock_multi, _mock_meta
    ):
        """
        OCR reads "Lotus Noir". /cards/named returns None (English-only).
        search_multilingual finds the French printing and returns lang:"fr".
        Response must contain language:"French" and the English canonical name.
        """
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["language"], "French")
        self.assertEqual(resp.data["card_name"], "Black Lotus")
        # Confirm the multilingual search was called with the OCR text
        mock_multi.assert_called_once_with("Lotus Noir")

    @patch(
        "cards.views.ScryfallService.extract_card_metadata",
        return_value={
            "scryfall_id": "abc-123",
            "card_name": "Black Lotus",
            "set_code": "VMA",
            "set_name": "Vintage Masters",
            "card_type": "Artifact",
            "mana_cost": "{0}",
            "language": "English",
        },
    )
    @patch("cards.views.ScryfallService.search_multilingual")
    @patch(
        "cards.views.ScryfallService.search",
        return_value=FAKE_SCRYFALL_CARD,
    )
    @patch("cards.views._preprocess_and_extract_text", return_value="Black Lotus")
    def test_english_card_does_not_trigger_multilingual_search(
        self, _mock_ocr, _mock_search, mock_multi, _mock_meta
    ):
        """
        When /cards/named succeeds (English card), search_multilingual must
        NOT be called — no wasted network request.
        """
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        mock_multi.assert_not_called()

    @patch("cards.views.ScryfallService.autocomplete", return_value=[])
    @patch("cards.views.ScryfallService.search_multilingual", return_value=None)
    @patch("cards.views.ScryfallService.search", return_value=None)
    @patch(
        "cards.views._preprocess_and_extract_text",
        return_value="Xzqrt Foobar",
    )
    def test_multilingual_miss_falls_through_to_404(
        self, _mock_ocr, _mock_search, _mock_multi, _mock_auto
    ):
        """
        If both /cards/named and search_multilingual return None, the endpoint
        still returns 404 — the multilingual pass is a fallback, not a guarantee.
        """
        f = io.BytesIO(self.jpeg)
        f.name = "card.jpg"
        resp = self.client.post(SCAN_URL, {"image": f}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

