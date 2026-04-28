import { useEffect, useState } from "react";
import { useUpdateCard } from "@/hooks";
import type { CardCondition, EditCardModalProps } from "@/types";

export function EditCardModal({ card, onClose }: EditCardModalProps) {
  // Pre-fill all form fields from the existing card data.
  // Using individual useState calls (not one big object) makes each field's
  // onChange handler trivially simple and avoids object-spread on every change.
  const [condition, setCondition] = useState<CardCondition>(card.condition);
  const [language, setLanguage] = useState(card.language);
  const [quantity, setQuantity] = useState(String(card.quantity));
  const [isFoil, setIsFoil] = useState(card.is_foil);
  const [isAvailable, setIsAvailable] = useState(card.is_available);
  const [notes, setNotes] = useState(card.notes ?? "");

  const updateCard = useUpdateCard();

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) return;

    updateCard.mutate(
      {
        id: card.id,
        payload: {
          condition,
          language,
          quantity: qty,
          is_foil: isFoil,
          is_available: isAvailable,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 space-y-5">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {card.card_name}
            </h2>
            {card.set_name && (
              <p className="text-sm text-gray-500">{card.set_name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Form ───────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="edit-condition"
                className="block text-sm text-gray-400"
              >
                Condition
              </label>
              <select
                id="edit-condition"
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
              <label htmlFor="edit-qty" className="block text-sm text-gray-400">
                Quantity
              </label>
              <input
                id="edit-qty"
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="edit-language"
              className="block text-sm text-gray-400"
            >
              Language
            </label>
            <select
              id="edit-language"
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

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFoil}
                onChange={(e) => setIsFoil(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Foil</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Available for swap</span>
            </label>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-notes" className="block text-sm text-gray-400">
              Notes <span className="text-gray-600">(optional)</span>
            </label>
            <textarea
              id="edit-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. signed, water damage on corner…"
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {updateCard.isError && (
            <p role="alert" className="text-red-400 text-sm">
              {updateCard.error instanceof Error
                ? updateCard.error.message
                : "Failed to save changes."}
            </p>
          )}

          <button
            type="submit"
            disabled={updateCard.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {updateCard.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
