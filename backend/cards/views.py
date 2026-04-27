"""
Views for Card management (CRUD + Scryfall integration).
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Card
from .serializers import (
    CardSerializer,
    CardCreateFromScryfallSerializer,
    CardAutocompleteSerializer,
    CardListSerializer,
)
from .scryfall_service import ScryfallService


class CardViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing cards in a user's collection.
    
    Endpoints:
    - POST   /api/cards/                    → Create card (add to collection)
    - GET    /api/cards/                    → List user's cards
    - GET    /api/cards/{id}/               → Get card details
    - PUT    /api/cards/{id}/               → Update card
    - PATCH  /api/cards/{id}/               → Partial update
    - DELETE /api/cards/{id}/               → Delete card
    - POST   /api/cards/autocomplete/       → Get card name suggestions
    - POST   /api/cards/add-from-scryfall/  → Create card from Scryfall search
    """
    
    permission_classes = [IsAuthenticated]
    serializer_class = CardSerializer
    
    def get_queryset(self):
        """
        Return only cards belonging to the authenticated user.
        
        Security: Users can only see and modify their own cards.
        """
        return Card.objects.filter(user=self.request.user)
    
    def get_serializer_class(self):
        """
        Use different serializers for different actions.
        """
        if self.action == 'list':
            return CardListSerializer
        elif self.action == 'add_from_scryfall':
            return CardCreateFromScryfallSerializer
        elif self.action == 'autocomplete':
            return CardAutocompleteSerializer
        
        return CardSerializer
    
    def perform_create(self, serializer):
        """
        Save the card with the authenticated user as the owner.
        """
        serializer.save(user=self.request.user)
    
    @action(detail=False, methods=['post'])
    def autocomplete(self, request):
        """
        Get card name autocomplete suggestions from Scryfall.
        
        POST /api/cards/autocomplete/
        {
            "query": "black"
        }
        
        Response:
        {
            "suggestions": ["Black Lotus", "Black Vise", "Blackcleave Cliffs", ...]
        }
        """
        serializer = CardAutocompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        query = serializer.validated_data['query']
        suggestions = ScryfallService.autocomplete(query)
        
        return Response({
            'suggestions': suggestions
        }, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'])
    def add_from_scryfall(self, request):
        """
        Create a card by searching Scryfall.
        
        Accepts a card name and optional attributes,
        looks up the card on Scryfall, and adds it to the user's collection.
        
        POST /api/cards/add-from-scryfall/
        {
            "card_name": "Black Lotus",
            "set_code": "LEA",
            "condition": "unused",
            "is_foil": false,
            "language": "English",
            "quantity": 1
        }
        
        Response:
        {
            "id": "...",
            "card_name": "Black Lotus",
            "set_code": "LEA",
            "set_name": "Limited Edition Alpha",
            ...
        }
        """
        serializer = CardCreateFromScryfallSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        card = serializer.save()
        
        # Return full card details
        return_serializer = CardSerializer(card)
        return Response(return_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search user's collection by card name.
        
        GET /api/cards/search/?q=black
        
        Returns a list of cards matching the search query.
        """
        query = request.query_params.get('q', '')
        
        if not query or len(query) < 2:
            return Response({
                'error': 'Query must be at least 2 characters.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Case-insensitive search on card_name
        cards = self.get_queryset().filter(
            card_name__icontains=query
        ).order_by('card_name')
        
        serializer = CardListSerializer(cards, many=True)
        
        return Response({
            'count': cards.count(),
            'results': serializer.data
        }, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def available(self, request):
        """
        Get only available cards (for swapping).
        
        GET /api/cards/available/
        
        Returns cards marked as is_available=True.
        """
        cards = self.get_queryset().filter(is_available=True)
        serializer = CardListSerializer(cards, many=True)
        
        return Response({
            'count': cards.count(),
            'results': serializer.data
        }, status=status.HTTP_200_OK)
