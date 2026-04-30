import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getUserProfile, getUserCards } from '@/api/users';
import type { GlobalSearchResult } from '@/types';
import styles from './UserProfilePage.module.scss';

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

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
  } = useQuery({
    queryKey: ['userProfile', id],
    queryFn: () => getUserProfile(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  const {
    data: cards,
    isLoading: cardsLoading,
    isError: cardsError,
  } = useQuery({
    queryKey: ['userCards', id],
    queryFn: () => getUserCards(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  if (profileLoading) {
    return <main className={styles.page}><p className={styles.muted}>Loading profile…</p></main>;
  }

  if (profileError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>User not found.</p>
        <Link to="/search" className={styles.backLink}>← Back to search</Link>
      </main>
    );
  }

  const cardList: GlobalSearchResult[] = cards ?? [];
  const memberSince = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });

  return (
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
              : profile.country ?? profile.city ?? 'Location not set'}
          </p>
          <p className={styles.since}>Member since {memberSince}</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{profile.total_swaps_completed}</span>
            <span className={styles.statLabel}>Swaps</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {parseFloat(profile.reputation_avg).toFixed(1)}
            </span>
            <span className={styles.statLabel}>Rating</span>
          </div>
        </div>
      </section>

      {/* ── Available cards ────────────────────────────────── */}
      <section>
        <h2 className={styles.sectionTitle}>
          Available Cards
          {!cardsLoading && (
            <span className={styles.cardCount}>{cardList.length}</span>
          )}
        </h2>

        {cardsLoading && <p className={styles.muted}>Loading cards…</p>}
        {cardsError && <p className={styles.error}>Could not load cards.</p>}

        {!cardsLoading && !cardsError && cardList.length === 0 && (
          <p className={styles.muted}>This user has no cards available for swap.</p>
        )}

        {cardList.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Set</th>
                  <th>Condition</th>
                  <th>Language</th>
                  <th>Foil</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {cardList.map((card: GlobalSearchResult) => (
                  <tr key={card.id}>
                    <td className={styles.cardName}>{card.card_name}</td>
                    <td className={styles.mono}>{card.set_code.toUpperCase()}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[card.condition]}`}>
                        {card.condition}
                      </span>
                    </td>
                    <td>{card.language}</td>
                    <td>{card.is_foil ? '✦' : '—'}</td>
                    <td>{card.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
