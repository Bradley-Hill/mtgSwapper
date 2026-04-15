from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that reads tokens from httpOnly cookies.
    
    Extends JWTAuthentication to check cookies in addition to Authorization header.
    
    Why?
    - httpOnly cookies are not accessible to JavaScript (XSS protection)
    - Browser automatically sends cookies with each request 
    - More secure than localStorage for token storage
    
    How?
    - Extracts access_token from cookies if present
    - Injects it into Authorization header for parent JWTAuthentication to validate
    - Also supports traditional Authorization: Bearer header for API clients
    """
    
    def authenticate(self, request):
        """
        Override authenticate() to check cookies first, then fall back to Authorization header.
        
        Flow:
        1. Check for access_token in request.COOKIES
        2. If found, inject into Authorization header
        3. Call parent JWTAuthentication.authenticate() to validate token
        4. Return (user, token_data) or raise AuthenticationFailed
        """
        # First, check if token is in cookies
        access_token = request.COOKIES.get('access_token')
        
        # If found in cookies, inject into Authorization header for parent to find
        if access_token:
            request.META['HTTP_AUTHORIZATION'] = f'Bearer {access_token}'
        
        # Call parent's authenticate() - handles both injected header and explicit Authorization header
        return super().authenticate(request)
