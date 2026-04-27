"""
Serializers for Card model.
"""

from rest_framework import serializers
from .models import Card
from .scryfall_service import ScryfallService


class CardSerializer(serializers.ModelSerializer):
    """
    Serializer for full Card details (read/write).
    
    Used for listing, creating, updating cards in user's collection.
    """
    
    class Meta:
        model = Card
        fields = [
            'id',
            'card_name',
            'set_code',
            'set_name',
            'card_type',
            'mana_cost',
            'condition',
            'is_foil',
            'language',
            'quantity',
            'is_available',
            'notes',
            'added_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'added_at', 'updated_at', 'scryfall_id']
    
    def create(self, validated_data):
        """
        Create a card in user's collection.
        
        The user is extracted from the request context automatically
        by the view's perform_create() method.
        """
        return Card.objects.create(**validated_data)


class CardCreateFromScryfallSerializer(serializers.Serializer):
    """
    Serializer for creating a card using Scryfall search.
    
    This accepts a card name and optional attributes,
    looks up the card on Scryfall, and creates the Card in the user's collection.
    
    Example:
    {
        "card_name": "Black Lotus",
        "set_code": "LEA",
        "condition": "unused",
        "is_foil": false,
        "language": "English",
        "quantity": 1
    }
    """
    
    card_name = serializers.CharField(max_length=255)
    set_code = serializers.CharField(max_length=10, required=False, allow_blank=True)
    condition = serializers.ChoiceField(
        choices=['unused', 'played', 'damaged'],
        default='played'
    )
    is_foil = serializers.BooleanField(default=False)
    language = serializers.CharField(max_length=50, default='French')
    quantity = serializers.IntegerField(default=1, min_value=1)
    
    def validate_quantity(self, value):
        """Ensure quantity is positive."""
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value
    
    def create(self, validated_data):
        """
        Search Scryfall for the card, extract metadata, and create Card.
        """
        card_name = validated_data['card_name']
        
        # Search Scryfall
        scryfall_card = ScryfallService.search(card_name)
        
        if not scryfall_card:
            raise serializers.ValidationError(
                f"Card '{card_name}' not found on Scryfall."
            )
        
        # Extract Scryfall metadata
        metadata = ScryfallService.extract_card_metadata(scryfall_card)
        
        # Merge with user-provided data
        card_data = {
            **metadata,
            'condition': validated_data.get('condition', 'played'),
            'is_foil': validated_data.get('is_foil', False),
            'language': validated_data.get('language', 'English'),
            'quantity': validated_data.get('quantity', 1),
            'user': self.context['request'].user,
        }
        
        # Create Card
        card = Card.objects.create(**card_data)
        return card


class CardAutocompleteSerializer(serializers.Serializer):
    """
    Serializer for card name autocomplete.
    
    Returns a simple list of card names matching the query.
    """
    
    query = serializers.CharField(max_length=100)
    
    def validate_query(self, value):
        """Ensure query is at least 2 characters."""
        if len(value) < 2:
            raise serializers.ValidationError(
                "Query must be at least 2 characters."
            )
        return value


class CardListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for card listings.
    
    Used when displaying lists of cards (e.g., user's library, search results).
    Omits verbose fields like notes.
    """
    
    class Meta:
        model = Card
        fields = [
            'id',
            'card_name',
            'set_code',
            'set_name',
            'condition',
            'is_foil',
            'language',
            'quantity',
            'is_available',
            'added_at',
        ]
        read_only_fields = fields
