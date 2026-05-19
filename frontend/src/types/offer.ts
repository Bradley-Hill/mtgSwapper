export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "completed";

export type OfferItemType = "offered" | "requested";

export interface OfferParticipant {
  id: string;
  username: string;
}

export interface OfferItemCard {
  id: string;
  scryfall_id: string;
  card_name: string;
  set_code: string;
  condition: string;
  is_foil: boolean;
  language: string;
  quantity: number;
}

export interface OfferItem {
  id: string;
  card: OfferItemCard;
  item_type: OfferItemType;
}

/** Lightweight row used in the offers inbox list. */
export interface OfferListItem {
  id: string;
  initiator: OfferParticipant;
  target: OfferParticipant;
  status: OfferStatus;
  offered_count: number;
  requested_count: number;
  counteroffer_count: number;
  created_at: string;
  expires_at: string;
}

/** Full offer with all card line-items. Used on the detail page. */
export interface OfferDetail {
  id: string;
  initiator: OfferParticipant;
  target: OfferParticipant;
  status: OfferStatus;
  counteroffer_count: number;
  max_counteroffers: number;
  items: OfferItem[];
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  expires_at: string;
}

export interface CreateOfferPayload {
  target_user_id: string;
  offered_card_ids: string[];
  requested_card_ids: string[];
}

export interface CounterOfferPayload {
  offered_card_ids: string[];
  requested_card_ids: string[];
}
