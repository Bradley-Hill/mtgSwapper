import { useEffect, useRef, useState } from 'react';
import { autocomplete } from '@/api/cards';
import { ApiError } from '@/api/client';
import { useDebounce } from '@/hooks';
import { useAddCard } from '@/hooks';
import type { AddCardModalProps, CardCondition } from '@/types';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-gray-900 rounded-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add card</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {apiError && (
            <p role="alert" className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
              {apiError}
            </p>
          )}

          {/* Card name search with autocomplete dropdown */}
          <div className="space-y-1 relative">
            <label htmlFor="card-name-search" className="block text-sm text-gray-400">
              Card name
            </label>
            <input
              ref={inputRef}
              id="card-name-search"
              type="text"
              autoComplete="off"
              required
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCardName(e.target.value);
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="e.g. Black Lotus"
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {/* "Searching…" indicator appears inside the input row */}
            {isLoadingSuggestions && (
              <span className="absolute right-3 top-[2.1rem] text-xs text-gray-500">
                Searching…
              </span>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Card name suggestions"
                className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl"
              >
                {suggestions.map((name) => (
                  <li
                    key={name}
                    role="option"
                    aria-selected={cardName === name}
                    onMouseDown={() => selectSuggestion(name)}
                    className="px-3 py-2 text-sm text-white hover:bg-indigo-600 cursor-pointer"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Optional set code */}
          <div className="space-y-1">
            <label htmlFor="set-code" className="block text-sm text-gray-400">
              Set code{' '}
              <span className="text-gray-600">(optional — e.g. LEA)</span>
            </label>
            <input
              id="set-code"
              type="text"
              autoComplete="off"
              value={setCode}
              onChange={(e) => setSetCode(e.target.value.toUpperCase())}
              placeholder="LEA"
              maxLength={6}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
            />
          </div>

          {/* Condition + Quantity side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="condition" className="block text-sm text-gray-400">
                Condition
              </label>
              <select
                id="condition"
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
              <label htmlFor="quantity" className="block text-sm text-gray-400">
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Language */}
          <div className="space-y-1">
            <label htmlFor="language" className="block text-sm text-gray-400">
              Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          {/* Foil checkbox */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isFoil}
              onChange={(e) => setIsFoil(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-gray-300">Foil</span>
          </label>

          <button
            type="submit"
            disabled={isPending || !cardName.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {isPending ? 'Adding…' : 'Add to collection'}
          </button>
        </form>
      </div>
    </div>
  );
}
