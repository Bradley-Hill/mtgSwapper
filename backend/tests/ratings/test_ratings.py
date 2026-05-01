"""

Test groups:
  SubmitRatingTests     — POST /api/ratings/
  ReputationSignalTests — reputation_avg + total_swaps_completed update after rating
  UserRatingsListTests  — GET  /api/users/{id}/ratings/
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card
from ratings.models import Rating
from swaps.models import Offer, OfferItem, SwapDetails

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------

class RatingTestBase(APITestCase):
    """
    Creates alice + bob with one card each, and a helper to build a
    completed offer in one call so individual tests stay readable.
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

    def _make_completed_offer(self, initiator=None, target=None):
        """Create a completed offer between two users (default: alice → bob)."""
        initiator = initiator or self.alice
        target = target or self.bob
        offer = Offer.objects.create(
            initiator_user=initiator,
            target_user=target,
            status="completed",
            accepted_at=timezone.now(),
            completed_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        OfferItem.objects.create(offer=offer, card=self.alice_card, item_type="offered")
        OfferItem.objects.create(offer=offer, card=self.bob_card, item_type="requested")
        SwapDetails.objects.create(offer=offer)
        return offer

    def _make_pending_offer(self):
        return Offer.objects.create(
            initiator_user=self.alice,
            target_user=self.bob,
            status="pending",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )


# ---------------------------------------------------------------------------
# POST /api/ratings/
# ---------------------------------------------------------------------------

class SubmitRatingTests(RatingTestBase):

    def test_initiator_can_rate_completed_swap(self):
        offer = self._make_completed_offer()
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 5, "comment": "Great trader!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["rating_stars"], 5)
        self.assertEqual(resp.data["rater_username"], "alice")

    def test_target_can_rate_completed_swap(self):
        offer = self._make_completed_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 4},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["rater_username"], "bob")

    def test_cannot_rate_pending_offer(self):
        offer = self._make_pending_offer()
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_outsider_cannot_rate(self):
        offer = self._make_completed_offer()
        eve = User.objects.create_user(
            username="eve", email="eve@example.com", password="pass"
        )
        self.client.force_authenticate(user=eve)
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_rate_same_swap_twice(self):
        offer = self._make_completed_offer()
        self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 5},
            format="json",
        )
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 3},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_stars_out_of_range_rejected(self):
        offer = self._make_completed_offer()
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 6},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nonexistent_offer_returns_404(self):
        import uuid
        resp = self.client.post(
            "/api/ratings/",
            {"offer_id": str(uuid.uuid4()), "rating_stars": 5},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Signal: reputation_avg + total_swaps_completed
# ---------------------------------------------------------------------------

class ReputationSignalTests(RatingTestBase):

    def test_reputation_avg_updates_after_rating(self):
        offer = self._make_completed_offer()
        self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 4},
            format="json",
        )
        self.bob.refresh_from_db()
        self.assertEqual(float(self.bob.reputation_avg), 4.0)

    def test_reputation_avg_averages_multiple_ratings(self):
        # alice → bob: 5 stars
        offer1 = self._make_completed_offer()
        self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer1.id), "rating_stars": 5},
            format="json",
        )
        # Create a third user, also rates bob: 3 stars
        carol = User.objects.create_user(
            username="carol", email="carol@example.com", password="pass"
        )
        carol_card = Card.objects.create(
            user=carol, scryfall_id="ccc-333", card_name="Counterspell",
            set_code="M10", set_name="Magic 2010", card_type="Instant", is_available=True,
        )
        offer2 = Offer.objects.create(
            initiator_user=carol, target_user=self.bob, status="completed",
            accepted_at=timezone.now(), completed_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        OfferItem.objects.create(offer=offer2, card=carol_card, item_type="offered")
        OfferItem.objects.create(offer=offer2, card=self.bob_card, item_type="requested")
        SwapDetails.objects.create(offer=offer2)
        self.client.force_authenticate(user=carol)
        self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer2.id), "rating_stars": 3},
            format="json",
        )
        self.bob.refresh_from_db()
        self.assertEqual(float(self.bob.reputation_avg), 4.0)  # (5+3)/2

    def test_total_swaps_completed_updates_after_rating(self):
        offer = self._make_completed_offer()
        self.client.post(
            "/api/ratings/",
            {"offer_id": str(offer.id), "rating_stars": 5},
            format="json",
        )
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.total_swaps_completed, 1)


# ---------------------------------------------------------------------------
# GET /api/users/{id}/ratings/
# ---------------------------------------------------------------------------

class UserRatingsListTests(RatingTestBase):

    def test_list_ratings_for_user(self):
        offer = self._make_completed_offer()
        Rating.objects.create(
            rater_user=self.alice,
            rated_user=self.bob,
            offer=offer,
            rating_stars=5,
            comment="Perfect!",
        )
        resp = self.client.get(f"/api/users/{self.bob.id}/ratings/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["rater_username"], "alice")
        self.assertEqual(resp.data[0]["rating_stars"], 5)

    def test_list_ratings_empty_for_new_user(self):
        resp = self.client.get(f"/api/users/{self.bob.id}/ratings/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])
