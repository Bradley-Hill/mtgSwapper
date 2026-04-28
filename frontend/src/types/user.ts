// Matches UserSerializer fields: id (UUID → string), username, email, created_at.
export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
}
