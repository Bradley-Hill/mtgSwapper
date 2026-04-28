// Shapes of API responses that are shared across multiple modules.

export interface BulkImportResultRow {
  card_name: string;
  quantity: number;
  status: 'ok' | 'error';
  reason?: string; 
}

export interface BulkImportResponse {
  imported: number;
  failed: number;
  results: BulkImportResultRow[];
}

export type ScryfallSuggestion = string;
