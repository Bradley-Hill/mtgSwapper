export interface Rating {
  id: string;
  rater_username: string;
  rating_stars: number;
  comment: string | null;
  created_at: string;
}

export interface SubmitRatingPayload {
  offer_id: string;
  rating_stars: number;
  comment?: string;
}
