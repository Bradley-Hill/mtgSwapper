import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { globalSearch } from "@/api/cards";
import { useAuth } from "@/context";
import { CreateOfferModal } from "@/components";
import { useDebounce } from "@/hooks";
import type { GlobalSearchResult } from "@/types";
import styles from "./SearchPage.module.scss";

interface OfferTarget {
  userId: string;
  username: string;
}

export function SearchPage() {
  const { user: currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null);
  const debouncedQuery = useDebounce(query, 350);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["globalSearch", debouncedQuery],
    queryFn: () => globalSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000, // cache results for 30 s — search results don't change that fast
  });

  const results: GlobalSearchResult[] = data?.results ?? [];
  const hasSearched = debouncedQuery.length >= 2;

  return (
    <>
      <main className={styles.page}>
        <h1 className={styles.heading}>Search Cards</h1>
        <p className={styles.sub}>
          Find cards available for swap across all users.
        </p>

        <div className={styles.searchBar}>
          <input
            type="search"
            className={styles.input}
            placeholder="Card name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label="Search for a card"
          />
          {isFetching && <span className={styles.spinner} aria-hidden="true" />}
        </div>

        {/* ── Results ─────────────────────────────────────────── */}
        {isError && (
          <p className={styles.error}>
            Something went wrong. Please try again.
          </p>
        )}

        {hasSearched && !isLoading && !isError && results.length === 0 && (
          <p className={styles.empty}>
            No cards found for &ldquo;{debouncedQuery}&rdquo;.
          </p>
        )}

        {results.length > 0 && (
          <>
            <p className={styles.count}>
              {data!.count} result{data!.count !== 1 ? "s" : ""}
            </p>
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
                    <th>Owner</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((card) => (
                    <tr key={card.id}>
                      <td className={styles.cardName}>{card.card_name}</td>
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
                      <td>
                        <Link
                          to={`/users/${card.owner_id}`}
                          className={styles.ownerLink}
                        >
                          {card.owner_username}
                        </Link>
                      </td>
                      <td>
                        {currentUser && card.owner_id !== currentUser.id && (
                          <button
                            className={styles.offerBtn}
                            onClick={() =>
                              setOfferTarget({
                                userId: card.owner_id,
                                username: card.owner_username,
                              })
                            }
                          >
                            Make Offer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {offerTarget && (
        <CreateOfferModal
          targetUserId={offerTarget.userId}
          targetUsername={offerTarget.username}
          onClose={() => setOfferTarget(null)}
        />
      )}
    </>
  );
}
