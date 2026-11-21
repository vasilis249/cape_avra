import { addDays, isISODate, type ISODate } from "./dates";

/**
 * Minimal, dependency-free iCalendar (RFC 5545) support for availability sync.
 * Import: Airbnb / Booking.com / VRBO export all-day VEVENTs (DTSTART;VALUE=DATE),
 * DTEND exclusive = the check-out day. Timed events are reduced to their dates.
 */

export type ICalEvent = { uid: string; start: ISODate; end: ISODate; summary: string };

/** Undo RFC 5545 line folding (CRLF + space/tab continues the previous line). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** DTSTART/DTEND value → calendar date. Handles 20270710, 20270710T140000Z and TZID forms. */
function toDate(value: string): ISODate | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return isISODate(d) ? d : null;
}

export function parseICal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  let cur: Partial<ICalEvent> & { dtendIsDate?: boolean; startHasTime?: boolean } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur?.start) {
        // no DTEND: all-day event lasts one day
        let end = cur.end ?? addDays(cur.start, 1);
        if (end <= cur.start) end = addDays(cur.start, 1);
        events.push({ uid: cur.uid ?? `${cur.start}-${end}`, start: cur.start, end, summary: cur.summary ?? "" });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name] = line.slice(0, idx).split(";");
    const value = line.slice(idx + 1).trim();
    switch (name.toUpperCase()) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescape(value);
        break;
      case "DTSTART": {
        const d = toDate(value);
        if (d) cur.start = d;
        break;
      }
      case "DTEND": {
        const d = toDate(value);
        // a timed event ending at, say, 10:00 on the check-out day still frees that night
        if (d) cur.end = d;
        break;
      }
    }
  }
  return events;
}

const fold = (line: string) => {
  // RFC 5545: lines SHOULD NOT exceed 75 octets; continuation lines start with a space
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};
const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (d: ISODate) => d.replace(/-/g, "");
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Our availability as an .ics feed for Airbnb / Booking.com to import. */
export function buildICal(events: ICalEvent[], opts: { name: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cape Avra//Availability//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(opts.name)}`,
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.end)}`,
      `SUMMARY:${escape(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
