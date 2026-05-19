import { apiFetch } from './client';
import type { UserPublicProfile, UserListItem } from '@/types';
import type { GlobalSearchResult } from '@/types';

export async function getUserProfile(id: string): Promise<UserPublicProfile> {
  const res = await apiFetch(`/api/users/${id}/`);
  return (await res.json()) as UserPublicProfile;
}

export async function getUserCards(id: string): Promise<GlobalSearchResult[]> {
  const res = await apiFetch(`/api/users/${id}/cards/`);
  return (await res.json()) as GlobalSearchResult[];
}

export async function listUsers(): Promise<UserListItem[]> {
  const res = await apiFetch('/api/users/');
  return (await res.json()) as UserListItem[];
}
