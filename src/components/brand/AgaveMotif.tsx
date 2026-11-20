import { cn } from "@/lib/cn";

/**
 * Fine-line flowering agave stalk: the silhouette that appears in almost
 * every photo of the cape. Used as a quiet brand motif and section marker.
 * Geometry is computed once at module load (deterministic, no randomness).
 */
const W = 60;
const H = 240;
const BASE = { x: 30, y: 238 };
const TOP = { x: 33, y: 8 };

function stemX(y: number) {
  // gentle lean: a quadratic between base and top
  const t = (BASE.y - y) / (BASE.y - TOP.y);
  return BASE.x + (TOP.x - BASE.x) * t + Math.sin(t * Math.PI) * 2.2;
}

const branches = Array.from({ length: 9 }, (_, i) => {
  const y = 34 + i * 17;
  const side = i % 2 === 0 ? -1 : 1;
  const len = 8 + Math.sin(((i + 1) / 10) * Math.PI) * 14; // longest in the middle
  const x0 = stemX(y);
  const x1 = x0 + side * len;
  const y1 = y - 7;
  const cx = x0 + side * len * 0.55;
  const cy = y + 1;
  return { d: `M${x0.toFixed(1)} ${y}Q${cx.toFixed(1)} ${cy} ${x1.toFixed(1)} ${y1}`, x: x1, y: y1 };
});

const stem = (() => {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const y = BASE.y - (i / 11) * (BASE.y - TOP.y);
    return `${stemX(y).toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${pts.join("L")}`;
})();

export function AgaveMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("block h-auto", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={stem} strokeWidth={1.1} />
      {branches.map((b, i) => (
        <g key={i}>
          <path d={b.d} strokeWidth={0.9} />
          <circle cx={b.x} cy={b.y} r={2.3} fill="currentColor" stroke="none" />
          <circle cx={b.x + 2.6} cy={b.y - 1.6} r={1.3} fill="currentColor" stroke="none" />
          <circle cx={b.x - 2.4} cy={b.y - 1.8} r={1.2} fill="currentColor" stroke="none" />
        </g>
      ))}
      <circle cx={stemX(TOP.y)} cy={TOP.y} r={2.6} fill="currentColor" stroke="none" />
      <circle cx={stemX(TOP.y) - 2.5} cy={TOP.y + 4} r={1.4} fill="currentColor" stroke="none" />
      <circle cx={stemX(TOP.y) + 2.6} cy={TOP.y + 3.5} r={1.4} fill="currentColor" stroke="none" />
    </svg>
  );
}
