import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import { scanCard, addFromScryfall } from "@/api/cards";
import { CameraCapture, ScanStagingList } from "@/components";
import type { StagedCard } from "@/types";
import styles from "./ScanPage.module.scss";

/**
 * ScanPage — /scan
 *
 * The card-scanning workflow has three phases:
 *
 * Phase 1 — Capture
 *   User takes a photo (or uploads one). CameraCapture returns a File.
 *
 * Phase 2 — OCR + Scryfall lookup
 *   The File goes to POST /api/cards/scan/. The backend crops the top 20%,
 *   runs Tesseract, then does a fuzzy Scryfall lookup. We get back card
 *   metadata (not a saved Card row).
 *
 *   Each result gets a client-side `stageId` (crypto.randomUUID) so React
 *   can track edits and removals without needing a real DB id yet.
 *
 * Phase 3 — Review + commit
 *   ScanStagingList shows all staged cards. User can edit mis-read names or
 *   remove wrong results. "Add to collection" calls addFromScryfall for each
 *   remaining card sequentially, then invalidates the "cards" query so
 *   CollectionPage refreshes.
 *
 * Why sequential adds instead of a bulk endpoint?
 *   addFromScryfall already exists and handles Scryfall metadata fetching.
 *   A dedicated scan-bulk endpoint would duplicate that logic. Sequential
 *   calls are fine for a typical scan session (5-20 cards).
 */
export function ScanPage() {
  const queryClient = useQueryClient();
  const [stagedCards, setStagedCards] = useState<StagedCard[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addResults, setAddResults] = useState<{
    added: number;
    failed: number;
  } | null>(null);
  const { t } = useTranslation();
  usePageTitle(t('scan.title'));

  // ── Scan mutation (OCR + Scryfall) ──────────────────────────────────────
  const scanMutation = useMutation({
    mutationFn: scanCard,
    onSuccess: (result) => {
      setScanError(null);
      setStagedCards((prev) => [
        ...prev,
        { ...result, stageId: crypto.randomUUID() },
      ]);
    },
    onError: (err: Error) => {
      setScanError(err.message || t("scan.errorFallback"));
    },
  });

  // ── Staging list handlers ────────────────────────────────────────────────
  const handleRemove = useCallback((stageId: string) => {
    setStagedCards((prev) => prev.filter((c) => c.stageId !== stageId));
  }, []);

  const handleEditName = useCallback((stageId: string, newName: string) => {
    setStagedCards((prev) =>
      prev.map((c) =>
        c.stageId === stageId ? { ...c, card_name: newName } : c,
      ),
    );
  }, []);

  // ── Commit: add all staged cards to collection ───────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (cards: StagedCard[]) => {
      setIsSubmitting(true);
      let added = 0;
      let failed = 0;

      for (const card of cards) {
        try {
          await addFromScryfall({
            card_name: card.card_name,
            set_code: card.set_code,
            condition: "unused",
            is_foil: false,
            language: "EN",
            quantity: 1,
          });
          added++;
        } catch {
          failed++;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["cards"] });
      setStagedCards([]);
      setAddResults({ added, failed });
      setIsSubmitting(false);
    },
    [queryClient],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("scan.title")}</h1>
        <p className={styles.subtitle}>{t("scan.subtitle")}</p>
      </header>

      {/* ── Capture area ── */}
      <section className={styles.captureSection}>
        <CameraCapture
          onCapture={(file) => scanMutation.mutate(file)}
          disabled={scanMutation.isPending}
        />

        {scanMutation.isPending && (
          <p className={styles.scanning}>{t("scan.scanning")}</p>
        )}

        {scanError && (
          <p className={styles.error} role="alert">
            {scanError}
          </p>
        )}
      </section>

      {/* ── Add-results banner ── */}
      {addResults && (
        <div className={styles.resultBanner} role="status">
          {addResults.added > 0 && (
            <span className={styles.addedCount}>
              {t("scan.results.added", { count: addResults.added })}
            </span>
          )}
          {addResults.failed > 0 && (
            <span className={styles.failedCount}>
              {t("scan.results.failed", { count: addResults.failed })}
            </span>
          )}
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={() => setAddResults(null)}
            aria-label={t("scan.results.dismiss")}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Staging list ── */}
      <ScanStagingList
        cards={stagedCards}
        onRemove={handleRemove}
        onEditName={handleEditName}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
