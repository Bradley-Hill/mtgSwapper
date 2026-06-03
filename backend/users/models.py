import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator


class User(AbstractUser):
    """
    Custom user model for MTG Swapper.
    Extends Django's AbstractUser with project-specific fields.
    
    Why CustomUser?
    - Allows future extensions (profile data, preferences)
    - Standard practice in production Django apps
    - Can add new fields without migrations later
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    avatar_url = models.URLField(max_length=500, null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    
    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('fr', 'French'),
    ]
    preferred_language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default='en'
    )
    
    # Location (Hidden Phase 1, used Phase 2+)
    city = models.CharField(max_length=100, null=True, blank=True)
    region_state = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    
    # Reputation (calculated from ratings, computed on-read)
    reputation_avg = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=0.00,
        validators=[MinValueValidator(0), MaxValueValidator(5)]
    )
    total_swaps_completed = models.IntegerField(default=0)
    
    is_admin = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['username']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{self.username} ({self.email})"


class InviteCode(models.Model):
    """
    Invite codes for closed-beta access control.
    
    Only invited users can sign up. This ensures:
    - Controlled user growth
    - Friend-group trust model
    - Quality over quantity
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    inviter_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_invites'
    )
    invitee_email = models.EmailField(unique=True)
    
    code = models.CharField(max_length=50, unique=True)
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    
    accepted_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='used_invite_code'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()  # Set to 30 days from created_at in view
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['invitee_email']),
            models.Index(fields=['status']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate code and set expires_at if not already provided."""
        import secrets
        from django.utils import timezone
        from datetime import timedelta
        
        if not self.code:
            self.code = secrets.token_urlsafe(20)
        
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=30)
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Invite for {self.invitee_email} (status: {self.status})"
