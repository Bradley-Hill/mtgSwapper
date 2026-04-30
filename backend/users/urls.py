from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AuthViewSet, InviteCodeViewSet, UserViewSet

# Router automatically handles routing for ViewSet actions
router = DefaultRouter()
router.register(r'auth', AuthViewSet, basename='auth')
router.register(r'invites', InviteCodeViewSet, basename='invites')
router.register(r'users', UserViewSet, basename='users')

urlpatterns = router.urls
