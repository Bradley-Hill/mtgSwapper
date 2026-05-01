import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSwapDetails,
  setSwapMode,
  proposeMeetup,
  confirmMeetup,
} from "@/api/swapDetails";
import { completeOffer } from "@/api/offers";
import styles from "./SwapCoordinationPanel.module.scss";

interface SwapCoordinationPanelProps {
  offerId: string;
  /** Whether the current user is the offer initiator (affects confirmation labels). */
  isInitiator: boolean;
  offerStatus: "accepted" | "completed";
  onOfferCompleted: () => void;
}

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
        <p className={styles.muted}>Loading coordination details…</p>
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
      <h3 className={styles.title}>Swap Coordination</h3>

      {panelError && <p className={styles.error}>{panelError}</p>}

      {/* ── Mode selection ─────────────────────────────────── */}
      {!details.swap_mode && offerStatus === "accepted" && (
        <section className={styles.section}>
          <p className={styles.prompt}>How will you exchange the cards?</p>
          <div className={styles.modeButtons}>
            <button
              className={styles.modeBtn}
              disabled={isPending}
              onClick={() =>
                run(() => setSwapMode(offerId, { swap_mode: "in_person" }))
              }
            >
              In-Person Meetup
            </button>
            <button
              className={styles.modeBtn}
              disabled={isPending}
              onClick={() =>
                run(() => setSwapMode(offerId, { swap_mode: "mail" }))
              }
            >
              Mail Swap
            </button>
          </div>
        </section>
      )}

      {/* ── Mode confirmed ─────────────────────────────────── */}
      {details.swap_mode && (
        <p className={styles.modeBadge}>
          Mode:{" "}
          <strong>
            {details.swap_mode === "in_person"
              ? "In-Person Meetup"
              : "Mail Swap"}
          </strong>
        </p>
      )}

      {/* ── In-person coordination ─────────────────────────── */}
      {details.swap_mode === "in_person" && offerStatus === "accepted" && (
        <section className={styles.section}>
          {/* Propose meetup form */}
          <h4 className={styles.subTitle}>Meetup Details</h4>

          {details.proposed_location ? (
            <div className={styles.proposal}>
              <p>
                <strong>Location:</strong> {details.proposed_location}
              </p>
              <p>
                <strong>Time:</strong>{" "}
                {new Date(details.proposed_datetime!).toLocaleString(
                  undefined,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                )}
              </p>
              {details.in_person_confirmed_at ? (
                <p className={styles.confirmed}>✓ Both parties confirmed</p>
              ) : (
                <>
                  <p className={styles.confirmStatus}>
                    Initiator:{" "}
                    {details.in_person_confirmed_initiator ? "✓" : "pending"} ·
                    Target:{" "}
                    {details.in_person_confirmed_target ? "✓" : "pending"}
                  </p>
                  {!myConfirmed && (
                    <button
                      className={styles.btnConfirm}
                      disabled={isPending}
                      onClick={() => run(() => confirmMeetup(offerId))}
                    >
                      Confirm Meetup
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className={styles.muted}>No meetup proposed yet.</p>
          )}

          {/* Propose / re-propose form */}
          <details className={styles.proposeForm}>
            <summary>
              {details.proposed_location ? "Change proposal" : "Propose meetup"}
            </summary>
            <div className={styles.formFields}>
              <label className={styles.label}>
                Location
                <input
                  type="text"
                  className={styles.input}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Starbucks on 5th & Pike"
                  maxLength={500}
                />
              </label>
              <label className={styles.label}>
                Date & Time
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
                Submit Proposal
              </button>
            </div>
          </details>
        </section>
      )}

      {/* ── Mail swap note ──────────────────────────────────── */}
      {details.swap_mode === "mail" && (
        <p className={styles.muted}>
          Mail swap selected. Use the message thread to coordinate shipping
          details.
        </p>
      )}

      {/* ── Mark Complete ───────────────────────────────────── */}
      {offerStatus === "accepted" && (
        <section className={styles.section}>
          <h4 className={styles.subTitle}>Completion</h4>
          {myCompleted ? (
            <p className={styles.confirmed}>
              ✓ You've marked this swap as complete.
            </p>
          ) : (
            <button
              className={styles.btnComplete}
              disabled={isPending}
              onClick={handleComplete}
            >
              Mark My Side Complete
            </button>
          )}
          <p className={styles.completionStatus}>
            Initiator: {details.completed_by_initiator ? "✓" : "pending"} ·
            Target: {details.completed_by_target ? "✓" : "pending"}
          </p>
        </section>
      )}

      {offerStatus === "completed" && (
        <p className={styles.confirmed}>✓ Swap completed!</p>
      )}
    </div>
  );
}
