/** Class names and helpers shared by server and client admin components. */
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
export const input =
  "block w-full border border-limestone bg-white px-3 py-2 text-[0.9375rem] text-ink focus:border-ionian focus:outline-none focus:ring-1 focus:ring-ionian";
export const label = "mb-1 block text-[0.8125rem] text-ink-soft";
export const button =
  "inline-flex items-center justify-center bg-ionian px-4 py-2 text-[0.8125rem] tracking-[0.12em] text-salt uppercase hover:bg-night disabled:opacity-60";
export const buttonOutline =
  "inline-flex items-center justify-center border border-ionian px-4 py-2 text-[0.8125rem] tracking-[0.12em] text-ionian uppercase hover:bg-ionian hover:text-salt disabled:opacity-60";
export const buttonDanger =
  "inline-flex items-center justify-center bg-[#9a4a2a] px-4 py-2 text-[0.8125rem] tracking-[0.12em] text-salt uppercase hover:bg-[#7a3517] disabled:opacity-60";
