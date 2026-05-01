from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import MessageViewSet, OfferViewSet, SwapDetailsViewSet

router = DefaultRouter()
router.register(r'offers', OfferViewSet, basename='offers')

# Nested routes under /api/offers/{offer_pk}/
offers_router = NestedDefaultRouter(router, r'offers', lookup='offer')
offers_router.register(r'messages', MessageViewSet, basename='offer-messages')
offers_router.register(r'swap', SwapDetailsViewSet, basename='offer-swap')

urlpatterns = router.urls + offers_router.urls
