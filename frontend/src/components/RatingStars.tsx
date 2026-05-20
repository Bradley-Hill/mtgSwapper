import type { RatingStarsProps } from "@/types";
import styles from "./RatingStars.module.scss";

/*
 * Why a pure display component instead of inline SVG everywhere?
 * Stars appear in three places: profile header, ratings list, and the submit
 * modal. Centralising the rendering means we update colours/sizing in one
 * file. It also lets UserProfilePage and OfferDetailPage import a clear,
 * named abstraction rather than duplicating the fill-logic.
 *
 * Why not a third-party library (react-stars, etc.)?
 * The design tokens define our colour palette. A library would ship its own
 * colours, requiring overrides. Five Unicode characters + a CSS class is
 * simpler, smaller, and fully under our control.
 */
export function RatingStars({
  stars,
  size = "md",
  showValue = false,
}: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, stars));

  return (
    <span
      className={`${styles.stars} ${styles[size]}`}
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= Math.round(clamped) ? styles.filled : styles.empty}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
      {showValue && <span className={styles.value}>{clamped.toFixed(1)}</span>}
    </span>
  );
}
