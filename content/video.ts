/**
 * Hero background video: one seamless loop built from several clips.
 * Originals live in /videos/raw (never modified). After editing, run
 * `npm run video` (needs ffmpeg) to regenerate public/video/* and
 * src/generated/video.json.
 *
 * Loop order: clip 1 → dissolve → clip 2 → … → dissolve back into clip 1.
 * The dissolve back is built into the file, so the loop never visibly restarts.
 */
export type ClipCrop = { w: number; h: number; x: number; y: number };

export type Clip = {
  file: string;
  /** seconds trimmed from start / end of the original */
  trimStart: number;
  trimEnd?: number;
  /** HLG/HDR source (newer iPhones) → tone-mapped to SDR; otherwise Display-P3 SDR */
  hdr: boolean;
  /** play the clip backwards */
  reverse?: boolean;
  /** normalised working frame before slow motion (width × height, upright) */
  work: { w: number; h: number };
  /** crops of the working frame per output variant */
  crops: { landscape: ClipCrop; portrait: ClipCrop };
};

export const heroVideo = {
  /** playback speed: 0.4 = slowed 2.5×, smoothed to 30 fps by motion interpolation */
  speed: 0.4,
  /** dissolve between clips, seconds */
  dissolve: 2.5,
  clips: [
    {
      // sunset pan: agave stalks against the sun → beach and Lefkada (played backwards so
      // the loop opens on the agaves, which also makes the poster frame)
      file: "Video_cape_avra.MOV",
      trimStart: 0.5,
      hdr: false,
      reverse: true,
      work: { w: 1440, h: 1920 },
      crops: {
        landscape: { w: 1440, h: 900, x: 0, y: 520 },
        portrait: { w: 1080, h: 1920, x: 180, y: 0 },
      },
    },
    {
      // blue hour: open sea, last orange band on the horizon
      file: "IMG_7536.mov",
      trimStart: 0.8,
      hdr: true,
      work: { w: 1440, h: 2560 },
      crops: {
        landscape: { w: 1440, h: 900, x: 0, y: 950 },
        portrait: { w: 1440, h: 2560, x: 0, y: 0 },
      },
    },
  ] satisfies Clip[],
  variants: {
    landscape: { size: { w: 1440, h: 900 }, crf: 25 },
    portrait: { size: { w: 810, h: 1440 }, crf: 26 },
  },
  alt: {
    en: "Slow pan along the shore at sunset, from the agave stalks against the setting sun to the mountains of Lefkada, then the open sea at blue hour",
    el: "Αργό πανόραμα της ακτής στο ηλιοβασίλεμα, από τις αγαύες μπροστά στον ήλιο ως τα βουνά της Λευκάδας, και μετά το ανοιχτό πέλαγος στο σούρουπο",
  },
} as const;
