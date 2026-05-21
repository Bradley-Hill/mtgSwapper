import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { globalSearch } from "@/api/cards";
import { listUsers } from "@/api/users";
import { useAuth } from "@/context";
import { CreateOfferModal, CardImageTooltip } from "@/components";
import { useDebounce, usePageTitle } from "@/hooks";
import type {
  GlobalSearchResult,
  UserListItem,
  SearchPageTab,
  OfferTarget,
  SwapperSort,
} from "@/types";
import styles from "./SearchPage.module.scss";

export function SearchPage() {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SearchPageTab>("cards");
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [traderFilter, setTraderFilter] = useState("");
  const [swapperSort, setSwapperSort] = useState<SwapperSort>("reputation");
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null);
  const debouncedQuery = useDebounce(query, 350);
  const { t } = useTranslation();
  usePageTitle(t("search.title"));

  // ── Cards tab query ────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["globalSearch", debouncedQuery],
    queryFn: () => globalSearch(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && activeTab === "cards",
    staleTime: 30_000,
  });

  // ── Traders tab query ──────────────────────────────────────────────────────
  // Fetches once when the tab is first opened, then stays cached for 60 s.
  // We fetch all traders up-front and filter client-side — the list is small
  // enough that a server-side filter endpoint would be over-engineering.
  const {
    data: tradersData,
    isLoading: tradersLoading,
    isError: tradersError,
  } = useQuery({
    queryKey: ["userList"],
    queryFn: listUsers,
    enabled: activeTab === "traders",
    staleTime: 60_000,
  });

  const results: GlobalSearchResult[] = data?.results ?? [];
  const filteredResults = availableOnly
    ? results.filter((c) => c.is_available)
    : results;
  const hasSearched = debouncedQuery.length >= 2;

  const traders: UserListItem[] = tradersData ?? [];
  const filteredTraders = traderFilter.trim()
    ? traders.filter((u) =>
        u.username.toLowerCase().includes(traderFilter.toLowerCase()),
      )
    : traders;
  const sortedTraders = [...filteredTraders].sort((a, b) =>
    swapperSort === "reputation"
      ? parseFloat(b.reputation_avg) - parseFloat(a.reputation_avg)
      : b.available_card_count - a.available_card_count,
  );

  return (
    <>
      <main className={styles.page}>
        <h1 className={styles.heading}>{t("search.title")}</h1>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "cards"}
            className={`${styles.tab} ${activeTab === "cards" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("cards")}
          >
            {t("search.tabs.cards")}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "traders"}
            className={`${styles.tab} ${activeTab === "traders" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("traders")}
          >
            {t("search.tabs.traders")}
          </button>
        </div>

        {/* ── Cards tab ────────────────────────────────────────────────────── */}
        {activeTab === "cards" && (
          <>
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
              {isFetching && (
                <span className={styles.spinner} aria-hidden="true" />
              )}
            </div>

            <div className={styles.filterRow}>
              <button
                className={`${styles.filterChip} ${availableOnly ? styles.filterChipActive : ""}`}
                onClick={() => setAvailableOnly((v) => !v)}
                aria-pressed={availableOnly}
              >
                {t("search.availableOnly")}
              </button>
            </div>

            {isError && <p className={styles.error}>{t("common.error")}</p>}

            {hasSearched && !isLoading && !isError && filteredResults.length === 0 && (
              <p className={styles.empty}>
                {t("search.noResults")} &ldquo;{debouncedQuery}&rdquo;
              </p>
            )}

            {filteredResults.length > 0 && (
              <>
                <p className={styles.count}>
                  {t("search.resultCount", { count: filteredResults.length })}
                </p>
                <div className={`${styles.tableWrapper} ${styles.cardsWrapper}`}>
                  <table className={`${styles.table} ${styles.cardsTable}`}>
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
                      {filteredResults.map((card) => (
                        <tr key={card.id}>
                          <td className={styles.cardName}>
                            <CardImageTooltip scryfallId={card.scryfall_id}>
                              {card.card_name}
                            </CardImageTooltip>
                          </td>
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
                            {currentUser &&
                              card.owner_id !== currentUser.id && (
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
          </>
        )}

        {/* ── Traders tab ──────────────────────────────────────────────────── */}
        {activeTab === "traders" && (
          <>
            <p className={styles.sub}>{t("search.traders.sub")}</p>

            <div className={styles.searchBar}>
              <input
                type="search"
                className={styles.input}
                placeholder={t("search.traders.filterPlaceholder")}
                value={traderFilter}
                onChange={(e) => setTraderFilter(e.target.value)}
                autoFocus
                aria-label={t("search.traders.filterPlaceholder")}
              />
            </div>

            {tradersError && (
              <p className={styles.error}>{t("common.error")}</p>
            )}
            {tradersLoading && (
              <p className={styles.empty}>{t("search.traders.loading")}</p>
            )}
            {!tradersLoading &&
              !tradersError &&
              filteredTraders.length === 0 && (
                <p className={styles.empty}>{t("search.traders.empty")}</p>
              )}

            {filteredTraders.length > 0 && (
              <div
                className={`${styles.tableWrapper} ${styles.tradersWrapper}`}
              >
                <table className={`${styles.table} ${styles.tradersTable}`}>
                  <thead>
                    <tr>
                      <th>{t("search.traders.columns.username")}</th>
                      <th>{t("search.traders.columns.location")}</th>
                      <th>
                        <button
                          className={`${styles.sortableHeader} ${swapperSort === "cards" ? styles.sortActive : ""}`}
                          onClick={() => setSwapperSort("cards")}
                          aria-pressed={swapperSort === "cards"}
                        >
                          {t("search.traders.columns.cards")}
                          {swapperSort === "cards" && " ↓"}
                        </button>
                      </th>
                      <th>
                        <button
                          className={`${styles.sortableHeader} ${swapperSort === "reputation" ? styles.sortActive : ""}`}
                          onClick={() => setSwapperSort("reputation")}
                          aria-pressed={swapperSort === "reputation"}
                        >
                          {t("search.traders.columns.reputation")}
                          {swapperSort === "reputation" && " ↓"}
                        </button>
                      </th>
                      <th>{t("search.traders.columns.swaps")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTraders.map((trader) => (
                      <tr key={trader.id}>
                        <td className={styles.cardName}>{trader.username}</td>
                        <td className={styles.location}>
                          {trader.city || trader.country
                            ? [trader.city, trader.country]
                                .filter(Boolean)
                                .join(", ")
                            : t("search.traders.noLocation")}
                        </td>
                        <td>{trader.available_card_count}</td>
                        <td>{parseFloat(trader.reputation_avg).toFixed(1)}</td>
                        <td>{trader.total_swaps_completed}</td>
                        <td>
                          <Link
                            to={`/users/${trader.id}`}
                            className={styles.offerBtn}
                          >
                            {t("search.traders.viewCollection")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
