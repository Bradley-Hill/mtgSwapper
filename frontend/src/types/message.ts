export interface Message {
  id: string;
  sender_username: string | null; // null for system messages
  content: string;
  is_system_message: boolean;
  created_at: string;
}

export interface SendMessagePayload {
  content: string;
}
