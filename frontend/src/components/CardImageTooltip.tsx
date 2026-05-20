import { useState, useRef, useCallback } from "react";
import type { CardImageTooltipProps } from "@/types";
import styles from "./CardImageTooltip.module.scss";

/**
 * Wraps any element and shows a floating card image on hover.
 *
 * How the URL is constructed:
 *   https://cards.scryfall.io/normal/front/{id[0]}/{id[1]}/{full_id}.jpg
 * Scryfall partitions their CDN by the first two hex characters of the UUID
 * to distribute load across directories. We just slice the stored scryfall_id —
 * no API call required at render time.
 *
 * Why position: fixed instead of absolute?
 * Card names sit inside overflow-x: auto table wrappers. An absolutely
 * positioned child would be clipped by that overflow. Fixed positioning
 * escapes all overflow containers and positions relative to the viewport,
 * so the image always appears fully visible.
 *
 * Why the 150 ms delay?
 * Prevents a burst of image requests when the user's cursor sweeps across
 * many rows. The image only fetches if you actually pause over a row.
 */
export function CardImageTooltip({
  scryfallId,
  children,
}: CardImageTooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build the URL only when we have a valid ID — avoids undefined[0] crash
  // if this component is rendered before the backend is redeployed with scryfall_id.
  const imageUrl =
    scryfallId && scryfallId.length >= 2
      ? `https://cards.scryfall.io/normal/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
      : null;

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (!imageUrl) return; // no image to show, skip the timer entirely
      const { clientX, clientY } = e;
      timerRef.current = setTimeout(() => {
        setPos({ x: clientX, y: clientY });
      }, 150);
    },
    [imageUrl],
  );

  // Functional update: only moves the image if it's already visible,
  // keeping this handler dependency-free (stable reference).
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setPos((cur) => (cur === null ? null : { x: e.clientX, y: e.clientY }));
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPos(null);
  }, []);

  // Default: 16px to the right of the cursor.
  // Flip left when within 220px of the right viewport edge so it doesn't overflow.
  const imgLeft = pos
    ? pos.x + 220 > window.innerWidth
      ? pos.x - 216
      : pos.x + 16
    : 0;
  // Vertically centre on the cursor (card is ~280px tall at 200px wide).
  const imgTop = pos ? Math.max(8, pos.y - 140) : 0;

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {pos !== null && imageUrl !== null && (
        <img
          src={imageUrl}
          alt=""
          role="presentation"
          className={styles.preview}
          style={{ left: imgLeft, top: imgTop }}
        />
      )}
    </span>
  );
}
