"""
Scryfall API integration service.

Handles all interactions with the Scryfall API for MTG card data.
Scryfall is the authoritative source for MTG card information.

Reference: https://scryfall.com/docs/api
"""

import requests
from django.core.cache import cache
from typing import Optional, List, Dict, Any


class ScryfallService:
    """Service for fetching card data from Scryfall API."""
    
    BASE_URL = "https://api.scryfall.com"
    TIMEOUT = 5  # seconds
    
    # Cache durations
    CARD_CACHE_TTL = 86400  # 24 hours (card data rarely changes)
    SEARCH_CACHE_TTL = 3600  # 1 hour (search results can vary)
    
    @classmethod
    def autocomplete(cls, query: str) -> List[str]:
        """
        Get card name autocomplete suggestions from Scryfall.
        
        Returns a list of card names matching the query.
        Used for search-as-you-type functionality.
        
        Args:
            query: Partial card name (e.g., "black" returns ["Black Lotus", "Black Vise", ...])
        
        Returns:
            List of card names
        
        Raises:
            Exception: If Scryfall API is unavailable
        """
        if not query or len(query) < 2:
            return []
        
        cache_key = f"scryfall:autocomplete:{query.lower()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        
        try:
            url = f"{cls.BASE_URL}/cards/autocomplete"
            params = {"q": query}
            response = requests.get(url, params=params, timeout=cls.TIMEOUT)
            response.raise_for_status()
            
            data = response.json()
            suggestions = data.get("data", [])
            
            # Cache results
            cache.set(cache_key, suggestions, cls.SEARCH_CACHE_TTL)
            
            return suggestions
        
        except requests.RequestException as e:
            # Log but don't raise — allow app to continue with empty results
            print(f"Scryfall autocomplete error: {e}")
            return []
    
    @classmethod
    def search(cls, query: str, exact: bool = False) -> Optional[Dict[str, Any]]:
        """
        Search for a card by exact or fuzzy name.
        
        Returns full card details if found.
        
        Args:
            query: Card name to search
            exact: If True, require exact match. If False, fuzzy search allowed.
        
        Returns:
            Card object with metadata, or None if not found
        
        Example response:
        {
            "id": "e0e0d....",
            "name": "Black Lotus",
            "set": "leb",
            "set_name": "Limited Edition Beta",
            "type_line": "Artifact",
            "mana_cost": "{0}",
            "image_uris": {"normal": "https://..."},
            ...
        }
        """
        if not query:
            return None
        
        cache_key = f"scryfall:search:{query.lower()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        
        try:
            url = f"{cls.BASE_URL}/cards/named"
            params = {
                "fuzzy" if not exact else "exact": query
            }
            response = requests.get(url, params=params, timeout=cls.TIMEOUT)
            
            if response.status_code == 404:
                # Card not found
                return None
            
            response.raise_for_status()
            card_data = response.json()
            
            # Cache the result
            cache.set(cache_key, card_data, cls.CARD_CACHE_TTL)
            
            return card_data
        
        except requests.RequestException as e:
            print(f"Scryfall search error: {e}")
            return None
    
    @classmethod
    def get_card_by_id(cls, scryfall_id: str) -> Optional[Dict[str, Any]]:
        """
        Get card details by Scryfall ID.
        
        Args:
            scryfall_id: UUID of the card from Scryfall
        
        Returns:
            Card object or None if not found
        """
        cache_key = f"scryfall:id:{scryfall_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        
        try:
            url = f"{cls.BASE_URL}/cards/{scryfall_id}"
            response = requests.get(url, timeout=cls.TIMEOUT)
            
            if response.status_code == 404:
                return None
            
            response.raise_for_status()
            card_data = response.json()
            
            cache.set(cache_key, card_data, cls.CARD_CACHE_TTL)
            
            return card_data
        
        except requests.RequestException as e:
            print(f"Scryfall get_card_by_id error: {e}")
            return None
    
    @classmethod
    def extract_card_metadata(cls, scryfall_card: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract relevant metadata from Scryfall card object.
        
        Maps Scryfall fields to our Card model fields.
        
        Args:
            scryfall_card: Full card object from Scryfall API
        
        Returns:
            Dict with cleaned card metadata
        """
        return {
            "scryfall_id": scryfall_card.get("id"),
            "card_name": scryfall_card.get("name"),
            "set_code": scryfall_card.get("set", "").upper(),
            "set_name": scryfall_card.get("set_name"),
            "card_type": scryfall_card.get("type_line"),
            "mana_cost": scryfall_card.get("mana_cost"),
        }
