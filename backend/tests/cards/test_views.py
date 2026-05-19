"""Unit tests for Card endpoints."""

from unittest.mock import patch, call

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from cards.models import Card

User = get_user_model()

# ---------------------------------------------------------------------------
# Fake Scryfall API response — used anywhere we need to mock ScryfallService.search
# ---------------------------------------------------------------------------
FAKE_SCRYFALL_CARD = {
    "id": "abc-123",
    "name": "Black Lotus",
    "set": "vma",
    "set_name": "Vintage Masters",
    "type_line": "Artifact",
    "mana_cost": "{0}",
}


# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------

class CardTestBase(APITestCase):
    """
    Shared setUp for all card test classes.

    Why force_authenticate instead of going through the login endpoint?
    Unit tests should test one thing at a time. Using force_authenticate()
    bypasses the auth layer entirely so we're testing *card logic*, not
    auth logic. Auth is already covered in tests/users/.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            email="otheruser@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

        # Card owned by self.user
        self.card = Card.objects.create(
            user=self.user,
            scryfall_id="abc-123",
            card_name="Black Lotus",
            set_code="VMA",
            set_name="Vintage Masters",
            card_type="Artifact",
            mana_cost="{0}",
            condition="unused",
            language="French",
        )

        # Card owned by other_user — should never appear in self.user's responses
        self.other_card = Card.objects.create(
            user=self.other_user,
            scryfall_id="xyz-789",
            card_name="Lightning Bolt",
            set_code="M11",
            set_name="Magic 2011",
            card_type="Instant",
            mana_cost="{R}",
        )


# ---------------------------------------------------------------------------
# GET /api/cards/
# ---------------------------------------------------------------------------

class CardListTests(CardTestBase):
    """Tests for the card list endpoint."""

    def test_list_returns_own_cards(self):
        """Authenticated user sees only their own cards."""
        response = self.client.get("/api/cards/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # DRF pagination wraps results
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["card_name"], "Black Lotus")

    def test_list_excludes_other_user_cards(self):
        """Cards from other users never appear in the list."""
        response = self.client.get("/api/cards/")
        card_ids = [c["id"] for c in response.data]
        self.assertNotIn(str(self.other_card.id), card_ids)

    def test_list_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/cards/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# GET /api/cards/{id}/   PUT/PATCH /api/cards/{id}/   DELETE /api/cards/{id}/
# ---------------------------------------------------------------------------

class CardDetailTests(CardTestBase):
    """Tests for retrieve, update, and delete endpoints."""

    def test_retrieve_own_card(self):
        """GET /api/cards/{id}/ returns full card details."""
        response = self.client.get(f"/api/cards/{self.card.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["card_name"], "Black Lotus")

    def test_retrieve_other_user_card_returns_404(self):
        """
        Attempting to retrieve another user's card returns 404, not 403.

        Why 404 instead of 403? Returning 403 leaks the fact that a card
        exists. Returning 404 hides that information completely — the card
        simply "doesn't exist" from this user's perspective.
        """
        response = self.client.get(f"/api/cards/{self.other_card.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_partial_update_own_card(self):
        """PATCH /api/cards/{id}/ updates mutable fields."""
        response = self.client.patch(
            f"/api/cards/{self.card.id}/",
            {"condition": "played", "quantity": 3},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.card.refresh_from_db()
        self.assertEqual(self.card.condition, "played")
        self.assertEqual(self.card.quantity, 3)

    def test_partial_update_other_user_card_returns_404(self):
        """Cannot PATCH another user's card."""
        response = self.client.patch(
            f"/api/cards/{self.other_card.id}/",
            {"condition": "damaged"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_card(self):
        """DELETE /api/cards/{id}/ removes the card from the database."""
        response = self.client.delete(f"/api/cards/{self.card.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Card.objects.filter(id=self.card.id).exists())

    def test_delete_other_user_card_returns_404(self):
        """Cannot DELETE another user's card — it remains in the database."""
        response = self.client.delete(f"/api/cards/{self.other_card.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Card.objects.filter(id=self.other_card.id).exists())


# ---------------------------------------------------------------------------
# POST /api/cards/autocomplete/
# ---------------------------------------------------------------------------

class CardAutocompleteTests(CardTestBase):
    """Tests for the Scryfall autocomplete endpoint."""

    @patch("cards.scryfall_service.ScryfallService.autocomplete")
    def test_autocomplete_returns_suggestions(self, mock_autocomplete):
        """Valid query returns Scryfall suggestions without hitting the real API."""
        mock_autocomplete.return_value = ["Black Lotus", "Black Vise"]

        response = self.client.post(
            "/api/cards/autocomplete/",
            {"query": "black"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["suggestions"], ["Black Lotus", "Black Vise"])
        mock_autocomplete.assert_called_once_with("black")

    @patch("cards.scryfall_service.ScryfallService.autocomplete")
    def test_autocomplete_query_too_short_returns_400(self, mock_autocomplete):
        """
        A single-character query is rejected before calling Scryfall.

        The CardAutocompleteSerializer enforces min_length=2, so invalid
        queries are caught at validation — no external call is made.
        """
        response = self.client.post(
            "/api/cards/autocomplete/",
            {"query": "b"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mock_autocomplete.assert_not_called()

    def test_autocomplete_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/cards/autocomplete/",
            {"query": "black"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# POST /api/cards/add_from_scryfall/
# ---------------------------------------------------------------------------

class CardAddFromScryfallTests(CardTestBase):
    """Tests for creating a card via Scryfall lookup."""

    @patch("cards.scryfall_service.ScryfallService.search")
    def test_add_creates_card(self, mock_search):
        """Valid card name creates a card populated with Scryfall metadata."""
        mock_search.return_value = FAKE_SCRYFALL_CARD

        response = self.client.post(
            "/api/cards/add_from_scryfall/",
            {"card_name": "Black Lotus", "condition": "unused"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["card_name"], "Black Lotus")
        self.assertEqual(response.data["set_name"], "Vintage Masters")
        self.assertEqual(response.data["mana_cost"], "{0}")

        # Verify it's in the DB and owned by the authenticated user
        card = Card.objects.get(id=response.data["id"])
        self.assertEqual(card.user, self.user)

    @patch("cards.scryfall_service.ScryfallService.search")
    def test_add_card_not_found_returns_400(self, mock_search):
        """
        When Scryfall returns None, the endpoint returns 400.

        The serializer's create() raises ValidationError when the card
        isn't found, which DRF translates to a 400 response.
        """
        mock_search.return_value = None

        response = self.client.post(
            "/api/cards/add_from_scryfall/",
            {"card_name": "Totally Fake Card XYZ"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_missing_card_name_returns_400(self):
        """Request body without card_name is rejected by the serializer."""
        response = self.client.post(
            "/api/cards/add_from_scryfall/",
            {"condition": "played"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/cards/add_from_scryfall/",
            {"card_name": "Black Lotus"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# GET /api/cards/search/?q=...
# ---------------------------------------------------------------------------

class CardSearchTests(CardTestBase):
    """Tests for in-collection search endpoint."""

    def test_search_returns_matching_cards(self):
        """Cards matching the query are returned."""
        response = self.client.get("/api/cards/search/?q=black")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["card_name"], "Black Lotus")

    def test_search_no_match_returns_empty(self):
        """Query with no match returns count=0 and empty results."""
        response = self.client.get("/api/cards/search/?q=fireball")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_search_query_too_short_returns_400(self):
        """
        Query shorter than 2 characters returns 400.

        The view enforces a minimum length before hitting the database.
        This prevents expensive wildcard searches on single characters.
        """
        response = self.client.get("/api/cards/search/?q=b")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_excludes_other_user_cards(self):
        """Search never returns cards owned by other users."""
        # other_user has "Lightning Bolt" — self.user does not
        response = self.client.get("/api/cards/search/?q=lightning")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)


# ---------------------------------------------------------------------------
# GET /api/cards/available/
# ---------------------------------------------------------------------------

class CardAvailableTests(CardTestBase):
    """Tests for the available-cards filter endpoint."""

    def test_available_returns_available_cards(self):
        """Cards with is_available=True are returned."""
        response = self.client.get("/api/cards/available/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["card_name"], "Black Lotus")

    def test_unavailable_cards_excluded(self):
        """Cards with is_available=False do not appear."""
        self.card.is_available = False
        self.card.save()

        response = self.client.get("/api/cards/available/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_available_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/cards/available/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# POST /api/cards/bulk_import/
# ---------------------------------------------------------------------------

FAKE_LIGHTNING_BOLT = {
    "id": "def-456",
    "name": "Lightning Bolt",
    "set": "m11",
    "set_name": "Magic 2011",
    "type_line": "Instant",
    "mana_cost": "{R}",
}


class CardBulkImportTests(CardTestBase):
    """Tests for the plain-text decklist bulk import endpoint."""

    @patch("cards.scryfall_service.ScryfallService.collection_search")
    def test_import_creates_all_cards(self, mock_collection_search):
        """
        A valid two-card decklist creates two Card rows and returns a summary.

        We mock ScryfallService.collection_search to return a pre-built dict
        instead of hitting the network, while still exercising the full import
        loop and DB writes.
        """
        mock_collection_search.return_value = (
            {
                "black lotus": FAKE_SCRYFALL_CARD,
                "lightning bolt": FAKE_LIGHTNING_BOLT,
            },
            [],
        )

        decklist = "4 Black Lotus\n3 Lightning Bolt"
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": decklist},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported"], 2)
        self.assertEqual(response.data["failed"], 0)

        # Both cards should now exist in the DB for this user
        self.assertEqual(Card.objects.filter(user=self.user, card_name="Black Lotus").count(), 2)  # 1 from setUp + 1 imported
        self.assertTrue(Card.objects.filter(user=self.user, card_name="Lightning Bolt").exists())

        # collection_search is called exactly once (batch, not per-card)
        mock_collection_search.assert_called_once()

    @patch("cards.scryfall_service.ScryfallService.collection_search")
    def test_import_skips_unknown_cards(self, mock_collection_search):
        """
        Lines where Scryfall returns no match are recorded as failures.
        The rest of the decklist is still imported (partial import).
        """
        mock_collection_search.return_value = (
            {"black lotus": FAKE_SCRYFALL_CARD},
            ["totally fake card xyz"],
        )

        decklist = "2 Black Lotus\n1 Totally Fake Card XYZ"
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": decklist},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(response.data["failed"], 1)

        failed = [r for r in response.data["results"] if r["status"] == "error"]
        self.assertEqual(failed[0]["card_name"], "Totally Fake Card XYZ")
        self.assertIn("reason", failed[0])

    @patch("cards.scryfall_service.ScryfallService.collection_search")
    def test_import_all_fail_returns_400(self, mock_collection_search):
        """If every card fails Scryfall lookup, the response is 400."""
        mock_collection_search.return_value = ({}, ["fake card a", "fake card b"])

        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": "1 Fake Card A\n1 Fake Card B"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["imported"], 0)
        self.assertEqual(response.data["failed"], 2)

    @patch("cards.scryfall_service.ScryfallService.collection_search")
    def test_import_strips_set_code_from_line(self, mock_collection_search):
        """
        Lines like "4 Black Lotus (VMA)" have the set code stripped before
        the Scryfall lookup, so collection_search receives "Black Lotus".
        """
        mock_collection_search.return_value = ({"black lotus": FAKE_SCRYFALL_CARD}, [])

        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": "4 Black Lotus (VMA)"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The name list passed to collection_search must not include "(VMA)"
        called_names = mock_collection_search.call_args[0][0]
        self.assertEqual(called_names, ["Black Lotus"])

    @patch("cards.scryfall_service.ScryfallService.collection_search")
    def test_import_skips_blank_lines_and_headers(self, mock_collection_search):
        """
        Blank lines and Moxfield section headers like 'Deck' or 'Sideboard'
        don't trigger Scryfall lookups.
        """
        mock_collection_search.return_value = ({"black lotus": FAKE_SCRYFALL_CARD}, [])

        decklist = "\nDeck\n4 Black Lotus\n\nSideboard\n"
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": decklist},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Only one real card line — collection_search receives only that name
        called_names = mock_collection_search.call_args[0][0]
        self.assertEqual(called_names, ["Black Lotus"])

    def test_import_empty_decklist_returns_400(self):
        """An empty decklist string is rejected before any Scryfall calls."""
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_import_no_parseable_lines_returns_400(self):
        """A decklist with only headers and blank lines returns 400."""
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": "Deck\nSideboard\n\n"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_import_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.post(
            "/api/cards/bulk_import/",
            {"decklist": "4 Black Lotus"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# GET /api/cards/global_search/?q=
# ---------------------------------------------------------------------------

class GlobalSearchTests(CardTestBase):
    """Tests for the cross-user card search endpoint."""

    def setUp(self):
        super().setUp()
        # Mark self.user's card as available (setUp default is True, but be explicit)
        self.card.is_available = True
        self.card.save()

        # other_user's card available — should appear in global search
        self.other_card.is_available = True
        self.other_card.save()
        # A second available Black Lotus owned by other_user — ensures cross-user results
        self.other_black_lotus = Card.objects.create(
            user=self.other_user,
            scryfall_id='ccc-333',
            card_name='Black Lotus',
            set_code='LEA',
            is_available=True,
        )
        # A private card (is_available=False) — must never appear in results
        self.private_card = Card.objects.create(
            user=self.other_user,
            scryfall_id="prv-001",
            card_name="Black Lotus",
            set_code="VMA",
            is_available=False,
        )

    def test_returns_cards_from_all_users(self):
        """Results include cards from both the requester and other users."""
        response = self.client.get("/api/cards/global_search/?q=black")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [r["card_name"] for r in response.data["results"]]
        self.assertIn("Black Lotus", names)
        # Both the requester's and other_user's available Black Lotus should appear
        self.assertGreaterEqual(response.data["count"], 2)

    def test_excludes_unavailable_cards(self):
        """Cards with is_available=False are never returned."""
        response = self.client.get("/api/cards/global_search/?q=black")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in response.data["results"]]
        self.assertNotIn(str(self.private_card.id), ids)

    def test_includes_owner_fields(self):
        """Each result includes owner_id and owner_username."""
        response = self.client.get("/api/cards/global_search/?q=lightning")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.data["results"][0]
        self.assertIn("owner_id", result)
        self.assertIn("owner_username", result)
        self.assertEqual(result["owner_username"], self.other_user.username)

    def test_short_query_returns_400(self):
        """Queries shorter than 2 characters are rejected."""
        response = self.client.get("/api/cards/global_search/?q=b")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/cards/global_search/?q=black")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

