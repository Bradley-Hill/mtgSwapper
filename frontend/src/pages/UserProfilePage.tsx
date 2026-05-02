import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import { getUserProfile, getUserCards } from "@/api/users";
import { getUserRatings } from "@/api/ratings";
import { useAuth } from "@/context";
import { CreateOfferModal, RatingStars } from "@/components";
import type { GlobalSearchResult } from "@/types";
import styles from "./UserProfilePage.module.scss";

/*
 * Why two separate useQuery calls instead of one combined fetch?
 * The profile header and the card table are independent data shapes served
 * by different endpoints. Splitting them means:
 *  - Each can show its own loading/error state independently (the header
 *    appears as soon as the profile loads, even if cards are still loading)
 *  - TanStack Query caches them under separate keys — navigating away and
 *    back shows the cached profile header instantly while cards refresh
 *  - The card list can be paginated or filtered later without touching the
 *    profile query
 */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [cardFilter, setCardFilter] = useState("");
  const { t } = useTranslation();

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ["userProfile", id],
    queryFn: () => getUserProfile(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  // Title shows the user's username once loaded; undefined falls back to app name
  usePageTitle(profile?.username);

  const {
    data: cards,
    isLoading: cardsLoading,
    isError: cardsError,
  } = useQuery({
    queryKey: ["userCards", id],
    queryFn: () => getUserCards(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const { data: ratings } = useQuery({
    queryKey: ["userRatings", id],
    queryFn: () => getUserRatings(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  if (profileLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.muted}>{t("userProfile.loading")}</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{t("userProfile.notFound")}</p>
        <Link to="/search" className={styles.backLink}>
          {t("offerDetail.backToOffers")}
        </Link>
      </main>
    );
  }

  const cardList: GlobalSearchResult[] = cards ?? [];
  const memberSince = new Date(profile.created_at).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
    },
  );

  return (
    <>
      <main className={styles.page}>
        {/* ── Profile header ─────────────────────────────────── */}
        <section className={styles.header}>
          <div className={styles.avatar} aria-hidden="true">
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div className={styles.meta}>
            <h1 className={styles.username}>{profile.username}</h1>
            <p className={styles.location}>
              {profile.city && profile.country
                ? `${profile.city}, ${profile.country}`
                : (profile.country ??
                  profile.city ??
                  t("userProfile.locationNotSet"))}
            </p>
            <p className={styles.since}>
              {t("userProfile.memberSince", { date: memberSince })}
            </p>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>
                {profile.total_swaps_completed}
              </span>
              <span className={styles.statLabel}>
                {t("userProfile.swapsLabel")}
              </span>
            </div>
            <div className={styles.stat}>
              <RatingStars
                stars={parseFloat(profile.reputation_avg)}
                size="lg"
                showValue
              />
            </div>
          </div>

          {/* Only show Make Offer if viewing someone else's profile */}
          {currentUser && currentUser.id !== profile.id && (
            <button
              className={styles.btnOffer}
              onClick={() => setShowOfferModal(true)}
            >
              {t("userProfile.makeOffer")}
            </button>
          )}
        </section>

        {/* ── Available cards ────────────────────────────────── */}
        <section>
          <h2 className={styles.sectionTitle}>
            {t("userProfile.availableCards")}
            {!cardsLoading && (
              <span className={styles.cardCount}>{cardList.length}</span>
            )}
          </h2>

          {cardsLoading && <p className={styles.muted}>{t("userProfile.loadingCards")}</p>}
          {cardsError && <p className={styles.error}>{t("userProfile.errorLoadingCards")}</p>}

          {!cardsLoading && !cardsError && cardList.length === 0 && (
            <p className={styles.muted}>{t("userProfile.noCardsAvailable")}</p>
          )}

          {cardList.length > 0 && (
            <>
              <input
                type="search"
                className={styles.filterInput}
                placeholder={t("userProfile.filterPlaceholder")}
                value={cardFilter}
                onChange={(e) => setCardFilter(e.target.value)}
                aria-label={t("userProfile.filterPlaceholder")}
              />
              {(() => {
                const filtered = cardFilter
                  ? cardList.filter((c) =>
                      c.card_name
                        .toLowerCase()
                        .includes(cardFilter.toLowerCase()),
                    )
                  : cardList;
                return filtered.length === 0 ? (
                  <p className={styles.muted}>{t("userProfile.noCardsMatch")}</p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t("userProfile.columns.card")}</th>
                          <th>{t("userProfile.columns.set")}</th>
                          <th>{t("userProfile.columns.condition")}</th>
                          <th>{t("userProfile.columns.language")}</th>
                          <th>{t("userProfile.columns.foil")}</th>
                          <th>{t("userProfile.columns.quantity")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((card: GlobalSearchResult) => (
                          <tr key={card.id}>
                            <td className={styles.cardName}>
                              {card.card_name}
                            </td>
                            <td className={styles.mono}>
                              {card.set_code.toUpperCase()}
                            </td>
                            <td>
                              <span
                                className={`${styles.badge} ${styles[card.condition]}`}
                              >
                                {card.condition}
                              </span>
                            </td>
                            <td>{card.language}</td>
                            <td>{card.is_foil ? "✦" : "—"}</td>
                            <td>{card.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </>
          )}
        </section>

        {/* ── Ratings received ───────────────────────────────── */}
        <section>
          <h2 className={styles.sectionTitle}>
            {t("userProfile.ratingsTitle")}
            {ratings && (
              <span className={styles.cardCount}>{ratings.length}</span>
            )}
          </h2>

          {!ratings || ratings.length === 0 ? (
            <p className={styles.muted}>{t("userProfile.noRatings")}</p>
          ) : (
            <ul className={styles.ratingsList}>
              {ratings.map((r) => (
                <li key={r.id} className={styles.ratingRow}>
                  <div className={styles.ratingHeader}>
                    <span className={styles.raterName}>{r.rater_username}</span>
                    <RatingStars stars={r.rating_stars} size="sm" />
                    <span className={styles.ratingDate}>
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {r.comment && (
                    <p className={styles.ratingComment}>{r.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Modal rendered outside the scroll container so it can cover the page */}
      {showOfferModal && profile && (
        <CreateOfferModal
          targetUserId={profile.id}
          targetUsername={profile.username}
          targetCards={cardList}
          onClose={() => setShowOfferModal(false)}
        />
      )}
    </>
  );
}
