/** "4-10" / "4,5,6" / "11-3" (wraps) → months; empty → all */
export function parseMonths(s: string): number[] | undefined {
  const out = new Set<number>();
  for (const part of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (!Number.isInteger(a) || a < 1 || a > 12) continue;
    if (b === undefined || Number.isNaN(b)) out.add(a);
    else if (Number.isInteger(b) && b >= 1 && b <= 12) for (let m = a; ; m = (m % 12) + 1) { out.add(m); if (m === b) break; }
  }
  return out.size ? [...out].sort((x, y) => x - y) : undefined;
}
export function toRanges(months: number[] | undefined): string {
  if (!months?.length) return "";
  const sorted = [...months].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const m of [...sorted.slice(1), -1]) {
    if (m === prev + 1) { prev = m; continue; }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = prev = m;
  }
  return parts.join(", ");
}

