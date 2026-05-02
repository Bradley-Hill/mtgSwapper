from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from django.utils import timezone
from django.conf import settings

from .models import User, InviteCode
from cards.models import Card
from cards.serializers import CardSerializer
from ratings.models import Rating
from ratings.serializers import RatingSerializer
from .serializers import (
    SignupSerializer,
    LoginSerializer,
    UserSerializer,
    UserPublicProfileSerializer,
    InviteCodeSerializer,
    CreateInviteCodeSerializer,
)


class AuthViewSet(viewsets.ViewSet):
    """
    API endpoints for authentication (signup, login, logout, refresh).
    
    Why ViewSet?
    - Groups related endpoints under one class
    - DRF handles routing automatically
    - Clean, RESTful structure
    """
    
    def get_permissions(self):
        """
        Allow anyone to signup/login/logout (public endpoints).
        Require authentication for other endpoints.
        
        Why logout is public: Users should always be able to logout,
        even if their token is expired/invalid.
        """
        if self.action in ['signup', 'login', 'logout']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def signup(self, request):
        """
        Sign up a new user with an invite code.
        
        POST /api/auth/signup/
        {
            "username": "alice",
            "email": "alice@example.com",
            "password": "securepassword123",
            "invite_code": "abc123xyz"
        }
        """
        serializer = SignupSerializer(data=request.data)
        
        if serializer.is_valid():
            # Create user
            user = serializer.save()
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            
            # Build response with tokens as httpOnly cookies
            response = Response({
                'user': UserSerializer(user).data,
                'message': 'Account created successfully!'
            }, status=status.HTTP_201_CREATED)
            
            # Set tokens as httpOnly cookies
            response.set_cookie(
                key='access_token',
                value=str(refresh.access_token),
                max_age=3600,  # 1 hour
                httponly=True,
                secure=not settings.DEBUG,  # True in production, False in dev
                samesite='None',
                partitioned=not settings.DEBUG,
            )
            response.set_cookie(
                key='refresh_token',
                value=str(refresh),
                max_age=604800,  # 7 days
                httponly=True,
                secure=not settings.DEBUG,
                samesite='None',
                partitioned=not settings.DEBUG,
            )
            
            return response
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def login(self, request):
        """
        Log in with email and password.
        
        POST /api/auth/login/
        {
            "email": "alice@example.com",
            "password": "securepassword123"
        }
        """
        serializer = LoginSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.validated_data['user']
            
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            
            # Update last login
            user.last_login_at = timezone.now()
            user.save(update_fields=['last_login_at'])
            
            # Build response
            response = Response({
                'user': UserSerializer(user).data,
                'message': 'Logged in successfully!'
            }, status=status.HTTP_200_OK)
            
            # Set tokens as httpOnly cookies
            response.set_cookie(
                key='access_token',
                value=str(refresh.access_token),
                max_age=3600,  # 1 hour
                httponly=True,
                secure=not settings.DEBUG,  # True in production, False in dev
                samesite='None',
                partitioned=not settings.DEBUG,
            )
            response.set_cookie(
                key='refresh_token',
                value=str(refresh),
                max_age=604800,  # 7 days
                httponly=True,
                secure=not settings.DEBUG,
                samesite='None',
                partitioned=not settings.DEBUG,
            )
            
            return response
        
        return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def logout(self, request):
        """
        Logout by clearing cookies.
        Since JWT is stateless, we just clear the client-side cookies.
        
        Why AllowAny? Logout should work even if token is expired/invalid.
        You should always be able to log out.
        
        POST /api/auth/logout/
        """
        response = Response(
            {'message': 'Logged out successfully!'},
            status=status.HTTP_200_OK
        )
        
        # Clear cookies
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        
        return response
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny()])
    def refresh(self, request):
        """
        Refresh access token using refresh token.
        
        POST /api/auth/refresh/
        (The refresh_token cookie is sent automatically by the browser)
        """
        # Get refresh token from cookie
        refresh_token = request.COOKIES.get('refresh_token')
        
        if not refresh_token:
            return Response(
                {'error': 'Refresh token not found in cookies'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            refresh = RefreshToken(refresh_token)
            new_access = refresh.access_token
            
            response = Response({
                'message': 'Token refreshed successfully!'
            }, status=status.HTTP_200_OK)
            
            # Set new access token cookie
            response.set_cookie(
                key='access_token',
                value=str(new_access),
                max_age=3600,  # 1 hour
                httponly=True,
                secure=not settings.DEBUG,  # True in production, False in dev
                samesite='None',
                partitioned=not settings.DEBUG,
            )
            
            return response
        
        except Exception as e:
            return Response(
                {'error': f'Invalid refresh token: {str(e)}'},
                status=status.HTTP_401_UNAUTHORIZED
            )
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        """
        Get current user profile (requires authentication).
        
        GET /api/auth/me/
        Authorization: Bearer {access_token}
        """
        user = request.user
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class InviteCodeViewSet(viewsets.ModelViewSet):
    """
    API endpoints for managing invite codes.
    Only authenticated users can create/view invites.
    """
    
    queryset = InviteCode.objects.all()
    serializer_class = InviteCodeSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'])
    def create_invite(self, request):
        """
        Create a new invite code (admin users only).
        
        POST /api/invites/create_invite/
        {
            "invitee_email": "friend@example.com"
        }
        """
        serializer = CreateInviteCodeSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            invite = serializer.save()
            return Response(
                InviteCodeSerializer(invite).data,
                status=status.HTTP_201_CREATED
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def my_invites(self, request):
        """
        Get all invites sent by the current user.
        
        GET /api/invites/my_invites/
        """
        invites = InviteCode.objects.filter(inviter_user=request.user)
        serializer = InviteCodeSerializer(invites, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def status(self, request):
        """
        Check status of an invite code (public access).
        
        GET /api/invites/status/?code=abc123xyz
        """
        code = request.query_params.get('code')
        
        if not code:
            return Response(
                {'error': 'code parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            invite = InviteCode.objects.get(code=code)
            return Response(
                InviteCodeSerializer(invite).data,
                status=status.HTTP_200_OK
            )
        except InviteCode.DoesNotExist:
            return Response(
                {'error': 'Invalid invite code'},
                status=status.HTTP_404_NOT_FOUND
            )


class UserViewSet(viewsets.GenericViewSet):
    """
    Public read-only endpoints for viewing other users' profiles and available cards.

    Why GenericViewSet (not ModelViewSet)?
    - ModelViewSet would expose list/create/update/destroy automatically.
    - We ONLY want retrieve (single user) + a custom cards action.
    - GenericViewSet gives us the queryset/serializer machinery without any
      default routes — we must explicitly define each action we want.
    """

    queryset = User.objects.all()
    serializer_class = UserPublicProfileSerializer
    permission_classes = [IsAuthenticated]

    def retrieve(self, request, pk=None):
        """
        GET /api/users/{id}/
        Returns the public profile of a single user.
        """
        user = self.get_object()  # handles 404 automatically
        serializer = self.get_serializer(user)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='cards')
    def cards(self, request, pk=None):
        """
        GET /api/users/{id}/cards/
        Returns all cards that user has marked as available for swapping.

        Why only is_available=True?
        - Cards marked unavailable are private to the owner.
        - A browsing user only cares about what they could trade for.
        """
        user = self.get_object()
        qs = Card.objects.filter(user=user, is_available=True)
        serializer = CardSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='ratings', permission_classes=[IsAuthenticated])
    def ratings(self, request, pk=None):
        """
        GET /api/users/{id}/ratings/
        Returns all ratings received by this user, newest first.

        Why on UserViewSet instead of RatingViewSet?
        Ratings are a sub-resource of a user's public profile — the same way
        cards are. Keeping both actions here means the profile page can call
        /api/users/{id}/cards/ and /api/users/{id}/ratings/ symmetrically.
        RatingViewSet only needs to handle submission (POST /api/ratings/).
        """
        user = self.get_object()
        qs = Rating.objects.filter(rated_user=user).select_related("rater_user")
        return Response(RatingSerializer(qs, many=True).data)
