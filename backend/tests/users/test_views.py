"""Basic endpoint tests for users app."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

from cards.models import Card

User = get_user_model()


class AuthEndpointTests(APITestCase):
    """Basic tests for auth endpoints."""
    
    def setUp(self):
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
        }
        response = self.client.post('/api/auth/signup/', data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('access_token', self.client.cookies)
        self.assertIn('refresh_token', self.client.cookies)
        self.assertTrue(User.objects.filter(email='newuser@example.com').exists())
    
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


# ---------------------------------------------------------------------------
# GET /api/users/{id}/  and  GET /api/users/{id}/cards/
# ---------------------------------------------------------------------------

class UserProfileTests(APITestCase):
    """Tests for the public user profile endpoints."""

    def setUp(self):
        self.viewer = User.objects.create_user(
            username='viewer', email='viewer@example.com', password='pass123'
        )
        self.target = User.objects.create_user(
            username='target', email='target@example.com', password='pass123',
            city='Paris', country='France',
        )
        self.client.force_authenticate(user=self.viewer)

        # Available card on target's profile
        self.available_card = Card.objects.create(
            user=self.target,
            scryfall_id='aaa-111',
            card_name='Black Lotus',
            set_code='VMA',
            is_available=True,
        )
        # Private card — must not appear in the cards endpoint
        self.private_card = Card.objects.create(
            user=self.target,
            scryfall_id='bbb-222',
            card_name='Lightning Bolt',
            set_code='M11',
            is_available=False,
        )

    def test_profile_returns_public_fields(self):
        """GET /api/users/{id}/ returns safe public fields."""
        response = self.client.get(f'/api/users/{self.target.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'target')
        self.assertEqual(response.data['city'], 'Paris')
        self.assertEqual(response.data['country'], 'France')
        # email must never be exposed
        self.assertNotIn('email', response.data)
        self.assertNotIn('password', response.data)

    def test_profile_unknown_id_returns_404(self):
        """GET /api/users/{id}/ with a non-existent UUID returns 404."""
        response = self.client.get('/api/users/00000000-0000-0000-0000-000000000000/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_profile_unauthenticated_returns_401(self):
        """Unauthenticated requests are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/users/{self.target.id}/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_cards_returns_only_available(self):
        """GET /api/users/{id}/cards/ returns only is_available=True cards."""
        response = self.client.get(f'/api/users/{self.target.id}/cards/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [c['id'] for c in response.data]
        self.assertIn(str(self.available_card.id), ids)
        self.assertNotIn(str(self.private_card.id), ids)

    def test_user_cards_unauthenticated_returns_401(self):
        """Unauthenticated requests to the cards endpoint are rejected."""
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/users/{self.target.id}/cards/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
