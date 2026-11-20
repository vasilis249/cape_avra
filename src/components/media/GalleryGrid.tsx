"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type GalleryPhoto = {
  id: string;
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  color: string;
  alt: string;
  category: "sea" | "garden" | "house" | "surroundings";
};

type Labels = {
  filterLabel: string;
  filters: Record<"all" | GalleryPhoto["category"], string>;
  empty: Partial<Record<GalleryPhoto["category"], string>>;
  lightbox: { label: string; close: string; prev: string; next: string; counter: string; open: string };
};

const CATEGORIES = ["all", "sea", "garden", "house", "surroundings"] as const;

/** Filterable masonry grid + accessible lightbox (native <dialog>, keyboard and swipe). */
export function GalleryGrid({ photos, labels }: { photos: GalleryPhoto[]; labels: Labels }) {
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>("all");
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const touchX = useRef<number | null>(null);

  const visible = filter === "all" ? photos : photos.filter((p) => p.category === filter);
  const count = (c: (typeof CATEGORIES)[number]) => (c === "all" ? photos.length : photos.filter((p) => p.category === c).length);

  const open = (i: number, el: HTMLElement) => {
    opener.current = el;
    setIndex(i);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const step = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + visible.length) % visible.length)),
    [visible.length],
  );

  useEffect(() => {
    const dlg = dialog.current;
    if (!dlg) return;
    const onClose = () => {
      setIndex(null);
      opener.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    dlg.addEventListener("close", onClose);
    dlg.addEventListener("keydown", onKey);
    return () => {
      dlg.removeEventListener("close", onClose);
      dlg.removeEventListener("keydown", onKey);
    };
  }, [step]);

  const current = index === null ? null : visible[index];
  const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k]));

  return (
    <>
      <div role="group" aria-label={labels.filterLabel} className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(c)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 border px-4 text-[0.8125rem] tracking-[0.14em] uppercase transition-colors",
              filter === c ? "border-ionian bg-ionian text-salt" : "border-limestone text-ink hover:border-ionian",
            )}
          >
            {labels.filters[c]}
            <span className={cn("tabular-nums text-[0.75rem]", filter === c ? "text-salt/75" : "text-ink-soft")}>{count(c)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="linen mt-10 flex min-h-64 items-center justify-center p-10 text-center font-display text-xl text-ink-soft">
          {filter !== "all" && labels.empty[filter]}
        </p>
      ) : (
        <ul className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4">
          {visible.map((p, i) => (
            <li key={p.id} className="break-inside-avoid">
              <button
                type="button"
                onClick={(e) => open(i, e.currentTarget)}
                aria-label={fmt(labels.lightbox.open, { alt: p.alt })}
                className="group block w-full overflow-hidden"
              >
                <Image
                  src={p.src}
                  alt=""
                  width={p.width}
                  height={p.height}
                  sizes="(min-width: 1024px) 31vw, (min-width: 640px) 47vw, 100vw"
                  quality={70}
                  placeholder="blur"
                  blurDataURL={p.blurDataURL}
                  style={{ backgroundColor: p.color }}
                  className="h-auto w-full transition-transform duration-700 ease-[var(--ease-breeze)] group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialog}
        aria-label={labels.lightbox.label}
        className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-night/97 p-0 text-salt backdrop:bg-night/80"
        onClick={(e) => e.target === dialog.current && close()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        {current && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-5 py-4 text-[0.8125rem] tracking-[0.14em] uppercase sm:px-8">
              <span className="tabular-nums text-salt/75" aria-live="polite">
                {fmt(labels.lightbox.counter, { current: (index ?? 0) + 1, total: visible.length })}
              </span>
              <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-3 px-2">
                {labels.lightbox.close}
                <svg viewBox="0 0 16 16" className="h-4 w-4" stroke="currentColor" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" strokeWidth="1.2" />
                </svg>
              </button>
            </div>
            <figure className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4 sm:px-20">
              <div className="relative min-h-0 w-full flex-1">
                <Image
                  key={current.id}
                  src={current.src}
                  alt={current.alt}
                  fill
                  sizes="100vw"
                  quality={80}
                  className="object-contain"
                />
              </div>
              <figcaption className="mt-4 max-w-2xl text-center text-[0.875rem] text-salt/80">{current.alt}</figcaption>
            </figure>
            {visible.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={labels.lightbox.prev}
                  className="absolute top-1/2 left-2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center text-salt/80 hover:text-salt sm:left-6"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M15 4l-8 8 8 8" strokeWidth="1.2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={labels.lightbox.next}
                  className="absolute top-1/2 right-2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center text-salt/80 hover:text-salt sm:right-6"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
                    <path d="M9 4l8 8-8 8" strokeWidth="1.2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
