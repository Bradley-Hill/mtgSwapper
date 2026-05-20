import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCards,
  useDeleteCard,
  usePageTitle,
  useBulkDelete,
  useBulkUpdateAvailability,
  useBulkUpdateLanguage,
} from "@/hooks";
import {
  AddCardModal,
  BulkActionBar,
  BulkEditLanguageModal,
  BulkImportModal,
  EditCardModal,
  CardImageTooltip,
} from "@/components";
import type { Card } from "@/types";
import styles from "./CollectionPage.module.scss";

export function CollectionPage() {
  const { data: cards, isLoading, isError, error, refetch } = useCards();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isBulkLanguageModalOpen, setIsBulkLanguageModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { t } = useTranslation();
  usePageTitle(t("collection.title"));

  const bulkDelete = useBulkDelete();
  const bulkAvailability = useBulkUpdateAvailability();
  const bulkLanguage = useBulkUpdateLanguage();
  const isBulkPending =
    bulkDelete.isPending ||
    bulkAvailability.isPending ||
    bulkLanguage.isPending;

  const isAllSelected = !!cards?.length && selectedIds.size === cards.length;
  const isSomeSelected = selectedIds.size > 0 && !isAllSelected;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else if (cards) {
      setSelectedIds(new Set(cards.map((card) => card.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    bulkDelete.mutate([...selectedIds], { onSuccess: clearSelection });
  };

  const handleBulkMarkAvailable = () => {
    bulkAvailability.mutate(
      { ids: [...selectedIds], isAvailable: true },
      { onSuccess: clearSelection },
    );
  };

  const handleBulkMarkUnavailable = () => {
    bulkAvailability.mutate(
      { ids: [...selectedIds], isAvailable: false },
      { onSuccess: clearSelection },
    );
  };

  const handleBulkSetLanguage = (language: string) => {
    bulkLanguage.mutate(
      { ids: [...selectedIds], language },
      {
        onSuccess: () => {
          setIsBulkLanguageModalOpen(false);
          clearSelection();
        },
      },
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.headerTitle}>{t("collection.title")}</h1>
            {cards && cards.length > 0 && (
              <p className={styles.headerSubtitle}>
                {t("collection.subtitle", { count: cards.length })}
              </p>
            )}
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className={styles.btnPrimary}
            >
              {t("collection.addCard")}
            </button>
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className={styles.btnSecondary}
            >
              {t("collection.bulkImport")}
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
              {error instanceof Error
                ? error.message
                : t("collection.errorLoading")}
            </p>
            <button onClick={() => void refetch()} className={styles.retryBtn}>
              {t("collection.retryLoad")}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && cards?.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}>🃏</p>
            <h2 className={styles.emptyTitle}>{t("collection.emptyTitle")}</h2>
            <p className={styles.emptySubtitle}>
              {t("collection.emptySubtitle")}
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className={styles.btnPrimary}
            >
              {t("collection.addFirstCard")}
            </button>
          </div>
        )}

        {/* Populated — scrollable table */}
        {!isLoading && !isError && cards && cards.length > 0 && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className={styles.checkbox}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected;
                      }}
                      aria-label={t("collection.bulk.selectAll")}
                    />
                  </th>
                  <th>{t("collection.columns.name")}</th>
                  <th>{t("collection.columns.set")}</th>
                  <th>{t("collection.columns.condition")}</th>
                  <th className={styles.colCenter}>
                    {t("collection.columns.quantity")}
                  </th>
                  <th>{t("collection.columns.language")}</th>
                  <th className={styles.colCenter}>
                    {t("collection.columns.available")}
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    isSelected={selectedIds.has(card.id)}
                    onToggleSelect={toggleSelect}
                  />
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
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={cards?.length ?? 0}
          onDelete={handleBulkDelete}
          onMarkAvailable={handleBulkMarkAvailable}
          onMarkUnavailable={handleBulkMarkUnavailable}
          onEditLanguage={() => setIsBulkLanguageModalOpen(true)}
          onClear={clearSelection}
          isPending={isBulkPending}
        />
      )}
      {isBulkLanguageModalOpen && (
        <BulkEditLanguageModal
          selectedCount={selectedIds.size}
          onConfirm={handleBulkSetLanguage}
          onClose={() => setIsBulkLanguageModalOpen(false)}
          isPending={bulkLanguage.isPending}
        />
      )}
    </div>
  );
}

// ── Private sub-component ────────────────────────────────────────────────────

function CardRow({
  card,
  isSelected,
  onToggleSelect,
}: {
  card: Card;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteCard = useDeleteCard();
  const { t } = useTranslation();

  return (
    <>
      <tr
        className={`${styles.tableRow} ${isSelected ? styles.rowSelected : ""}`}
      >
        <td className={styles.checkboxCell}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(card.id)}
            className={styles.checkbox}
            aria-label={`Select ${card.card_name}`}
          />
        </td>
        <td className={styles.cell}>
          <span className={styles.cardName}>
            <CardImageTooltip scryfallId={card.scryfall_id}>
              {card.card_name}
            </CardImageTooltip>
          </span>
          {card.is_foil && (
            <span className={styles.foilBadge} title={t("collection.foilYes")}>
              ✦
            </span>
          )}
        </td>
        <td className={styles.cell}>{card.set_name ?? card.set_code}</td>
        <td className={styles.cell}>
          <span className={`${styles.badge} ${styles[card.condition]}`}>
            {t(`collection.condition.${card.condition}`)}
          </span>
        </td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>
          {card.quantity}
        </td>
        <td className={styles.cell}>{card.language}</td>
        <td className={`${styles.cell} ${styles.cellCenter}`}>
          <span
            className={`${styles.availDot} ${card.is_available ? styles.available : ""}`}
            title={
              card.is_available
                ? t("collection.availableYes")
                : t("collection.availableNo")
            }
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
                  {deleteCard.isPending
                    ? t("collection.deleting")
                    : t("collection.confirmDelete")}
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(false)}
                  disabled={deleteCard.isPending}
                  className={styles.actionCancel}
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditOpen(true)}
                  className={styles.actionEdit}
                >
                  {t("collection.edit")}
                </button>
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className={styles.actionDelete}
                >
                  {t("collection.delete")}
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
