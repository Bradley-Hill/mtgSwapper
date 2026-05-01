export type SwapMode = "in_person" | "mail";

export interface SwapDetails {
  id: string;
  swap_mode: SwapMode | null;
  mode_decided_at: string | null;
  proposed_location: string | null;
  proposed_datetime: string | null;
  in_person_confirmed_initiator: boolean;
  in_person_confirmed_target: boolean;
  in_person_confirmed_at: string | null;
  completed_by_initiator: boolean;
  completed_by_target: boolean;
  swap_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetModePayload {
  swap_mode: SwapMode;
}

export interface ProposeMeetupPayload {
  proposed_location: string;
  proposed_datetime: string; // ISO 8601
}
