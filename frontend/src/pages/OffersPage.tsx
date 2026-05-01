import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOffers } from "@/api/offers";
import { useAuth } from "@/context";
import type { OfferListItem, OfferStatus } from "@/types";
import styles from "./OffersPage.module.scss";

type Direction = "all" | "sent" | "received";

const STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function OffersPage() {
  const { user } = useAuth();
  const [direction, setDirection] = useState<Direction>("all");
  const [statusFilter, setStatusFilter] = useState("");

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
      <h1 className={styles.pageTitle}>Offers</h1>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className={styles.filters}>
        <div className={styles.tabs} role="tablist">
          {(["all", "received", "sent"] as Direction[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={direction === d}
              className={`${styles.tab} ${direction === d ? styles.tabActive : ""}`}
              onClick={() => setDirection(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={styles.statusSelect}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as OfferStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      {isLoading && <p className={styles.muted}>Loading offers…</p>}
      {isError && <p className={styles.error}>Could not load offers.</p>}

      {!isLoading && !isError && offers.length === 0 && (
        <p className={styles.muted}>No offers found.</p>
      )}

      {offers.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Other Party</th>
                <th>Direction</th>
                <th>Offered</th>
                <th>Requested</th>
                <th>Counters</th>
                <th>Status</th>
                <th>Date</th>
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
                      {isSent ? "↑ Sent" : "↓ Received"}
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
                        View →
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
