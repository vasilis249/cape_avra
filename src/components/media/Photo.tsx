import Image from "next/image";
import { getLocale } from "next-intl/server";
import type { PhotoId } from "@content/photos";
import { getPhoto } from "@/lib/photos";
import { cn } from "@/lib/cn";

type PhotoProps = {
  id: PhotoId;
  /** Responsive `sizes` hint, e.g. "(min-width: 1024px) 50vw, 100vw". Required for good srcsets. */
  sizes: string;
  /** Fill the (positioned, sized) parent. Otherwise renders at intrinsic aspect ratio. */
  fill?: boolean;
  /** Above-the-fold hero image: preload + high fetch priority. */
  preload?: boolean;
  className?: string;
  imgClassName?: string;
  /** Override the registry focal point (CSS object-position). */
  focal?: string;
  /** Decorative usage (alt=""). */
  decorative?: boolean;
  quality?: 70 | 80;
};

/** Registry-driven photo: alt text, blur placeholder and focal point come from content/photos.ts. */
export async function Photo({
  id,
  sizes,
  fill,
  preload,
  className,
  imgClassName,
  focal,
  decorative,
  quality = 70,
}: PhotoProps) {
  const locale = (await getLocale()) as "en" | "el";
  const p = getPhoto(id, locale);
  const alt = decorative ? "" : p.alt;
  const common = {
    src: p.src,
    sizes,
    quality,
    placeholder: "blur" as const,
    blurDataURL: p.blurDataURL,
    preload,
    fetchPriority: preload ? ("high" as const) : undefined,
    style: { objectPosition: focal ?? p.focal, backgroundColor: p.color },
  };

  if (fill) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <Image {...common} alt={alt} fill className={cn("object-cover", imgClassName)} />
      </div>
    );
  }
  return (
    <Image
      {...common}
      alt={alt}
      width={p.width}
      height={p.height}
      className={cn("h-auto w-full", className, imgClassName)}
    />
  );
}
