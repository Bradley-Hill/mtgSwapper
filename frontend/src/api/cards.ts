import { apiFetch } from "./client";
import type {
  Card,
  AddFromScryfallPayload,
  UpdateCardPayload,
  BulkImportResponse,
  BulkImportPayload,
  GlobalSearchResponse,
  ScanResult,
} from "@/types";

export async function listCards(): Promise<Card[]> {
  const res = await apiFetch("/api/cards/");
  return (await res.json()) as Card[];
}

export async function deleteCard(id: string): Promise<void> {
  await apiFetch(`/api/cards/${id}/`, { method: "DELETE" });
}

export async function updateCard(
  id: string,
  payload: UpdateCardPayload,
): Promise<Card> {
  const res = await apiFetch(`/api/cards/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Card;
}

export async function addFromScryfall(
  payload: AddFromScryfallPayload,
): Promise<Card> {
  const res = await apiFetch("/api/cards/add_from_scryfall/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Card;
}

export async function autocomplete(query: string): Promise<string[]> {
  const res = await apiFetch("/api/cards/autocomplete/", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  const data = (await res.json()) as { suggestions: string[] };
  return data.suggestions;
}

export async function bulkImport(
  payload: BulkImportPayload,
): Promise<BulkImportResponse> {
  const res = await apiFetch("/api/cards/bulk_import/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as BulkImportResponse;
}

export async function globalSearch(
  query: string,
): Promise<GlobalSearchResponse> {
  const res = await apiFetch(
    `/api/cards/global_search/?q=${encodeURIComponent(query)}`,
  );
  return (await res.json()) as GlobalSearchResponse;
}

/**
 * POST /api/cards/scan/
 * Sends an image file to the backend for OCR + Scryfall lookup.
 * Returns card metadata — no Card row is created.
 * The caller shows the result in a staging list before committing.
 *
 * Why not use apiFetch here?
 * apiFetch unconditionally sets Content-Type: application/json. FormData
 * uploads require the browser to set its own multipart/form-data header
 * (including the boundary string it generates). Overriding it with a fixed
 * string breaks the request. We call fetch directly, keeping credentials.
 */
export async function scanCard(imageFile: File): Promise<ScanResult> {
  const form = new FormData();
  form.append("image", imageFile);
  const res = await fetch("/api/cards/scan/", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  return (await res.json()) as ScanResult;
}
