import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCards } from "@/api/cards";
import { getUserCards } from "@/api/users";
import { createOffer } from "@/api/offers";
import type { CreateOfferModalProps, GlobalSearchResult } from "@/types";
import styles from "./CreateOfferModal.module.scss";

/*
 * CreateOfferModal — lets the current user send a swap offer to another user.
 *
 * targetCards is optional:
 *  - UserProfilePage passes the already-fetched list (no extra request).
 *  - SearchPage omits it; the modal fetches the target's full card list itself.
 *
 * Both columns have a live text filter so large collections stay navigable.
 */
export function CreateOfferModal({
  targetUserId,
  targetUsername,
  targetCards: targetCardsProp,
  onClose,
}: CreateOfferModalProps) {
  const queryClient = useQueryClient();
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [myFilter, setMyFilter] = useState("");
  const [theirFilter, setTheirFilter] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  const { data: myCards = [], isLoading: myCardsLoading } = useQuery({
    queryKey: ["cards"],
    queryFn: listCards,
    staleTime: 30_000,
  });

  // Only fetch target cards if the caller didn't supply them
  const { data: fetchedTargetCards = [], isLoading: targetCardsLoading } = useQuery({
    queryKey: ["userCards", targetUserId],
    queryFn: () => getUserCards(targetUserId),
    enabled: targetCardsProp === undefined,
    staleTime: 30_000,
  });

  const targetCards: GlobalSearchResult[] = targetCardsProp ?? fetchedTargetCards;
  const targetLoading = targetCardsProp === undefined && targetCardsLoading;

  const availableMyCards = myCards.filter((c) => c.is_available);

  // Client-side filter — case-insensitive substring match on card name
  const filteredMyCards = myFilter
    ? availableMyCards.filter((c) =>
        c.card_name.toLowerCase().includes(myFilter.toLowerCase())
      )
    : availableMyCards;

  const filteredTargetCards = theirFilter
    ? targetCards.filter((c) =>
        c.card_name.toLowerCase().includes(theirFilter.toLowerCase())
      )
    : targetCards;

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () =>
      createOffer({
        target_user_id: targetUserId,
        offered_card_ids: [...offeredIds],
        requested_card_ids: [...requestedIds],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["offers"] });
      onClose();
    },
    onError: (err: Error) => {
      setApiError(err.message ?? "Failed to create offer.");
    },
  });

  function toggleId(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const canSubmit = offeredIds.size > 0 && requestedIds.size > 0 && !isPending;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ─────────────────────────────────────────── */}
        <div className={styles.header}>
          <h2 className={styles.title}>Offer to {targetUsername}</h2>
          <button
            ref={firstFocusRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className={styles.hint}>
          Select cards <strong>you offer</strong> on the left and cards{" "}
          <strong>you want</strong> from {targetUsername} on the right.
        </p>

        {/* ── Two-column picker ───────────────────────────────── */}
        <div className={styles.columns}>
          {/* Your cards */}
          <section className={styles.column}>
            <h3 className={styles.columnTitle}>
              Your cards{offeredIds.size > 0 && ` (${offeredIds.size})`}
            </h3>
            <input
              type="search"
              className={styles.filterInput}
              placeholder="Filter…"
              value={myFilter}
              onChange={(e) => setMyFilter(e.target.value)}
              aria-label="Filter your cards"
            />
            {myCardsLoading && <p className={styles.muted}>Loading…</p>}
            {!myCardsLoading && availableMyCards.length === 0 && (
              <p className={styles.muted}>No available cards.</p>
            )}
            {!myCardsLoading && availableMyCards.length > 0 && filteredMyCards.length === 0 && (
              <p className={styles.muted}>No cards match.</p>
            )}
            <ul className={styles.list}>
              {filteredMyCards.map((card) => (
                <li key={card.id}>
                  <label
                    className={`${styles.row} ${offeredIds.has(card.id) ? styles.rowSelected : ""}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={offeredIds.has(card.id)}
                      onChange={() =>
                        setOfferedIds(toggleId(offeredIds, card.id))
                      }
                    />
                    <span className={styles.cardName}>{card.card_name}</span>
                    <span className={styles.cardMeta}>
                      {card.set_code.toUpperCase()}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* Their cards */}
          <section className={styles.column}>
            <h3 className={styles.columnTitle}>
              {targetUsername}&apos;s cards
              {requestedIds.size > 0 && ` (${requestedIds.size})`}
            </h3>
            <input
              type="search"
              className={styles.filterInput}
              placeholder="Filter…"
              value={theirFilter}
              onChange={(e) => setTheirFilter(e.target.value)}
              aria-label={`Filter ${targetUsername}'s cards`}
            />
            {targetLoading && <p className={styles.muted}>Loading…</p>}
            {!targetLoading && targetCards.length === 0 && (
              <p className={styles.muted}>No available cards.</p>
            )}
            {!targetLoading && targetCards.length > 0 && filteredTargetCards.length === 0 && (
              <p className={styles.muted}>No cards match.</p>
            )}
            <ul className={styles.list}>
              {filteredTargetCards.map((card: GlobalSearchResult) => (
                <li key={card.id}>
                  <label
                    className={`${styles.row} ${requestedIds.has(card.id) ? styles.rowSelected : ""}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={requestedIds.has(card.id)}
                      onChange={() =>
                        setRequestedIds(toggleId(requestedIds, card.id))
                      }
                    />
                    <span className={styles.cardName}>{card.card_name}</span>
                    <span className={styles.cardMeta}>
                      {card.set_code.toUpperCase()}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ── Error + submit ──────────────────────────────────── */}
        {apiError && <p className={styles.error}>{apiError}</p>}

        <div className={styles.footer}>
          <button
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            className={styles.btnSubmit}
            onClick={() => submit()}
            disabled={!canSubmit}
          >
            {isPending ? "Sending…" : "Send Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}
