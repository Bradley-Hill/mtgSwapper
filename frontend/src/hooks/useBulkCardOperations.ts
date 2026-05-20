import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteCard, updateCard } from "@/api/cards";
import { CARDS_QUERY_KEY } from "./useCards";

// Each hook fires all API calls in parallel with Promise.all, then invalidates
// the collection cache once on success. This is more efficient than sequential
// awaits and means the UI only re-renders once after all mutations settle.

export function useBulkDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => deleteCard(id))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

export function useBulkUpdateAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      isAvailable,
    }: {
      ids: string[];
      isAvailable: boolean;
    }) =>
      Promise.all(
        ids.map((id) => updateCard(id, { is_available: isAvailable })),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}

export function useBulkUpdateLanguage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, language }: { ids: string[]; language: string }) =>
      Promise.all(ids.map((id) => updateCard(id, { language }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CARDS_QUERY_KEY });
    },
  });
}
