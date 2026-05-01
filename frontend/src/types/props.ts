// Component prop interfaces.
// One interface per component that accepts props.

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

export interface CreateOfferModalProps {
  targetUserId: string;
  targetUsername: string;
  /** Pass the already-fetched list to skip a round-trip (e.g. from UserProfilePage).
   *  Omit to let the modal fetch the target's cards itself (e.g. from SearchPage). */
  targetCards?: import('./card').GlobalSearchResult[];
  onClose: () => void;
}
