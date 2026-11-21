"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { startBooking } from "@/lib/booking/actions";
import { canCheckInOn, checkStay, lastPossibleCheckOut, minNightsFor, type StayProblem } from "@/lib/booking/availability";
import type { BookingConfig } from "@/lib/booking/config-schema";
import { addDays, addMonths, diffDays, weekday, type ISODate } from "@/lib/booking/dates";
import { quoteStay, seasonFor } from "@/lib/booking/pricing";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { BookingLabels } from "./labels";
import { PriceSummary } from "./PriceSummary";

type CalendarData = { today: ISODate; until: ISODate; unavailable: ISODate[]; config: BookingConfig };

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const monthStart = (d: ISODate) => `${d.slice(0, 7)}-01`;

/** Monday-first grid for a month: null = padding cell. */
function monthGrid(first: ISODate): (ISODate | null)[] {
  const offset = (weekday(first) + 6) % 7;
  const days = diffDays(first, addMonths(first, 1));
  return [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
}

export function BookingWidget({ locale, labels }: { locale: "en" | "el"; labels: BookingLabels }) {
  const router = useRouter();
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState(false);
  const [checkIn, setCheckIn] = useState<ISODate | null>(null);
  const [checkOut, setCheckOut] = useState<ISODate | null>(null);
  const [hover, setHover] = useState<ISODate | null>(null);
  const [guests, setGuests] = useState(2);
  const [view, setView] = useState<ISODate | null>(null); // first visible month
  const [focusDate, setFocusDate] = useState<ISODate | null>(null);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dayRefs = useRef(new Map<ISODate, HTMLButtonElement>());
  const keyboardMove = useRef(false);

  const load = useCallback(() => {
    fetch("/api/booking/calendar", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CalendarData) => {
        setData(d);
        setError(false);
        setView((v) => v ?? monthStart(d.today));
      })
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const unavailable = useMemo(() => new Set(data?.unavailable ?? []), [data]);
  const lang = locale === "el" ? "el-GR" : "en-GB";
  const fmtLong = (d: ISODate) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fmtShort = (d: ISODate) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const weekdayNames = (days: number[]) =>
    new Intl.ListFormat(lang, { type: "conjunction" }).format(
      days.map((d) => new Date(Date.UTC(2027, 0, 3 + d)).toLocaleDateString(lang, { weekday: "long", timeZone: "UTC" })),
    );

  if (error) return <p className="bg-sand p-8 text-ink-soft">{labels.loadError}</p>;
  if (!data || !view) {
    return (
      <div aria-busy="true" className="linen flex min-h-[24rem] items-center justify-center text-ink-soft">
        {labels.loading}
      </div>
    );
  }

  const { config, today, until } = data;
  const earliest = addDays(today, config.minAdvanceDays);
  const firstMonth = monthStart(today);
  const lastMonth = monthStart(until);
  const open = (d: ISODate) => !!seasonFor(config, d) || !config.closedOutsideSeasons;
  const canStart = (d: ISODate) => d >= earliest && d < until && !unavailable.has(d) && open(d) && canCheckInOn(config, d);
  const maxOut = checkIn && !checkOut ? lastPossibleCheckOut(config, unavailable, checkIn) : null;
  const canEnd = (d: ISODate) => !!checkIn && !checkOut && d > checkIn && !!maxOut && d <= maxOut;

  const pick = (d: ISODate) => {
    setServerProblem(null);
    if (checkIn && !checkOut && canEnd(d)) {
      setCheckOut(d);
      return;
    }
    if (canStart(d)) {
      setCheckIn(d);
      setCheckOut(null);
    }
  };

  const rangeEnd = checkOut ?? (checkIn && hover && canEnd(hover) ? hover : null);
  const inRange = (d: ISODate) => !!checkIn && !!rangeEnd && d > checkIn && d < rangeEnd;

  const problem: StayProblem | null = checkIn && checkOut ? checkStay(config, unavailable, { checkIn, checkOut, guests }, today) : null;
  const quote = checkIn && checkOut && !problem ? quoteStay(config, { checkIn, checkOut, guests }) : null;

  const problemText = (p: StayProblem | { code: string; [k: string]: unknown }): string => {
    const tpl = labels.problems[p.code] ?? labels.problems.invalid;
    const v: Record<string, string | number> = {};
    if ("minNights" in p) v.count = p.minNights as number;
    if ("maxNights" in p) v.count = p.maxNights as number;
    if ("minAdvanceDays" in p) v.count = p.minAdvanceDays as number;
    if ("maxAdvanceMonths" in p) v.count = p.maxAdvanceMonths as number;
    if ("max" in p) v.max = p.max as number;
    if ("days" in p) v.days = weekdayNames(p.days as number[]);
    if ("date" in p && p.date) v.date = fmtLong(p.date as string);
    return fill(tpl, v);
  };

  const hint = (() => {
    if (!checkIn || checkOut) return null;
    const season = seasonFor(config, checkIn);
    const parts = [fill(labels.minNightsHint, { count: minNightsFor(config, checkIn) })];
    if (season?.checkInDays) parts.push(fill(labels.checkInDaysHint, { days: weekdayNames(season.checkInDays) }));
    return parts.join(" ");
  })();

  const continueBooking = () => {
    if (!checkIn || !checkOut || problem) return;
    startTransition(async () => {
      const res = await startBooking({ checkIn, checkOut, guests, locale });
      if (res.ok) {
        router.push({ pathname: "/book/checkout", query: { ref: res.ref, t: res.token } });
        return;
      }
      setServerProblem(res.problem.code === "rate" ? labels.rate : problemText(res.problem));
      if (res.problem.code === "unavailable") {
        setCheckIn(null);
        setCheckOut(null);
        load();
      }
    });
  };

  // keyboard: roving focus across days (arrows ±1/±7, Home/End week, PageUp/Down month)
  const onDayKey = (e: KeyboardEvent<HTMLButtonElement>, d: ISODate) => {
    const moves: Record<string, () => ISODate> = {
      ArrowRight: () => addDays(d, 1),
      ArrowLeft: () => addDays(d, -1),
      ArrowDown: () => addDays(d, 7),
      ArrowUp: () => addDays(d, -7),
      Home: () => addDays(d, -((weekday(d) + 6) % 7)),
      End: () => addDays(d, 6 - ((weekday(d) + 6) % 7)),
      PageDown: () => addMonths(d, 1),
      PageUp: () => addMonths(d, -1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    let next = move();
    if (next < today) next = today;
    if (next >= until) next = addDays(until, -1);
    keyboardMove.current = true;
    setFocusDate(next);
    const m = monthStart(next);
    if (m < view) setView(m);
    else if (m > addMonths(view, 1)) setView(addMonths(m, -1) < firstMonth ? firstMonth : addMonths(m, -1));
  };

  const tabbable = focusDate ?? checkIn ?? (canStart(earliest) ? earliest : today);
  const months = [view, addMonths(view, 1)];

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <section aria-label={labels.calendarLabel} className="lg:col-span-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <p aria-live="polite" className="font-display text-xl text-ink">
            {checkIn && checkOut
              ? diffDays(checkIn, checkOut) === 1
                ? labels.nightOne
                : fill(labels.nightOther, { count: diffDays(checkIn, checkOut) })
              : !checkIn
                ? labels.selectArrival
                : labels.selectDeparture}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView(addMonths(view, -1))}
              disabled={view <= firstMonth}
              aria-label={labels.prevMonth}
              className="inline-flex h-11 w-11 items-center justify-center text-ionian disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M15 4l-8 8 8 8" strokeWidth="1.3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setView(addMonths(view, 1))}
              disabled={addMonths(view, 1) >= lastMonth}
              aria-label={labels.nextMonth}
              className="inline-flex h-11 w-11 items-center justify-center text-ionian disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M9 4l8 8-8 8" strokeWidth="1.3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-2">
          {months.map((m, mi) => (
            <MonthView
              key={m}
              first={m}
              lang={lang}
              className={mi === 1 ? "hidden sm:block" : undefined}
              render={(d) => {
                const night = unavailable.has(d);
                const past = d < earliest || d >= until;
                const startable = canStart(d);
                const endable = canEnd(d);
                const isEdge = d === checkIn || d === checkOut;
                const enabled = startable || endable;
                const state = isEdge
                  ? labels.daySelected
                  : endable || startable
                    ? labels.dayAvailable
                    : night
                      ? labels.dayBooked
                      : !past && open(d) && !canCheckInOn(config, d)
                        ? labels.dayNoArrival
                        : labels.dayUnavailable;
                return (
                  <button
                    ref={(el) => {
                      if (el) dayRefs.current.set(d, el);
                      else dayRefs.current.delete(d);
                      if (el && keyboardMove.current && d === focusDate) {
                        keyboardMove.current = false;
                        el.focus();
                      }
                    }}
                    type="button"
                    tabIndex={d === tabbable ? 0 : -1}
                    aria-disabled={!enabled}
                    aria-pressed={isEdge}
                    aria-label={`${fmtLong(d)}, ${state}`}
                    onClick={() => enabled && pick(d)}
                    onMouseEnter={() => setHover(d)}
                    onFocus={() => setFocusDate(d)}
                    onKeyDown={(e) => onDayKey(e, d)}
                    className={cn(
                      "relative flex aspect-square w-full items-center justify-center text-[0.9375rem] tabular-nums transition-colors",
                      enabled ? "cursor-pointer" : "cursor-default",
                      // exactly one tone per day, so utilities never compete
                      isEdge
                        ? "bg-ionian text-salt"
                        : inRange(d)
                          ? "bg-agave/25 text-ink"
                          : enabled
                            ? "text-ink hover:bg-sand"
                            : !past && open(d) && !night
                              ? "text-ink-soft/70" // open night, but no arrival allowed on this day
                              : "text-ink-soft/45",
                      night && !endable && !inRange(d) && "line-through decoration-limestone",
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              }}
            />
          ))}
        </div>

        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-ink-soft">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 border border-limestone bg-white" />
            {labels.legendAvailable}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-ink-soft/50 line-through decoration-limestone">
              14
            </span>
            {labels.legendBooked}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-ink-soft/70">
              14
            </span>
            {labels.legendNoArrival}
          </li>
        </ul>
        {hint && <p className="mt-4 text-[0.875rem] text-ink-soft">{hint}</p>}
      </section>

      <aside className="lg:col-span-5" aria-label={labels.summaryTitle}>
        <div className="bg-sand p-6 sm:p-8 lg:sticky lg:top-28">
          <div className="grid grid-cols-2 gap-px bg-limestone/60">
            {[
              [labels.arrival, checkIn],
              [labels.departure, checkOut],
            ].map(([label, d]) => (
              <div key={label} className="bg-sand py-2 pr-2">
                <p className="text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">{label}</p>
                <p className="mt-1 font-display text-xl text-ink">{d ? fmtShort(d) : "—"}</p>
              </div>
            ))}
          </div>

          <label htmlFor="bw-guests" className="mt-6 block text-[0.75rem] tracking-[0.14em] text-ink-soft uppercase">
            {labels.guests}
          </label>
          <select
            id="bw-guests"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="mt-2 block w-full border border-limestone bg-white/70 px-4 py-3 text-ink"
          >
            {Array.from({ length: config.maxGuests }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>

          {checkIn && (
            <button type="button" onClick={() => (setCheckIn(null), setCheckOut(null), setServerProblem(null))} className="mt-4 text-[0.8125rem] text-ionian underline underline-offset-4">
              {labels.clear}
            </button>
          )}

          {(problem || serverProblem) && (
            <p role="alert" className="mt-6 border-l-2 border-dusk pl-4 text-[0.9375rem] text-ink">
              {serverProblem ?? problemText(problem!)}
            </p>
          )}

          {quote && (
            <>
              <PriceSummary
                quote={quote}
                locale={locale}
                labels={labels.summary}
                depositPercent={config.payment.depositPercent}
                balanceDaysBeforeArrival={config.payment.balanceDaysBeforeArrival}
                className="mt-6"
              />
              <button type="button" onClick={continueBooking} disabled={pending} className={buttonClasses("primary", "md", "mt-6 w-full disabled:opacity-60")}>
                {pending ? labels.holding : labels.continue}
              </button>
              <p className="mt-3 text-center text-[0.8125rem] text-ink-soft">{labels.note}</p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function MonthView({
  first,
  lang,
  render,
  className,
}: {
  first: ISODate;
  lang: string;
  render: (d: ISODate) => React.ReactNode;
  className?: string;
}) {
  const title = new Date(`${first}T12:00:00Z`).toLocaleDateString(lang, { month: "long", year: "numeric", timeZone: "UTC" });
  const heads = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2027, 0, 4 + i)).toLocaleDateString(lang, { weekday: "narrow", timeZone: "UTC" }),
  );
  const cells = monthGrid(first);
  return (
    <div className={className}>
      <p className="mb-3 text-center font-display text-lg capitalize text-ink">{title}</p>
      <div role="presentation" className="grid grid-cols-7 text-center text-[0.75rem] text-ink-soft" aria-hidden="true">
        {heads.map((h, i) => (
          <span key={i} className="py-2">
            {h}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => (
          <div key={d ?? `pad-${i}`}>{d ? render(d) : null}</div>
        ))}
      </div>
    </div>
  );
}
