import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCards,
  addFromScryfall,
  deleteCard,
  updateCard,
  bulkImport,
} from "@/api/cards";
import type {
  AddFromScryfallPayload,
  UpdateCardPayload,
  BulkImportPayload,
} from "@/types";

// A stable query key constant — used by both useCards (to fetch) and mutations
// (to invalidate the cache on success). Keeping it in one place means a typo
// in one spot won't silently break cache invalidation.
export const CARDS_QUERY_KEY = ["cards"] as const;

export function useCards() {
  return useQuery({
    queryKey: CARDS_QUERY_KEY,
    queryFn: listCards,
  });
}

export function useAddCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddFromScryfallPayload) => addFromScryfall(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

export function useDeleteCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCard(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

export function useUpdateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCardPayload }) =>
      updateCard(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

// Unlike the other mutations, the caller needs the full response (imported/failed
// counts + per-row results) to display the results UI — so we don't close the
// modal on success here; the component decides what to do with the data.
export function useBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkImportPayload) => bulkImport(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}
