import { useEffect, useState } from 'react';
import { useBulkImport } from '@/hooks';
import { ApiError } from '@/api/client';
import type { BulkImportModalProps, BulkImportResultRow, CardCondition } from '@/types';

type ModalState =
  | { stage: 'form' }
  | { stage: 'loading' }
  | { stage: 'results'; imported: number; failed: number; rows: BulkImportResultRow[] };

export function BulkImportModal({ onClose }: BulkImportModalProps) {
  const [modalState, setModalState] = useState<ModalState>({ stage: 'form' });

  // Form field state
  const [decklist, setDecklist] = useState('');
  const [condition, setCondition] = useState<CardCondition>('played');
  const [language, setLanguage] = useState('English');
  const [isFoil, setIsFoil] = useState(false);

  const { mutate: runImport } = useBulkImport();

  // Close on Escape (only when not loading — prevent accidental dismissal mid-import)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && modalState.stage !== 'loading') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, modalState.stage]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decklist.trim()) return;

    setModalState({ stage: 'loading' });

    runImport(
      { decklist, condition, language, is_foil: isFoil },
      {
        onSuccess: (data) => {
          setModalState({
            stage: 'results',
            imported: data.imported,
            failed: data.failed,
            rows: data.results,
          });
        },
        onError: (err) => {
          // Server-level error (not partial row failures — those come back as 200 with results)
          // Return to form with the error message pre-filled.
          setModalState({ stage: 'form' });
          if (err instanceof ApiError) {
            // Re-use the decklist the user typed — don't lose their work
            alert(`Import failed: ${err.message}`);
          } else {
            alert('Import failed. Please try again.');
          }
        },
      },
    );
  }

  const canDismiss = modalState.stage !== 'loading';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget && canDismiss) onClose(); }}
    >
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl p-6 space-y-5 max-h-[90vh] flex flex-col">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-white">Bulk import</h2>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* ── Stage: form ──────────────────────────────────────────────── */}
        {modalState.stage === 'form' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto">
            <div className="space-y-1">
              <label htmlFor="decklist" className="block text-sm text-gray-400">
                Decklist{' '}
                <span className="text-gray-600">(Moxfield / MTG Arena format)</span>
              </label>
              <textarea
                id="decklist"
                required
                rows={10}
                value={decklist}
                onChange={(e) => setDecklist(e.target.value)}
                placeholder={`4 Black Lotus\n3 Lightning Bolt\n1 Sol Ring (NEO)`}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />
              <p className="text-xs text-gray-600">
                One card per line: <code className="text-gray-500">4 Card Name</code> or{' '}
                <code className="text-gray-500">4 Card Name (SET)</code>. Unknown cards are
                skipped and reported after import.
              </p>
            </div>

            {/* Condition + Language + Foil — applied to every card in the batch */}
            <p className="text-xs text-gray-500 -mb-1">
              These settings apply to all cards in this import.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="bulk-condition" className="block text-sm text-gray-400">
                  Condition
                </label>
                <select
                  id="bulk-condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as CardCondition)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="unused">Unused / NM</option>
                  <option value="played">Played</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="bulk-language" className="block text-sm text-gray-400">
                  Language
                </label>
                <select
                  id="bulk-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
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

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFoil}
                onChange={(e) => setIsFoil(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">All cards are foil</span>
            </label>

            <button
              type="submit"
              disabled={!decklist.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-medium rounded-lg py-2 text-sm transition-colors shrink-0"
            >
              Import
            </button>
          </form>
        )}

        {/* ── Stage: loading ───────────────────────────────────────────── */}
        {modalState.stage === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            {/* CSS-only spinner — no extra library needed */}
            <div className="w-10 h-10 border-4 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Importing cards…</p>
            <p className="text-gray-600 text-xs">
              This can take a moment — the backend looks up each card on Scryfall.
            </p>
          </div>
        )}

        {/* ── Stage: results ───────────────────────────────────────────── */}
        {modalState.stage === 'results' && (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Summary banner */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="bg-green-950 border border-green-800 rounded-xl px-4 py-3 text-center">
                <p className="text-2xl font-bold text-green-300">{modalState.imported}</p>
                <p className="text-xs text-green-500 mt-0.5">Imported</p>
              </div>
              <div className={`border rounded-xl px-4 py-3 text-center ${
                modalState.failed > 0
                  ? 'bg-red-950 border-red-800'
                  : 'bg-gray-800 border-gray-700'
              }`}>
                <p className={`text-2xl font-bold ${modalState.failed > 0 ? 'text-red-300' : 'text-gray-400'}`}>
                  {modalState.failed}
                </p>
                <p className={`text-xs mt-0.5 ${modalState.failed > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  Failed
                </p>
              </div>
            </div>

            {/* Per-row results — scrollable */}
            <div className="overflow-y-auto flex-1 space-y-1.5 min-h-0">
              {modalState.rows.map((row, i) => (
                <ResultRow key={i} row={row} />
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg py-2 text-sm transition-colors shrink-0"
            >
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
  const isOk = row.status === 'ok';
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${
      isOk ? 'bg-gray-800/60' : 'bg-red-950/40 border border-red-900'
    }`}>
      <span className={`mt-0.5 shrink-0 ${isOk ? 'text-green-400' : 'text-red-400'}`}>
        {isOk ? '✓' : '✗'}
      </span>
      <div className="min-w-0">
        <span className="text-white font-medium">{row.card_name}</span>
        <span className="text-gray-500 ml-2">×{row.quantity}</span>
        {!isOk && row.reason && (
          <p className="text-red-400 text-xs mt-0.5">{row.reason}</p>
        )}
      </div>
    </div>
  );
}
