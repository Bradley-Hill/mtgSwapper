import { apiFetch } from "./client";
import type {
  SwapDetails,
  SetModePayload,
  ProposeMeetupPayload,
} from "@/types";

export async function getSwapDetails(offerId: string): Promise<SwapDetails> {
  const res = await apiFetch(`/api/offers/${offerId}/swap/`);
  return (await res.json()) as SwapDetails;
}

export async function setSwapMode(
  offerId: string,
  payload: SetModePayload,
): Promise<SwapDetails> {
  const res = await apiFetch(`/api/offers/${offerId}/swap/set_mode/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as SwapDetails;
}

export async function proposeMeetup(
  offerId: string,
  payload: ProposeMeetupPayload,
): Promise<SwapDetails> {
  const res = await apiFetch(`/api/offers/${offerId}/swap/propose_meetup/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as SwapDetails;
}

export async function confirmMeetup(offerId: string): Promise<SwapDetails> {
  const res = await apiFetch(`/api/offers/${offerId}/swap/confirm_meetup/`, {
    method: "POST",
  });
  return (await res.json()) as SwapDetails;
}
