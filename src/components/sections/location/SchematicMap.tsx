import { getTranslations } from "next-intl/server";
import { mapPlaces } from "@content/location";

/**
 * Schematic "time map": the house at the centre, rings for driving time,
 * places at their true compass bearing. No third-party map, no cookies.
 */
const SIZE = 640;
const C = SIZE / 2;
const RMAX = 268; // radius of the 60-minute ring
const RINGS = [15, 30, 45, 60];
/** square-root scale: gives nearby places room while rings still read as 15/30/45/60 min */
const radius = (minutes: number) => Math.sqrt(minutes / 60) * RMAX;

const polar = (bearing: number, r: number) => {
  const a = (bearing * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

/** Sea: the open Ionian lies west of the coast that runs from Parga (NW) down past the cape. */
function seaPath() {
  const from = 192;
  const to = 318;
  const R = SIZE;
  const pts = [];
  for (let b = from; b <= to; b += 3) pts.push(polar(b, R));
  return `M${C} ${C} ` + pts.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
}

export async function SchematicMap() {
  const t = await getTranslations("location.map");
  const tp = await getTranslations("places");
  const sea = polar(258, 190);

  return (
    <figure>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={t("label")} className="h-auto w-full max-w-[40rem] overflow-hidden">
        <defs>
          <clipPath id="map-clip">
            <circle cx={C} cy={C} r={RMAX + 26} />
          </clipPath>
          <pattern id="waves" width="28" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 5 q7 -4 14 0 t14 0" fill="none" stroke="var(--color-ionian)" strokeOpacity="0.18" strokeWidth="0.8" />
          </pattern>
        </defs>

        <g clipPath="url(#map-clip)">
          <rect width={SIZE} height={SIZE} fill="var(--color-salt)" />
          <path d={seaPath()} fill="var(--color-agave)" fillOpacity="0.22" />
          <path d={seaPath()} fill="url(#waves)" />
        </g>

        {RINGS.map((m) => (
          <g key={m}>
            <circle cx={C} cy={C} r={radius(m)} fill="none" stroke="var(--color-limestone)" strokeWidth="0.8" strokeDasharray={m === 60 ? undefined : "2 5"} />
            <text x={C + 6} y={C - radius(m) - 6} className="fill-ink-soft" fontSize="11" letterSpacing="1.2">
              {t("ring", { count: m }).toUpperCase()}
            </text>
          </g>
        ))}

        <text x={sea.x} y={sea.y} textAnchor="middle" className="fill-ionian font-display" fontSize="20" fontStyle="italic">
          {t("sea")}
        </text>

        {/* North marker */}
        <g transform={`translate(${SIZE - 40} 40)`} className="fill-ink-soft">
          <path d="M0 -16 L5 4 L0 0 L-5 4 Z" />
          <text y="20" textAnchor="middle" fontSize="11" letterSpacing="1">
            N
          </text>
        </g>

        {mapPlaces.map((p) => {
          const pos = polar(p.bearing, radius(p.minutes));
          const right = pos.x >= C - 4;
          return (
            <g key={p.key}>
              <line x1={C} y1={C} x2={pos.x} y2={pos.y} stroke="var(--color-limestone)" strokeWidth="0.6" />
              <circle cx={pos.x} cy={pos.y} r="4.5" fill="var(--color-ionian)" />
              <text x={pos.x + (right ? 10 : -10)} y={pos.y + 4} textAnchor={right ? "start" : "end"} className="fill-ink" fontSize="15">
                {tp(p.key as Parameters<typeof tp>[0])}
              </text>
              <text x={pos.x + (right ? 10 : -10)} y={pos.y + 20} textAnchor={right ? "start" : "end"} className="fill-ink-soft" fontSize="11.5">
                ~{t("ring", { count: p.minutes })}
              </text>
            </g>
          );
        })}

        {/* The house */}
        <circle cx={C} cy={C} r="11" fill="var(--color-salt)" stroke="var(--color-dusk)" strokeWidth="1.2" />
        <circle cx={C} cy={C} r="4.5" fill="var(--color-dusk)" />
        <text x={C - 16} y={C + 5} textAnchor="end" className="fill-ionian font-display" fontSize="17">
          {t("house")}
        </text>
      </svg>
      <figcaption className="mt-4 max-w-md text-[0.8125rem] text-ink-soft">{t("caption")}</figcaption>
    </figure>
  );
}
