"""Basic model tests for users app."""
from django.test import TestCase
from django.contrib.auth import get_user_model
from datetime import timedelta
from django.utils import timezone

from users.models import InviteCode

User = get_user_model()


class InviteCodeModelTests(TestCase):
    """Basic tests for InviteCode model."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='inviter',
            email='inviter@example.com',
            password='testpass123'
        )
    
    def test_invite_code_creation(self):
        """Invite code is created with pending status."""
        invite = InviteCode.objects.create(
            inviter_user=self.user,
            invitee_email='friend@example.com'
        )
        self.assertEqual(invite.status, 'pending')
        self.assertIsNotNone(invite.code)
    
    def test_invite_code_expires_in_30_days(self):
        """Invite code expiration is set to 30 days from now."""
        invite = InviteCode.objects.create(
            inviter_user=self.user,
            invitee_email='friend@example.com'
        )
        expected_expiry = timezone.now() + timedelta(days=30)
        # Within 1 minute tolerance
        self.assertLess(abs((invite.expires_at - expected_expiry).total_seconds()), 60)
