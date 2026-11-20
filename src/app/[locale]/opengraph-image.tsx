import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { wordmark } from "@/components/brand/brand-paths";
import video from "@/generated/video.json";
import { isLocale } from "@/i18n/routing";

export const alt = "Cape Avra";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontFile = (subset: "latin" | "greek") =>
  readFile(path.join(process.cwd(), `node_modules/@fontsource/noto-serif-display/files/noto-serif-display-${subset}-400-italic.woff`));

/** Greek capitals drop the tonos */
const upper = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/** Share image per locale: the sunset frame, the wordmark and the tagline. */
export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : "en";
  const messages = JSON.parse(await readFile(path.join(process.cwd(), `content/messages/${locale}.json`), "utf8"));
  const tagline: string = messages.home.hero.title;
  const place: string = messages.home.hero.eyebrow;

  const photo = await readFile(path.join(process.cwd(), "public", video.landscape.poster.src));
  const photoUri = `data:image/jpeg;base64,${photo.toString("base64")}`;
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wordmark.width} ${wordmark.height}"><g fill="#f6f2ea">${wordmark.letters
    .map((l) => `<path transform="translate(${l.x} 0)" d="${l.d}"/>`)
    .join("")}</g></svg>`;
  const markUri = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: "#1b2433" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={photoUri} width={1200} height={750} style={{ position: "absolute", top: -40, left: 0, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, rgba(27,36,51,0.92) 0%, rgba(27,36,51,0.7) 38%, rgba(27,36,51,0.15) 72%, rgba(27,36,51,0) 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "rgba(246,242,234,0.8)", fontSize: 18, letterSpacing: 5, fontFamily: "Display, DisplayGreek" }}>{upper(place)}</div>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img src={markUri} width={560} height={Math.round((560 * wordmark.height) / wordmark.width)} style={{ marginTop: 22 }} />
          </div>
          <div style={{ color: "#f6f2ea", fontSize: 58, fontFamily: "Display, DisplayGreek", fontStyle: "italic", maxWidth: 540, lineHeight: 1.1 }}>{tagline}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Display", data: await fontFile("latin"), style: "italic", weight: 400 },
        { name: "DisplayGreek", data: await fontFile("greek"), style: "italic", weight: 400 },
      ],
    },
  );
}
