import { wordmark } from "./brand-paths";
import { cn } from "@/lib/cn";

type WordmarkProps = {
  className?: string;
  /** Letters drift in from a wider spacing on load ("breeze settling"). */
  animate?: boolean;
  /** Render as decorative (when a visible text label is next to it). */
  decorative?: boolean;
};

/** CAPE AVRA wordmark: outlined paths, inherits `currentColor`. */
export function Wordmark({ className, animate, decorative }: WordmarkProps) {
  const n = wordmark.letters.length;
  const center = (n - 1) / 2;
  return (
    <svg
      viewBox={`0 0 ${wordmark.width} ${wordmark.height}`}
      className={cn("block h-auto overflow-visible", animate && "wordmark-animate", className)}
      fill="currentColor"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Cape Avra" })}
    >
      {wordmark.letters.map((l, i) => (
        <g key={i} transform={`translate(${l.x} 0)`}>
          <path
            className="wordmark-letter"
            d={l.d}
            style={{ "--i": i, "--offset": Math.round((i - center) * 9) } as React.CSSProperties}
          />
        </g>
      ))}
    </svg>
  );
}
