import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitRating } from "@/api/ratings";
import styles from "./SubmitRatingModal.module.scss";

interface SubmitRatingModalProps {
  offerId: string;
  targetUsername: string;
  onClose: () => void;
  onSuccess: () => void;
}

/*
 * Why manage `selectedStars` as local state rather than a controlled form field?
 * Stars are not a native HTML input type. We render five clickable spans and
 * track the chosen value as a number — cleaner than a hidden <input> whose
 * value we'd have to sync manually. The comment textarea IS a standard input
 * so it uses a normal controlled pattern.
 *
 * Why call onSuccess from the parent instead of navigating here?
 * The modal doesn't know whether it's inside OfferDetailPage or a future
 * notification panel. Reporting success upward keeps the modal reusable.
 */
export function SubmitRatingModal({
  offerId,
  targetUsername,
  onClose,
  onSuccess,
}: SubmitRatingModalProps) {
  const queryClient = useQueryClient();
  const [selectedStars, setSelectedStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      submitRating({
        offer_id: offerId,
        rating_stars: selectedStars,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      // Invalidate the rated user's profile so reputation_avg updates live
      void queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["userRatings"] });
      onSuccess();
    },
    onError: (err: Error) => {
      setSubmitError(err.message ?? "Could not submit rating.");
    },
  });

  const display = hovered || selectedStars;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-title"
      >
        <h2 id="rating-title" className={styles.title}>
          Rate {targetUsername}
        </h2>

        {/* ── Star picker ──────────────────────────────────── */}
        <div
          className={styles.starPicker}
          role="radiogroup"
          aria-label="Star rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.star} ${n <= display ? styles.active : ""}`}
              aria-label={`${n} star${n !== 1 ? "s" : ""}`}
              aria-pressed={selectedStars === n}
              onClick={() => setSelectedStars(n)}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
            >
              ★
            </button>
          ))}
        </div>

        {selectedStars > 0 && (
          <p className={styles.starLabel}>
            {["", "Poor", "Fair", "Good", "Great", "Excellent"][selectedStars]}
          </p>
        )}

        {/* ── Comment ──────────────────────────────────────── */}
        <label className={styles.label}>
          Comment <span className={styles.optional}>(optional)</span>
          <textarea
            className={styles.textarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={`How was your swap with ${targetUsername}?`}
          />
        </label>

        {submitError && <p className={styles.error}>{submitError}</p>}

        {/* ── Actions ──────────────────────────────────────── */}
        <div className={styles.actions}>
          <button
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            className={styles.btnSubmit}
            disabled={selectedStars === 0 || isPending}
            onClick={() => {
              setSubmitError(null);
              mutate();
            }}
          >
            {isPending ? "Submitting…" : "Submit Rating"}
          </button>
        </div>
      </div>
    </div>
  );
}
