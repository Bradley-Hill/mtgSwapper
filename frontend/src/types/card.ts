export type CardCondition = "unused" | "played" | "damaged";

// Matches CardSerializer fields exactly.
export interface Card {
  id: string;
  scryfall_id: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  card_type: string | null;
  mana_cost: string | null;
  condition: CardCondition;
  is_foil: boolean;
  language: string;
  quantity: number;
  is_available: boolean;
  notes: string | null;
  added_at: string;
  updated_at: string;
}

export interface AddFromScryfallPayload {
  card_name: string;
  set_code?: string;
  condition: CardCondition;
  is_foil: boolean;
  language: string;
  quantity: number;
}

export type UpdateCardPayload = Partial<
  Pick<
    Card,
    "condition" | "is_foil" | "language" | "quantity" | "is_available" | "notes"
  >
>;

export interface BulkImportPayload {
  decklist: string;
  condition: CardCondition;
  language: string;
  is_foil: boolean;
}

export interface GlobalSearchResult {
  id: string;
  scryfall_id: string;
  card_name: string;
  set_code: string;
  set_name: string | null;
  condition: CardCondition;
  is_foil: boolean;
  language: string;
  quantity: number;
  is_available: boolean;
  owner_id: string;
  owner_username: string;
}

export interface GlobalSearchResponse {
  count: number;
  results: GlobalSearchResult[];
}
