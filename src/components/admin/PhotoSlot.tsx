"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import A from "@content/messages/admin.el.json";
import { restorePhoto, uploadPhoto, type ActionState } from "@/lib/admin/actions";
import { button, buttonOutline, fill, input, label } from "./ui-client";

const P = A.photos;
const MAX = 2400;
const MIN = 1200;

/** Downscale in the browser (keeps uploads under the server limit, applies EXIF orientation). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  if (bitmap.width < MIN) throw new Error("small");
  const scale = Math.min(1, MAX / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.9));
}

export function PhotoSlot({
  slot,
  title,
  src,
  replacedAt,
  overridden,
  alt,
  canRestore,
}: {
  slot: string;
  title: string;
  src: string | null;
  replacedAt: string | null;
  overridden: boolean;
  alt: { en: string; el: string };
  canRestore: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadPhoto, {});
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    const fd = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    fd.delete("file");
    if (file) {
      if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return setLocalError(P.badType);
      setBusy(true);
      try {
        fd.set("file", new File([await shrink(file)], "photo.jpg", { type: "image/jpeg" }));
      } catch (err) {
        setBusy(false);
        return setLocalError(err instanceof Error && err.message === "small" ? fill(P.tooSmall, { min: MIN }) : P.unreadable);
      }
      setBusy(false);
    }
    startTransition(() => action(fd));
    if (fileRef.current) fileRef.current.value = "";
  }

  const error = localError ?? state.error;
  const id = `ph-${slot}`;
  return (
    <article className="border border-limestone/60 bg-white">
      <div className="aspect-[4/3] bg-sand">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary upload */}
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <p className="flex h-full items-center justify-center p-4 text-center text-[0.875rem] text-ink-soft">{P.interiorEmpty}</p>}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="font-display text-lg text-ionian">{title}</h3>
          <p className="text-[0.75rem] text-ink-soft">{overridden && replacedAt ? fill(P.replaced, { date: replacedAt }) : src ? P.original : ""}</p>
        </div>
        <form ref={formRef} onSubmit={submit} className="space-y-3" aria-busy={pending || busy}>
          <input type="hidden" name="slot" value={slot} />
          <div>
            <label htmlFor={`${id}-file`} className={label}>{src ? P.replace : P.upload}</label>
            <input ref={fileRef} id={`${id}-file`} type="file" name="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="block w-full text-[0.8125rem]" />
          </div>
          <div>
            <label htmlFor={`${id}-en`} className={label}>{P.altEn}</label>
            <input id={`${id}-en`} name="alt_en" defaultValue={alt.en} maxLength={300} className={input} aria-describedby={`${id}-hint`} />
          </div>
          <div>
            <label htmlFor={`${id}-el`} className={label}>{P.altEl}</label>
            <input id={`${id}-el`} name="alt_el" defaultValue={alt.el} maxLength={300} className={input} aria-describedby={`${id}-hint`} />
            <p id={`${id}-hint`} className="mt-1 text-[0.75rem] text-ink-soft">{P.altHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || busy} className={button}>
              {pending || busy ? P.uploading : A.common.save}
            </button>
            {error && <p role="alert" className="text-[0.8125rem] text-[#9a4a2a]">{error}</p>}
            {state.ok && !error && <p role="status" className="text-[0.8125rem] text-olive">{state.message}</p>}
          </div>
        </form>
        {canRestore && (
          <form action={restorePhoto}>
            <input type="hidden" name="slot" value={slot} />
            <button type="submit" className={buttonOutline}>{slot.startsWith("space-") ? P.removePhoto : P.restore}</button>
          </form>
        )}
      </div>
    </article>
  );
}
