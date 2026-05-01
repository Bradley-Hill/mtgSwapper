"""Tests for the Offers / Swaps API endpoints."""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card
from swaps.models import Offer, OfferItem

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------

class OfferTestBase(APITestCase):
    """
    Creates two users (alice + bob) and one available card for each.
    alice is authenticated by default.
    """

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.alice)

        self.alice_card = Card.objects.create(
            user=self.alice,
            scryfall_id="aaa-111",
            card_name="Lightning Bolt",
            set_code="M10",
            set_name="Magic 2010",
            card_type="Instant",
            is_available=True,
        )
        self.bob_card = Card.objects.create(
            user=self.bob,
            scryfall_id="bbb-222",
            card_name="Black Lotus",
            set_code="VMA",
            set_name="Vintage Masters",
            card_type="Artifact",
            is_available=True,
        )

    def _make_offer(self, initiator=None, target=None, offered=None, requested=None):
        """Helper — creates an Offer + OfferItems directly (bypasses HTTP)."""
        offer = Offer.objects.create(
            initiator_user=initiator or self.alice,
            target_user=target or self.bob,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        for card in (offered or [self.alice_card]):
            OfferItem.objects.create(offer=offer, card=card, item_type="offered")
        for card in (requested or [self.bob_card]):
            OfferItem.objects.create(offer=offer, card=card, item_type="requested")
        return offer


# ---------------------------------------------------------------------------
# POST /api/offers/ — create
# ---------------------------------------------------------------------------

class OfferCreateTests(OfferTestBase):

    def test_create_offer_happy_path(self):
        payload = {
            "target_user_id": self.bob.id,
            "offered_card_ids": [str(self.alice_card.id)],
            "requested_card_ids": [str(self.bob_card.id)],
        }
        resp = self.client.post("/api/offers/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")
        self.assertEqual(resp.data["initiator"]["username"], "alice")

    def test_cannot_offer_other_users_card(self):
        """Offering a card you don't own should fail."""
        payload = {
            "target_user_id": self.bob.id,
            "offered_card_ids": [str(self.bob_card.id)],  # bob's card!
            "requested_card_ids": [str(self.bob_card.id)],
        }
        resp = self.client.post("/api/offers/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_offer_to_self(self):
        payload = {
            "target_user_id": self.alice.id,
            "offered_card_ids": [str(self.alice_card.id)],
            "requested_card_ids": [str(self.alice_card.id)],
        }
        resp = self.client.post("/api/offers/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_at_least_one_card_each_side(self):
        payload = {
            "target_user_id": self.bob.id,
            "offered_card_ids": [],
            "requested_card_ids": [str(self.bob_card.id)],
        }
        resp = self.client.post("/api/offers/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post("/api/offers/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# GET /api/offers/ — list
# ---------------------------------------------------------------------------

class OfferListTests(OfferTestBase):

    def setUp(self):
        super().setUp()
        self.offer = self._make_offer()

    def test_participant_sees_offer(self):
        resp = self.client.get("/api/offers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_non_participant_does_not_see_offer(self):
        carol = User.objects.create_user(username="carol", email="c@x.com", password="pass")
        self.client.force_authenticate(user=carol)
        resp = self.client.get("/api/offers/")
        self.assertEqual(len(resp.data), 0)

    def test_direction_sent_filter(self):
        resp = self.client.get("/api/offers/?direction=sent")
        self.assertEqual(len(resp.data), 1)

        self.client.force_authenticate(user=self.bob)
        resp = self.client.get("/api/offers/?direction=sent")
        self.assertEqual(len(resp.data), 0)

    def test_direction_received_filter(self):
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get("/api/offers/?direction=received")
        self.assertEqual(len(resp.data), 1)

    def test_status_filter(self):
        resp = self.client.get("/api/offers/?status=pending")
        self.assertEqual(len(resp.data), 1)

        resp = self.client.get("/api/offers/?status=accepted")
        self.assertEqual(len(resp.data), 0)


# ---------------------------------------------------------------------------
# GET /api/offers/{id}/ — retrieve
# ---------------------------------------------------------------------------

class OfferRetrieveTests(OfferTestBase):

    def test_participant_can_retrieve(self):
        offer = self._make_offer()
        resp = self.client.get(f"/api/offers/{offer.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("items", resp.data)

    def test_non_participant_gets_404(self):
        offer = self._make_offer()
        carol = User.objects.create_user(username="carol", email="c@x.com", password="pass")
        self.client.force_authenticate(user=carol)
        resp = self.client.get(f"/api/offers/{offer.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/accept|decline|cancel/
# ---------------------------------------------------------------------------

class OfferActionTests(OfferTestBase):

    def test_target_can_accept(self):
        offer = self._make_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "accepted")

    def test_initiator_cannot_accept(self):
        offer = self._make_offer()
        resp = self.client.post(f"/api/offers/{offer.id}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_target_can_decline(self):
        offer = self._make_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/decline/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "declined")

    def test_initiator_cannot_decline(self):
        offer = self._make_offer()
        resp = self.client.post(f"/api/offers/{offer.id}/decline/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_initiator_can_cancel(self):
        offer = self._make_offer()
        resp = self.client.post(f"/api/offers/{offer.id}/cancel/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "cancelled")

    def test_target_cannot_cancel(self):
        offer = self._make_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/cancel/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_pending_offer_cannot_be_accepted(self):
        offer = self._make_offer()
        offer.status = "cancelled"
        offer.save()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/counteroffer/
# ---------------------------------------------------------------------------

class CounterOfferTests(OfferTestBase):

    def _bob_extra_card(self):
        return Card.objects.create(
            user=self.bob,
            scryfall_id="bbb-333",
            card_name="Mox Pearl",
            set_code="VMA",
            set_name="Vintage Masters",
            card_type="Artifact",
            is_available=True,
        )

    def test_target_can_counteroffer(self):
        offer = self._make_offer()
        extra = self._bob_extra_card()
        self.client.force_authenticate(user=self.bob)
        payload = {
            "offered_card_ids": [str(self.bob_card.id)],
            "requested_card_ids": [str(self.alice_card.id)],
        }
        resp = self.client.post(f"/api/offers/{offer.id}/counteroffer/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        offer.refresh_from_db()
        self.assertEqual(offer.counteroffer_count, 1)
        self.assertEqual(offer.last_counteroffer_by, self.bob)

    def test_cannot_counter_own_counteroffer(self):
        """Bob counters, then Bob tries to counter again immediately."""
        offer = self._make_offer()
        offer.last_counteroffer_by = self.bob
        offer.counteroffer_count = 1
        offer.save()

        self.client.force_authenticate(user=self.bob)
        payload = {
            "offered_card_ids": [str(self.bob_card.id)],
            "requested_card_ids": [str(self.alice_card.id)],
        }
        resp = self.client.post(f"/api/offers/{offer.id}/counteroffer/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_max_counteroffers_returns_409(self):
        offer = self._make_offer()
        offer.counteroffer_count = 4  # equals max_counteroffers default
        offer.save()
        payload = {
            "offered_card_ids": [str(self.bob_card.id)],
            "requested_card_ids": [str(self.alice_card.id)],
        }
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/counteroffer/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_counteroffer_extends_expiry(self):
        offer = self._make_offer()
        original_expiry = offer.expires_at
        self.client.force_authenticate(user=self.bob)
        payload = {
            "offered_card_ids": [str(self.bob_card.id)],
            "requested_card_ids": [str(self.alice_card.id)],
        }
        self.client.post(f"/api/offers/{offer.id}/counteroffer/", payload, format="json")
        offer.refresh_from_db()
        self.assertGreater(offer.expires_at, original_expiry)


# ---------------------------------------------------------------------------
# Cards guard — delete / mark unavailable while in active offer
# ---------------------------------------------------------------------------

class CardOfferGuardTests(OfferTestBase):

    def test_cannot_delete_card_in_active_offer(self):
        self._make_offer()  # alice_card is in a pending offer
        resp = self.client.delete(f"/api/cards/{self.alice_card.id}/")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_can_delete_card_not_in_active_offer(self):
        resp = self.client.delete(f"/api/cards/{self.alice_card.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_cannot_mark_unavailable_while_in_active_offer(self):
        self._make_offer()
        resp = self.client.patch(
            f"/api/cards/{self.alice_card.id}/",
            {"is_available": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_can_mark_unavailable_when_no_active_offer(self):
        resp = self.client.patch(
            f"/api/cards/{self.alice_card.id}/",
            {"is_available": False},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
