from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that reads tokens from httpOnly cookies.
    
    Why?
    - HttpOnly cookies are not accessible to JavaScript
    - Browser automatically sends cookies with each request
    - More secure than storing tokens in localStorage
    
    How?
    - First checks Authorization header (for API tools like Postman)
    - Falls back to 'access_token' cookie (for browser-based clients)
    """
    
    def get_raw_token(self, request):
        """
        Extract token from either:
        1. Authorization header (for testing/postman)
        2. access_token cookie (for browser requests)
        """
        # Try Authorization header first
        auth_header = request.META.get('HTTP_AUTHORIZATION', '').split()
        
        if auth_header and auth_header[0].lower() == 'bearer':
            return auth_header[1].encode()
        
        # Fall back to cookie
        raw_token = request.COOKIES.get('access_token')
        if raw_token:
            return raw_token.encode()
        
        return None
