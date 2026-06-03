"""Basic serializer tests for users app."""
from django.test import TestCase
from django.contrib.auth import get_user_model

from users.serializers import SignupSerializer, LoginSerializer

User = get_user_model()


class SignupSerializerTests(TestCase):
    """Basic serializer tests for signup validation."""
    
    def setUp(self):
        pass
    
    def test_valid_signup(self):
        """Valid signup without an invite code."""
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'securepass123',
        }
        serializer = SignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()
        self.assertEqual(user.email, 'newuser@example.com')
    
    def test_signup_weak_password(self):
        """Signup fails with password < 8 chars."""
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'weak',
        }
        serializer = SignupSerializer(data=data)
        self.assertFalse(serializer.is_valid())


class LoginSerializerTests(TestCase):
    """Basic serializer tests for login validation."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_valid_login(self):
        """Valid login with correct credentials."""
        data = {'email': 'test@example.com', 'password': 'testpass123'}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())
    
    def test_login_wrong_password(self):
        """Login fails with wrong password."""
        data = {'email': 'test@example.com', 'password': 'wrongpass'}
        serializer = LoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
