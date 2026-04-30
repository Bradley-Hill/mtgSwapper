from rest_framework import serializers
from django.contrib.auth import authenticate
from django.utils import timezone
from datetime import timedelta
import secrets

from .models import User, InviteCode


class InviteCodeSerializer(serializers.ModelSerializer):
    """Serializer for invite codes."""
    
    class Meta:
        model = InviteCode
        fields = ['id', 'code', 'status', 'created_at', 'expires_at']
        read_only_fields = ['id', 'code', 'created_at', 'expires_at']


class CreateInviteCodeSerializer(serializers.Serializer):
    """Serializer for creating new invite codes (admin only)."""
    
    invitee_email = serializers.EmailField()
    
    def validate_invitee_email(self, value):
        """Ensure email doesn't already have a pending invite."""
        # Check if an active invite already exists for this email
        existing = InviteCode.objects.filter(
            invitee_email=value,
            status__in=['pending', 'accepted']
        ).first()
        
        if existing:
            raise serializers.ValidationError(
                "This email already has an active invite."
            )
        return value
    
    def create(self, validated_data):
        """Generate a new invite code."""
        user = self.context['request'].user
        invitee_email = validated_data['invitee_email']
        
        # Generate a random code (URL-safe)
        code = secrets.token_urlsafe(20)
        
        # Set expiry to 30 days from now
        expires_at = timezone.now() + timedelta(days=30)
        
        invite = InviteCode.objects.create(
            inviter_user=user,
            invitee_email=invitee_email,
            code=code,
            expires_at=expires_at
        )
        
        return invite


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user profile information."""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserPublicProfileSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for public user profiles.

    Intentionally excludes sensitive fields (email, password, is_admin, etc.).
    Only exposes data another user should be able to see on a profile page.
    """

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'city',
            'country',
            'reputation_avg',
            'total_swaps_completed',
            'created_at',
        ]
        read_only_fields = fields


class SignupSerializer(serializers.Serializer):
    """Serializer for user registration with invite code."""
    
    username = serializers.CharField(max_length=150, min_length=3)
    email = serializers.EmailField()
    password = serializers.CharField(
        max_length=128,
        min_length=8,
        write_only=True,
        help_text="At least 8 characters"
    )
    invite_code = serializers.CharField(max_length=50)
    
    def validate_username(self, value):
        """Check if username is unique."""
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value
    
    def validate_email(self, value):
        """Check if email is unique."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value
    
    def validate_invite_code(self, value):
        """Check if invite code is valid and not expired."""
        try:
            invite = InviteCode.objects.get(code=value)
        except InviteCode.DoesNotExist:
            raise serializers.ValidationError("Invalid invite code.")
        
        # Check if already used
        if invite.status != 'pending':
            raise serializers.ValidationError(
                f"This invite has already been {invite.status}."
            )
        
        # Check if expired
        if timezone.now() > invite.expires_at:
            invite.status = 'expired'
            invite.save()
            raise serializers.ValidationError("This invite code has expired.")
        
        return value
    
    def validate(self, data):
        """Cross-field validation."""
        # Find the invite code again for marking as used
        try:
            invite = InviteCode.objects.get(code=data['invite_code'])
            data['invite'] = invite
        except InviteCode.DoesNotExist:
            pass  # Already validated above
        
        return data
    
    def create(self, validated_data):
        """Create a new user and mark invite as accepted."""
        invite = validated_data.pop('invite', None)
        
        # Create user (password is hashed automatically by Django)
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        
        # Mark invite as accepted
        if invite:
            invite.status = 'accepted'
            invite.accepted_user = user
            invite.accepted_at = timezone.now()
            invite.save()
        
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        """Authenticate user with email and password."""
        email = data.get('email')
        password = data.get('password')
        
        # Get user by email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid email or password.")
        
        # Authenticate (check password)
        if not user.check_password(password):
            raise serializers.ValidationError("Invalid email or password.")
        
        # Check if user is active
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")
        
        data['user'] = user
        return data


class RefreshTokenSerializer(serializers.Serializer):
    """Serializer for token refresh (accepts refresh token)."""
    
    refresh = serializers.CharField()
