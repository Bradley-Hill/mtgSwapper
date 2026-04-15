"""Basic endpoint tests for users app."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from users.models import InviteCode

User = get_user_model()


class AuthEndpointTests(APITestCase):
    """Basic tests for auth endpoints."""
    
    def setUp(self):
        self.inviter = User.objects.create_user(
            username='inviter',
            email='inviter@example.com',
            password='testpass123'
        )
        self.invite = InviteCode.objects.create(
            inviter_user=self.inviter,
            invitee_email='newuser@example.com'
        )
        self.user = User.objects.create_user(
            username='existing',
            email='existing@example.com',
            password='existpass123'
        )
    
    def test_signup_success(self):
        """POST /api/auth/signup/ creates user and returns tokens in cookies."""
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'securepass123',
            'invite_code': self.invite.code
        }
        response = self.client.post('/api/auth/signup/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        # Tokens are set as httpOnly cookies, not in response body
        self.assertIn('access_token', self.client.cookies)
        self.assertIn('refresh_token', self.client.cookies)
        self.assertTrue(User.objects.filter(email='newuser@example.com').exists())
    
    def test_signup_invalid_invite(self):
        """POST /api/auth/signup/ rejects invalid invite code."""
        data = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'securepass123',
            'invite_code': 'invalid'
        }
        response = self.client.post('/api/auth/signup/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    
    def test_login_success(self):
        """POST /api/auth/login/ authenticates user and returns tokens in cookies."""
        data = {'email': 'existing@example.com', 'password': 'existpass123'}
        response = self.client.post('/api/auth/login/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('user', response.data)
        # Tokens are set as httpOnly cookies, not in response body
        self.assertIn('access_token', self.client.cookies)
        self.assertIn('refresh_token', self.client.cookies)
    
    def test_login_wrong_password(self):
        """POST /api/auth/login/ rejects wrong password."""
        data = {'email': 'existing@example.com', 'password': 'wrongpass'}
        response = self.client.post('/api/auth/login/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_me_authenticated(self):
        """GET /api/auth/me/ returns user profile when authenticated."""
        # Login
        login_data = {'email': 'existing@example.com', 'password': 'existpass123'}
        self.client.post('/api/auth/login/', login_data, format='json')
        
        # Get me
        response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'existing@example.com')
    
    def test_me_unauthenticated(self):
        """GET /api/auth/me/ returns 401 without authentication."""
        response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_logout_success(self):
        """POST /api/auth/logout/ clears cookies."""
        # Login
        login_data = {'email': 'existing@example.com', 'password': 'existpass123'}
        self.client.post('/api/auth/login/', login_data, format='json')
        
        # Logout
        response = self.client.post('/api/auth/logout/', format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
