// UI-specific state types — not API shapes, but internal component state
// that is kept here so no type declarations live outside the /types directory.

/** Active tab on SearchPage. */
export type SearchPageTab = "cards" | "traders";

/** Transient state for an in-progress offer creation on SearchPage. */
export interface OfferTarget {
  userId: string;
  username: string;
}

/** Direction filter on OffersPage. */
export type OffersDirection = "all" | "sent" | "received";

/** Multi-step state machine for BulkImportModal. */
export type BulkImportModalState =
  | { stage: "form" }
  | { stage: "loading" }
  | {
      stage: "results";
      imported: number;
      failed: number;
      rows: import("./api").BulkImportResultRow[];
    };

/** Class component state for ErrorBoundary. */
export interface ErrorBoundaryState {
  error: Error | null;
}

/** Active sort column on the Swappers tab of SearchPage. */
export type SwapperSort = "reputation" | "cards";
