import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOffer, acceptOffer, declineOffer, cancelOffer } from "@/api/offers";
import { useAuth } from "@/context";
import type { OfferItem, OfferStatus } from "@/types";
import styles from "./OfferDetailPage.module.scss";

const STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: offer,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => getOffer(id!),
    enabled: !!id,
    staleTime: 10_000,
  });

  /*
   * Why one shared mutation config instead of three separate useMutation calls?
   * All three actions (accept / decline / cancel) share the same success
   * behavior — invalidate the offer cache and clear the error. Only the
   * API function differs, so we pass it as a variable via `mutate(fn)`.
   * This avoids duplicating onSuccess/onError three times.
   */
  const { mutate: runAction, isPending: isActing } = useMutation({
    mutationFn: (fn: () => Promise<typeof offer>) => fn(),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["offer", id] });
      void queryClient.invalidateQueries({ queryKey: ["offers"] });
    },
    onError: (err: Error) => {
      setActionError(err.message ?? "Action failed.");
    },
  });

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>Loading offer…</p>
      </main>
    );
  }

  if (isError || !offer) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>Offer not found.</p>
        <Link to="/offers" className={styles.backLink}>
          ← Back to offers
        </Link>
      </main>
    );
  }

  const isInitiator = offer.initiator.id === user?.id;
  const isTarget = offer.target.id === user?.id;
  const isPending = offer.status === "pending";

  const offeredItems = offer.items.filter(
    (i: OfferItem) => i.item_type === "offered",
  );
  const requestedItems = offer.items.filter(
    (i: OfferItem) => i.item_type === "requested",
  );

  const expiresAt = new Date(offer.expires_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main className={styles.page}>
      {/* ── Back nav ───────────────────────────────────────── */}
      <Link to="/offers" className={styles.backLink}>
        ← Back to offers
      </Link>

      {/* ── Header ─────────────────────────────────────────── */}
      <section className={styles.header}>
        <div className={styles.participants}>
          <Link to={`/users/${offer.initiator.id}`} className={styles.link}>
            {offer.initiator.username}
          </Link>
          <span className={styles.arrow}>→</span>
          <Link to={`/users/${offer.target.id}`} className={styles.link}>
            {offer.target.username}
          </Link>
        </div>

        <div className={styles.meta}>
          <span className={`${styles.badge} ${styles[offer.status]}`}>
            {STATUS_LABELS[offer.status]}
          </span>
          {offer.counteroffer_count > 0 && (
            <span className={styles.metaItem}>
              {offer.counteroffer_count} / {offer.max_counteroffers}{" "}
              counteroffers
            </span>
          )}
          <span className={styles.metaItem}>Expires {expiresAt}</span>
        </div>
      </section>

      {/* ── Card columns ───────────────────────────────────── */}
      <div className={styles.columns}>
        <section className={styles.column}>
          <h2 className={styles.columnTitle}>
            {isInitiator ? "Your offer" : `${offer.initiator.username} offers`}
          </h2>
          <CardList items={offeredItems} />
        </section>

        <section className={styles.column}>
          <h2 className={styles.columnTitle}>
            {isInitiator ? "You want" : `${offer.initiator.username} wants`}
          </h2>
          <CardList items={requestedItems} />
        </section>
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      {isPending && (
        <div className={styles.actions}>
          {actionError && <p className={styles.error}>{actionError}</p>}

          {isTarget && (
            <>
              <button
                className={styles.btnAccept}
                disabled={isActing}
                onClick={() => runAction(() => acceptOffer(offer.id))}
              >
                Accept
              </button>
              <button
                className={styles.btnDecline}
                disabled={isActing}
                onClick={() => runAction(() => declineOffer(offer.id))}
              >
                Decline
              </button>
            </>
          )}

          {isInitiator && (
            <button
              className={styles.btnCancel}
              disabled={isActing}
              onClick={() =>
                runAction(async () => {
                  await cancelOffer(offer.id);
                  navigate("/offers");
                  return undefined;
                })
              }
            >
              Cancel Offer
            </button>
          )}
        </div>
      )}
    </main>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function CardList({ items }: { items: OfferItem[] }) {
  if (items.length === 0) {
    return <p className={styles.muted}>None</p>;
  }
  return (
    <ul className={styles.cardList}>
      {items.map((item) => (
        <li key={item.id} className={styles.cardRow}>
          <span className={styles.cardName}>{item.card.card_name}</span>
          <span className={styles.cardMeta}>
            {item.card.set_code.toUpperCase()} · {item.card.condition}
            {item.card.is_foil && " · ✦"}
          </span>
        </li>
      ))}
    </ul>
  );
}
