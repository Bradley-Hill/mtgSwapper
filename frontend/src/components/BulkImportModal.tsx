import { useEffect, useState } from "react";
import { useBulkImport } from "@/hooks";
import { ApiError } from "@/api/client";
import type {
  BulkImportModalProps,
  BulkImportResultRow,
  CardCondition,
} from "@/types";
import styles from "./BulkImportModal.module.scss";

type ModalState =
  | { stage: "form" }
  | { stage: "loading" }
  | {
      stage: "results";
      imported: number;
      failed: number;
      rows: BulkImportResultRow[];
    };

export function BulkImportModal({ onClose }: BulkImportModalProps) {
  const [modalState, setModalState] = useState<ModalState>({ stage: "form" });

  // Form field state
  const [decklist, setDecklist] = useState("");
  const [condition, setCondition] = useState<CardCondition>("played");
  const [language, setLanguage] = useState("English");
  const [isFoil, setIsFoil] = useState(false);

  const { mutate: runImport } = useBulkImport();

  // Close on Escape (only when not loading — prevent accidental dismissal mid-import)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && modalState.stage !== "loading") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, modalState.stage]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decklist.trim()) return;

    setModalState({ stage: "loading" });

    runImport(
      { decklist, condition, language, is_foil: isFoil },
      {
        onSuccess: (data) => {
          setModalState({
            stage: "results",
            imported: data.imported,
            failed: data.failed,
            rows: data.results,
          });
        },
        onError: (err) => {
          // Server-level error (not partial row failures — those come back as 200 with results)
          // Return to form with the error message pre-filled.
          setModalState({ stage: "form" });
          if (err instanceof ApiError) {
            // Re-use the decklist the user typed — don't lose their work
            alert(`Import failed: ${err.message}`);
          } else {
            alert("Import failed. Please try again.");
          }
        },
      },
    );
  }

  const canDismiss = modalState.stage !== "loading";

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && canDismiss) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Bulk import</h2>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={styles.closeBtn}
            >
              ×
            </button>
          )}
        </div>

        {/* ── Stage: form ─────────────────────────────────────────────── */}
        {modalState.stage === "form" && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="decklist" className={styles.label}>
                Decklist{" "}
                <span className={styles.labelHint}>
                  (Moxfield / MTG Arena format)
                </span>
              </label>
              <textarea
                id="decklist"
                required
                rows={10}
                value={decklist}
                onChange={(e) => setDecklist(e.target.value)}
                placeholder={`4 Black Lotus\n3 Lightning Bolt\n1 Sol Ring (NEO)`}
                className={styles.textarea}
              />
              <p className={styles.hint}>
                One card per line: <code>4 Card Name</code> or{" "}
                <code>4 Card Name (SET)</code>. Unknown cards are skipped and
                reported after import.
              </p>
            </div>

            <p className={styles.batchNote}>
              These settings apply to all cards in this import.
            </p>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label htmlFor="bulk-condition" className={styles.label}>
                  Condition
                </label>
                <select
                  id="bulk-condition"
                  value={condition}
                  onChange={(e) =>
                    setCondition(e.target.value as CardCondition)
                  }
                  className={styles.select}
                >
                  <option value="unused">Unused / NM</option>
                  <option value="played">Played</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="bulk-language" className={styles.label}>
                  Language
                </label>
                <select
                  id="bulk-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={styles.select}
                >
                  <option>English</option>
                  <option>French</option>
                  <option>German</option>
                  <option>Spanish</option>
                  <option>Italian</option>
                  <option>Portuguese</option>
                  <option>Japanese</option>
                  <option>Korean</option>
                  <option>Russian</option>
                  <option>Chinese Simplified</option>
                  <option>Chinese Traditional</option>
                </select>
              </div>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isFoil}
                onChange={(e) => setIsFoil(e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>All cards are foil</span>
            </label>

            <button
              type="submit"
              disabled={!decklist.trim()}
              className={styles.submitBtn}
            >
              Import
            </button>
          </form>
        )}

        {/* ── Stage: loading ───────────────────────────────────────────── */}
        {modalState.stage === "loading" && (
          <div className={styles.loadingStage}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Importing cards…</p>
            <p className={styles.loadingSubtext}>
              This can take a moment — the backend looks up each card on
              Scryfall.
            </p>
          </div>
        )}

        {/* ── Stage: results ───────────────────────────────────────────── */}
        {modalState.stage === "results" && (
          <div className={styles.resultsStage}>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCardImported}>
                <p className={styles.summaryCount}>{modalState.imported}</p>
                <p className={styles.summaryLabel}>Imported</p>
              </div>
              <div
                className={
                  modalState.failed > 0
                    ? styles.summaryCardFailed
                    : styles.summaryCardOk
                }
              >
                <p className={styles.summaryCount}>{modalState.failed}</p>
                <p className={styles.summaryLabel}>Failed</p>
              </div>
            </div>

            <div className={styles.resultsList}>
              {modalState.rows.map((row, i) => (
                <ResultRow key={i} row={row} />
              ))}
            </div>

            <button type="button" onClick={onClose} className={styles.doneBtn}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Private sub-component ────────────────────────────────────────────────────

function ResultRow({ row }: { row: BulkImportResultRow }) {
  const isOk = row.status === "ok";
  return (
    <div className={isOk ? styles.resultRowOk : styles.resultRowError}>
      <span className={styles.resultIcon}>{isOk ? "✓" : "✗"}</span>
      <div className={styles.resultBody}>
        <span className={styles.resultName}>{row.card_name}</span>
        <span className={styles.resultQty}>×{row.quantity}</span>
        {!isOk && row.reason && (
          <span className={styles.resultReason}>{row.reason}</span>
        )}
      </div>
    </div>
  );
}
