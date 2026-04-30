import { useState } from 'react';
import { useCards, useDeleteCard } from '@/hooks';
import { AddCardModal, BulkImportModal, EditCardModal } from '@/components';
import type { Card } from '@/types';
import styles from './CollectionPage.module.scss';

const CONDITION_LABEL: Record<string, string> = {
  unused: 'NM',
  played: 'Played',
  damaged: 'Damaged',
};

export function CollectionPage() {
  const { data: cards, isLoading, isError, error, refetch } = useCards();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.headerTitle}>My Collection</h1>
            {cards && cards.length > 0 && (
              <p className={styles.headerSubtitle}>
                {cards.length} card{cards.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => setIsAddModalOpen(true)} className={styles.btnPrimary}>
              + Add card
            </button>
            <button onClick={() => setIsBulkModalOpen(true)} className={styles.btnSecondary}>
              Bulk import
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Loading — pulse skeleton rows */}
        {isLoading && (
          <div className={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className={styles.errorState}>
            <p className={styles.errorText}>
              {error instanceof Error ? error.message : 'Failed to load collection.'}
            </p>
            <button onClick={() => void refetch()} className={styles.retryBtn}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && cards?.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}>🃏</p>
            <h2 className={styles.emptyTitle}>No cards yet</h2>
            <p className={styles.emptySubtitle}>
              Add your first card to start building your collection.
            </p>
            <button onClick={() => setIsAddModalOpen(true)} className={styles.btnPrimary}>
              Add your first card
            </button>
          </div>
        )}

        {/* Populated — scrollable table */}
        {!isLoading && !isError && cards && cards.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th>Card</th>
                  <th>Set</th>
                  <th>Condition</th>
                  <th className={styles.colCenter}>Qty</th>
                  <th>Language</th>
                  <th className={styles.colCenter}>Available</th>
                  <th />
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteCard = useDeleteCard();

  return (
    <>
      <tr className={styles.tableRow}>
        <td className={styles.cell}>
          <span className={styles.cardName}>{card.card_name}</span>
          {card.is_foil && (
            <span className={styles.foilBadge} title="Foil">✦</span>
          )}
        </td>
        <td className={styles.cell}>{card.set_name ?? card.set_code}</td>
        <td className={styles.cell}>
          {/* Two classes: base badge style + condition-specific colour */}
          <span className={`${styles.badge} ${styles[card.condition]}`}>
            {CONDITION_LABEL[card.condition]}
          </span>
        </td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>{card.quantity}</td>
        <td className={styles.cell}>{card.language}</td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>
          <span
            className={`${styles.availDot} ${card.is_available ? styles.available : ''}`}
            title={card.is_available ? 'Available for swap' : 'Not available'}
          />
        </td>
        <td className={styles.cell}>
          <div className={styles.actions}>
            {isConfirmingDelete ? (
              <>
                <button
                  onClick={() => deleteCard.mutate(card.id)}
                  disabled={deleteCard.isPending}
                  className={styles.actionConfirm}
                >
                  {deleteCard.isPending ? 'Deleting…' : 'Sure?'}
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={deleteCard.isPending}
                  className={styles.actionCancel}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setIsEditOpen(true)} className={styles.actionEdit}>
                  Edit
                </button>
                <button onClick={() => setIsConfirmingDelete(true)} className={styles.actionDelete}>
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

