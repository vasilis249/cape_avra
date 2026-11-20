/**
 * Hero background video. Original lives in /videos/raw (never modified).
 * After editing, run `npm run video` (needs ffmpeg) to regenerate
 * public/video/* and src/generated/video.json.
 */
export const heroVideo = {
  file: "Video_cape_avra.MOV",
  /** seconds trimmed from the start (a finger enters the frame) */
  trimStart: 0.5,
  /** playback speed: 0.4 = slowed 2.5×, smoothed to 30 fps by motion interpolation */
  speed: 0.4,
  /** play backwards then forwards so the loop never jumps */
  pingPong: true,
  /** crops in source pixels of the upright 1440×1920 frame */
  variants: {
    landscape: { crop: { w: 1440, h: 900, x: 0, y: 520 }, scale: null, crf: 25 },
    portrait: { crop: { w: 1080, h: 1920, x: 180, y: 0 }, scale: { w: 810, h: 1440 }, crf: 26 },
  },
  alt: {
    en: "Slow pan along the shore at sunset, from the mountains of Lefkada to the agave stalks against the setting sun",
    el: "Αργό πανόραμα της ακτής στο ηλιοβασίλεμα, από τα βουνά της Λευκάδας ως τις αγαύες μπροστά στον ήλιο που δύει",
  },
} as const;
