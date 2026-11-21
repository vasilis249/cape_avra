import { getMedia, isSafeMediaPath } from "@/lib/media-storage";

/** Photos uploaded in the admin. Names are content-hashed, so they can be cached forever. */
export async function GET(_req: Request, { params }: RouteContext<"/media/[...path]">) {
  const p = (await params).path.join("/");
  if (!isSafeMediaPath(p)) return new Response("Not found", { status: 404 });
  const body = await getMedia(p);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
