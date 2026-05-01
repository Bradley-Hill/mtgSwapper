import { apiFetch } from "./client";
import type { Message, SendMessagePayload } from "@/types";

export async function getMessages(
  offerId: string,
  since?: string,
): Promise<Message[]> {
  const url = since
    ? `/api/offers/${offerId}/messages/?since=${encodeURIComponent(since)}`
    : `/api/offers/${offerId}/messages/`;
  const res = await apiFetch(url);
  return (await res.json()) as Message[];
}

export async function sendMessage(
  offerId: string,
  payload: SendMessagePayload,
): Promise<Message> {
  const res = await apiFetch(`/api/offers/${offerId}/messages/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Message;
}
