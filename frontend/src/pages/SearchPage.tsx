import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { globalSearch } from "@/api/cards";
import { useAuth } from "@/context";
import { CreateOfferModal } from "@/components";
import { useDebounce, usePageTitle } from "@/hooks";
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
  const { t } = useTranslation();
  usePageTitle(t('search.title'));

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
        <h1 className={styles.heading}>{t("search.title")}</h1>
        <p className={styles.sub}>{t("search.sub")}</p>

        <div className={styles.searchBar}>
          <input
            type="search"
            className={styles.input}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label={t("search.title")}
          />
          {isFetching && <span className={styles.spinner} aria-hidden="true" />}
        </div>

        {/* ── Results ─────────────────────────────────────────── */}
        {isError && <p className={styles.error}>{t("common.error")}</p>}

        {hasSearched && !isLoading && !isError && results.length === 0 && (
          <p className={styles.empty}>
            {t("search.noResults")} &ldquo;{debouncedQuery}&rdquo;
          </p>
        )}

        {results.length > 0 && (
          <>
            <p className={styles.count}>
              {t("search.resultCount", { count: data!.count })}
            </p>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("search.columns.card")}</th>
                    <th>{t("search.columns.set")}</th>
                    <th>{t("search.columns.condition")}</th>
                    <th>{t("search.columns.language")}</th>
                    <th>{t("search.columns.foil")}</th>
                    <th>{t("search.columns.quantity")}</th>
                    <th>{t("search.columns.owner")}</th>
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
                          {t(`collection.condition.${card.condition}`)}
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
                            {t("search.makeOffer")}
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
