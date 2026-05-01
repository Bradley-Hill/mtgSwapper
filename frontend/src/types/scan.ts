// What the /api/cards/scan/ endpoint returns — metadata for ONE scanned card.
// No Card row is created yet; the user reviews and confirms before adding.
export interface ScanResult {
  card_name: string;
  set_name: string;
  set_code: string;
  card_type: string;
  mana_cost: string;
  scryfall_id: string;
  raw_ocr_text: string;
}

// A ScanResult enriched with a client-side id so the staging list can track
// individual rows (add, remove, edit) before bulk-submitting.
export interface StagedCard extends ScanResult {
  /** Unique key for React list rendering — assigned client-side, never sent to API. */
  stageId: string;
}
