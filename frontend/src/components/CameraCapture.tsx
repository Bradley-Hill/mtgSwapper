import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
 * 1. getUserMedia live viewfinder (primary on mobile/desktop browsers that
 *    support it). Shows a <video> element with a targeting guide box overlaid
 *    at the card name bar position. When the user taps Capture, a canvas crops
 *    the live frame to just the guide band and sends that narrow strip to the
 *    backend. This means the server receives a pre-cropped name bar image
 *    rather than a full card photo, which dramatically improves OCR accuracy.
 *
 * 2. File input fallback (<input capture="environment">). Used automatically
 *    when getUserMedia fails (e.g. permission denied, older browser). Opens the
 *    native camera app or file picker. The full image is sent to the backend,
 *    which uses its own card-detection (numpy row-brightness scan) to locate
 *    and crop the name bar.
 *
 * Guide box positioning:
 *   GUIDE_TOP_PCT and GUIDE_BOTTOM_PCT define the guide band as a fraction of
 *   viewfinder height. These same values are mirrored as CSS percentages in
 *   CameraCapture.module.scss (.guideBox top / height). Both must stay in sync
 *   so the visible guide and the canvas crop land on the same pixels.
 *
 *   The viewfinder uses `height: auto` (no object-fit) so its rendered height
 *   equals the video's native aspect ratio scaled to the container width. This
 *   means `GUIDE_TOP_PCT × videoHeight` (native pixels, used in canvas) and
 *   `GUIDE_TOP_PCT × containerHeight` (CSS percentage) are exactly the same
 *   fraction — no mapping correction needed.
 */

// Guide band: 12% → 28% of the viewfinder height.
// This covers the name bar for a card that fills ~80% of the frame,
// accounting for a few percent of background above the card top.
// IMPORTANT: mirror any change here in CameraCapture.module.scss .guideBox
const GUIDE_TOP_PCT = 0.12;
const GUIDE_BOTTOM_PCT = 0.28;

export function CameraCapture({ onCapture, disabled = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // streamRef avoids stale-closure issues in useEffect cleanup functions —
  // a ref is always up-to-date even in closures that captured an old state.
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [isLive, setIsLive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const { t } = useTranslation();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsLive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setIsLive(true);
    } catch {
      // Permission denied, device not found, or API not supported.
      // Fall back to the native file input.
      setUseFallback(true);
    }
  }, []);

  // Attach stream to the video element once both are ready.
  useEffect(() => {
    if (isLive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isLive]);

  // Start camera on mount; guarantee cleanup on unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []); // deliberately empty — run only once on mount

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Crop to the guide band in native pixel coordinates.
    // Because the viewfinder uses height:auto (no object-fit crop/stretch),
    // CSS guide percentages and native pixel percentages are the same fraction.
    const cropTop = Math.round(vh * GUIDE_TOP_PCT);
    const cropHeight = Math.round(vh * (GUIDE_BOTTOM_PCT - GUIDE_TOP_PCT));

    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw only the guide band region of the current video frame.
    ctx.drawImage(video, 0, cropTop, vw, cropHeight, 0, 0, vw, cropHeight);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
        setPreview(URL.createObjectURL(blob));
        stopCamera();
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, stopCamera]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPreview(URL.createObjectURL(file));
      onCapture(file);
      e.target.value = "";
    },
    [onCapture],
  );

  // ── Fallback: getUserMedia unavailable ────────────────────────────────────
  if (useFallback) {
    return (
      <div className={styles.root}>
        {preview && (
          <div className={styles.preview}>
            <img
              src={preview}
              alt={t("scan.capture.preview")}
              className={styles.previewImg}
            />
          </div>
        )}
        <p className={styles.fallbackNote}>
          {t("scan.capture.cameraUnavailable")}
        </p>
        <input
          ref={fallbackInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className={styles.hiddenInput}
          onChange={handleFileChange}
          disabled={disabled}
          aria-hidden="true"
        />
        <button
          type="button"
          className={styles.captureBtn}
          onClick={() => fallbackInputRef.current?.click()}
          disabled={disabled}
        >
          {disabled
            ? t("scan.scanning")
            : preview
              ? t("scan.capture.retake")
              : t("scan.capture.takePhoto")}
        </button>
        {preview && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setPreview(null)}
            disabled={disabled}
          >
            {t("scan.capture.clear")}
          </button>
        )}
      </div>
    );
  }

  // ── Live viewfinder ────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {isLive && !preview && (
        // The entire viewfinder is a tap target (role="button" + onClick).
        // The floating button inside is a visual affordance for sighted users;
        // it uses stopPropagation + tabIndex=-1 so keyboard navigation goes
        // through the outer div only, avoiding a duplicate tab stop.
        <div
          className={styles.viewfinder}
          onClick={!disabled ? handleCapture : undefined}
          role="button"
          aria-label={t("scan.capture.capture")}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleCapture();
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.video}
          />
          {/* Card outline — shows where to position the whole card in the frame.
               Uses the standard MTG card aspect ratio (63:88 mm) so the outline
               matches what a real card looks like held up to the camera.
               When the card fills this outline, the name bar lands inside the
               green guide band below. Purely visual — aria-hidden. */}
          <div className={styles.cardOutline} aria-hidden="true" />
          {/* Guide overlay — pointer-events:none so taps fall through to the viewfinder div */}
          <div className={styles.guideBox} aria-hidden="true">
            <span className={styles.guideLabel}>
              {t("scan.capture.alignGuide")}
            </span>
          </div>
          {/* Floating button — visual affordance only; stopPropagation prevents double-fire */}
          <button
            type="button"
            className={styles.floatingCaptureBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleCapture();
            }}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
          >
            {disabled ? t("scan.scanning") : t("scan.capture.capture")}
          </button>
        </div>
      )}

      {preview && (
        <div className={styles.preview}>
          <img
            src={preview}
            alt={t("scan.capture.preview")}
            className={styles.previewImg}
          />
        </div>
      )}

      {preview && (
        <>
          <button
            type="button"
            className={styles.captureBtn}
            onClick={handleRetake}
            disabled={disabled}
          >
            {t("scan.capture.retake")}
          </button>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setPreview(null)}
            disabled={disabled}
          >
            {t("scan.capture.clear")}
          </button>
        </>
      )}
    </div>
  );
}
