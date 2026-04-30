import { apiFetch } from './client';
import type {
  Card,
  AddFromScryfallPayload,
  UpdateCardPayload,
  BulkImportResponse,
  BulkImportPayload,
  GlobalSearchResponse,
} from '@/types';

export async function listCards(): Promise<Card[]> {
  const res = await apiFetch('/api/cards/');
  return (await res.json()) as Card[];
}

export async function deleteCard(id: string): Promise<void> {
  await apiFetch(`/api/cards/${id}/`, { method: 'DELETE' });
}

export async function updateCard(id: string, payload: UpdateCardPayload): Promise<Card> {
  const res = await apiFetch(`/api/cards/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Card;
}

export async function addFromScryfall(payload: AddFromScryfallPayload): Promise<Card> {
  const res = await apiFetch('/api/cards/add_from_scryfall/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Card;
}

export async function autocomplete(query: string): Promise<string[]> {
  const res = await apiFetch('/api/cards/autocomplete/', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  const data = (await res.json()) as { suggestions: string[] };
  return data.suggestions;
}

export async function bulkImport(payload: BulkImportPayload): Promise<BulkImportResponse> {
  const res = await apiFetch('/api/cards/bulk_import/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return (await res.json()) as BulkImportResponse;
}

export async function globalSearch(query: string): Promise<GlobalSearchResponse> {
  const res = await apiFetch(`/api/cards/global_search/?q=${encodeURIComponent(query)}`);
  return (await res.json()) as GlobalSearchResponse;
}
