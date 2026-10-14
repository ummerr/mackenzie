import { feeLine, tripFeeLine, type TripView } from "@/lib/california100";

/* The weekends. Server component: the join has already found each trip's rows
 * and summed the band, so this only lays them out — a scorecard card per
 * trip, the story first because the story is why you go, then the three
 * rows the way the rest of the page prints a row, then the day plan. The
 * square on each course is the record's verdict, the same mark the table
 * uses: filled is played, hollow is still to play. Nothing here is a claim;
 * the file's note says so and the page repeats it. */

export function Trips({ trips, note }: { trips: TripView[]; note: string }) {
  if (trips.length === 0) return null;
  const nights = trips.reduce((n, t) => n + t.trip.nights, 0);
  const rounds = trips.reduce((n, t) => n + t.rows.length, 0);
  const played = trips.reduce((n, t) => n + t.played, 0);
  return (
    <section className="mt-10" id="trips">
      <h2 className="font-serif text-[26px] leading-tight">Trips</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">{note}</p>
      <p className="stamp mt-3 text-ink-3">
        {trips.length} weekends · {rounds} rounds · {nights} nights · {played} of the {rounds} already played
      </p>
      <ol className="mt-4 space-y-4">
        {trips.map((t) => (
          <TripCard key={t.trip.slug} t={t} />
        ))}
      </ol>
    </section>
  );
}

function TripCard({ t }: { t: TripView }) {
  const { trip } = t;
  const fee = tripFeeLine(t.fee);
  return (
    <li id={`trip-${trip.slug}`} className="card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-[22px] leading-tight text-ink-0">{trip.title}</h3>
        <span className="font-mono text-[11px] text-ink-2">{trip.tagline}</span>
      </div>
      <p className="stamp mt-2 text-ink-3">
        {trip.nights} night{trip.nights === 1 ? "" : "s"} · fly {trip.airport.code} · {trip.airport.drive} to the first tee ·{" "}
        {t.drive.label} from SF by car · green fees {fee}
        {fee === "—" ? "" : " a head"}
        {t.played ? ` · ${t.played} of ${t.rows.length} played` : ""}
      </p>

      <p className="mt-3 max-w-2xl text-[15px] leading-6 text-ink-1">{trip.story}</p>

      <ol className="mt-4 space-y-px" aria-label="The courses">
        {t.rows.map((r) => (
          <li
            key={r.entry.slug}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-2 px-3 py-2 sm:px-4"
            style={{ borderColor: r.state === "played" ? "var(--accent-ink)" : "var(--line)" }}
          >
            <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">#{r.entry.rank}</span>
            <a href={`#r-${r.entry.rank}`} className="text-[14px] leading-snug text-ink-0">
              {r.entry.name}
            </a>
            <span className="font-mono text-[11px] tabular-nums text-ink-2">
              {r.entry.locality} · {feeLine(r.entry.fee)} · {r.entry.value ?? "—"} value · {r.entry.drive.label} from SF
            </span>
            <span className={`ml-auto shrink-0 font-mono text-[10px] ${r.state === "played" ? "text-accent-ink" : "text-ink-3"}`}>
              {r.state === "played"
                ? `played${r.timesPlayed > 1 ? ` ${r.timesPlayed}×` : ""}`
                : r.state === "facility-played"
                  ? "facility played"
                  : "to play"}
            </span>
          </li>
        ))}
      </ol>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="stamp text-ink-3">airport</dt>
          <dd className="mt-1 font-mono text-[11px] leading-5 text-ink-2">
            {trip.airport.code} {trip.airport.name}, {trip.airport.drive}
            {trip.airport.note ? ` — ${trip.airport.note}` : ""}
          </dd>
        </div>
        <div>
          <dt className="stamp text-ink-3">sleep</dt>
          <dd className="mt-1 font-mono text-[11px] leading-5 text-ink-2">{trip.base}</dd>
        </div>
        <div>
          <dt className="stamp text-ink-3">when</dt>
          <dd className="mt-1 font-mono text-[11px] leading-5 text-ink-2">{trip.when}</dd>
        </div>
      </dl>

      {trip.days.length > 0 && (
        <ol className="mt-4 space-y-1 border-t pt-3 rule" aria-label="The plan">
          {trip.days.map((d, i) => (
            <li key={i} className="font-mono text-[11px] leading-5 text-ink-2">
              {d}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
