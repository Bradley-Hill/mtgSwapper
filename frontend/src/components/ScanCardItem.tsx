import { useTranslation } from "react-i18next";
import type { ScanCardItemProps } from "@/types";
import styles from "./ScanCardItem.module.scss";

/**
 * ScanCardItem
 *
 * A single row in the staging list. Shows the card name (editable inline),
 * set info, mana cost, and a remove button.
 *
 * Why inline editing instead of a modal?
 * OCR mis-reads are usually minor (one wrong letter). An inline text field
 * on the name is the least-friction correction path — the user just clicks
 * the name, fixes the typo, and moves on. A modal for such a small edit
 * would be overkill.
 *
 * The `raw_ocr_text` is shown as a hint so the user can compare what OCR
 * read vs. what Scryfall matched — useful for spotting when the fuzzy search
 * picked the wrong card entirely.
 */
export function ScanCardItem({
  card,
  onRemove,
  onEditName,
}: ScanCardItemProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <div className={styles.main}>
        <input
          className={styles.nameInput}
          value={card.card_name}
          onChange={(e) => onEditName(card.stageId, e.target.value)}
          aria-label="Card name"
        />
        <span className={styles.meta}>
          {card.set_name && <span>{card.set_name}</span>}
          {card.mana_cost && (
            <span className={styles.mana}>{card.mana_cost}</span>
          )}
          {card.card_type && (
            <span className={styles.type}>{card.card_type}</span>
          )}
        </span>
        {card.raw_ocr_text && card.raw_ocr_text !== card.card_name && (
          <span className={styles.ocrHint}>
            {t("scan.staging.ocrHint", { text: card.raw_ocr_text })}
          </span>
        )}
      </div>

      <button
        type="button"
        className={styles.removeBtn}
        onClick={() => onRemove(card.stageId)}
        aria-label={t("scan.staging.removeCard", { name: card.card_name })}
      >
        ✕
      </button>
    </div>
  );
}
