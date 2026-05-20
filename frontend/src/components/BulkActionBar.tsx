import { useTranslation } from "react-i18next";
import type { BulkActionBarProps } from "@/types";
import styles from "./BulkActionBar.module.scss";

export function BulkActionBar({
  selectedCount,
  totalCount,
  onDelete,
  onMarkAvailable,
  onMarkUnavailable,
  onEditLanguage,
  onClear,
  isPending,
}: BulkActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        {t("collection.bulk.selected", {
          count: selectedCount,
          total: totalCount,
        })}
      </span>
      <div className={styles.actions}>
        <button
          onClick={onMarkAvailable}
          disabled={isPending}
          className={styles.btn}
        >
          {t("collection.bulk.markAvailable")}
        </button>
        <button
          onClick={onMarkUnavailable}
          disabled={isPending}
          className={styles.btn}
        >
          {t("collection.bulk.markUnavailable")}
        </button>
        <button
          onClick={onEditLanguage}
          disabled={isPending}
          className={styles.btn}
        >
          {t("collection.bulk.setLanguage")}
        </button>
        <button
          onClick={onDelete}
          disabled={isPending}
          className={`${styles.btn} ${styles.btnDestructive}`}
        >
          {isPending
            ? t("collection.bulk.deleting")
            : t("collection.bulk.delete")}
        </button>
        <button
          onClick={onClear}
          disabled={isPending}
          className={styles.btnClear}
        >
          {t("collection.bulk.clear")}
        </button>
      </div>
    </div>
  );
}
