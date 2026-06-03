export interface AddCardModalProps {
  onClose: () => void;
}

export interface BulkImportModalProps {
  onClose: () => void;
}

export interface EditCardModalProps {
  card: import("./card").Card;
  onClose: () => void;
}

export interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onDelete: () => void;
  onMarkAvailable: () => void;
  onMarkUnavailable: () => void;
  onEditLanguage: () => void;
  onClear: () => void;
  isPending: boolean;
}

export interface BulkEditLanguageModalProps {
  selectedCount: number;
  onConfirm: (language: string) => void;
  onClose: () => void;
  isPending: boolean;
}

export interface CreateOfferModalProps {
  targetUserId: string;
  targetUsername: string;
  /** Pass the already-fetched list to skip a round-trip (e.g. from UserProfilePage).
   *  Omit to let the modal fetch the target's cards itself (e.g. from SearchPage). */
  targetCards?: import("./card").GlobalSearchResult[];
  onClose: () => void;
}

export interface RatingStarsProps {
  /** Value between 0 and 5. Fractional values are rounded to nearest 0.5. */
  stars: number;
  /** Controls icon size. Default: "md" */
  size?: "sm" | "md" | "lg";
  /** Show numeric value beside the stars. Default: false */
  showValue?: boolean;
}

export interface MessageThreadProps {
  offerId: string;
  currentUsername: string;
}

export interface CardImageTooltipProps {
  // Allow undefined: old API responses (before serializer was updated) or
  // a temporarily stale TanStack Query cache may not carry scryfall_id yet.
  // The component degrades gracefully — no tooltip, no crash.
  scryfallId: string | undefined;
  children: import("react").ReactNode;
}

export interface SwapCoordinationPanelProps {
  offerId: string;
  /** Whether the current user is the offer initiator (affects confirmation labels). */
  isInitiator: boolean;
  offerStatus: "accepted" | "completed";
  onOfferCompleted: () => void;
}

export interface SubmitRatingModalProps {
  offerId: string;
  targetUsername: string;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ErrorBoundaryProps {
  children: import("react").ReactNode;
  /** Optional custom fallback UI. Receives the caught error. */
  fallback?: (error: Error) => import("react").ReactNode;
}

export interface ScanCardItemProps {
  card: import("./scan").StagedCard;
  onRemove: (stageId: string) => void;
  onEditName: (stageId: string, newName: string) => void;
}

export interface ScanStagingListProps {
  cards: import("./scan").StagedCard[];
  onRemove: (stageId: string) => void;
  onEditName: (stageId: string, newName: string) => void;
  /** Called when the user clicks "Add X cards to my collection". */
  onSubmit: (cards: import("./scan").StagedCard[]) => void;
  isSubmitting: boolean;
}

export interface CameraCaptureProps {
  /** Called with the captured image File when the user takes or selects a photo. */
  onCapture: (file: File) => void;
  /** Whether an upload/scan is in progress — disables controls. */
  disabled?: boolean;
}
