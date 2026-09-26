import { useEffect, useRef } from "react";

interface CameraPreviewProps {
  stream: MediaStream | null;
  /** Mirror the live preview horizontally, mimicking a mirror (selfie UX). */
  mirrored?: boolean;
}

/**
 * Pure presentation component: attaches a MediaStream to a <video> element
 * for live preview. Capture happens separately via CameraManager.captureFrame
 * (CLAUDE.md section 6) — this component never touches capture logic.
 */
export function CameraPreview({ stream, mirrored = true }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      video.play().catch(() => {
        // Autoplay can be rejected before the first user gesture; the
        // booth requests camera permission during setup (CLAUDE.md
        // section 2), and playback resumes once a gesture occurs.
      });
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className="camera-preview"
      style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
      muted
      playsInline
      autoPlay
    />
  );
}
