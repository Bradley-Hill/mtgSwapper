import { useTranslation } from "react-i18next";
import type { ScanStagingListProps } from "@/types";
import { ScanCardItem } from "./ScanCardItem";
import styles from "./ScanStagingList.module.scss";

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
}: ScanStagingListProps) {
  const { t } = useTranslation();
  if (cards.length === 0) return null;

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h3 className={styles.title}>
          {t("scan.staging.title", { count: cards.length })}
        </h3>
        <p className={styles.hint}>{t("scan.staging.hint")}</p>
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
          ? t("scan.staging.adding")
          : t("scan.staging.addButton", { count: cards.length })}
      </button>
    </section>
  );
}
