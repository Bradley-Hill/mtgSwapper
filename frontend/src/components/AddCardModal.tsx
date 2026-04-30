import { useEffect, useRef, useState } from 'react';
import { autocomplete } from '@/api/cards';
import { ApiError } from '@/api/client';
import { useDebounce } from '@/hooks';
import { useAddCard } from '@/hooks';
import type { AddCardModalProps, CardCondition } from '@/types';
import styles from './AddCardModal.module.scss';

const LANGUAGES = [
  'English',
  'French',
  'German',
  'Spanish',
  'Italian',
  'Portuguese',
  'Japanese',
  'Korean',
  'Russian',
  'Chinese Simplified',
  'Chinese Traditional',
];

export function AddCardModal({ onClose }: AddCardModalProps) {
  // --- Search / autocomplete state ---
  // `query` drives what's displayed in the input AND what gets sent to autocomplete.
  // `cardName` is the confirmed selection — separate so we don't re-trigger
  // autocomplete when the user has already picked from the dropdown.
  const [query, setQuery] = useState('');
  const [cardName, setCardName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const [setCode, setSetCode] = useState('');
  const [condition, setCondition] = useState<CardCondition>('played');
  const [language, setLanguage] = useState('English');
  const [quantity, setQuantity] = useState(1);
  const [isFoil, setIsFoil] = useState(false);

  const [apiError, setApiError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const { mutate: addCard, isPending } = useAddCard();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsLoadingSuggestions(true);
    autocomplete(debouncedQuery)
      .then((results) => {
        setSuggestions(results.slice(0, 8)); 
        setShowSuggestions(true);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setIsLoadingSuggestions(false));
  }, [debouncedQuery]);

  function selectSuggestion(name: string) {
    setCardName(name);
    setQuery(name);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cardName.trim()) return;
    setApiError(null);

    addCard(
      {
        card_name: cardName.trim(),
        set_code: setCode.trim() || undefined,
        condition,
        is_foil: isFoil,
        language,
        quantity,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          if (err instanceof ApiError) setApiError(err.message);
          else setApiError('Failed to add card. Please try again.');
        },
      },
    );
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add card</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.closeBtn}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {apiError && (
            <p role="alert" className={styles.errorAlert}>{apiError}</p>
          )}

          {/* Card name search with autocomplete dropdown */}
          <div className={styles.field}>
            <label htmlFor="card-name-search" className={styles.label}>Card name</label>
            <input
              ref={inputRef}
              id="card-name-search"
              type="text"
              autoComplete="off"
              required
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCardName(e.target.value); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder="e.g. Black Lotus"
              className={styles.input}
            />
            {isLoadingSuggestions && (
              <span className={styles.searchingHint}>Searching…</span>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul role="listbox" aria-label="Card name suggestions" className={styles.suggestions}>
                {suggestions.map((name) => (
                  <li
                    key={name}
                    role="option"
                    aria-selected={cardName === name}
                    onMouseDown={() => selectSuggestion(name)}
                    className={styles.suggestion}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Optional set code */}
          <div className={styles.field}>
            <label htmlFor="set-code" className={styles.label}>
              Set code <span className={styles.labelHint}>(optional — e.g. LEA)</span>
            </label>
            <input
              id="set-code"
              type="text"
              autoComplete="off"
              value={setCode}
              onChange={(e) => setSetCode(e.target.value.toUpperCase())}
              placeholder="LEA"
              maxLength={6}
              className={`${styles.input} ${styles.uppercase}`}
            />
          </div>

          {/* Condition + Quantity */}
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="condition" className={styles.label}>Condition</label>
              <select
                id="condition"
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
              <label htmlFor="quantity" className={styles.label}>Quantity</label>
              <input
                id="quantity"
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={styles.input}
              />
            </div>
          </div>

          {/* Language */}
          <div className={styles.field}>
            <label htmlFor="language" className={styles.label}>Language</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={styles.select}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Foil checkbox */}
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isFoil}
              onChange={(e) => setIsFoil(e.target.checked)}
              className={styles.checkbox}
            />
            <span className={styles.checkboxText}>Foil</span>
          </label>

          <button
            type="submit"
            disabled={isPending || !cardName.trim()}
            className={styles.submitBtn}
          >
            {isPending ? 'Adding…' : 'Add to collection'}
          </button>
        </form>
      </div>
    </div>
  );
}
