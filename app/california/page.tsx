import {
  AMAR_COMPONENTS,
  AMAR_COMPONENT_WORD,
  CHECK_GROUPS,
  CHECK_GROUP_WORD,
  feeLine,
  joinCalifornia100,
  valueOrdinal,
  type California100,
  type California100File,
  type ListRow,
} from "@/lib/california100";
import { loadCalifornia100, loadFacilityIndex, loadHistory } from "@/lib/load";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../provenance";
import { StatTiles, type StatTile } from "../stat-tiles";
import { CaliforniaList, type RowCheck, type TableRow } from "./list";

/* The California Public 100 against the record. Server component: the list
 * is parsed, joined and ordered in lib/california100.ts (tested); the client
 * table below only picks an order and hides rows. The page answers four
 * questions in order — how many, which next, which the index rates, which
 * are hard — and says on every row whether the row has been checked yet. A
 * hundred-square progress grid was tried first and retired the same day:
 * it repeated what the rows already say and answered nothing on its own. */

export const metadata = {
  title: "CA 100 — Mackenzie",
  description:
    "The California Public 100: a to-play list of public-access courses, each row joined to the record — played, facility played, or still to play.",
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function recordLine(r: ListRow): string {
  if (r.state === "played") {
    const rds = `${r.timesPlayed} rd${r.timesPlayed === 1 ? "" : "s"}`;
    const avg = r.avgScore === null ? "" : ` · avg ${r.avgScore}${r.shortRounds ? " (short rounds)" : ""}`;
    const rank = r.personalRank === null ? "" : ` · your ${ordinal(r.personalRank)}`;
    return `${rds}${avg}${rank}`;
  }
  if (r.state === "facility-played") return `played ${r.layoutName ?? r.facilityName ?? "the facility"}, not this course`;
  return "—";
}

function componentsLine(r: ListRow): string {
  return AMAR_COMPONENTS.map((k) => `${AMAR_COMPONENT_WORD[k]} ${r.entry.amar.components[k].toFixed(1)}`).join(" · ");
}

/** A check's link: the file names a URL, or a key in `_sources` that has one. */
function checkHref(source: string | null, file: California100File): string | null {
  if (source === null) return null;
  if (/^https?:\/\//.test(source)) return source;
  return file.sources[source]?.url ?? null;
}

function tableRows(list: California100, file: California100File): TableRow[] {
  return list.rows.map((r) => {
    const e = r.entry;
    const checks: RowCheck[] = CHECK_GROUPS.map((g) => ({
      group: g,
      word: CHECK_GROUP_WORD[g],
      verified: e.provenance.checks[g].verified,
      source: e.provenance.checks[g].source,
      href: checkHref(e.provenance.checks[g].source, file),
      note: e.provenance.checks[g].note,
    }));
    return {
      rank: e.rank,
      slug: e.slug,
      name: e.name,
      locality: e.locality,
      region: e.region,
      area: e.area,
      areaWord: file.areas[e.area] ?? e.area,
      status: e.status,
      architect: e.architect,
      yards: e.tee.yards,
      slope: e.tee.slope,
      rating: e.tee.rating,
      teeName: e.tee.name,
      fee: feeLine(e.fee),
      feeLow: e.fee.low ?? e.fee.high,
      feeNote: e.fee.note,
      access: e.access,
      value: e.value,
      valueOrd: valueOrdinal(e.value),
      valueNote: e.valueNote,
      tags: e.tags.map((t) => file.tags[t] ?? t),
      housing: e.housing,
      gwCA: e.rankings.golfweekCA,
      gwUS: e.rankings.golfweekUS,
      gdScore: e.rankings.golfDigestScore,
      gdCA: e.rankings.golfDigestCA,
      gdPublic: e.rankings.golfDigestPublic,
      ycp: e.rankings.golfYCP,
      drive: e.drive.label,
      driveMinutes: e.drive.minutes,
      amarRank: e.amar.rank,
      amarTier: e.amar.tier,
      amarScore: e.amar.score,
      components: e.amar.components,
      verified: e.provenance.verified,
      checksVerified: checks.filter((c) => c.verified).length,
      checks,
      state: r.state,
      timesPlayed: r.timesPlayed,
      record: recordLine(r),
    };
  });
}

export default function California() {
  const file = loadCalifornia100();
  const index = loadFacilityIndex();
  const history = loadHistory();
  const list = file && index ? joinCalifornia100(file, index.bySlug, index.capturedAt) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        CALIFORNIA 100
      </h1>
      {list === null ? (
        <p className="stamp mt-3 text-ink-3">
          no data/california-100.json or public/data/courses.json on this checkout — run{" "}
          <code className="text-ink-2">pnpm data:build</code>
        </p>
      ) : (
        <Body list={list} file={file!} history={history} />
      )}
    </div>
  );
}

function Body({
  list,
  file,
  history,
}: {
  list: California100;
  file: NonNullable<ReturnType<typeof loadCalifornia100>>;
  history: ReturnType<typeof loadHistory>;
}) {
  const next = list.nextUp;
  const cheap = list.cheapestUnplayed;
  const tiles: StatTile[] = [
    {
      label: "played",
      value: `${list.played}/100`,
      note: `${list.roundsOnList} rounds on the list · ${list.linked - list.played} more at a facility the record holds`,
      accent: true,
    },
    {
      label: "of the top 25",
      value: `${list.top25Played}/25`,
      note: `top 50: ${list.top50Played}/50 · the index's own ten: ${list.amarTenPlayed}/10`,
    },
    {
      label: "next up",
      value: next ? next.entry.name : "—",
      note: next
        ? `best value still to play on the SF shortlist · ${feeLine(next.entry.fee)} · #${next.entry.rank}`
        : "nothing left on the SF shortlist",
    },
    {
      label: "cheapest still to play",
      value: cheap ? cheap.entry.name : "—",
      note: cheap ? `${feeLine(cheap.entry.fee)} · ${cheap.entry.value ?? "—"} value · #${cheap.entry.rank}` : undefined,
    },
  ];

  return (
    <>
      <p className="stamp mt-3 text-ink-3">
        compiled {list.compiledAt} · {list.verified} of 100 rows fully checked · {list.checks} of 500 checks · joined
        to the record captured {list.capturedAt}
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        The hundred best public-access courses in California, as one compilation of the published
        lists ranks them, laid against the record: which of them have been played, how it went, and
        which to book next. Beside the compiled rank sits the index&rsquo;s own score — nine things it
        cares about, weighted toward architecture and toward what is worth the drive from here. Every
        row is a claim until its checks say otherwise — the ones not yet checked say so.
      </p>

      <StatTiles tiles={tiles} className="mt-6 grid grid-cols-2 gap-px border bg-paper-2 rule sm:grid-cols-4" />

      {/* ── the table ─────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">The hundred</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          The same hundred under any heading you click — the compiled rank, the index&rsquo;s score and
          its nine parts, the value grade, the tee, the posted fee, the drive from SF, the published
          ranks — with filters for where you are going and a column picker for what you want to see.
          A course name opens its row. The square on each row is the record&rsquo;s verdict: filled is
          played, pressed is a facility the record holds under another course, hollow is still to play.
          Only the column choice is saved; the record decides what counts as played.
        </p>
        <ul className="mt-4 flex flex-wrap gap-px" aria-label="Played by area">
          {list.byArea.map((a) => (
            <li key={a.area} className="border bg-paper-1 px-2.5 py-1.5 font-mono text-[10px] text-ink-2 rule">
              {file.areas[a.area] ?? a.area}{" "}
              <span className={`tabular-nums ${a.played ? "text-accent-ink" : "text-ink-3"}`}>
                {a.played}/{a.total}
              </span>
            </li>
          ))}
        </ul>
        <CaliforniaList
          rows={tableRows(list, file)}
          access={file.access}
          areas={file.areas}
          tags={file.tags}
          housing={file.housing}
        />
      </section>

      {/* ── the index's ten ───────────────────────────────────────────────── */}
      {file.amar && (
        <section className="mt-10">
          <h2 className="font-serif text-[26px] leading-tight">The index&rsquo;s ten</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            {file.amar.note} Weights:{" "}
            {AMAR_COMPONENTS.map((k) => `${AMAR_COMPONENT_WORD[k]} ${Math.round(file.amar!.weights[k] * 100)}%`).join(", ")}.
          </p>
          <ol className="mt-4 space-y-px">
            {list.order.amar.slice(0, 10).map((i) => {
              const r = list.rows[i];
              return (
                <li
                  key={r.entry.slug}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
                  style={{ borderColor: r.state === "played" ? "var(--accent-ink)" : "var(--line)" }}
                >
                  <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">#{r.entry.amar.rank}</span>
                  <a href={`#r-${r.entry.rank}`} className="text-[14px] leading-snug text-ink-0">
                    {r.entry.name}
                  </a>
                  <span className="font-mono text-[11px] tabular-nums text-ink-2" title={componentsLine(r)}>
                    {r.entry.amar.score.toFixed(1)} · {r.entry.amar.tier} · compiled #{r.entry.rank} · {r.entry.drive.label} from SF
                  </span>
                  <span className={`ml-auto shrink-0 font-mono text-[10px] ${r.state === "played" ? "text-accent-ink" : "text-ink-3"}`}>
                    {recordLine(r)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ── the hardest ───────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-serif text-[26px] leading-tight">Hardest on the list</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Slope is not quality. It is the answer to a different question — which of these can beat you
          up — and the back tees here are the rated ones, not tournament stretching.
        </p>
        <ol className="mt-4 space-y-px">
          {list.hardest.map((r) => (
            <li
              key={r.entry.slug}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
              style={{ borderColor: r.state === "played" ? "var(--accent-ink)" : "var(--line)" }}
            >
              <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-ink-3">#{r.entry.rank}</span>
              <a href={`#r-${r.entry.rank}`} className="text-[14px] leading-snug text-ink-0">
                {r.entry.name}
              </a>
              <span className="font-mono text-[11px] tabular-nums text-ink-2">
                slope {r.entry.tee.slope} · {r.entry.tee.yards === null ? "—" : r.entry.tee.yards.toLocaleString("en-US")} yds
              </span>
              <span className={`ml-auto shrink-0 font-mono text-[10px] ${r.state === "played" ? "text-accent-ink" : "text-ink-3"}`}>
                {recordLine(r)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Provenance
        sources={buildSources({ history, california: list }).filter((s) => s.id === "map" || s.id === "california")}
        note={
          <>
            The list is <code className="text-ink-2">data/california-100.json</code>: a ChatGPT compilation
            of Golfweek, Golf Digest and GOLF lists and its own nine-component index, both pasted{" "}
            {list.compiledAt}, then checked row by row — each row carries a check per claim (Golfweek and GOLF
            ranks, Golf Digest, tee, fee, architect) with the page it was read from; the index&rsquo;s scores are an opinion and carry
            none;{" "}
            <code className="text-ink-2">pnpm data:validate</code> refuses a verified check without a source.
            Played / not played comes from the courses artifact, never from this page.
          </>
        }
      />
    </>
  );
}
