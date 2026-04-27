import uuid
from django.db import models
from users.models import User


class Card(models.Model):
    """
    User card inventory. Each row represents ONE UNIQUE CARD in a user's collection.
    
    Denormalization approach:
    - card_name, set_code stored denormalized (fast search, no API calls per query)
    - Quantity field: stores multiple copies in ONE row (e.g., quantity=3 means 3x same card)
    - is_available: marks card as available for swapping or kept private
    
    Why denormalize?
    - Search by card name across all users' libraries must be FAST
    - Without denormalization, every search would join to external Scryfall API
    - With denormalization: simple indexed text search on card_name
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cards')
    
    # Scryfall Data (denormalized for fast search)
    scryfall_id = models.CharField(max_length=255)
    card_name = models.CharField(max_length=255, db_index=True)  # Indexed for search
    set_code = models.CharField(max_length=10)
    set_name = models.CharField(max_length=255, null=True, blank=True)
    card_type = models.CharField(max_length=255, null=True, blank=True)
    mana_cost = models.CharField(max_length=50, null=True, blank=True)
    
    # Card Attributes
    CONDITION_CHOICES = [
        ('unused', 'Unused'),
        ('played', 'Played'),
        ('damaged', 'Damaged'),
    ]
    condition = models.CharField(
        max_length=30,
        choices=CONDITION_CHOICES,
        default='played'
    )
    is_foil = models.BooleanField(default=False)
    language = models.CharField(max_length=50, default='French')
    quantity = models.IntegerField(default=1)  # Multiple copies in one row
    
    # Status
    is_available = models.BooleanField(default=True)  # Available for swapping?
    
    # Optional notes
    notes = models.TextField(null=True, blank=True)
    
    # Timestamps
    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-added_at']
        indexes = [
            models.Index(fields=['user_id']),
            models.Index(fields=['card_name']),
            models.Index(fields=['user_id', 'is_available']),  # Composite for library search
        ]
        verbose_name_plural = 'Cards'
    
    def __str__(self):
        qty = f" x{self.quantity}" if self.quantity > 1 else ""
        return f"{self.card_name} ({self.set_code}){qty} - {self.user.username}"
