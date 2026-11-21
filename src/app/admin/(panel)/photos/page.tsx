import type { Metadata } from "next";
import { PhotoSlot } from "@/components/admin/PhotoSlot";
import { dateTime, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getBookingStore } from "@/lib/booking/store";
import { mediaAvailable } from "@/lib/media-storage";
import { getPhoto } from "@/lib/photos";
import { photos } from "@content/photos";
import { spaces } from "@content/property";
import A from "@content/messages/admin.el.json";

export const metadata: Metadata = { title: A.photos.title };
const P = A.photos;

export default async function PhotosPage() {
  await requireAdmin();
  // read the store directly (not the cached copy): the admin must see its own changes immediately
  const overrides = Object.fromEntries((await getBookingStore().listSitePhotos()).map((p) => [p.slot, p]));
  const groups = [...new Set(photos.map((p) => p.category))];

  return (
    <>
      <PageTitle>{P.title}</PageTitle>
      <p className="mb-8 max-w-3xl text-ink-soft">{P.lead}</p>
      {!mediaAvailable() && <p role="alert" className="mb-8 text-[#9a4a2a]">{P.storageUnavailable}</p>}

      <h2 className="mb-4 text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">{P.interior}</h2>
      <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {spaces.map((s) => {
          const slot = `space-${s.key}`;
          const o = overrides[slot];
          const fallback = s.photo ? getPhoto(s.photo, "el") : null;
          return (
            <PhotoSlot
              key={slot}
              slot={slot}
              title={P.spaces[s.key]}
              src={o ? `/media/${o.path}` : (fallback?.src ?? null)}
              overridden={!!o}
              replacedAt={o ? dateTime(o.updatedAt) : null}
              alt={o?.alt ?? { en: "", el: "" }}
              canRestore={!!o}
            />
          );
        })}
      </div>

      {groups.map((cat) => (
        <section key={cat} className="mb-12">
          <h2 className="mb-4 text-[0.75rem] font-sans tracking-[0.14em] text-ink-soft uppercase">
            {P.site} · {P.categories[cat as keyof typeof P.categories] ?? cat}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {photos
              .filter((p) => p.category === cat)
              .map((p) => {
                const o = overrides[p.id];
                const original = getPhoto(p.id, "el");
                return (
                  <PhotoSlot
                    key={p.id}
                    slot={p.id}
                    title={p.id}
                    src={o ? `/media/${o.path}` : original.src}
                    overridden={!!o}
                    replacedAt={o ? dateTime(o.updatedAt) : null}
                    alt={o?.alt ?? p.alt}
                    canRestore={!!o}
                  />
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}
