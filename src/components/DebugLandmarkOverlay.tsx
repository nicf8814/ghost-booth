import type { FaceModel, Point } from "../vision/VisionTypes";

interface DebugLandmarkOverlayProps {
  faces: FaceModel[];
  /** Rendered width/height of the photo this overlay sits on top of, in CSS pixels. */
  width: number;
  height: number;
}

/**
 * Development-only overlay (CLAUDE.md section 58): draws each detected
 * face's bounding box plus eye/eyebrow/nose/mouth/contour landmarks, so an
 * operator can visually confirm detection is working before the
 * deformation engine (Phase 4) is built on top of it. Only ever rendered
 * when settings.debugMode is on.
 */
export function DebugLandmarkOverlay({ faces, width, height }: DebugLandmarkOverlayProps) {
  const toPx = (p: Point) => ({ x: p.x * width, y: p.y * height });

  return (
    <svg
      className="debug-landmark-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {faces.map((face, i) => {
        const box = face.boundingBox;
        return (
          <g key={i}>
            <rect
              x={box.x * width}
              y={box.y * height}
              width={box.width * width}
              height={box.height * height}
              className="debug-box"
            />
            <Polyline points={face.faceContour} toPx={toPx} className="debug-contour" closed={false} />
            <Polyline points={face.outerLips} toPx={toPx} className="debug-lips" closed />
            <Polyline points={face.innerLips} toPx={toPx} className="debug-lips" closed />
            <Polyline points={face.noseContour} toPx={toPx} className="debug-nose" closed={false} />
            {face.leftEye && <DebugPoint point={face.leftEye} toPx={toPx} className="debug-eye" />}
            {face.rightEye && <DebugPoint point={face.rightEye} toPx={toPx} className="debug-eye" />}
            {face.leftEyebrow && <DebugPoint point={face.leftEyebrow} toPx={toPx} className="debug-brow" />}
            {face.rightEyebrow && <DebugPoint point={face.rightEyebrow} toPx={toPx} className="debug-brow" />}
            {face.mouth && <DebugPoint point={face.mouth} toPx={toPx} className="debug-mouth" />}
            {face.nose && <DebugPoint point={face.nose} toPx={toPx} className="debug-mouth" />}
          </g>
        );
      })}
      {faces.length === 0 && (
        <text x={12} y={28} className="debug-no-face-text">
          NO FACE DETECTED
        </text>
      )}
    </svg>
  );
}

function Polyline({
  points,
  toPx,
  className,
  closed,
}: {
  points: Point[];
  toPx: (p: Point) => { x: number; y: number };
  className: string;
  closed: boolean;
}) {
  if (points.length === 0) return null;
  const pts = points.map(toPx);
  const d = pts.map((p) => `${p.x},${p.y}`).join(" ");
  return closed ? <polygon points={d} className={className} /> : <polyline points={d} className={className} />;
}

function DebugPoint({
  point,
  toPx,
  className,
}: {
  point: Point;
  toPx: (p: Point) => { x: number; y: number };
  className: string;
}) {
  const { x, y } = toPx(point);
  return <circle cx={x} cy={y} r={4} className={className} />;
}
