import type { ReactNode } from "react";
import { AgaveMotif } from "@/components/brand/AgaveMotif";
import { Photo } from "@/components/media/Photo";
import { Container, Hairline } from "@/components/ui/Layout";
import type { PhotoId } from "@content/photos";

/**
 * Inner-page opening. With a photo: a calm full-bleed band (night overlay, light text,
 * pair with <SiteHeader variant="overlay" />). Without: a quiet salt band.
 */
export function PageHeader({
  eyebrow,
  title,
  lead,
  photo,
  focal,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  photo?: PhotoId;
  focal?: string;
  children?: ReactNode;
}) {
  if (photo) {
    return (
      <header className="relative isolate overflow-hidden bg-night text-salt">
        <div className="absolute inset-0 -z-10">
          <Photo id={photo} fill preload quality={80} sizes="100vw" className="h-full w-full" focal={focal} />
          <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/45 to-night/30" />
        </div>
        <Container className="flex min-h-[62svh] flex-col justify-end pt-32 pb-14 lg:min-h-[68svh] lg:pb-20">
          <p className="text-eyebrow font-medium uppercase text-salt/80">{eyebrow}</p>
          <span aria-hidden="true" className="mt-5 block h-px w-12 bg-salt/50" />
          <h1 className="mt-6 max-w-3xl text-h1 [text-shadow:0_1px_24px_rgb(27_36_51/0.5)]">{title}</h1>
          {lead && <p className="mt-6 max-w-2xl text-lead text-salt/90">{lead}</p>}
          {children}
        </Container>
      </header>
    );
  }
  return (
    <header className="relative overflow-hidden pt-32 pb-12 lg:pt-44 lg:pb-16">
      <AgaveMotif className="pointer-events-none absolute right-6 -bottom-6 w-16 text-limestone/50 lg:right-16 lg:w-24" />
      <Container>
        <p className="text-eyebrow font-medium uppercase text-ink-soft">{eyebrow}</p>
        <Hairline className="mt-5" />
        <h1 className="mt-6 max-w-3xl text-h1 text-ionian">{title}</h1>
        {lead && <p className="mt-6 max-w-2xl text-lead text-ink-soft">{lead}</p>}
        {children}
      </Container>
    </header>
  );
}
