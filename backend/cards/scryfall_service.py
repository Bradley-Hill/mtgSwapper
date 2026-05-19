"""
Scryfall API integration service.

Handles all interactions with the Scryfall API for MTG card data.
Scryfall is the authoritative source for MTG card information.

Reference: https://scryfall.com/docs/api
"""

import time

import requests
from django.core.cache import cache
from typing import Optional, List, Dict, Any, Tuple


class ScryfallService:
    """Service for fetching card data from Scryfall API."""
    
    BASE_URL = "https://api.scryfall.com"
    TIMEOUT = 5  # seconds
    COLLECTION_TIMEOUT = 30  # /cards/collection may return up to 75 cards; give it more time
    COLLECTION_BATCH_SIZE = 75  # Scryfall hard limit per /cards/collection request
    COLLECTION_RATE_LIMIT_DELAY = 0.11  # Scryfall asks for 50–100ms between requests

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

    @classmethod
    def collection_search(cls, names: List[str]) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
        """
        Fetch multiple cards by exact name in bulk using /cards/collection.

        This is the correct endpoint for bulk imports. Instead of making one
        HTTP request per card (which quickly hits rate limits), it batches up
        to 75 identifiers per request. 

        How it works:
        1. Check the Django cache for each name — already-cached cards skip
           the network entirely.
        2. Group the remaining names into batches of 75 (Scryfall's hard limit).
        3. POST each batch to /cards/collection with a short delay between
           batches to respect Scryfall's rate limit policy.
        4. Cache every returned card for 24 h so repeated imports are free.

        Name matching: /cards/collection uses *exact* name matching (not fuzzy).
        This is fine for Moxfield/Arena decklist exports, where names are
        already canonical. If you need fuzzy matching use search() instead.

        Args:
            names: List of card names to look up (may contain duplicates).

        Returns:
            Tuple of:
            - found: dict keyed by lowercased card name → full Scryfall card object
            - not_found_names: list of lowercased names Scryfall could not match
        """
        found: Dict[str, Dict[str, Any]] = {}
        not_found_names: List[str] = []

        # Deduplicate preserving the first-seen casing, but key everything
        # by lowercase so lookups are case-insensitive.
        seen: Dict[str, str] = {}
        for name in names:
            key = name.lower()
            if key not in seen:
                seen[key] = name

        # Serve hits from the Django cache; collect misses for the network.
        to_fetch: List[str] = []
        for key, original_name in seen.items():
            cache_key = f"scryfall:search:{key}"
            cached = cache.get(cache_key)
            if cached is not None:
                found[key] = cached
            else:
                to_fetch.append(original_name)

        if not to_fetch:
            return found, not_found_names

        # Split into batches of 75 and POST each one.
        batches = [
            to_fetch[i : i + cls.COLLECTION_BATCH_SIZE]
            for i in range(0, len(to_fetch), cls.COLLECTION_BATCH_SIZE)
        ]

        for batch_index, batch in enumerate(batches):
            if batch_index > 0:
                # Brief pause between batches — Scryfall asks for at least
                # 50–100 ms between requests. Two batches means one pause.
                time.sleep(cls.COLLECTION_RATE_LIMIT_DELAY)

            identifiers = [{"name": name} for name in batch]
            try:
                response = requests.post(
                    f"{cls.BASE_URL}/cards/collection",
                    json={"identifiers": identifiers},
                    timeout=cls.COLLECTION_TIMEOUT,
                )
                response.raise_for_status()
                data = response.json()
            except requests.RequestException as e:
                print(f"Scryfall collection search error (batch {batch_index}): {e}")
                # Treat the whole batch as not found so the view can report
                # individual failures rather than crashing the whole import.
                for name in batch:
                    not_found_names.append(name.lower())
                continue

            # Map each returned card by its canonical lowercased name.
            for card in data.get("data", []):
                card_name_lower = card.get("name", "").lower()
                found[card_name_lower] = card
                cache.set(
                    f"scryfall:search:{card_name_lower}",
                    card,
                    cls.CARD_CACHE_TTL,
                )

            # The not_found list contains the original identifier objects
            # we sent, e.g. {"name": "Mispelled Card"}.
            for identifier in data.get("not_found", []):
                nf_name = identifier.get("name", "").lower()
                if nf_name:
                    not_found_names.append(nf_name)

        return found, not_found_names
