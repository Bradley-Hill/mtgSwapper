"""
Views for Card management (CRUD + Scryfall integration).
"""

import re
import time

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
    CardGlobalSearchSerializer,
    CardListSerializer,
    DecklistImportSerializer,
)
from .scryfall_service import ScryfallService


# Matches: "4 Black Lotus" or "4 Black Lotus (VMA)" or "4 Black Lotus (VMA) 123"
# Group 1 → quantity, Group 2 → card name (everything up to optional set code in parens)
_DECKLIST_LINE_RE = re.compile(r'^(\d+)\s+([^(]+?)(?:\s*\(.*)?$')


def _parse_decklist(text):
    """
    Parse a Moxfield / MTG Arena style decklist into (quantity, card_name) pairs.

    Handles:
    - "4 Black Lotus"          → (4, "Black Lotus")
    - "4 Black Lotus (VMA)"    → (4, "Black Lotus")  — set code stripped
    - "4 Black Lotus (VMA) 1"  → (4, "Black Lotus")  — collector number stripped
    - Blank lines              → skipped
    - Comment lines (//)       → skipped
    - Section headers (Deck, Sideboard, etc.) → skipped (no leading digit)
    """
    entries = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith('//'):
            continue
        match = _DECKLIST_LINE_RE.match(line)
        if match:
            quantity = int(match.group(1))
            card_name = match.group(2).strip()
            if card_name:
                entries.append((quantity, card_name))
    return entries


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
    - POST   /api/cards/autocomplete/         → Get card name suggestions
    - POST   /api/cards/add_from_scryfall/    → Create card from Scryfall search
    - POST   /api/cards/bulk_import/          → Import a full decklist at once
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
        elif self.action == 'bulk_import':
            return DecklistImportSerializer

        return CardSerializer
    
    def perform_create(self, serializer):
        """
        Save the card with the authenticated user as the owner.
        """
        serializer.save(user=self.request.user)

    def _card_in_active_offer(self, card):
        """
        Return True if the card is part of any pending or accepted offer.

        Why inline import?
        swaps.models imports cards.models (swaps depends on cards). Importing
        swaps at the top of cards/views.py would create a circular import at
        module load time. Importing inside the method defers it to runtime,
        after both apps are fully loaded — a standard Django pattern for
        cross-app references.
        """
        from swaps.models import Offer
        return Offer.objects.filter(
            items__card=card,
            status__in=['pending', 'accepted'],
        ).exists()

    def destroy(self, request, *args, **kwargs):
        """Block deletion if the card is in an active offer."""
        card = self.get_object()
        if self._card_in_active_offer(card):
            return Response(
                {'error': 'Cannot delete a card that is part of an active offer.'},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Block marking a card unavailable if it is in an active offer."""
        if request.data.get('is_available') is False:
            card = self.get_object()
            if self._card_in_active_offer(card):
                return Response(
                    {'error': 'Cannot mark a card unavailable while it is part of an active offer.'},
                    status=status.HTTP_409_CONFLICT,
                )
        return super().partial_update(request, *args, **kwargs)

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
        
        POST /api/cards/add_from_scryfall/
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

    @action(detail=False, methods=['get'], url_path='global_search')
    def global_search(self, request):
        """
        Search cards across ALL users' collections.

        GET /api/cards/global_search/?q=lightning

        Only returns cards where is_available=True — unavailable cards are
        private to their owner and should not appear in search results.
        select_related('user') avoids N+1 queries: one JOIN fetches owner
        username alongside every card row.
        """
        query = request.query_params.get('q', '').strip()

        if len(query) < 2:
            return Response(
                {'error': 'Query must be at least 2 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cards = (
            Card.objects
            .select_related('user')
            .filter(card_name__icontains=query, is_available=True)
            .order_by('card_name', 'user__username')
        )

        serializer = CardGlobalSearchSerializer(cards, many=True)
        return Response({
            'count': cards.count(),
            'results': serializer.data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """
        Import a collection from a plain-text decklist.

        Accepts the Moxfield / MTG Arena export format — one card per line:
            4 Black Lotus
            3 Lightning Bolt
            1 Sol Ring (NEO)   ← set code in parens is stripped before search

        All cards are given the same condition/language/is_foil from the request.
        Bad rows are skipped; successfully imported cards are saved.

        POST /api/cards/bulk_import/
        {
            "decklist": "4 Black Lotus\n3 Lightning Bolt",
            "condition": "played",
            "language": "French",
            "is_foil": false
        }

        Response:
        {
            "imported": 2,
            "failed": 0,
            "results": [
                {"card_name": "Black Lotus", "quantity": 4, "status": "ok"},
                {"card_name": "Lightning Bolt", "quantity": 3, "status": "ok"}
            ]
        }
        """
        serializer = DecklistImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        entries = _parse_decklist(data['decklist'])
        if not entries:
            return Response(
                {'error': 'No valid lines found. Expected format: "4 Card Name"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        imported_count = 0
        failed_count = 0

        for quantity, card_name in entries:
            # Respect Scryfall's rate limit (max 10 req/s)
            time.sleep(0.1)

            scryfall_card = ScryfallService.search(card_name)

            if not scryfall_card:
                failed_count += 1
                results.append({
                    'card_name': card_name,
                    'quantity': quantity,
                    'status': 'error',
                    'reason': f"'{card_name}' not found on Scryfall.",
                })
                continue

            metadata = ScryfallService.extract_card_metadata(scryfall_card)
            Card.objects.create(
                user=request.user,
                quantity=quantity,
                condition=data['condition'],
                language=data['language'],
                is_foil=data['is_foil'],
                **metadata,
            )
            imported_count += 1
            results.append({
                'card_name': metadata['card_name'],
                'quantity': quantity,
                'status': 'ok',
            })

        response_status = status.HTTP_200_OK if imported_count > 0 else status.HTTP_400_BAD_REQUEST
        return Response({
            'imported': imported_count,
            'failed': failed_count,
            'results': results,
        }, status=response_status)

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
