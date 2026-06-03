import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./BulkEditLanguageModal.module.scss";

const LANGUAGES = [
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Portuguese",
  "Japanese",
  "Korean",
  "Russian",
  "Chinese Simplified",
  "Chinese Traditional",
];

import type { BulkEditLanguageModalProps } from "@/types";

export function BulkEditLanguageModal({
  selectedCount,
  onConfirm,
  onClose,
  isPending,
}: BulkEditLanguageModalProps) {
  const [language, setLanguage] = useState("English");
  const { t } = useTranslation();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {t("collection.bulk.setLanguageTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className={styles.closeBtn}
          >
            ×
          </button>
        </div>

        <p className={styles.subtitle}>
          {t("collection.bulk.setLanguageSubtitle", { count: selectedCount })}
        </p>

        <div className={styles.field}>
          <label htmlFor="bulk-language" className={styles.label}>
            {t("collection.columns.language")}
          </label>
          <select
            id="bulk-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={styles.select}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className={styles.cancelBtn}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(language)}
            disabled={isPending}
            className={styles.confirmBtn}
          >
            {isPending
              ? t("collection.bulk.applying")
              : t("collection.bulk.applyLanguage")}
          </button>
        </div>
      </div>
    </div>
  );
}
