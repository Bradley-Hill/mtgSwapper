import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import { getOffer, acceptOffer, declineOffer, cancelOffer } from "@/api/offers";
import { useAuth } from "@/context";
import {
  MessageThread,
  SwapCoordinationPanel,
  SubmitRatingModal,
  CardImageTooltip,
} from "@/components";
import type { OfferItem } from "@/types";
import styles from "./OfferDetailPage.module.scss";

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const { t } = useTranslation();

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

  // Title updates once the offer loads; undefined falls back to base app name
  usePageTitle(offer ? `#${offer.id.slice(0, 8)}` : undefined);

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
        <p className={styles.muted}>{t("offerDetail.loading")}</p>
      </main>
    );
  }

  if (isError || !offer) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{t("offerDetail.notFound")}</p>
        <Link to="/offers" className={styles.backLink}>
          {t("offerDetail.backToOffers")}
        </Link>
      </main>
    );
  }

  const isInitiator = offer.initiator.id === user?.id;
  const isTarget = offer.target.id === user?.id;
  const isPending = offer.status === "pending";
  const otherParticipant = isInitiator ? offer.target : offer.initiator;

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
        {t("offerDetail.backToOffers")}
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
            {t(`offers.status.${offer.status}`)}
          </span>
          {offer.counteroffer_count > 0 && (
            <span className={styles.metaItem}>
              {t("offerDetail.counterofferLine", {
                count: offer.counteroffer_count,
                max: offer.max_counteroffers,
              })}
            </span>
          )}
          <span className={styles.metaItem}>
            {t("offerDetail.expires", { date: expiresAt })}
          </span>
        </div>
      </section>

      {/* ── Card columns ───────────────────────────────────── */}
      <div className={styles.columns}>
        <section className={styles.column}>
          <h2 className={styles.columnTitle}>
            {isInitiator
              ? t("offerDetail.yourOffer")
              : t("offerDetail.initiatorOffers", {
                  username: offer.initiator.username,
                })}
          </h2>
          <CardList items={offeredItems} />
        </section>

        <section className={styles.column}>
          <h2 className={styles.columnTitle}>
            {isInitiator
              ? t("offerDetail.youWant")
              : t("offerDetail.initiatorWants", {
                  username: offer.initiator.username,
                })}
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
                {t("offerDetail.actions.accept")}
              </button>
              <button
                className={styles.btnDecline}
                disabled={isActing}
                onClick={() => runAction(() => declineOffer(offer.id))}
              >
                {t("offerDetail.actions.decline")}
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
              {t("offerDetail.actions.cancel")}
            </button>
          )}
        </div>
      )}

      {/* ── Post-acceptance coordination + messaging ───────── */}
      {(offer.status === "accepted" || offer.status === "completed") &&
        user && (
          <>
            <SwapCoordinationPanel
              offerId={offer.id}
              isInitiator={isInitiator}
              offerStatus={offer.status}
              onOfferCompleted={() => {
                void queryClient.invalidateQueries({ queryKey: ["offer", id] });
              }}
            />
            <MessageThread offerId={offer.id} currentUsername={user.username} />
          </>
        )}

      {/* ── Rate swap partner (completed offers only) ────── */}
      {offer.status === "completed" && !hasRated && (
        <div className={styles.actions}>
          <button
            className={styles.btnRate}
            onClick={() => setShowRatingModal(true)}
          >
            {t("offerDetail.actions.rateUser", {
              username: otherParticipant.username,
            })}
          </button>
        </div>
      )}
      {offer.status === "completed" && hasRated && (
        <p className={styles.ratedNote}>{t("offerDetail.ratedNote")}</p>
      )}

      {showRatingModal && (
        <SubmitRatingModal
          offerId={offer.id}
          targetUsername={otherParticipant.username}
          onClose={() => setShowRatingModal(false)}
          onSuccess={() => {
            setHasRated(true);
            setShowRatingModal(false);
          }}
        />
      )}
    </main>
  );
}

function CardList({ items }: { items: OfferItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className={styles.muted}>{t("offerDetail.none")}</p>;
  }
  return (
    <ul className={styles.cardList}>
      {items.map((item) => (
        <li key={item.id} className={styles.cardRow}>
          <span className={styles.cardName}>
            <CardImageTooltip scryfallId={item.card.scryfall_id}>
              {item.card.card_name}
            </CardImageTooltip>
          </span>
          <span className={styles.cardMeta}>
            {item.card.set_code.toUpperCase()} · {item.card.condition}
            {item.card.is_foil && " · ✦"}
          </span>
        </li>
      ))}
    </ul>
  );
}
