import { useState } from 'react';
import { useCards, useDeleteCard } from '@/hooks';
import { AddCardModal, BulkImportModal, EditCardModal } from '@/components';
import type { Card } from '@/types';

const CONDITION_LABEL: Record<string, string> = {
  unused: 'NM',
  played: 'Played',
  damaged: 'Damaged',
};

const CONDITION_COLOUR: Record<string, string> = {
  unused: 'bg-green-900 text-green-300',
  played: 'bg-yellow-900 text-yellow-300',
  damaged: 'bg-red-900 text-red-300',
};

export function CollectionPage() {
  const { data: cards, isLoading, isError, error, refetch } = useCards();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">My Collection</h1>
            {cards && cards.length > 0 && (
              <p className="text-sm text-gray-400">
                {cards.length} card{cards.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Add card
            </button>
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Bulk import
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Loading — pulse skeleton rows */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">
              {error instanceof Error ? error.message : 'Failed to load collection.'}
            </p>
            <button
              onClick={() => void refetch()}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && cards?.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🃏</p>
            <h2 className="text-lg font-semibold text-white mb-2">No cards yet</h2>
            <p className="text-gray-400 text-sm mb-6">
              Add your first card to start building your collection.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Add your first card
            </button>
          </div>
        )}

        {/* Populated — scrollable table */}
        {!isLoading && !isError && cards && cards.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">Card</th>
                  <th className="px-4 py-3 font-medium">Set</th>
                  <th className="px-4 py-3 font-medium">Condition</th>
                  <th className="px-4 py-3 font-medium text-center">Qty</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-4 py-3 font-medium text-center">Available</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add card modal — conditionally mounted so state resets on close */}
      {isAddModalOpen && (
        <AddCardModal onClose={() => setIsAddModalOpen(false)} />
      )}
      {isBulkModalOpen && (
        <BulkImportModal onClose={() => setIsBulkModalOpen(false)} />
      )}
    </div>
  );
}

// ── Private sub-component ────────────────────────────────────────────────────

function CardRow({ card }: { card: Card }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  // Inline delete confirmation — clicking Delete shows "Sure? / Cancel" in-row
  // instead of launching a modal. Keeps the interaction lightweight for a
  // destructive action that's easy to undo at the DB level but jarring in the UI.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteCard = useDeleteCard();

  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
        <td className="px-4 py-3">
          <span className="font-medium text-white">{card.card_name}</span>
          {card.is_foil && (
            <span className="ml-2 text-xs text-yellow-400" title="Foil">
              ✦
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-400">
          {card.set_name ?? card.set_code}
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONDITION_COLOUR[card.condition]}`}
          >
            {CONDITION_LABEL[card.condition]}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-gray-300">{card.quantity}</td>
        <td className="px-4 py-3 text-gray-400">{card.language}</td>
        <td className="px-4 py-3 text-center">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              card.is_available ? 'bg-green-400' : 'bg-gray-600'
            }`}
            title={card.is_available ? 'Available for swap' : 'Not available'}
          />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex gap-2 justify-end">
            {isConfirmingDelete ? (
              // Inline confirmation — replaces Edit/Delete while pending
              <>
                <button
                  onClick={() => deleteCard.mutate(card.id)}
                  disabled={deleteCard.isPending}
                  className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                >
                  {deleteCard.isPending ? 'Deleting…' : 'Sure?'}
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={deleteCard.isPending}
                  className="text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditOpen(true)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {isEditOpen && (
        <EditCardModal card={card} onClose={() => setIsEditOpen(false)} />
      )}
    </>
  );
}

