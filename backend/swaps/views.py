"""
Views for the Offers / Swaps system.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cards.models import Card
from .models import Message, Offer, OfferItem, SwapDetails
from .serializers import (
    CounterOfferSerializer,
    CreateOfferSerializer,
    MessageSerializer,
    OfferDetailSerializer,
    OfferListSerializer,
    ProposeMeetupSerializer,
    SetModeSerializer,
    SwapDetailsSerializer,
)


class OfferViewSet(viewsets.GenericViewSet):
    """
    API endpoints for swap offers.

    Why GenericViewSet (not ModelViewSet)?
    ModelViewSet auto-generates list/create/retrieve/update/destroy. We only
    want list/retrieve/create plus custom actions (accept, decline, cancel,
    counteroffer). Using GenericViewSet means we define exactly what we expose
    and nothing else — no accidental PUT /api/offers/{id}/ that bypasses the
    state machine logic.

    Permission model: Any authenticated user can create an offer. All other
    actions check participant status inside the action method rather than via
    a custom permission class — this is simpler and keeps the logic readable.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OfferDetailSerializer

    def get_queryset(self):
        """
        Return all offers where the current user is initiator OR target.

        select_related fetches the FK rows (participants, last_counteroffer_by)
        in the same query. prefetch_related('items__card') handles the nested
        item→card in one extra query rather than N queries per offer.
        """
        user = self.request.user
        return (
            Offer.objects
            .filter(Q(initiator_user=user) | Q(target_user=user))
            .select_related('initiator_user', 'target_user', 'last_counteroffer_by')
            .prefetch_related('items__card')
        )

    # ── List ──────────────────────────────────────────────────────────────────

    def list(self, request):
        """
        GET /api/offers/
        Optional query params: ?status=pending&direction=sent|received
        """
        qs = self.get_queryset()

        status_filter = request.query_params.get('status')
        direction = request.query_params.get('direction')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if direction == 'sent':
            qs = qs.filter(initiator_user=request.user)
        elif direction == 'received':
            qs = qs.filter(target_user=request.user)

        serializer = OfferListSerializer(qs, many=True)
        return Response(serializer.data)

    # ── Retrieve ──────────────────────────────────────────────────────────────

    def retrieve(self, request, pk=None):
        """
        GET /api/offers/{id}/
        Only accessible to the two offer participants (get_queryset enforces this).
        A non-participant gets 404, not 403 — we don't leak offer existence.
        """
        offer = self.get_object()
        return Response(OfferDetailSerializer(offer).data)

    # ── Create ────────────────────────────────────────────────────────────────

    def create(self, request):
        """POST /api/offers/"""
        serializer = CreateOfferSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        offer = serializer.save()
        return Response(
            OfferDetailSerializer(offer).data,
            status=status.HTTP_201_CREATED,
        )

    # ── Accept ────────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """POST /api/offers/{id}/accept/ — target user only."""
        offer = self.get_object()

        if offer.target_user != request.user:
            return Response(
                {'error': 'Only the target user can accept this offer.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if offer.status != 'pending':
            return Response(
                {'error': 'Only pending offers can be accepted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        offer.status = 'accepted'
        offer.accepted_at = timezone.now()
        offer.save()

        # Creating SwapDetails unlocks messaging + coordination (Sprint 6)
        SwapDetails.objects.create(offer=offer)

        return Response(OfferDetailSerializer(offer).data)

    # ── Decline ───────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        """POST /api/offers/{id}/decline/ — target user only."""
        offer = self.get_object()

        if offer.target_user != request.user:
            return Response(
                {'error': 'Only the target user can decline this offer.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if offer.status != 'pending':
            return Response(
                {'error': 'Only pending offers can be declined.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        offer.status = 'declined'
        offer.declined_at = timezone.now()
        offer.save()

        return Response(OfferDetailSerializer(offer).data)

    # ── Cancel ────────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """POST /api/offers/{id}/cancel/ — initiator only, while pending."""
        offer = self.get_object()

        if offer.initiator_user != request.user:
            return Response(
                {'error': 'Only the initiator can cancel this offer.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if offer.status != 'pending':
            return Response(
                {'error': 'Only pending offers can be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        offer.status = 'cancelled'
        offer.save()

        return Response(OfferDetailSerializer(offer).data)

    # ── Counteroffer ──────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def counteroffer(self, request, pk=None):
        """
        POST /api/offers/{id}/counteroffer/

        Either participant can counter, but NOT the same user who made the
        last counteroffer — enforces a ping-pong negotiation pattern.

        Side effects:
        - Existing OfferItems deleted and replaced with new selections
        - counteroffer_count incremented
        - last_counteroffer_by set to caller
        - expires_at extended 7 days from now
        """
        offer = self.get_object()
        user = request.user

        if offer.status != 'pending':
            return Response(
                {'error': 'Can only counteroffer on pending offers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if offer.counteroffer_count >= offer.max_counteroffers:
            return Response(
                {'error': 'Maximum number of counteroffers reached.'},
                status=status.HTTP_409_CONFLICT,
            )
        if offer.last_counteroffer_by == user:
            return Response(
                {'error': 'You cannot counteroffer when you made the last counteroffer.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CounterOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        offered_ids = serializer.validated_data['offered_card_ids']
        requested_ids = serializer.validated_data['requested_card_ids']

        # The caller offers their own cards and requests the other party's cards
        other_user = (
            offer.target_user if user == offer.initiator_user else offer.initiator_user
        )

        offered_cards = list(
            Card.objects.filter(id__in=offered_ids, user=user, is_available=True)
        )
        if len(offered_cards) != len(offered_ids):
            return Response(
                {'error': 'One or more offered cards are invalid or not available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requested_cards = list(
            Card.objects.filter(id__in=requested_ids, user=other_user, is_available=True)
        )
        if len(requested_cards) != len(requested_ids):
            return Response(
                {'error': 'One or more requested cards are invalid or not available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Replace all existing items with the new selections
        offer.items.all().delete()
        for card in offered_cards:
            OfferItem.objects.create(offer=offer, card=card, item_type='offered')
        for card in requested_cards:
            OfferItem.objects.create(offer=offer, card=card, item_type='requested')

        offer.counteroffer_count += 1
        offer.last_counteroffer_by = user
        offer.expires_at = timezone.now() + timedelta(days=7)
        offer.save()

        return Response(OfferDetailSerializer(offer).data)

    # ── Complete ──────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """
        POST /api/offers/{id}/complete/

        Each participant calls this independently. When both have confirmed,
        the offer status flips to 'completed' and swap_completed_at is set.

        Why two-step instead of one-step?
        A single "mark complete" button creates an asymmetric confirmation
        problem — one user marks done before the other has received their
        cards. Two booleans ensure both parties physically confirm the swap
        happened before reputation and stats are updated.
        """
        offer = self.get_object()

        if offer.status != 'accepted':
            return Response(
                {'error': 'Only accepted offers can be marked complete.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            details = offer.swap_details
        except SwapDetails.DoesNotExist:
            return Response(
                {'error': 'Swap details not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        if user == offer.initiator_user:
            details.completed_by_initiator = True
        elif user == offer.target_user:
            details.completed_by_target = True
        else:
            return Response(
                {'error': 'You are not a participant in this offer.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Both confirmed → complete the offer atomically
        if details.completed_by_initiator and details.completed_by_target:
            with transaction.atomic():
                details.swap_completed_at = timezone.now()
                offer.status = 'completed'
                offer.completed_at = timezone.now()
                offer.save()

                # Re-assign cards to their new owners and mark unavailable.
                # item_type='offered'   → initiator gave these → go to target_user
                # item_type='requested' → target gave these   → go to initiator_user
                items = OfferItem.objects.filter(offer=offer).select_related('card')
                cards_to_update = []
                for item in items:
                    card = item.card
                    if item.item_type == 'offered':
                        card.user = offer.target_user
                    else:
                        card.user = offer.initiator_user
                    card.is_available = False
                    cards_to_update.append(card)
                Card.objects.bulk_update(cards_to_update, ['user', 'is_available'])

                Message.objects.create(
                    offer=offer,
                    sender_user=None,
                    content='Swap marked as complete by both parties.',
                    is_system_message=True,
                )

        details.save()
        return Response(OfferDetailSerializer(offer).data)


# ── Message ViewSet ────────────────────────────────────────────────────────────

class MessageViewSet(viewsets.GenericViewSet):
    """
    GET  /api/offers/{offer_pk}/messages/       — list all messages for the offer
    POST /api/offers/{offer_pk}/messages/       — send a new message

    Why GenericViewSet instead of ModelViewSet?
    We only expose list + create. Editing or deleting messages is out of scope
    for Phase 1 — chats are a record of negotiation and should be immutable.

    Privacy: get_queryset filters to offers the current user participates in,
    so a non-participant gets an empty queryset (→ 404 on detail, empty list
    on list). No information is leaked about offer existence to outsiders.

    Polling: The frontend calls GET every 3 seconds. `?since=<iso_datetime>`
    is supported to return only messages newer than a given timestamp, keeping
    payloads small as threads grow.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def _get_offer(self, offer_pk):
        """Return the offer if the current user is a participant, else 404."""
        user = self.request.user
        return Offer.objects.filter(
            Q(initiator_user=user) | Q(target_user=user),
            pk=offer_pk,
        ).first()

    def list(self, request, offer_pk=None):
        """GET /api/offers/{offer_pk}/messages/"""
        offer = self._get_offer(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)

        qs = Message.objects.filter(offer=offer)

        since = request.query_params.get('since')
        if since:
            try:
                from django.utils.dateparse import parse_datetime
                since_dt = parse_datetime(since)
                if since_dt:
                    qs = qs.filter(created_at__gt=since_dt)
            except (ValueError, TypeError):
                pass  # Invalid since param — just return all messages

        return Response(MessageSerializer(qs, many=True).data)

    def create(self, request, offer_pk=None):
        """POST /api/offers/{offer_pk}/messages/"""
        offer = self._get_offer(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)

        if offer.status not in ('accepted', 'completed'):
            return Response(
                {'error': 'Messaging is only available on accepted or completed offers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = MessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        message = Message.objects.create(
            offer=offer,
            sender_user=request.user,
            content=serializer.validated_data['content'],
        )
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


# ── SwapDetails ViewSet ────────────────────────────────────────────────────────

class SwapDetailsViewSet(viewsets.GenericViewSet):
    """
    Swap coordination endpoints, all nested under /api/offers/{offer_pk}/swap/.

    GET    /api/offers/{offer_pk}/swap/               — retrieve coordination record
    POST   /api/offers/{offer_pk}/swap/set_mode/      — choose in_person or mail
    POST   /api/offers/{offer_pk}/swap/propose_meetup/ — set location + datetime
    POST   /api/offers/{offer_pk}/swap/confirm_meetup/ — confirm the proposed meetup

    Why separate from OfferViewSet?
    SwapDetails is a one-to-one extension of Offer that only exists post-
    acceptance. Keeping its endpoints under their own ViewSet makes the routing
    explicit and avoids overloading OfferViewSet with coordination logic.

    Who can do what?
    - set_mode: either participant
    - propose_meetup: either participant
    - confirm_meetup: either participant (confirming their own side)
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SwapDetailsSerializer

    def _get_details(self, offer_pk):
        """Return (offer, details) if user is a participant and offer is accepted."""
        user = self.request.user
        offer = (
            Offer.objects
            .filter(Q(initiator_user=user) | Q(target_user=user), pk=offer_pk)
            .first()
        )
        if not offer:
            return None, None
        try:
            return offer, offer.swap_details
        except SwapDetails.DoesNotExist:
            return offer, None

    def list(self, request, offer_pk=None):
        """GET /api/offers/{offer_pk}/swap/"""
        offer, details = self._get_details(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not details:
            return Response({'error': 'Swap details not available yet.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(SwapDetailsSerializer(details).data)

    @action(detail=False, methods=['post'], url_path='set_mode')
    def set_mode(self, request, offer_pk=None):
        """POST /api/offers/{offer_pk}/swap/set_mode/"""
        offer, details = self._get_details(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not details:
            return Response({'error': 'Swap details not available yet.'}, status=status.HTTP_404_NOT_FOUND)
        if offer.status != 'accepted':
            return Response({'error': 'Offer must be accepted to set mode.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SetModeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mode = serializer.validated_data['swap_mode']
        details.swap_mode = mode
        details.mode_decided_at = timezone.now()
        details.save()

        Message.objects.create(
            offer=offer,
            sender_user=None,
            content=f'Swap mode set to {"in-person meetup" if mode == "in_person" else "mail swap"}.',
            is_system_message=True,
        )

        return Response(SwapDetailsSerializer(details).data)

    @action(detail=False, methods=['post'], url_path='propose_meetup')
    def propose_meetup(self, request, offer_pk=None):
        """POST /api/offers/{offer_pk}/swap/propose_meetup/"""
        offer, details = self._get_details(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not details:
            return Response({'error': 'Swap details not available yet.'}, status=status.HTTP_404_NOT_FOUND)
        if details.swap_mode != 'in_person':
            return Response({'error': 'Meetup details are only for in-person swaps.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ProposeMeetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Reset confirmations whenever a new proposal is made — both must re-confirm
        details.proposed_location = serializer.validated_data['proposed_location']
        details.proposed_datetime = serializer.validated_data['proposed_datetime']
        details.in_person_confirmed_initiator = False
        details.in_person_confirmed_target = False
        details.in_person_confirmed_at = None
        details.save()

        Message.objects.create(
            offer=offer,
            sender_user=request.user,
            content=(
                f'Meetup proposed: {details.proposed_location} at '
                f'{details.proposed_datetime.strftime("%Y-%m-%d %H:%M UTC")}.'
            ),
            is_system_message=True,
        )

        return Response(SwapDetailsSerializer(details).data)

    @action(detail=False, methods=['post'], url_path='confirm_meetup')
    def confirm_meetup(self, request, offer_pk=None):
        """POST /api/offers/{offer_pk}/swap/confirm_meetup/"""
        offer, details = self._get_details(offer_pk)
        if not offer:
            return Response({'error': 'Offer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not details:
            return Response({'error': 'Swap details not available yet.'}, status=status.HTTP_404_NOT_FOUND)
        if not details.proposed_location:
            return Response({'error': 'No meetup has been proposed yet.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if user == offer.initiator_user:
            details.in_person_confirmed_initiator = True
        elif user == offer.target_user:
            details.in_person_confirmed_target = True

        if details.in_person_confirmed_initiator and details.in_person_confirmed_target:
            details.in_person_confirmed_at = timezone.now()
            Message.objects.create(
                offer=offer,
                sender_user=None,
                content='Both parties confirmed the meetup details.',
                is_system_message=True,
            )

        details.save()
        return Response(SwapDetailsSerializer(details).data)
