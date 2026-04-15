"""Basic authentication tests for users app."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class CookieAuthenticationTests(APITestCase):
    """Basic tests for cookie-based JWT authentication."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_cookie_auth_works(self):
        """Tokens in cookies are authenticated correctly."""
        # Login to get tokens in cookies
        login_data = {'email': 'test@example.com', 'password': 'testpass123'}
        self.client.post('/api/auth/login/', login_data, format='json')
        
        # Request with cookies should work
        response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'testuser')
    
    def test_header_auth_still_works(self):
        """Authorization header auth still works (backward compat)."""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)
        
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        response = self.client.get('/api/auth/me/', format='json')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'testuser')
    
    def test_no_auth_returns_401(self):
        """Missing auth returns 401."""
        response = self.client.get('/api/auth/me/', format='json')
        self.assertEqual(response.status_code, 401)
