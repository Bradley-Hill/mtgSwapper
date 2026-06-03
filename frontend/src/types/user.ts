export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

// Matches UserPublicProfileSerializer — safe subset, no email/password.
export interface UserPublicProfile {
  id: string;
  username: string;
  city: string | null;
  country: string | null;
  reputation_avg: string; // DecimalField serializes as string
  total_swaps_completed: number;
  created_at: string;
}

// available_card_count is an annotated field computed by the backend.
export interface UserListItem {
  id: string;
  username: string;
  city: string | null;
  country: string | null;
  reputation_avg: string;
  total_swaps_completed: number;
  available_card_count: number;
}
