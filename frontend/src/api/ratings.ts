import { apiFetch } from "./client";
import type { Rating, SubmitRatingPayload } from "@/types";

export async function submitRating(
  payload: SubmitRatingPayload,
): Promise<Rating> {
  const res = await apiFetch("/api/ratings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Rating;
}

export async function getUserRatings(userId: string): Promise<Rating[]> {
  const res = await apiFetch(`/api/users/${userId}/ratings/`);
  return (await res.json()) as Rating[];
}
