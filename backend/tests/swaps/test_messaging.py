"""
Sprint 6 tests — Messaging, SwapDetails coordination, and offer completion.

Test groups:
  MessageListTests        — GET  /api/offers/{id}/messages/
  MessageCreateTests      — POST /api/offers/{id}/messages/
  SwapDetailsRetrieveTests— GET  /api/offers/{id}/swap/
  SetModeTests            — POST /api/offers/{id}/swap/set_mode/
  ProposeMeetupTests      — POST /api/offers/{id}/swap/propose_meetup/
  ConfirmMeetupTests      — POST /api/offers/{id}/swap/confirm_meetup/
  CompleteOfferTests      — POST /api/offers/{id}/complete/
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from urllib.parse import quote

from cards.models import Card
from swaps.models import Message, Offer, OfferItem, SwapDetails

User = get_user_model()


# ---------------------------------------------------------------------------
# Shared base — same pattern as test_views.py
# ---------------------------------------------------------------------------

class Sprint6TestBase(APITestCase):
    """
    Creates alice + bob with one card each.
    _make_accepted_offer() creates an offer + SwapDetails in one call so
    individual test methods stay concise.
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

    def _make_accepted_offer(self):
        """Create a pending offer, accept it (creating SwapDetails), return the offer."""
        offer = Offer.objects.create(
            initiator_user=self.alice,
            target_user=self.bob,
            status="accepted",
            accepted_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        OfferItem.objects.create(offer=offer, card=self.alice_card, item_type="offered")
        OfferItem.objects.create(offer=offer, card=self.bob_card, item_type="requested")
        SwapDetails.objects.create(offer=offer)
        return offer

    def _msgs_url(self, offer_id):
        return f"/api/offers/{offer_id}/messages/"

    def _swap_url(self, offer_id, suffix=""):
        return f"/api/offers/{offer_id}/swap/{suffix}"


# ---------------------------------------------------------------------------
# GET /api/offers/{id}/messages/
# ---------------------------------------------------------------------------

class MessageListTests(Sprint6TestBase):

    def test_list_messages_empty_for_new_offer(self):
        offer = self._make_accepted_offer()
        resp = self.client.get(self._msgs_url(offer.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data, [])

    def test_list_messages_returns_messages_in_order(self):
        offer = self._make_accepted_offer()
        Message.objects.create(offer=offer, sender_user=self.alice, content="Hello Bob!")
        Message.objects.create(offer=offer, sender_user=self.bob, content="Hi Alice!")
        resp = self.client.get(self._msgs_url(offer.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(resp.data[0]["content"], "Hello Bob!")

    def test_list_messages_since_filter(self):
        offer = self._make_accepted_offer()
        m1 = Message.objects.create(offer=offer, sender_user=self.alice, content="Old")
        # Back-date m1 to 2s ago so m2 (created now) is clearly newer than `later`
        Message.objects.filter(pk=m1.pk).update(
            created_at=timezone.now() - timezone.timedelta(seconds=2)
        )
        m1.refresh_from_db()
        later = m1.created_at + timezone.timedelta(seconds=1)
        Message.objects.create(offer=offer, sender_user=self.bob, content="New")
        resp = self.client.get(
            self._msgs_url(offer.id) + f"?since={quote(later.isoformat())}"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["content"], "New")

    def test_outsider_cannot_list_messages(self):
        offer = self._make_accepted_offer()
        Message.objects.create(offer=offer, sender_user=self.alice, content="Secret")
        eve = User.objects.create_user(
            username="eve", email="eve@example.com", password="pass"
        )
        self.client.force_authenticate(user=eve)
        resp = self.client.get(self._msgs_url(offer.id))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/messages/
# ---------------------------------------------------------------------------

class MessageCreateTests(Sprint6TestBase):

    def test_send_message_on_accepted_offer(self):
        offer = self._make_accepted_offer()
        resp = self.client.post(
            self._msgs_url(offer.id), {"content": "Where should we meet?"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["sender_username"], "alice")
        self.assertFalse(resp.data["is_system_message"])

    def test_send_message_on_pending_offer_rejected(self):
        # Pending offer — messaging not allowed yet
        offer = Offer.objects.create(
            initiator_user=self.alice,
            target_user=self.bob,
            status="pending",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = self.client.post(
            self._msgs_url(offer.id), {"content": "Early message"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_target_can_also_send_message(self):
        offer = self._make_accepted_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(
            self._msgs_url(offer.id), {"content": "Works for me!"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["sender_username"], "bob")

    def test_outsider_cannot_send_message(self):
        offer = self._make_accepted_offer()
        eve = User.objects.create_user(
            username="eve2", email="eve2@example.com", password="pass"
        )
        self.client.force_authenticate(user=eve)
        resp = self.client.post(
            self._msgs_url(offer.id), {"content": "Hack!"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# GET /api/offers/{id}/swap/
# ---------------------------------------------------------------------------

class SwapDetailsRetrieveTests(Sprint6TestBase):

    def test_retrieve_swap_details(self):
        offer = self._make_accepted_offer()
        resp = self.client.get(self._swap_url(offer.id))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data["swap_mode"])

    def test_retrieve_swap_details_pending_offer_404(self):
        offer = Offer.objects.create(
            initiator_user=self.alice,
            target_user=self.bob,
            status="pending",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = self.client.get(self._swap_url(offer.id))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/swap/set_mode/
# ---------------------------------------------------------------------------

class SetModeTests(Sprint6TestBase):

    def test_set_mode_in_person(self):
        offer = self._make_accepted_offer()
        resp = self.client.post(
            self._swap_url(offer.id, "set_mode/"), {"swap_mode": "in_person"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["swap_mode"], "in_person")
        self.assertIsNotNone(resp.data["mode_decided_at"])

    def test_set_mode_creates_system_message(self):
        offer = self._make_accepted_offer()
        self.client.post(
            self._swap_url(offer.id, "set_mode/"), {"swap_mode": "mail"}, format="json"
        )
        system_msgs = Message.objects.filter(offer=offer, is_system_message=True)
        self.assertTrue(system_msgs.exists())

    def test_set_mode_invalid_value(self):
        offer = self._make_accepted_offer()
        resp = self.client.post(
            self._swap_url(offer.id, "set_mode/"), {"swap_mode": "carrier_pigeon"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_set_mode_target_can_also_set(self):
        offer = self._make_accepted_offer()
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(
            self._swap_url(offer.id, "set_mode/"), {"swap_mode": "in_person"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/swap/propose_meetup/
# ---------------------------------------------------------------------------

class ProposeMeetupTests(Sprint6TestBase):

    def _accept_and_set_in_person(self):
        offer = self._make_accepted_offer()
        offer.swap_details.swap_mode = "in_person"
        offer.swap_details.save()
        return offer

    def test_propose_meetup_happy_path(self):
        offer = self._accept_and_set_in_person()
        resp = self.client.post(
            self._swap_url(offer.id, "propose_meetup/"),
            {
                "proposed_location": "Starbucks on 5th & Pike",
                "proposed_datetime": "2026-06-01T14:00:00Z",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["proposed_location"], "Starbucks on 5th & Pike")

    def test_propose_meetup_resets_confirmations(self):
        offer = self._accept_and_set_in_person()
        details = offer.swap_details
        details.in_person_confirmed_initiator = True
        details.in_person_confirmed_target = True
        details.save()

        self.client.post(
            self._swap_url(offer.id, "propose_meetup/"),
            {
                "proposed_location": "New location",
                "proposed_datetime": "2026-06-02T10:00:00Z",
            },
            format="json",
        )
        details.refresh_from_db()
        self.assertFalse(details.in_person_confirmed_initiator)
        self.assertFalse(details.in_person_confirmed_target)

    def test_propose_meetup_on_mail_mode_rejected(self):
        offer = self._make_accepted_offer()
        offer.swap_details.swap_mode = "mail"
        offer.swap_details.save()
        resp = self.client.post(
            self._swap_url(offer.id, "propose_meetup/"),
            {"proposed_location": "Starbucks", "proposed_datetime": "2026-06-01T14:00:00Z"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/swap/confirm_meetup/
# ---------------------------------------------------------------------------

class ConfirmMeetupTests(Sprint6TestBase):

    def _setup_proposed(self):
        offer = self._make_accepted_offer()
        details = offer.swap_details
        details.swap_mode = "in_person"
        details.proposed_location = "Starbucks"
        details.proposed_datetime = timezone.now() + timezone.timedelta(days=3)
        details.save()
        return offer

    def test_initiator_confirms(self):
        offer = self._setup_proposed()
        resp = self.client.post(self._swap_url(offer.id, "confirm_meetup/"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["in_person_confirmed_initiator"])
        self.assertFalse(resp.data["in_person_confirmed_target"])

    def test_both_confirm_sets_confirmed_at(self):
        offer = self._setup_proposed()
        self.client.post(self._swap_url(offer.id, "confirm_meetup/"))
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(self._swap_url(offer.id, "confirm_meetup/"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["in_person_confirmed_at"])

    def test_confirm_without_proposal_rejected(self):
        offer = self._make_accepted_offer()
        resp = self.client.post(self._swap_url(offer.id, "confirm_meetup/"))
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# POST /api/offers/{id}/complete/
# ---------------------------------------------------------------------------

class CompleteOfferTests(Sprint6TestBase):

    def test_initiator_marks_complete_first(self):
        offer = self._make_accepted_offer()
        resp = self.client.post(f"/api/offers/{offer.id}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # One side confirmed — still accepted
        self.assertEqual(resp.data["status"], "accepted")

    def test_both_mark_complete_transitions_to_completed(self):
        offer = self._make_accepted_offer()
        self.client.post(f"/api/offers/{offer.id}/complete/")
        self.client.force_authenticate(user=self.bob)
        resp = self.client.post(f"/api/offers/{offer.id}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "completed")

    def test_complete_on_pending_offer_rejected(self):
        offer = Offer.objects.create(
            initiator_user=self.alice,
            target_user=self.bob,
            status="pending",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = self.client.post(f"/api/offers/{offer.id}/complete/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_both_complete_creates_system_message(self):
        offer = self._make_accepted_offer()
        self.client.post(f"/api/offers/{offer.id}/complete/")
        self.client.force_authenticate(user=self.bob)
        self.client.post(f"/api/offers/{offer.id}/complete/")
        system_msgs = Message.objects.filter(offer=offer, is_system_message=True)
        self.assertTrue(system_msgs.exists())
