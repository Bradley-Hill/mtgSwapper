import type { User } from './user';

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string, inviteCode: string) => Promise<void>;
  logout: () => Promise<void>;
}
