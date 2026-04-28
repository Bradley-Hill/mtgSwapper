import { apiFetch } from './client';
import type { User } from '@/types';

export async function login(email: string, password: string): Promise<User> {
  const res = await apiFetch('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as { user: User };
  return data.user;
}

export interface SignupPayload {
  username: string;
  email: string;
  password: string;
  invite_code: string;
}

export async function signup(payload: SignupPayload): Promise<User> {
  const res = await apiFetch('/api/auth/signup/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { user: User };
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout/', { method: 'POST' });
}

export async function getMe(): Promise<User> {
  const res = await apiFetch('/api/auth/me/');
  return (await res.json()) as User;
}
