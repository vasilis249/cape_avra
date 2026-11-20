"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Source = { mp4: string; webm: string };
type Props = {
  landscape: Source;
  portrait: Source;
  labels: { pause: string; play: string };
};

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/**
 * Decorative background video layered over the server-rendered poster.
 * - loads only after the page has loaded (poster/headline stay the LCP)
 * - picks the landscape or portrait encode for the viewport
 * - never autoplays under prefers-reduced-motion, Save-Data or 2G (poster only; play button offered)
 * - pauses while off-screen; visible pause/play control (WCAG 2.2.2)
 */
export function HeroVideo({ landscape, portrait, labels }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const userPaused = useRef(false);

  const load = () => {
    const v = ref.current;
    if (!v || v.src) return v;
    const s = matchMedia("(orientation: portrait)").matches ? portrait : landscape;
    v.src = v.canPlayType('video/mp4; codecs="avc1.640028"') ? s.mp4 : s.webm;
    return v;
  };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const slow = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "");

    const onPlaying = () => {
      setVisible(true);
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);

    let idle: number | undefined;
    const start = () => {
      idle = window.setTimeout(() => {
        load()
          ?.play()
          .catch(() => setPlaying(false));
      }, 200);
    };
    if (!reduced && !slow) {
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true });
    }

    // pause off-screen, resume on return (unless the visitor paused it)
    const io = new IntersectionObserver(([e]) => {
      if (!v.src) return;
      if (e.isIntersecting && !userPaused.current) v.play().catch(() => {});
      else if (!e.isIntersecting) v.pause();
    });
    io.observe(v);

    return () => {
      window.removeEventListener("load", start);
      window.clearTimeout(idle);
      io.disconnect();
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const v = load();
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      v.play().catch(() => {});
    } else {
      userPaused.current = true;
      v.pause();
    }
  };

  return (
    <>
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        data-src-landscape={landscape.mp4}
        data-src-portrait={portrait.mp4}
        data-webm-landscape={landscape.webm}
        data-webm-portrait={portrait.webm}
        className={cn(
          "absolute inset-0 -z-10 h-full w-full object-cover transition-opacity duration-[1600ms] ease-[var(--ease-breeze)]",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <button
        type="button"
        onClick={toggle}
        data-video-toggle
        aria-label={playing ? labels.pause : labels.play}
        aria-pressed={!playing}
        className="absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-salt/40 text-salt/85 backdrop-blur-sm transition-colors hover:border-salt hover:text-salt sm:right-8 lg:right-12 lg:bottom-10"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          {playing ? (
            <path data-icon="pause" d="M4 2.5h2.5v11H4zM9.5 2.5H12v11H9.5z" />
          ) : (
            <path data-icon="play" d="M4.5 2.5v11l9-5.5z" />
          )}
        </svg>
      </button>
    </>
  );
}
