import type { StagedCard } from "@/types";
import { ScanCardItem } from "./ScanCardItem";
import styles from "./ScanStagingList.module.scss";

interface Props {
  cards: StagedCard[];
  onRemove: (stageId: string) => void;
  onEditName: (stageId: string, newName: string) => void;
  /** Called when the user clicks "Add X cards to my collection". */
  onSubmit: (cards: StagedCard[]) => void;
  isSubmitting: boolean;
}

/**
 * ScanStagingList
 *
 * Shows all scanned-but-not-yet-saved cards. The user can:
 *   - Edit a mis-read card name inline
 *   - Remove a card that was wrongly identified
 *   - Add all remaining cards to their collection in one click
 *
 * Why a staging list instead of adding cards immediately on scan?
 * OCR accuracy is ~85-95% for MTG card fonts in good lighting. The staging
 * list is the safety net: the user reviews the batch before committing.
 * One wrong Scryfall match silently added to the collection would be worse
 * than the minor friction of a confirm step.
 *
 * The submit button routes through the existing add_from_scryfall endpoint
 * (one card at a time via useMutation in the parent ScanPage), so no new
 * backend endpoint is needed.
 */
export function ScanStagingList({
  cards,
  onRemove,
  onEditName,
  onSubmit,
  isSubmitting,
}: Props) {
  if (cards.length === 0) return null;

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h3 className={styles.title}>Staged cards ({cards.length})</h3>
        <p className={styles.hint}>
          Review names before adding — edit inline if OCR made a mistake.
        </p>
      </header>

      <ul className={styles.list}>
        {cards.map((card) => (
          <li key={card.stageId}>
            <ScanCardItem
              card={card}
              onRemove={onRemove}
              onEditName={onEditName}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={styles.submitBtn}
        onClick={() => onSubmit(cards)}
        disabled={isSubmitting || cards.length === 0}
      >
        {isSubmitting
          ? "Adding…"
          : `Add ${cards.length} card${cards.length === 1 ? "" : "s"} to my collection`}
      </button>
    </section>
  );
}
