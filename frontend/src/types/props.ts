// Component prop interfaces.
// One interface per component that accepts props.

export interface AddCardModalProps {
  onClose: () => void;
}

export interface BulkImportModalProps {
  onClose: () => void;
}

export interface EditCardModalProps {
  card: import('./card').Card;
  onClose: () => void;
}
