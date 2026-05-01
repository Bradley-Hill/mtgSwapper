import uuid
from django.db import models
from django.utils import timezone
from datetime import timedelta
from users.models import User
from cards.models import Card


class Offer(models.Model):
    """
    Swap offer (negotiation record). Tracks entire offer lifecycle.
    
    Workflow:
    1. Initiator creates offer (status='pending')
    2. Target responds: Accept (status='accepted') OR Counteroffer (counteroffer_count += 1, stays 'pending')
    3. After max 4 counteroffers, offer expires or is accepted
    4. Once accepted, unlock SwapDetails for coordination
    5. After swap completed, offer status='completed'
    
    Expiration:
    - Starts at 7 days from creation
    - Renewed by 7 days each counteroffer (app logic handles renewal)
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Participants
    initiator_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='offers_sent'
    )
    target_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='offers_received'
    )
    
    # Status & Negotiation
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    
    # Counteroffer tracking
    counteroffer_count = models.IntegerField(default=0)
    max_counteroffers = models.IntegerField(default=4)
    last_counteroffer_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='last_countered_offers',
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)  # Set to 7 days in view
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['initiator_user_id']),
            models.Index(fields=['target_user_id']),
            models.Index(fields=['status']),
            models.Index(fields=['status', 'expires_at']),  # For expiry check
        ]
    
    def __str__(self):
        return f"Offer: {self.initiator_user.username} → {self.target_user.username} ({self.status})"
    
    def save(self, *args, **kwargs):
        # Set default expiry on creation.
        # Must use self._state.adding rather than `not self.pk` because
        # UUIDField(default=uuid.uuid4) pre-populates pk before save() runs,
        # making `not self.pk` always False for new objects.
        if self._state.adding and not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)


class OfferItem(models.Model):
    """
    Line items in an offer. Each row = ONE CARD in the offer.
    
    Example:
    - Offer 1: Initiator offers [Card A, Card A, Card B] and wants [Card C]
    - Creates 4 OfferItem rows:
      - (offer=1, card=A, item_type='offered')
      - (offer=1, card=A, item_type='offered')  ← duplicate allowed (different copies)
      - (offer=1, card=B, item_type='offered')
      - (offer=1, card=C, item_type='requested')
    
    Note: With this design, quantity is implicit in row count.
    To counteroffer: Delete old items, insert new items for same offer.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    offer = models.ForeignKey(
        Offer,
        on_delete=models.CASCADE,
        related_name='items'
    )
    card = models.ForeignKey(Card, on_delete=models.CASCADE)
    
    ITEM_TYPE_CHOICES = [
        ('offered', 'Offered'),
        ('requested', 'Requested'),
    ]
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES)
    
    added_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['added_at']
        indexes = [
            models.Index(fields=['offer_id']),
            models.Index(fields=['card_id']),
        ]
    
    def __str__(self):
        return f"{self.card.card_name} ({self.item_type}) - Offer {self.offer.id}"


class SwapDetails(models.Model):
    """
    Post-acceptance coordination for a swap.
    Created only when an offer is accepted (status='accepted').
    
    Handles:
    1. Mode selection: In-person OR Mail (decided via messaging)
    2. In-person: Location + datetime + two-step confirmation
    3. Mail: Shipping addresses (Phase 2, simplified for now)
    4. Completion: Mark swap done, IMMEDIATELY delete addresses (GDPR)
    
    Why separate table?
    - Keeps Offer lightweight (just negotiation logic)
    - Privacy: Addresses stored only here, deleted post-completion
    - Messaging tied to offer, coordination tied to swap_details
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    offer = models.OneToOneField(
        Offer,
        on_delete=models.CASCADE,
        related_name='swap_details'
    )
    
    # Swap Mode Decision (Post-Acceptance)
    SWAP_MODE_CHOICES = [
        ('in_person', 'In-Person Meetup'),
        ('mail', 'Mail Swap'),
    ]
    swap_mode = models.CharField(
        max_length=20,
        choices=SWAP_MODE_CHOICES,
        null=True,
        blank=True
    )
    mode_decided_at = models.DateTimeField(null=True, blank=True)
    
    # IN-PERSON MODE
    proposed_location = models.TextField(null=True, blank=True)
    proposed_datetime = models.DateTimeField(null=True, blank=True)
    in_person_confirmed_initiator = models.BooleanField(default=False)
    in_person_confirmed_target = models.BooleanField(default=False)
    in_person_confirmed_at = models.DateTimeField(null=True, blank=True)
    
    # MAIL MODE (Phase 2)
    shipping_from_address = models.TextField(null=True, blank=True)
    shipping_to_address = models.TextField(null=True, blank=True)
    CARRIER_CHOICES = [
        ('USPS', 'USPS'),
        ('UPS', 'UPS'),
        ('FedEx', 'FedEx'),
        ('DHL', 'DHL'),
    ]
    carrier = models.CharField(
        max_length=50,
        choices=CARRIER_CHOICES,
        null=True,
        blank=True
    )
    outbound_tracking_number = models.CharField(max_length=255, null=True, blank=True)
    
    # Completion & Privacy
    swap_completed_at = models.DateTimeField(null=True, blank=True)
    addresses_deleted_at = models.DateTimeField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['offer_id']),
            models.Index(fields=['swap_mode']),
        ]
    
    def __str__(self):
        return f"SwapDetails for Offer {self.offer.id} (mode: {self.swap_mode})"
