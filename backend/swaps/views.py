"""
Views for the Offers / Swaps system.
"""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cards.models import Card
from .models import Offer, OfferItem, SwapDetails
from .serializers import (
    CounterOfferSerializer,
    CreateOfferSerializer,
    OfferDetailSerializer,
    OfferListSerializer,
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

