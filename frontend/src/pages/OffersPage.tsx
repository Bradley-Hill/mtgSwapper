import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import { getOffers } from "@/api/offers";
import { useAuth } from "@/context";
import type { OfferListItem, OfferStatus, OffersDirection } from "@/types";
import styles from "./OffersPage.module.scss";

export function OffersPage() {
  const { user } = useAuth();
  const [direction, setDirection] = useState<OffersDirection>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const { t } = useTranslation();
  usePageTitle(t("offers.title"));

  const STATUS_LABELS: Record<OfferStatus, string> = {
    pending: t("offers.status.pending"),
    accepted: t("offers.status.accepted"),
    declined: t("offers.status.declined"),
    expired: t("offers.status.expired"),
    cancelled: t("offers.status.cancelled"),
    completed: t("offers.status.completed"),
  };

  const DIRECTION_LABELS: Record<OffersDirection, string> = {
    all: t("offers.tabs.all"),
    sent: t("offers.tabs.sent"),
    received: t("offers.tabs.received"),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["offers", direction, statusFilter],
    queryFn: () =>
      getOffers({
        direction: direction === "all" ? undefined : direction,
        status: statusFilter || undefined,
      }),
    staleTime: 15_000,
  });

  const offers: OfferListItem[] = data ?? [];

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>{t("offers.title")}</h1>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className={styles.filters}>
        <div className={styles.tabs} role="tablist">
          {(["all", "received", "sent"] as OffersDirection[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={direction === d}
              className={`${styles.tab} ${direction === d ? styles.tabActive : ""}`}
              onClick={() => setDirection(d)}
            >
              {DIRECTION_LABELS[d]}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.statusSelect}
          aria-label={t("offers.filter.allStatuses")}
        >
          <option value="">{t("offers.filter.allStatuses")}</option>
          {(Object.keys(STATUS_LABELS) as OfferStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      {isLoading && <p className={styles.muted}>{t("offers.loading")}</p>}
      {isError && <p className={styles.error}>{t("common.error")}</p>}

      {!isLoading && !isError && offers.length === 0 && (
        <p className={styles.muted}>{t("offers.empty")}</p>
      )}

      {offers.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("offers.columns.with")}</th>
                <th>{t("offers.columns.direction")}</th>
                <th>{t("offers.columns.offered")}</th>
                <th>{t("offers.columns.requested")}</th>
                <th>{t("offers.columns.counteroffers")}</th>
                <th>{t("offers.columns.status")}</th>
                <th>{t("offers.columns.created")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const isSent = offer.initiator.id === user?.id;
                const other = isSent ? offer.target : offer.initiator;
                return (
                  <tr key={offer.id}>
                    <td>
                      <Link to={`/users/${other.id}`} className={styles.link}>
                        {other.username}
                      </Link>
                    </td>
                    <td className={styles.mono}>
                      {isSent
                        ? t("offers.direction.sent")
                        : t("offers.direction.received")}
                    </td>
                    <td>{offer.offered_count}</td>
                    <td>{offer.requested_count}</td>
                    <td>{offer.counteroffer_count}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${styles[offer.status]}`}
                      >
                        {STATUS_LABELS[offer.status]}
                      </span>
                    </td>
                    <td className={styles.muted}>
                      {new Date(offer.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <Link
                        to={`/offers/${offer.id}`}
                        className={styles.viewLink}
                      >
                        {t("offers.viewDetail")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
