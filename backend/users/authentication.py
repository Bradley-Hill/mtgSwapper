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

    Key subtlety — stale cookie handling:
    When a cookie token is expired/invalid, super().authenticate() raises
    AuthenticationFailed. DRF treats a raised AuthenticationFailed as a hard
    401 that bypasses ALL permission checks, including AllowAny. This means the
    login endpoint itself would return 401 if the browser sends an old cookie.
    Fix: if the token came from a cookie (not an explicit Authorization header),
    catch the exception and return None (unauthenticated) so AllowAny views
    can still proceed. Protected views will still be rejected because
    IsAuthenticated denies a None user.
    """

    def authenticate(self, request):
        """
        Override authenticate() to check cookies first, then fall back to
        Authorization header.

        Flow:
        1. Record whether an explicit Authorization header was present.
        2. Check for access_token cookie; if found, inject as Bearer header.
        3. Call parent JWTAuthentication.authenticate() to validate token.
        4. If validation fails AND the token came only from a cookie, return
           None instead of re-raising so AllowAny views are not blocked.
        """
        # Was there an explicit Authorization header before we touched anything?
        has_explicit_auth = bool(request.META.get('HTTP_AUTHORIZATION'))

        access_token = request.COOKIES.get('access_token')

        if access_token:
            request.META['HTTP_AUTHORIZATION'] = f'Bearer {access_token}'

        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            # Only swallow the error when the token came from a cookie and
            # the caller didn't send their own Authorization header.
            # Re-raise for explicit Authorization headers so API clients get
            # a proper error.
            if access_token and not has_explicit_auth:
                return None
            raise
