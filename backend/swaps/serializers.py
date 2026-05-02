"""
Serializers for the Offers / Swaps system.

Four serializers, each serving a distinct purpose:
  OfferParticipantSerializer  — minimal user info (id + username) embedded in offers
  OfferItemSerializer         — one card line-item inside an offer, with nested card detail
  OfferListSerializer         — lightweight summary for the inbox list (no full item details)
  OfferDetailSerializer       — full offer with all items, used on the detail page
  CreateOfferSerializer       — validates and creates a new offer (ownership checks here)
  CounterOfferSerializer      — validates new card selections for a counteroffer
  MessageSerializer           — a single chat message on an offer thread
  SwapDetailsSerializer       — post-acceptance coordination record
  SetModeSerializer           — input for choosing in_person vs mail
  ProposeMeetupSerializer     — input for proposing in-person location + datetime
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from cards.models import Card
from .models import Message, Offer, OfferItem, SwapDetails

User = get_user_model()


class OfferParticipantSerializer(serializers.ModelSerializer):
    """Minimal user info nested inside offer responses."""

    class Meta:
        model = User
        fields = ['id', 'username']


class OfferItemCardSerializer(serializers.ModelSerializer):
    """Card detail nested inside an OfferItem."""

    class Meta:
        model = Card
        fields = ['id', 'card_name', 'set_code', 'condition', 'is_foil', 'language', 'quantity']


class OfferItemSerializer(serializers.ModelSerializer):
    """
    Single line-item in an offer.
    item_type tells the reader whether this card is being offered or requested.
    """

    card = OfferItemCardSerializer(read_only=True)

    class Meta:
        model = OfferItem
        fields = ['id', 'card', 'item_type']


class OfferListSerializer(serializers.ModelSerializer):
    """
    Lightweight summary for the offers inbox.

    Why separate from OfferDetailSerializer?
    The inbox renders a list of potentially many offers. Embedding all item
    details (card names, set codes, etc.) for every row would over-fetch.
    Instead we just show participant names + a card count summary so the user
    can decide which offer to open.
    """

    initiator = OfferParticipantSerializer(source='initiator_user', read_only=True)
    target = OfferParticipantSerializer(source='target_user', read_only=True)
    offered_count = serializers.SerializerMethodField()
    requested_count = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = [
            'id',
            'initiator',
            'target',
            'status',
            'counteroffer_count',
            'offered_count',
            'requested_count',
            'created_at',
            'expires_at',
        ]

    def get_offered_count(self, obj):
        return obj.items.filter(item_type='offered').count()

    def get_requested_count(self, obj):
        return obj.items.filter(item_type='requested').count()


class OfferDetailSerializer(serializers.ModelSerializer):
    """
    Full offer detail including all card line-items.
    Used on the offer detail page and as the response for create/accept/etc.
    """

    initiator = OfferParticipantSerializer(source='initiator_user', read_only=True)
    target = OfferParticipantSerializer(source='target_user', read_only=True)
    items = OfferItemSerializer(many=True, read_only=True)

    class Meta:
        model = Offer
        fields = [
            'id',
            'initiator',
            'target',
            'status',
            'counteroffer_count',
            'max_counteroffers',
            'items',
            'created_at',
            'updated_at',
            'accepted_at',
            'expires_at',
        ]


class CreateOfferSerializer(serializers.Serializer):
    """
    Validates and creates a new offer.

    Why a plain Serializer (not ModelSerializer)?
    The creation logic involves validating two lists of card IDs against
    ownership rules, then writing to two tables (Offer + OfferItem rows).
    A ModelSerializer would only handle the Offer row — the multi-table
    write logic belongs here in create().

    Ownership rules enforced:
    - offered_card_ids  → must all belong to request.user, is_available=True
    - requested_card_ids → must all belong to target_user, is_available=True
    """

    target_user_id = serializers.UUIDField()
    offered_card_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1
    )
    requested_card_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1
    )

    def validate(self, data):
        user = self.context['request'].user

        # Resolve target user
        try:
            target_user = User.objects.get(id=data['target_user_id'])
        except User.DoesNotExist:
            raise serializers.ValidationError({'target_user_id': 'User not found.'})

        if target_user == user:
            raise serializers.ValidationError(
                {'target_user_id': 'You cannot make an offer to yourself.'}
            )

        # Validate offered cards (must be caller's + available)
        offered_cards = list(
            Card.objects.filter(
                id__in=data['offered_card_ids'],
                user=user,
                is_available=True,
            )
        )
        if len(offered_cards) != len(data['offered_card_ids']):
            raise serializers.ValidationError(
                {'offered_card_ids': 'One or more offered cards are invalid or not available.'}
            )

        # Validate requested cards (must be target's + available)
        requested_cards = list(
            Card.objects.filter(
                id__in=data['requested_card_ids'],
                user=target_user,
                is_available=True,
            )
        )
        if len(requested_cards) != len(data['requested_card_ids']):
            raise serializers.ValidationError(
                {'requested_card_ids': 'One or more requested cards are invalid or not available.'}
            )

        data['target_user'] = target_user
        data['offered_cards'] = offered_cards
        data['requested_cards'] = requested_cards
        return data

    def create(self, validated_data):
        user = self.context['request'].user

        offer = Offer.objects.create(
            initiator_user=user,
            target_user=validated_data['target_user'],
        )

        for card in validated_data['offered_cards']:
            OfferItem.objects.create(offer=offer, card=card, item_type='offered')

        for card in validated_data['requested_cards']:
            OfferItem.objects.create(offer=offer, card=card, item_type='requested')

        return offer


class CounterOfferSerializer(serializers.Serializer):
    """Card selections for a counteroffer. Ownership validation happens in the view."""

    offered_card_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1
    )
    requested_card_ids = serializers.ListField(
        child=serializers.UUIDField(), min_length=1
    )


class MessageSerializer(serializers.ModelSerializer):
    """
    A single message in an offer's chat thread.

    sender_username is a convenience field — the frontend needs to display a
    name without a second API call. Read-only; sender is set from request.user
    in the view, never from the request body (prevents impersonation).
    """

    sender_username = serializers.CharField(
        source='sender_user.username', read_only=True, default=None
    )

    class Meta:
        model = Message
        fields = ['id', 'sender_username', 'content', 'is_system_message', 'created_at']
        read_only_fields = ['id', 'sender_username', 'is_system_message', 'created_at']


class SwapDetailsSerializer(serializers.ModelSerializer):
    """
    Full swap coordination record.

    Read-only on retrieve. Individual fields are updated via dedicated
    actions (set_mode, propose_meetup, confirm_meetup, mark_complete) rather
    than a PATCH, so the state-machine logic lives in the view, not here.
    """

    class Meta:
        model = SwapDetails
        fields = [
            'id',
            'swap_mode',
            'mode_decided_at',
            'proposed_location',
            'proposed_datetime',
            'in_person_confirmed_initiator',
            'in_person_confirmed_target',
            'in_person_confirmed_at',
            'completed_by_initiator',
            'completed_by_target',
            'swap_completed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class SetModeSerializer(serializers.Serializer):
    """Input for POST /api/offers/<id>/swap/set_mode/."""

    VALID_MODES = ['in_person', 'mail']
    swap_mode = serializers.ChoiceField(choices=VALID_MODES)


class ProposeMeetupSerializer(serializers.Serializer):
    """Input for POST /api/offers/<id>/swap/propose_meetup/."""

    proposed_location = serializers.CharField(max_length=500)
    proposed_datetime = serializers.DateTimeField()
