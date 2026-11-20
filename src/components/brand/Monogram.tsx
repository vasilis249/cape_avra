import { monogram } from "./brand-paths";
import { cn } from "@/lib/cn";

/** "CA" monogram in a fine ring; inherits `currentColor`. */
export function Monogram({ className, ring = true }: { className?: string; ring?: boolean }) {
  return (
    <svg viewBox={monogram.viewBox} className={cn("block", className)} aria-hidden="true">
      {ring && (
        <circle
          cx={monogram.ring.cx}
          cy={monogram.ring.cy}
          r={monogram.ring.r - 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
        />
      )}
      <g fill="currentColor">
        <path d={monogram.c} />
        <path d={monogram.a} />
      </g>
    </svg>
  );
}
