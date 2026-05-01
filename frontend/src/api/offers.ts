import { apiFetch } from "./client";
import type {
  CounterOfferPayload,
  CreateOfferPayload,
  OfferDetail,
  OfferListItem,
} from "@/types";

export interface GetOffersParams {
  status?: string;
  direction?: "sent" | "received";
}

export async function getOffers(
  params: GetOffersParams = {},
): Promise<OfferListItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.direction) query.set("direction", params.direction);
  const qs = query.toString();
  const res = await apiFetch(`/api/offers/${qs ? `?${qs}` : ""}`);
  return (await res.json()) as OfferListItem[];
}

export async function getOffer(id: string): Promise<OfferDetail> {
  const res = await apiFetch(`/api/offers/${id}/`);
  return (await res.json()) as OfferDetail;
}

export async function createOffer(
  payload: CreateOfferPayload,
): Promise<OfferDetail> {
  const res = await apiFetch("/api/offers/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as OfferDetail;
}

export async function acceptOffer(id: string): Promise<OfferDetail> {
  const res = await apiFetch(`/api/offers/${id}/accept/`, { method: "POST" });
  return (await res.json()) as OfferDetail;
}

export async function declineOffer(id: string): Promise<OfferDetail> {
  const res = await apiFetch(`/api/offers/${id}/decline/`, { method: "POST" });
  return (await res.json()) as OfferDetail;
}

export async function cancelOffer(id: string): Promise<OfferDetail> {
  const res = await apiFetch(`/api/offers/${id}/cancel/`, { method: "POST" });
  return (await res.json()) as OfferDetail;
}

export async function counterOffer(
  id: string,
  payload: CounterOfferPayload,
): Promise<OfferDetail> {
  const res = await apiFetch(`/api/offers/${id}/counteroffer/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as OfferDetail;
}
