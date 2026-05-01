import { useRef, useState, useCallback } from "react";
import styles from "./CameraCapture.module.scss";

interface Props {
  /** Called with the captured image File when the user takes or selects a photo. */
  onCapture: (file: File) => void;
  /** Whether an upload/scan is in progress — disables controls. */
  disabled?: boolean;
}

/**
 * CameraCapture
 *
 * Two capture modes in one component:
 *
 * 1. File input with `capture="environment"` — on mobile this opens the rear
 *    camera directly. On desktop it opens a file picker as a fallback.
 *    This is the simplest possible approach: no getUserMedia, no canvas, no
 *    permission management. Works on every browser without extra setup.
 *
 * 2. Manual file picker — the same <input> without capture, so the user can
 *    also choose an existing photo from their gallery.
 *
 * Why not use MediaDevices.getUserMedia() with a live <video> preview?
 * That approach gives a live viewfinder and more control over resolution, but
 * it requires:
 *   - Explicit permission grant (extra UX friction on first use)
 *   - Canvas capture for the snapshot (more code, more surface area)
 *   - Safari quirks with getUserMedia constraints
 *
 * For a card scanner where the user is taking a deliberate photo, the native
 * camera-capture input is faster to implement, equally effective, and requires
 * zero permission handling. We can upgrade to getUserMedia in Phase 2 if users
 * want a live preview flow.
 *
 * Gotcha: `capture="environment"` is ignored on desktop browsers — they just
 * show a file picker. That's acceptable; desktop users can upload a photo.
 */
export function CameraCapture({ onCapture, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Show a local preview so the user can see what they captured
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onCapture(file);

      // Reset the input so the same file can be re-selected after an error
      e.target.value = "";
    },
    [onCapture],
  );

  return (
    <div className={styles.root}>
      {preview && (
        <div className={styles.preview}>
          <img src={preview} alt="Card preview" className={styles.previewImg} />
        </div>
      )}

      {/* Hidden file input — triggered by the button below */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className={styles.hiddenInput}
        onChange={handleChange}
        disabled={disabled}
        aria-hidden="true"
      />

      <button
        type="button"
        className={styles.captureBtn}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        {disabled
          ? "Scanning…"
          : preview
            ? "Retake Photo"
            : "Take Photo / Upload Image"}
      </button>

      {preview && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => setPreview(null)}
          disabled={disabled}
        >
          Clear
        </button>
      )}
    </div>
  );
}
