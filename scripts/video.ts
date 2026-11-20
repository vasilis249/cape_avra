/**
 * Builds the hero background video from the untouched original.
 *
 *   npm run video          (requires ffmpeg with libx264, vidstab, zscale)
 *
 * Pipeline: trim → stabilise (vidstab) → Display-P3 → BT.709 colour →
 * slow down + motion-interpolate back to 30 fps → per-variant crop/scale →
 * ping-pong loop → H.264 MP4 (no audio, faststart) + poster frame.
 *
 * The slow-motion master is cached in .cache/video (interpolation takes minutes).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { heroVideo as cfg } from "../content/video";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "videos/raw", cfg.file);
const CACHE = path.join(ROOT, ".cache/video");
const OUT = path.join(ROOT, "public/video");
const MANIFEST = path.join(ROOT, "src/generated/video.json");

const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

async function slowMaster(): Promise<string> {
  const key = createHash("sha256")
    .update(await readFile(RAW))
    .update(JSON.stringify([cfg.trimStart, cfg.speed]))
    .digest("hex")
    .slice(0, 12);
  const master = path.join(CACHE, `slow-${key}.mp4`);
  if (existsSync(master)) return master;

  await mkdir(CACHE, { recursive: true });
  const trf = path.join(CACHE, "transforms.trf");
  const stab = path.join(CACHE, "stab.mp4");
  console.log("· stabilising…");
  ff(["-ss", String(cfg.trimStart), "-i", RAW, "-an", "-vf", `vidstabdetect=shakiness=6:accuracy=15:result=${trf}`, "-f", "null", "-"]);
  ff([
    "-ss", String(cfg.trimStart), "-i", RAW, "-an",
    "-vf",
    `vidstabtransform=input=${trf}:smoothing=40:zoom=4:optzoom=0,` +
      "zscale=rangein=full:range=limited:primariesin=smpte432:primaries=709:transferin=709:transfer=709:matrixin=709:matrix=709,format=yuv420p",
    "-c:v", "libx264", "-crf", "12", "-preset", "fast", stab,
  ]);
  console.log("· slow motion + interpolation (takes a few minutes)…");
  ff([
    "-i", stab,
    "-vf", `setpts=${1 / cfg.speed}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
    "-c:v", "libx264", "-crf", "12", "-preset", "fast", master,
  ]);
  return master;
}

async function main() {
  const master = await slowMaster();
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) await rm(path.join(OUT, f));

  const manifest: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(cfg.variants)) {
    const { crop } = v;
    let chain = `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`;
    if (v.scale) chain += `,scale=${v.scale.w}:${v.scale.h}:flags=lanczos`;
    const graph = cfg.pingPong
      ? `[0:v]${chain},split[a][b];[a]reverse[r];[r][b]concat=n=2:v=1[v]`
      : `[0:v]${chain}[v]`;
    const tmp = path.join(CACHE, `${name}.mp4`);
    console.log(`· encoding ${name}…`);
    ff([
      "-i", master, "-filter_complex", graph, "-map", "[v]",
      "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-crf", String(v.crf), "-x264-params", "keyint=60",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
      "-movflags", "+faststart", "-an", tmp,
    ]);
    const video = await readFile(tmp);
    const vHash = createHash("sha256").update(video).digest("hex").slice(0, 8);
    const videoName = `hero-${name}.${vHash}.mp4`;
    await writeFile(path.join(OUT, videoName), video);

    // VP9/WebM fallback for browsers without H.264 (e.g. some Linux builds)
    const webmTmp = path.join(CACHE, `${name}.webm`);
    ff([
      "-i", master, "-filter_complex", graph, "-map", "[v]",
      "-c:v", "libvpx-vp9", "-crf", String(v.crf + 9), "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
      "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-an", webmTmp,
    ]);
    const webm = await readFile(webmTmp);
    const wHash = createHash("sha256").update(webm).digest("hex").slice(0, 8);
    const webmName = `hero-${name}.${wHash}.webm`;
    await writeFile(path.join(OUT, webmName), webm);

    // poster = first frame of the loop (agave stalks against the setting sun)
    const posterTmp = path.join(CACHE, `${name}-poster.png`);
    ff(["-i", tmp, "-frames:v", "1", posterTmp]);
    const poster = await sharp(posterTmp).jpeg({ quality: 86, mozjpeg: true, progressive: true }).toBuffer();
    const pHash = createHash("sha256").update(poster).digest("hex").slice(0, 8);
    const posterName = `hero-${name}-poster.${pHash}.jpg`;
    await writeFile(path.join(OUT, posterName), poster);
    const meta = await sharp(poster).metadata();
    const blur = await sharp(poster).resize(16).webp({ quality: 40 }).toBuffer();

    manifest[name] = {
      src: `/video/${videoName}`,
      webm: `/video/${webmName}`,
      bytes: video.length,
      poster: {
        src: `/video/${posterName}`,
        width: meta.width,
        height: meta.height,
        blurDataURL: `data:image/webp;base64,${blur.toString("base64")}`,
      },
    };
    console.log(`✓ ${name.padEnd(9)} mp4 ${(video.length / 1e6).toFixed(1)} MB · webm ${(webm.length / 1e6).toFixed(1)} MB`);
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Wrote src/generated/video.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
