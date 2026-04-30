import { useEffect, useState } from "react";
import { useUpdateCard } from "@/hooks";
import type { CardCondition, EditCardModalProps } from "@/types";
import styles from "./EditCardModal.module.scss";

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
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.cardTitle}>{card.card_name}</h2>
            {card.set_name && <p className={styles.cardSet}>{card.set_name}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={styles.closeBtn}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-condition" className={styles.label}>
                Condition
              </label>
              <select
                id="edit-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as CardCondition)}
                className={styles.select}
              >
                <option value="unused">Unused / NM</option>
                <option value="played">Played</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="edit-qty" className={styles.label}>
                Quantity
              </label>
              <input
                id="edit-qty"
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-language" className={styles.label}>
              Language
            </label>
            <select
              id="edit-language"
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

          <div className={styles.checkboxRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isFoil}
                onChange={(e) => setIsFoil(e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>Foil</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>Available for swap</span>
            </label>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-notes" className={styles.label}>
              Notes <span className={styles.labelHint}>(optional)</span>
            </label>
            <textarea
              id="edit-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. signed, water damage on corner…"
              className={styles.textarea}
            />
          </div>

          {updateCard.isError && (
            <p role="alert" className={styles.errorAlert}>
              {updateCard.error instanceof Error
                ? updateCard.error.message
                : "Failed to save changes."}
            </p>
          )}

          <button
            type="submit"
            disabled={updateCard.isPending}
            className={styles.submitBtn}
          >
            {updateCard.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
