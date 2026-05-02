import uuid
from django.db import models
from users.models import User
from swaps.models import Offer


class Rating(models.Model):
    """
    Post-swap rating and review. Feeds user reputation.
    
    Design:
    - One rating per user per swap (UNIQUE constraint)
    - Tied to offer_id (for context: "Why did you rate them?")
    - Reputation calculated on-read from ratings table
    
    Example:
    - Alice & Bob complete a swap (status='completed')
    - Alice rates Bob: 5 stars, "Perfect cards, great trader!"
    - Bob rates Alice: 4 stars, "Good condition, slight delay in pickup"
    - System calculates Alice's avg reputation: (5 + 4) / 2 = 4.5
    
    Privacy:
    - Ratings public (part of user profile)
    - Comments visible on profile
    - Ratings appear in chronological order
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Rater → Rated
    rater_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='ratings_given'
    )
    rated_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='ratings_received'
    )
    offer = models.ForeignKey(Offer, on_delete=models.CASCADE, related_name='ratings')
    
    # Rating
    rating_stars = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)])
    comment = models.TextField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        unique_together = [['rater_user', 'offer']]  # One rating per swap
        indexes = [
            models.Index(fields=['rated_user_id']),
            models.Index(fields=['rated_user_id', '-created_at']),  # For profile page
        ]
    
    def __str__(self):
        return f"{self.rater_user.username} rated {self.rated_user.username} {self.rating_stars}★"
