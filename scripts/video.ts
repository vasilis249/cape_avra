/**
 * Builds the hero background video loop from the untouched originals.
 *
 *   npm run video          (requires ffmpeg with libx264, libvpx-vp9, vidstab, zscale, xfade)
 *
 * Per clip (cached in .cache/video, interpolation takes minutes):
 *   trim → colour (HLG HDR tone-map, or Display-P3 → BT.709) → working size →
 *   stabilise (vidstab) → slow down + motion-interpolate back to 30 fps
 * Per output variant (landscape / portrait):
 *   crop + scale each clip → (reverse) → join with dissolves → dissolve back into
 *   the opening so the loop never visibly restarts → H.264 MP4 + VP9 WebM + poster
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { heroVideo as cfg, type Clip } from "../content/video";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache/video");
const OUT = path.join(ROOT, "public/video");
const MANIFEST = path.join(ROOT, "src/generated/video.json");
const FPS = 30;

const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
const duration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

function colourFilter(clip: Clip) {
  return clip.hdr
    ? // HLG (BT.2020) → SDR BT.709, mobius keeps the horizon glow without crushing the water
      "zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le," +
        "zscale=p=bt709,tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
    : // iPhone SDR is Display-P3 + full range
      "zscale=rangein=full:range=limited:primariesin=smpte432:primaries=709:transferin=709:transfer=709:matrixin=709:matrix=709,format=yuv420p";
}

/** Slow-motion master for one clip (cached by content + settings). */
async function slowMaster(clip: Clip): Promise<string> {
  const raw = path.join(ROOT, "videos/raw", clip.file);
  const settings = [clip.trimStart, cfg.speed];
  const extra = clip.hdr || clip.trimEnd ? JSON.stringify([clip.hdr, clip.trimEnd ?? 0, clip.work]) : "";
  const key = createHash("sha256")
    .update(await readFile(raw))
    .update(JSON.stringify(settings) + extra)
    .digest("hex")
    .slice(0, 12);
  const master = path.join(CACHE, `slow-${key}.mp4`);
  if (existsSync(master)) {
    console.log(`· ${clip.file}: cached slow-motion master`);
    return master;
  }

  await mkdir(CACHE, { recursive: true });
  const base = path.join(CACHE, key);
  const trim = ["-ss", String(clip.trimStart), ...(clip.trimEnd ? ["-to", String(clip.trimEnd)] : []), "-i", raw, "-an"];
  console.log(`· ${clip.file}: colour + working size…`);
  ff([...trim, "-vf", `${colourFilter(clip)},scale=${clip.work.w}:${clip.work.h}:flags=lanczos`, "-c:v", "libx264", "-crf", "12", "-preset", "fast", `${base}-norm.mp4`]);
  console.log(`· ${clip.file}: stabilising…`);
  ff(["-i", `${base}-norm.mp4`, "-vf", `vidstabdetect=shakiness=6:accuracy=15:result=${base}.trf`, "-f", "null", "-"]);
  ff(["-i", `${base}-norm.mp4`, "-vf", `vidstabtransform=input=${base}.trf:smoothing=40:zoom=4:optzoom=0`, "-c:v", "libx264", "-crf", "12", "-preset", "fast", `${base}-stab.mp4`]);
  console.log(`· ${clip.file}: slow motion + interpolation (takes a few minutes)…`);
  ff([
    "-i", `${base}-stab.mp4`,
    "-vf", `setpts=${1 / cfg.speed}*PTS,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
    "-c:v", "libx264", "-crf", "12", "-preset", "fast", master,
  ]);
  return master;
}

/** filter_complex that crops/scales every clip and chains them into a seamless loop. */
function loopGraph(variant: keyof typeof cfg.variants, lengths: number[]) {
  const { size } = cfg.variants[variant];
  const d = cfg.dissolve;
  const parts: string[] = [];
  cfg.clips.forEach((clip, i) => {
    const c = clip.crops[variant];
    parts.push(
      `[${i}:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${size.w}:${size.h}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p` +
        `${"reverse" in clip && clip.reverse ? ",reverse" : ""},settb=AVTB[c${i}]`,
    );
  });
  // split the opening clip: its first `d` seconds close the loop
  parts.push(`[c0]split[c0a][c0b]`);
  parts.push(`[c0a]trim=start=${d},setpts=PTS-STARTPTS[main]`);
  parts.push(`[c0b]trim=end=${d},setpts=PTS-STARTPTS[head]`);

  let label = "main";
  let len = lengths[0] - d;
  const chain = [...cfg.clips.slice(1).map((_, i) => ({ label: `c${i + 1}`, len: lengths[i + 1] })), { label: "head", len: d }];
  chain.forEach((next, i) => {
    const out = i === chain.length - 1 ? "v" : `x${i}`;
    parts.push(`[${label}][${next.label}]xfade=transition=fade:duration=${d}:offset=${(len - d).toFixed(3)}[${out}]`);
    len = len + next.len - d;
    label = out;
  });
  return { graph: parts.join(";"), length: len };
}

async function main() {
  const masters: string[] = [];
  for (const clip of cfg.clips) masters.push(await slowMaster(clip));
  const lengths = masters.map(duration);

  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) await rm(path.join(OUT, f));

  const manifest: Record<string, unknown> = {};
  for (const name of Object.keys(cfg.variants) as (keyof typeof cfg.variants)[]) {
    const v = cfg.variants[name];
    const { graph, length } = loopGraph(name, lengths);
    const inputs = masters.flatMap((m) => ["-i", m]);
    const colourTags = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];

    console.log(`· encoding ${name} (${length.toFixed(1)} s loop)…`);
    const mp4Tmp = path.join(CACHE, `${name}.mp4`);
    ff([
      ...inputs, "-filter_complex", graph, "-map", "[v]",
      "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-crf", String(v.crf), "-x264-params", "keyint=60", ...colourTags, "-movflags", "+faststart", "-an", mp4Tmp,
    ]);
    // VP9/WebM fallback for browsers without H.264 (e.g. some Linux builds); from the MP4 to save a second graph run
    const webmTmp = path.join(CACHE, `${name}.webm`);
    ff([
      "-i", mp4Tmp, "-c:v", "libvpx-vp9", "-crf", String(v.crf + 9), "-b:v", "0", "-row-mt", "1",
      "-deadline", "good", "-cpu-used", "2", "-pix_fmt", "yuv420p", ...colourTags, "-an", webmTmp,
    ]);

    const write = async (tmp: string, ext: string) => {
      const buf = await readFile(tmp);
      const h = createHash("sha256").update(buf).digest("hex").slice(0, 8);
      const file = `hero-${name}.${h}.${ext}`;
      await writeFile(path.join(OUT, file), buf);
      return { file, bytes: buf.length };
    };
    const mp4 = await write(mp4Tmp, "mp4");
    const webm = await write(webmTmp, "webm");

    // poster = first frame of the loop
    const posterTmp = path.join(CACHE, `${name}-poster.png`);
    ff(["-i", mp4Tmp, "-frames:v", "1", posterTmp]);
    const poster = await sharp(posterTmp).jpeg({ quality: 86, mozjpeg: true, progressive: true }).toBuffer();
    const pHash = createHash("sha256").update(poster).digest("hex").slice(0, 8);
    const posterName = `hero-${name}-poster.${pHash}.jpg`;
    await writeFile(path.join(OUT, posterName), poster);
    const meta = await sharp(poster).metadata();
    const blur = await sharp(poster).resize(16).webp({ quality: 40 }).toBuffer();

    manifest[name] = {
      src: `/video/${mp4.file}`,
      webm: `/video/${webm.file}`,
      bytes: mp4.bytes,
      seconds: Number(length.toFixed(2)),
      poster: {
        src: `/video/${posterName}`,
        width: meta.width,
        height: meta.height,
        blurDataURL: `data:image/webp;base64,${blur.toString("base64")}`,
      },
    };
    console.log(`✓ ${name.padEnd(9)} mp4 ${(mp4.bytes / 1e6).toFixed(1)} MB · webm ${(webm.bytes / 1e6).toFixed(1)} MB`);
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote src/generated/video.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
