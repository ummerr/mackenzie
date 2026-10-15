import Link from "next/link";
import {
  feeLine,
  tripFeeLine,
  tripStops,
  type California100Geo,
  type Photo,
  type TripPhotos,
  type TripStop,
  type TripView,
} from "@/lib/california100";
import { Hero, Picture } from "./photo";
import { ShareTrip } from "./share";
import { FromAbove, TripMap } from "./trip-map";

/* The weekends. Server components: the join has already found each trip's
 * rows and summed the band, tripStops its points, tripPhotos its pictures;
 * this only lays them out. A trip's page opens on its hero — the place,
 * with the title set into it — then the share bar, the story beside the
 * atlas map, the courses each with a picture (a photograph where Commons
 * has one, the course from above where the map has it), the rest of the
 * place, the facts and the plan. The section on /california prints the
 * short card with the hero and the small map. Every photograph carries the
 * credit its licence asks for. Nothing here is a claim; the file's note says
 * so and the page repeats it. */

export const tripPath = (slug: string) => `/california/trips/${slug}`;

/** Google Maps with the stops in order: airport, then the courses. No key,
 *  no script — a URL the phone's own app opens. */
export function directionsUrl(stops: TripStop[]): string | null {
  if (stops.length < 2) return null;
  const q = (s: TripStop) => `${s.point.lat.toFixed(5)},${s.point.lon.toFixed(5)}`;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", q(stops[0]));
  u.searchParams.set("destination", q(stops[stops.length - 1]));
  if (stops.length > 2) u.searchParams.set("waypoints", stops.slice(1, -1).map(q).join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

export interface TripBits {
  stops: TripStop[];
  photos: TripPhotos;
}

export function Trips({
  trips,
  note,
  geo,
  bits,
}: {
  trips: TripView[];
  note: string;
  geo: California100Geo | null;
  bits: (t: TripView) => TripBits;
}) {
  if (trips.length === 0) return null;
  const nights = trips.reduce((n, t) => n + t.trip.nights, 0);
  const rounds = trips.reduce((n, t) => n + t.rows.length, 0);
  const played = trips.reduce((n, t) => n + t.played, 0);
  void geo;
  return (
    <section className="mt-10" id="trips">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-[26px] leading-tight">Trips</h2>
        <Link href="/california/trips" className="font-mono text-[11px] text-ink-2 hover:text-accent-ink">
          every trip on one page, to send →
        </Link>
      </div>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">{note}</p>
      <p className="stamp mt-3 text-ink-3">
        {trips.length} weekends · {rounds} rounds · {nights} nights · {played} of the {rounds} already played
      </p>
      <ol className="mt-4 space-y-5">
        {trips.map((t) => (
          <TripCard key={t.trip.slug} t={t} {...bits(t)} />
        ))}
      </ol>
    </section>
  );
}

const STATE = (r: TripView["rows"][number]) =>
  r.state === "played"
    ? `played${r.timesPlayed > 1 ? ` ${r.timesPlayed}×` : ""}`
    : r.state === "facility-played"
      ? "facility played"
      : "to play";

function stampLine(t: TripView): string {
  const { trip } = t;
  const fee = tripFeeLine(t.fee);
  return [
    `${trip.nights} night${trip.nights === 1 ? "" : "s"}`,
    `fly ${trip.airport.code}`,
    `${trip.airport.drive} to the first tee`,
    `${t.drive.label} from SF by car`,
    `green fees ${fee}${fee === "—" ? "" : " a head"}`,
    t.played ? `${t.played} of ${t.rows.length} played` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function milesLine(stops: TripStop[], i: number): string {
  const stop = stops[i + 1];
  if (!stop || stop.milesFromPrev === null) return "";
  return ` · ${stop.milesFromPrev} mi from ${i === 0 ? stops[0].label : `#${stops[i].label}`}`;
}

function CourseRows({ t, stops }: { t: TripView; stops: TripStop[] }) {
  return (
    <ol className="mt-4 space-y-px" aria-label="The courses">
      {t.rows.map((r, i) => (
        <li
          key={r.entry.slug}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-2 px-3 py-2 sm:px-4"
          style={{ borderColor: r.state === "played" ? "var(--accent-ink)" : "var(--line)" }}
        >
          <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">#{r.entry.rank}</span>
          <Link href={`/california#r-${r.entry.rank}`} className="text-[14px] leading-snug text-ink-0">
            {r.entry.name}
          </Link>
          <span className="font-mono text-[11px] tabular-nums text-ink-2">
            {r.entry.locality} · {feeLine(r.entry.fee)} · {r.entry.value ?? "—"} value · {r.entry.drive.label} from SF
            {milesLine(stops, i)}
          </span>
          <span className={`ml-auto shrink-0 font-mono text-[10px] ${r.state === "played" ? "text-accent-ink" : "text-ink-3"}`}>
            {STATE(r)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The courses as pictures: a photograph where there is one, else the
 *  course from above where the map found the course itself. */
function CoursePictures({ t, stops, photos }: { t: TripView; stops: TripStop[]; photos: TripPhotos }) {
  const cells = t.rows.map((r, i) => {
    const ph = photos.byCourse[r.entry.slug]?.[0] ?? null;
    const stop = stops[i + 1] ?? null;
    return { r, ph, stop };
  });
  if (!cells.some((c) => c.ph || (c.stop && c.stop.precision === "course_feature"))) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cells.map(({ r, ph, stop }) => (
        <div key={r.entry.slug}>
          {ph ? (
            <Picture ph={ph} />
          ) : stop && stop.precision === "course_feature" ? (
            <FromAbove point={stop.point} name={r.entry.name} precision={stop.precision} />
          ) : (
            <div className="flex aspect-[4/3] items-end border bg-paper-2 p-3 font-mono text-[10px] leading-4 text-ink-3 rule">
              no picture of {r.entry.name} we may print, and the map has only its town
            </div>
          )}
          <p className="mt-1.5 font-mono text-[11px] text-ink-1">
            <span className="text-ink-3">#{r.entry.rank}</span> {r.entry.name}
          </p>
        </div>
      ))}
    </div>
  );
}

function Gallery({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return null;
  return (
    <div className={`mt-4 grid grid-cols-1 gap-3 ${photos.length === 1 ? "" : "sm:grid-cols-2"}`}>
      {photos.map((ph) => (
        <Picture key={ph.file} ph={ph} aspect={photos.length === 1 ? "21 / 9" : "3 / 2"} />
      ))}
    </div>
  );
}

function Facts({ t }: { t: TripView }) {
  const { trip } = t;
  return (
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
  );
}

function Plan({ t }: { t: TripView }) {
  if (t.trip.days.length === 0) return null;
  return (
    <ol className="mt-4 space-y-1 border-t pt-3 rule" aria-label="The plan">
      {t.trip.days.map((d, i) => (
        <li key={i} className="font-mono text-[11px] leading-5 text-ink-2">
          {d}
        </li>
      ))}
    </ol>
  );
}

/** The short card: the section's unit on /california and on /california/trips. */
export function TripCard({ t, stops, photos }: { t: TripView } & TripBits) {
  const { trip } = t;
  const share = <ShareTrip path={tripPath(trip.slug)} title={`${trip.title} — a California 100 trip`} directions={directionsUrl(stops)} />;
  return (
    <li id={`trip-${trip.slug}`} className="card">
      {photos.hero ? (
        <Link href={tripPath(trip.slug)} className="block">
          <Hero ph={photos.hero}>
            <p className="stamp text-[#e5dfd0]">{stampLine(t)}</p>
            <h3 className="mt-1.5 font-serif text-[34px] leading-[0.95] sm:text-[44px]">{trip.title}</h3>
            <p className="mt-1.5 font-mono text-[12px] text-[#e5dfd0]">{trip.tagline}</p>
          </Hero>
        </Link>
      ) : (
        <div className="px-4 pt-4 sm:px-5">
          <h3 className="font-serif text-[22px] leading-tight text-ink-0">
            <Link href={tripPath(trip.slug)}>{trip.title}</Link>
          </h3>
          <p className="stamp mt-2 text-ink-3">{stampLine(t)}</p>
        </div>
      )}
      <div className="px-4 pb-4 sm:px-5">
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_minmax(0,300px)] md:items-start">
          <p className="max-w-2xl text-[15px] leading-6 text-ink-1">{trip.story}</p>
          {stops.length > 0 && <TripMap stops={stops} width={600} height={420} caption={false} />}
        </div>
        <CourseRows t={t} stops={stops} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 rule">
          {share}
          <Link href={tripPath(trip.slug)} className="font-mono text-[11px] text-ink-2 hover:text-accent-ink">
            the whole trip — pictures, the map, the plan →
          </Link>
        </div>
      </div>
    </li>
  );
}

/** The full card: the trip's own page. */
export function TripFull({ t, stops, photos }: { t: TripView } & TripBits) {
  const { trip } = t;
  const title = (
    <>
      <p className="stamp">
        <Link href="/california#trips" className="hover:text-accent-ink">
          California 100
        </Link>{" "}
        · a trip
      </p>
      <h1 className="mt-2 font-serif text-[42px] leading-[0.92] tracking-[-0.01em] sm:text-[64px]">{trip.title}</h1>
      <p className="mt-2 font-mono text-[12px]">{trip.tagline}</p>
      <p className="stamp mt-2">{stampLine(t)}</p>
    </>
  );
  return (
    <article>
      {photos.hero ? (
        <Hero ph={photos.hero}>
          <div className="text-[#f7f4ec] [&_.stamp]:text-[#e5dfd0] [&_p.font-mono]:text-[#e5dfd0]">{title}</div>
        </Hero>
      ) : (
        <div className="text-ink-0 [&_.stamp]:text-ink-3 [&_p.font-mono]:text-ink-2">{title}</div>
      )}
      <div className="mt-4">
        <ShareTrip path={tripPath(trip.slug)} title={`${trip.title} — a California 100 trip`} directions={directionsUrl(stops)} />
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
        <p className="max-w-2xl text-[16px] leading-7 text-ink-1">{trip.story}</p>
        {stops.length > 0 && <TripMap stops={stops} width={640} height={560} />}
      </div>

      <h2 className="stamp mt-8 text-ink-3">the courses</h2>
      <CourseRows t={t} stops={stops} />
      <CoursePictures t={t} stops={stops} photos={photos} />

      {photos.gallery.length > 0 && (
        <>
          <h2 className="stamp mt-8 text-ink-3">the rest of the weekend</h2>
          <Gallery photos={photos.gallery} />
        </>
      )}

      <h2 className="stamp mt-8 text-ink-3">the logistics</h2>
      <Facts t={t} />
      <Plan t={t} />
    </article>
  );
}
