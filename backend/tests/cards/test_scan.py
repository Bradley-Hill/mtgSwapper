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

    @patch("cards.views.ScryfallService.search", return_value=None)
    @patch("cards.views._preprocess_and_extract_text", return_value="Blacc Lotuz")
    def test_ocr_text_not_on_scryfall_returns_404(self, _mock_ocr, _mock_search):
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

        # Shape check
        for key in ("card_name", "set_name", "set_code", "scryfall_id", "raw_ocr_text"):
            self.assertIn(key, resp.data)

        self.assertEqual(resp.data["card_name"], "Black Lotus")
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
