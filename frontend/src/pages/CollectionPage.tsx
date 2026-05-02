import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCards, useDeleteCard, usePageTitle } from '@/hooks';
import { AddCardModal, BulkImportModal, EditCardModal } from '@/components';
import type { Card } from '@/types';
import styles from './CollectionPage.module.scss';

export function CollectionPage() {
  const { data: cards, isLoading, isError, error, refetch } = useCards();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const { t } = useTranslation();
  usePageTitle(t('collection.title'));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.headerTitle}>{t('collection.title')}</h1>
            {cards && cards.length > 0 && (
              <p className={styles.headerSubtitle}>
                {t('collection.subtitle', { count: cards.length })}
              </p>
            )}
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => setIsAddModalOpen(true)} className={styles.btnPrimary}>
              {t('collection.addCard')}
            </button>
            <button onClick={() => setIsBulkModalOpen(true)} className={styles.btnSecondary}>
              {t('collection.bulkImport')}
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
              {error instanceof Error ? error.message : t('collection.errorLoading')}
            </p>
            <button onClick={() => void refetch()} className={styles.retryBtn}>
              {t('collection.retryLoad')}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && cards?.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}>🃏</p>
            <h2 className={styles.emptyTitle}>{t('collection.emptyTitle')}</h2>
            <p className={styles.emptySubtitle}>{t('collection.emptySubtitle')}</p>
            <button onClick={() => setIsAddModalOpen(true)} className={styles.btnPrimary}>
              {t('collection.addFirstCard')}
            </button>
          </div>
        )}

        {/* Populated — scrollable table */}
        {!isLoading && !isError && cards && cards.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th>{t('collection.columns.name')}</th>
                  <th>{t('collection.columns.set')}</th>
                  <th>{t('collection.columns.condition')}</th>
                  <th className={styles.colCenter}>{t('collection.columns.quantity')}</th>
                  <th>{t('collection.columns.language')}</th>
                  <th className={styles.colCenter}>{t('collection.columns.available')}</th>
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
  const { t } = useTranslation();

  return (
    <>
      <tr className={styles.tableRow}>
        <td className={styles.cell}>
          <span className={styles.cardName}>{card.card_name}</span>
          {card.is_foil && (
            <span className={styles.foilBadge} title={t('collection.foilYes')}>✦</span>
          )}
        </td>
        <td className={styles.cell}>{card.set_name ?? card.set_code}</td>
        <td className={styles.cell}>
          <span className={`${styles.badge} ${styles[card.condition]}`}>
            {t(`collection.condition.${card.condition}`)}
          </span>
        </td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>{card.quantity}</td>
        <td className={styles.cell}>{card.language}</td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>
          <span
            className={`${styles.availDot} ${card.is_available ? styles.available : ''}`}
            title={card.is_available ? t('collection.availableYes') : t('collection.availableNo')}
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
                  {deleteCard.isPending ? t('collection.deleting') : t('collection.confirmDelete')}
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={deleteCard.isPending}
                  className={styles.actionCancel}
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setIsEditOpen(true)} className={styles.actionEdit}>
                  {t('collection.edit')}
                </button>
                <button onClick={() => setIsConfirmingDelete(true)} className={styles.actionDelete}>
                  {t('collection.delete')}
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

