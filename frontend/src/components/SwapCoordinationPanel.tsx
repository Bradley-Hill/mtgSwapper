import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getSwapDetails,
  setSwapMode,
  proposeMeetup,
  confirmMeetup,
} from "@/api/swapDetails";
import { completeOffer } from "@/api/offers";
import type { SwapCoordinationPanelProps } from "@/types";
import styles from "./SwapCoordinationPanel.module.scss";

export function SwapCoordinationPanel({
  offerId,
  isInitiator,
  offerStatus,
  onOfferCompleted,
}: SwapCoordinationPanelProps) {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState("");
  const [datetime, setDatetime] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const { t } = useTranslation();

  const { data: details, isLoading } = useQuery({
    queryKey: ["swapDetails", offerId],
    queryFn: () => getSwapDetails(offerId),
    staleTime: 5_000,
  });

  /*
   * One shared mutation helper — same pattern as OfferDetailPage actions.
   * Each button passes a different API function; onSuccess invalidates the
   * swapDetails + offer caches so both panels re-render with fresh data.
   */
  const { mutate: run, isPending } = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setPanelError(null);
      void queryClient.invalidateQueries({
        queryKey: ["swapDetails", offerId],
      });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      void queryClient.invalidateQueries({ queryKey: ["messages", offerId] });
    },
    onError: (err: Error) => {
      setPanelError(err.message ?? "Action failed.");
    },
  });

  function handleComplete() {
    run(async () => {
      const offer = await completeOffer(offerId);
      if (offer.status === "completed") onOfferCompleted();
      return offer;
    });
  }

  if (isLoading || !details) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>{t("swapCoordination.loading")}</p>
      </div>
    );
  }

  const myConfirmed = isInitiator
    ? details.in_person_confirmed_initiator
    : details.in_person_confirmed_target;

  const myCompleted = isInitiator
    ? details.completed_by_initiator
    : details.completed_by_target;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>{t("swapCoordination.title")}</h3>

      {panelError && <p className={styles.error}>{panelError}</p>}

      {/* ── Mode selection ─────────────────────────────────── */}
      {!details.swap_mode && offerStatus === "accepted" && (
        <section className={styles.section}>
          <p className={styles.prompt}>{t("swapCoordination.modeQuestion")}</p>
          <div className={styles.modeButtons}>
            <button
              className={styles.modeBtn}
              disabled={isPending}
              onClick={() =>
                run(() => setSwapMode(offerId, { swap_mode: "in_person" }))
              }
            >
              {t("swapCoordination.inPerson")}
            </button>
            <button
              className={styles.modeBtn}
              disabled={isPending}
              onClick={() =>
                run(() => setSwapMode(offerId, { swap_mode: "mail" }))
              }
            >
              {t("swapCoordination.mail")}
            </button>
          </div>
        </section>
      )}

      {/* ── Mode confirmed ─────────────────────────────────── */}
      {details.swap_mode && (
        <p className={styles.modeBadge}>
          {t("swapCoordination.mode")}:{" "}
          <strong>
            {details.swap_mode === "in_person"
              ? t("swapCoordination.inPerson")
              : t("swapCoordination.mail")}
          </strong>
        </p>
      )}

      {/* ── In-person coordination ─────────────────────────── */}
      {details.swap_mode === "in_person" && offerStatus === "accepted" && (
        <section className={styles.section}>
          {/* Propose meetup form */}
          <h4 className={styles.subTitle}>
            {t("swapCoordination.meetupDetails")}
          </h4>

          {details.proposed_location ? (
            <div className={styles.proposal}>
              <p>
                <strong>{t("swapCoordination.location")}:</strong>{" "}
                {details.proposed_location}
              </p>
              <p>
                <strong>{t("swapCoordination.dateTime")}:</strong>{" "}
                {new Date(details.proposed_datetime!).toLocaleString(
                  undefined,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                )}
              </p>
              {details.in_person_confirmed_at ? (
                <p className={styles.confirmed}>
                  {t("swapCoordination.bothConfirmed")}
                </p>
              ) : (
                <>
                  <p className={styles.confirmStatus}>
                    {t("swapCoordination.initiatorStatus")}:{" "}
                    {details.in_person_confirmed_initiator
                      ? "✓"
                      : t("swapCoordination.pending")}{" "}
                    · {t("swapCoordination.targetStatus")}:{" "}
                    {details.in_person_confirmed_target
                      ? "✓"
                      : t("swapCoordination.pending")}
                  </p>
                  {!myConfirmed && (
                    <button
                      className={styles.btnConfirm}
                      disabled={isPending}
                      onClick={() => run(() => confirmMeetup(offerId))}
                    >
                      {t("swapCoordination.confirmMeetup")}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className={styles.muted}>
              {t("swapCoordination.noMeetupProposed")}
            </p>
          )}

          {/* Propose / re-propose form */}
          <details className={styles.proposeForm}>
            <summary>
              {details.proposed_location
                ? t("swapCoordination.changeProposal")
                : t("swapCoordination.proposeMeetup")}
            </summary>
            <div className={styles.formFields}>
              <label className={styles.label}>
                {t("swapCoordination.location")}
                <input
                  type="text"
                  className={styles.input}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("swapCoordination.locationPlaceholder")}
                  maxLength={500}
                />
              </label>
              <label className={styles.label}>
                {t("swapCoordination.dateTime")}
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                />
              </label>
              <button
                className={styles.btnPropose}
                disabled={isPending || !location || !datetime}
                onClick={() =>
                  run(() =>
                    proposeMeetup(offerId, {
                      proposed_location: location,
                      proposed_datetime: new Date(datetime).toISOString(),
                    }),
                  )
                }
              >
                {t("swapCoordination.submitProposal")}
              </button>
            </div>
          </details>
        </section>
      )}

      {/* ── Mail swap note ──────────────────────────────────── */}
      {details.swap_mode === "mail" && (
        <p className={styles.muted}>{t("swapCoordination.mailNote")}</p>
      )}

      {/* ── Mark Complete ───────────────────────────────────── */}
      {offerStatus === "accepted" && (
        <section className={styles.section}>
          <h4 className={styles.subTitle}>
            {t("swapCoordination.completion")}
          </h4>
          {myCompleted ? (
            <p className={styles.confirmed}>
              {t("swapCoordination.youMarkedComplete")}
            </p>
          ) : (
            <button
              className={styles.btnComplete}
              disabled={isPending}
              onClick={handleComplete}
            >
              {t("swapCoordination.markComplete")}
            </button>
          )}
          <p className={styles.completionStatus}>
            {t("swapCoordination.initiatorStatus")}:{" "}
            {details.completed_by_initiator
              ? "✓"
              : t("swapCoordination.pending")}{" "}
            · {t("swapCoordination.targetStatus")}:{" "}
            {details.completed_by_target ? "✓" : t("swapCoordination.pending")}
          </p>
        </section>
      )}

      {offerStatus === "completed" && (
        <p className={styles.confirmed}>
          {t("swapCoordination.swapCompleted")}
        </p>
      )}
    </div>
  );
}
