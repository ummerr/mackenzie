/* The last ten rounds, read as one object.
 *
 * `recentVsCareer` (lib/round-history.ts) answers "the last eighteen months
 * against the career". This answers the sharper question — what did the last
 * ten cards actually do — and it reads every ledger that can speak to a
 * round: the card itself (strokes, putts per hole, fairway codes, the penalty
 * row); the watch where a human-confirmed link joins it (pars, and so over
 * par, double bogeys and the worst hole; the tee, approach and short-game
 * classifiers in lib/break80.ts); and Grint's own charts, which carry the
 * greens in regulation the cards never do.
 *
 * Rules, all inherited:
 *  - the window is the last `count` DISTINCT 18-hole scored cards, anchored
 *    to the newest card and never the wall clock — byte-identical inputs
 *    must render byte-identical output or `pnpm profile --check` fails on a
 *    Tuesday;
 *  - both numbers, always: every row prints the window beside the whole
 *    record, each with its n, so recency cannot hide that it moved a figure;
 *  - the charts are positional and are never joined to the cards. Their last
 *    `count` points sit in rows labelled as the chart's, and the one thing
 *    said about the join is whether the course names line up;
 *  - the watch joins only through a confirmed link, and a round it did not
 *    hear prints a dash, never a guess;
 *  - a blank penalty cell is Grint's "not counted", so every penalty rate is
 *    a floor and the row says so.
 *
 * The page and PROFILE.md both render this object — the rows arrive
 * pre-formatted so the two cannot drift on the block that changes most.
 */

import {
  approachMisses,
  chips,
  doublesPerRound,
  holeViews,
  troublesomeTees,
  upAndDowns,
  type HoleView,
} from "./break80";
import type { GarminRound, GarminShots } from "./garmin-shots";
import {
  differentialTail,
  distinctRounds,
  fairwaySplit,
  mean,
  penaltyTally,
  roundPenalties,
  threePuttShare,
  type PlayedRound,
  type RoundHistory,
} from "./round-history";

export const RECENT_ROUNDS = {
  /** Distinct 18-hole cards in the window. */
  count: 10,
  /** Under this many, the window is an anecdote and nothing renders. */
  min: 5,
  /** One side must own this share of the left/right misses to be a lean. */
  leanShare: 0.6,
  /** Doubles must carry this share of the over-par strokes before the read
   *  says the score is made there. */
  doublesShare: 0.5,
} as const;

export type StatGroup =
  | "Scoring"
  | "Off the tee"
  | "Into the green"
  | "Around the green"
  | "On the green"
  | "Penalties"
  | "Handicap";

export const STAT_GROUPS: StatGroup[] = [
  "Scoring",
  "Off the tee",
  "Into the green",
  "Around the green",
  "On the green",
  "Penalties",
  "Handicap",
];

/** One row of the window-against-career table, pre-formatted. */
export interface StatRow {
  group: StatGroup;
  label: string;
  recent: string;
  career: string;
  /** What exactly was counted, and from which ledger. */
  note: string;
}

/** One card of the window, with what each ledger says about it. */
export interface RoundLine {
  round: PlayedRound;
  /** The watch's scorecard, where a human-confirmed link exists. */
  scorecardId: string | null;
  /** AutoShot shots on that scorecard; null when the watch has no card. */
  shotsHeard: number | null;
  /** Card strokes against the watch's pars, over every hole that has both;
   *  null unless every played hole does. */
  overPar: number | null;
  /** Holes at double bogey or worse, same join. */
  doublesOrWorse: number | null;
  worstHole: { hole: number; strokes: number; par: number } | null;
  onePutts: number | null;
  threePutts: number | null;
  /** Grint's own fairway codes; null when the card carries none. */
  fairways: { hit: number; left: number; right: number; missed: number; classified: number } | null;
  /** The penalty row, summed; null when the card has no row. */
  penaltyStrokes: number | null;
  bunkerShots: number | null;
}

export interface RecentRounds {
  /** The newest card — the window is measured from here. */
  asOf: string;
  /** The oldest card in the window. */
  from: string;
  count: number;
  /** Ascending by date. */
  rounds: RoundLine[];
  /** Cards in the window the watch heard through a confirmed link. */
  heard: number;
  /** Whether Grint's GIR chart's last `count` course names equal the window's
   *  cards in order — a statement about the two arrays, not a join. Null
   *  without the chart. */
  chartNamesMatch: boolean | null;
  scoring: {
    mean: number;
    best: RoundLine;
    worst: RoundLine;
    careerMean: number | null;
    careerN: number;
  };
  rows: StatRow[];
  /** The window's story, one sentence per ledger, numbers in every one.
   *  A read that needs a number the record lacks is not emitted. */
  reads: string[];
}

export interface RecentRoundsInput {
  roundHistory: RoundHistory | null;
  garminShots: GarminShots | null;
  /** scorecardId → the Grint card, confirmed links only. */
  linked: Map<string, PlayedRound>;
  count?: number;
}

/* ── helpers ──────────────────────────────────────────────────────────── */

const f1 = (x: number) => x.toFixed(1);
const signed = (x: number) => (x > 0 ? `+${f1(x)}` : f1(x));
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((100 * num) / den)}%` : "—");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byDate = (a: PlayedRound, b: PlayedRound) => a.date.localeCompare(b.date);

/** Putt counts per hole over the cards that carry them. */
function puttCounts(rounds: PlayedRound[]): { rounds: number; holes: number; ones: number; threes: number } {
  const out = { rounds: 0, holes: 0, ones: 0, threes: 0 };
  for (const r of rounds) {
    if (r.holePutts === null) continue;
    let any = false;
    for (const p of r.holePutts) {
      if (p === null) continue;
      any = true;
      out.holes += 1;
      if (p === 1) out.ones += 1;
      if (p >= 3) out.threes += 1;
    }
    if (any) out.rounds += 1;
  }
  return out;
}

/** Net strokes over par per scorecard, over the holes that have both a par
 *  and a stroke count — null for a round where any played hole lacks one. */
function netOverPar(views: HoleView[]): Map<string, number | null> {
  const acc = new Map<string, { over: number; usable: number; played: number }>();
  for (const v of views) {
    const id = v.round.scorecardId;
    const a = acc.get(id) ?? { over: 0, usable: 0, played: 0 };
    if (v.strokes !== null) a.played += 1;
    if (v.par !== null && v.strokes !== null) {
      a.usable += 1;
      a.over += v.strokes - v.par;
    }
    acc.set(id, a);
  }
  const out = new Map<string, number | null>();
  for (const [id, a] of acc) out.set(id, a.usable > 0 && a.usable === a.played ? a.over : null);
  return out;
}

function parScoring(views: HoleView[], par: number): { holes: number; over: number | null } {
  const v = views.filter((x) => x.par === par && x.strokes !== null);
  return {
    holes: v.length,
    over: v.length ? v.reduce((a, x) => a + ((x.strokes as number) - par), 0) / v.length : null,
  };
}

function lineOf(
  r: PlayedRound,
  g: GarminRound | null,
  scorecardId: string | null,
  overPar: number | null,
): RoundLine {
  let doubles: number | null = null;
  let worst: RoundLine["worstHole"] = null;
  let worstOver = -Infinity;
  if (g !== null && r.holeStrokes !== null) {
    doubles = 0;
    for (const h of g.holes) {
      const s = r.holeStrokes[h.number - 1] ?? null;
      if (h.par === null || s === null) continue;
      const o = s - h.par;
      if (o >= 2) doubles += 1;
      if (o > worstOver) {
        worstOver = o;
        worst = { hole: h.number, strokes: s, par: h.par };
      }
    }
  }
  const pc = puttCounts([r]);
  const fw = fairwaySplit([r]);
  const pen = roundPenalties(r);
  return {
    round: r,
    scorecardId,
    shotsHeard: g === null ? null : g.shotCount,
    overPar,
    doublesOrWorse: doubles,
    worstHole: worst,
    onePutts: pc.rounds ? pc.ones : null,
    threePutts: pc.rounds ? pc.threes : null,
    fairways:
      fw.classified + fw.unclassified > 0
        ? { hit: fw.hit, left: fw.left, right: fw.right, missed: fw.missed, classified: fw.classified }
        : null,
    penaltyStrokes: pen === null ? null : pen.penaltyStrokes,
    bunkerShots: pen === null ? null : pen.bunkerShots,
  };
}

/* ── the object ───────────────────────────────────────────────────────── */

export function buildRecentRounds({
  roundHistory: h,
  garminShots: g,
  linked,
  count = RECENT_ROUNDS.count,
}: RecentRoundsInput): RecentRounds | null {
  if (h === null) return null;
  const career = distinctRounds(h.rounds)
    .filter((r) => r.holes === 18 && r.strokes !== null)
    .sort(byDate);
  const window = career.slice(-count);
  if (window.length < RECENT_ROUNDS.min) return null;
  const asOf = window[window.length - 1].date;
  const from = window[0].date;

  /* The join: card → watch scorecard, confirmed links only. */
  const scorecardByRound = new Map<string, string>();
  for (const [sid, r] of linked) scorecardByRound.set(r.roundId, sid);
  const garminById = new Map((g?.rounds ?? []).map((r) => [r.scorecardId, r]));

  const views = holeViews(g, linked);
  const overByCard = netOverPar(views);
  const rounds = window.map((r) => {
    const sid = scorecardByRound.get(r.roundId) ?? null;
    const gr = sid === null ? null : (garminById.get(sid) ?? null);
    return lineOf(r, gr, sid, sid === null ? null : (overByCard.get(sid) ?? null));
  });
  const windowCards = new Set(rounds.flatMap((l) => (l.scorecardId === null ? [] : [l.scorecardId])));
  const heard = rounds.filter((l) => l.shotsHeard !== null && l.shotsHeard > 0).length;
  const wViews = views.filter((v) => windowCards.has(v.round.scorecardId));

  const rows: StatRow[] = [];
  const row = (group: StatGroup, label: string, recent: string, careerStr: string, note: string) =>
    rows.push({ group, label, recent, career: careerStr, note });
  const reads: string[] = [];

  // ── scoring ──────────────────────────────────────────────────────────────
  const strokes = window.map((r) => r.strokes as number);
  const careerStrokes = career.map((r) => r.strokes as number);
  const sm = mean(strokes) as number;
  const cm = mean(careerStrokes);
  const best = rounds.reduce((a, b) => ((b.round.strokes as number) < (a.round.strokes as number) ? b : a));
  const worst = rounds.reduce((a, b) => ((b.round.strokes as number) > (a.round.strokes as number) ? b : a));
  const u90 = strokes.filter((s) => s < 90).length;
  const u80 = strokes.filter((s) => s < 80).length;
  const cu90 = careerStrokes.filter((s) => s < 90).length;
  const cu80 = careerStrokes.filter((s) => s < 80).length;
  row(
    "Scoring",
    "Strokes",
    `${f1(sm)} (${plural(window.length, "round")})`,
    `${cm === null ? "—" : f1(cm)} (${plural(career.length, "round")})`,
    "mean over distinct 18-hole cards; a quick-entry echo of a card on file is not counted twice",
  );
  row(
    "Scoring",
    "Best / worst",
    `${best.round.strokes} / ${worst.round.strokes}`,
    `${Math.min(...careerStrokes)} / ${Math.max(...careerStrokes)}`,
    "",
  );
  row(
    "Scoring",
    "Cards under 90 / under 80",
    `${u90} / ${u80} of ${window.length}`,
    `${cu90} / ${cu80} of ${career.length}`,
    "",
  );
  reads.push(
    `${plural(window.length, "card")} from ${from} to ${asOf}: ${f1(sm)} a round, from ${best.round.strokes} at ` +
      `${best.round.courseName ?? "—"} to ${worst.round.strokes} at ${worst.round.courseName ?? "—"}; ` +
      `${u90} of the ${window.length} under 90, ${u80} under 80. The career runs ${cm === null ? "—" : f1(cm)}.`,
  );

  const overLines = rounds.filter((l) => l.overPar !== null);
  const careerOver = [...overByCard.values()].filter((v): v is number => v !== null);
  if (overLines.length > 0) {
    const om = mean(overLines.map((l) => l.overPar as number)) as number;
    const cmo = mean(careerOver);
    row(
      "Scoring",
      "Over par",
      `${signed(om)} (${plural(overLines.length, "round")} the watch heard)`,
      `${cmo === null ? "—" : signed(cmo)} (${plural(careerOver.length, "round")})`,
      "card strokes against the watch's pars, on confirmed links only",
    );
  }
  const dW = doublesPerRound(wViews);
  const dC = doublesPerRound(views);
  if (dW.rounds > 0 && dW.perRound !== null) {
    row(
      "Scoring",
      "Double bogey or worse",
      `${f1(dW.perRound)} a round (${plural(dW.rounds, "round")} heard)`,
      `${dC.perRound === null ? "—" : f1(dC.perRound)} a round (${plural(dC.rounds, "round")})`,
      "holes two or more over the watch's par",
    );
    row(
      "Scoring",
      "Over-par strokes those holes carry",
      pct(dW.overFromDoubles, dW.over),
      pct(dC.overFromDoubles, dC.over),
      "of every stroke dropped over par on an over-par hole",
    );
    const share = dW.over > 0 ? dW.overFromDoubles / dW.over : 0;
    reads.push(
      `Double bogey or worse ${f1(dW.perRound)} times a round on the ${plural(dW.rounds, "round")} the watch heard, ` +
        `carrying ${pct(dW.overFromDoubles, dW.over)} of the strokes dropped over par` +
        (share >= RECENT_ROUNDS.doublesShare
          ? " — the score is made on the blow-up holes, not on the bogeys."
          : "."),
    );
  }
  const p3 = parScoring(wViews, 3);
  const p4 = parScoring(wViews, 4);
  const p5 = parScoring(wViews, 5);
  if (p3.over !== null || p4.over !== null || p5.over !== null) {
    const c3 = parScoring(views, 3);
    const c4 = parScoring(views, 4);
    const c5 = parScoring(views, 5);
    const trio = (a: typeof p3, b: typeof p4, c: typeof p5) =>
      `${a.over === null ? "—" : signed(a.over)} / ${b.over === null ? "—" : signed(b.over)} / ` +
      `${c.over === null ? "—" : signed(c.over)} (${a.holes + b.holes + c.holes} holes)`;
    row("Scoring", "Par 3 / 4 / 5, over par", trio(p3, p4, p5), trio(c3, c4, c5), "mean strokes over par by hole par, same join");
  }

  // ── off the tee ──────────────────────────────────────────────────────────
  const fw = fairwaySplit(window);
  const fwC = fairwaySplit(career);
  if (fw.classified > 0) {
    row(
      "Off the tee",
      "Fairways hit",
      `${pct(fw.hit, fw.classified)} (${fw.hit} of ${plural(fw.classified, "hole")})`,
      `${pct(fwC.hit, fwC.classified)} (${fwC.hit} of ${plural(fwC.classified, "hole")})`,
      "Grint's own codes — hit, left, right, missed; a code outside its legend is carried as unclassified, never read as a miss",
    );
    const sided = fw.left + fw.right;
    const lean =
      sided > 0 && fw.left / sided >= RECENT_ROUNDS.leanShare
        ? "left"
        : sided > 0 && fw.right / sided >= RECENT_ROUNDS.leanShare
          ? "right"
          : null;
    row(
      "Off the tee",
      "Misses left / right / unspecified",
      `${fw.left} / ${fw.right} / ${fw.missed}`,
      `${fwC.left} / ${fwC.right} / ${fwC.missed}`,
      lean === null ? "two-way" : `leans ${lean}`,
    );
    reads.push(
      `Fairways ${pct(fw.hit, fw.classified)} (${fw.hit} of ${fw.classified} classified holes; career ${pct(fwC.hit, fwC.classified)}): ` +
        `${fw.left} missed left, ${fw.right} right, ${fw.missed} unspecified — ` +
        (lean === null
          ? "a two-way miss, which aiming off cannot fix."
          : `the miss leans ${lean}, so there is a side to aim away from.`),
    );
  }
  const fwChart = h.series?.fairwayHitPct;
  if (fwChart && fwChart.length > 0) {
    const last = fwChart.slice(-count);
    row(
      "Off the tee",
      "Fairways hit, Grint's chart",
      `${f1(mean(last.map((p) => p.value)) as number)}% (last ${last.length} charted)`,
      `${f1(mean(fwChart.map((p) => p.value)) as number)}% (${fwChart.length} charted)`,
      "Grint's own per-round figure, sliced by position — its denominator is Grint's, not the codes'",
    );
  }
  const tW = troublesomeTees(wViews);
  const tC = troublesomeTees(views);
  if (tW.teeShots > 0 && tW.perRound !== null) {
    row(
      "Off the tee",
      "Troublesome tee balls",
      `${f1(tW.perRound)} a round (${tW.troublesome} of ${tW.teeShots} par-4/5 tee shots, ${plural(tW.rounds, "round")})`,
      `${tC.perRound === null ? "—" : f1(tC.perRound)} a round (${tC.troublesome} of ${tC.teeShots}, ${plural(tC.rounds, "round")})`,
      "a driver, wood or hybrid under 170 yd, a tee ball into a bunker, or a recovery shot next",
    );
    if (tW.overOnTrouble !== null && tW.overOnRest !== null) {
      row(
        "Off the tee",
        "What one costs",
        `${signed(tW.overOnTrouble)} on those holes vs ${signed(tW.overOnRest)} on the rest`,
        tC.overOnTrouble !== null && tC.overOnRest !== null
          ? `${signed(tC.overOnTrouble)} vs ${signed(tC.overOnRest)}`
          : "—",
        "mean strokes over par",
      );
      reads.push(
        `${f1(tW.perRound)} troublesome tee balls a round on the watch's ${plural(tW.rounds, "round")} — a mishit wood, a bunker, ` +
          `or a punch-out next — and those holes went ${signed(tW.overOnTrouble)} against ${signed(tW.overOnRest)} on the rest.`,
      );
    }
  }

  // ── into the green ───────────────────────────────────────────────────────
  const gir = h.series?.girPerRound;
  let chartNamesMatch: boolean | null = null;
  let girLast: number | null = null;
  if (gir && gir.length > 0) {
    const last = gir.slice(-count);
    girLast = mean(last.map((p) => p.value));
    const girAll = mean(gir.map((p) => p.value)) as number;
    chartNamesMatch =
      last.length === window.length &&
      last.every((p, i) => (p.courseName ?? null) === (window[i].courseName ?? null));
    row(
      "Into the green",
      "Greens in regulation",
      `${f1(girLast as number)} a round (last ${last.length} charted)`,
      `${f1(girAll)} a round (${gir.length} charted)`,
      "Grint's own chart, sliced by position and never joined to the cards",
    );
  }
  const p3Chart = h.series?.par3HitPct;
  if (p3Chart && p3Chart.length > 0) {
    const last = p3Chart.slice(-count);
    row(
      "Into the green",
      "Par-3 greens hit",
      `${f1(mean(last.map((p) => p.value)) as number)}% (last ${last.length} charted)`,
      `${f1(mean(p3Chart.map((p) => p.value)) as number)}% (${p3Chart.length} charted)`,
      "Grint's chart, same slice",
    );
  }
  const aW = approachMisses(wViews);
  const aC = approachMisses(views);
  if (aW.attempts > 0) {
    row(
      "Into the green",
      "Approaches 50–200 yd on the green",
      `${pct(aW.onGreen, aW.attempts)} (${plural(aW.attempts, "approach", "approaches")})`,
      `${pct(aC.onGreen, aC.attempts)} (${plural(aC.attempts, "approach", "approaches")})`,
      "the watch: a shot started 50–200 yd from the pin, a par-3 tee shot included, that ended on the green",
    );
    row(
      "Into the green",
      "Misses short / long / lateral",
      `${aW.short} / ${aW.long} / ${aW.lateral}`,
      `${aC.short} / ${aC.long} / ${aC.lateral}`,
      `${aW.snapped} unclassifiable (the shot's end is the pin itself); ${aW.intoBunker} into a bunker`,
    );
    if (aW.from125to200.attempts > 0) {
      row(
        "Into the green",
        "From 125–200 yd",
        `${pct(aW.from125to200.onGreen, aW.from125to200.attempts)} on (${aW.from125to200.attempts})`,
        `${pct(aC.from125to200.onGreen, aC.from125to200.attempts)} on (${aC.from125to200.attempts})`,
        "",
      );
    }
    const classified = aW.short + aW.long + aW.lateral;
    reads.push(
      (girLast === null ? "" : `${f1(girLast)} greens a round on Grint's last ${Math.min(count, gir?.length ?? 0)} charted rounds. `) +
        `The watch saw ${aW.onGreen} of ${aW.attempts} approaches from 50–200 yd finish on the green (${pct(aW.onGreen, aW.attempts)})` +
        (classified > 0
          ? `; of the ${classified} misses it could place, ${pct(aW.short, classified)} were short.`
          : "."),
    );
  }

  // ── around the green ─────────────────────────────────────────────────────
  const uW = upAndDowns(wViews);
  const uC = upAndDowns(views);
  const cW = chips(wViews);
  const cC = chips(views);
  if (uW.chances > 0) {
    row(
      "Around the green",
      "Up and down",
      `${uW.made} of ${uW.chances} (${pct(uW.made, uW.chances)})`,
      `${uC.made} of ${uC.chances} (${pct(uC.made, uC.chances)})`,
      "the last heard shot started inside 50 yd off the green and reached it; made = one putt or none on the card",
    );
  }
  if (cW.chips > 0) {
    row(
      "Around the green",
      "Chips reaching the green",
      `${pct(cW.reachedGreen, cW.chips)} (${plural(cW.chips, "chip")})`,
      `${pct(cC.reachedGreen, cC.chips)} (${plural(cC.chips, "chip")})`,
      "every shot started inside 50 yd from off the green",
    );
    if (cW.medianLeaveYd !== null) {
      row(
        "Around the green",
        "Chip leave",
        `median ${f1(cW.medianLeaveYd)} yd · ${cW.insideSixFt} of ${cW.measured} inside 6 ft`,
        cC.medianLeaveYd === null
          ? "—"
          : `median ${f1(cC.medianLeaveYd)} yd · ${cC.insideSixFt} of ${cC.measured} inside 6 ft`,
        `${cW.pinSnapped} leaves unmeasurable (ended on the pin)`,
      );
    }
  }
  if (uW.chances > 0 || cW.medianLeaveYd !== null) {
    reads.push(
      (uW.chances > 0 ? `Up and down ${uW.made} of ${uW.chances} (${pct(uW.made, uW.chances)}) when the last shot started inside 50 yd` : "") +
        (uW.chances > 0 && cW.medianLeaveYd !== null ? "; " : "") +
        (cW.medianLeaveYd !== null
          ? `chips that reach the green stop a median ${f1(cW.medianLeaveYd)} yd from the hole, ${cW.insideSixFt} of ${cW.measured} inside 6 ft`
          : "") +
        ".",
    );
  }

  // ── on the green ─────────────────────────────────────────────────────────
  const withPutts = window.filter((r) => r.putts !== null);
  const cWithPutts = career.filter((r) => r.putts !== null);
  const pm = mean(withPutts.map((r) => r.putts as number));
  const cpm = mean(cWithPutts.map((r) => r.putts as number));
  if (pm !== null) {
    row(
      "On the green",
      "Putts",
      `${f1(pm)} a round (${plural(withPutts.length, "round")})`,
      `${cpm === null ? "—" : f1(cpm)} a round (${plural(cWithPutts.length, "round")})`,
      "the card's total",
    );
  }
  const pc = puttCounts(window);
  const cpc = puttCounts(career);
  const tp = threePuttShare(window);
  const ctp = threePuttShare(career);
  if (pc.rounds > 0) {
    row(
      "On the green",
      "One-putts",
      `${f1(pc.ones / pc.rounds)} a round (${plural(pc.rounds, "card")})`,
      cpc.rounds ? `${f1(cpc.ones / cpc.rounds)} a round (${plural(cpc.rounds, "card")})` : "—",
      "holes with exactly one putt on the card",
    );
    row(
      "On the green",
      "Three-putts",
      `${f1(pc.threes / pc.rounds)} a round · ${pct(tp.threePutts, tp.holes)} of ${plural(tp.holes, "hole")}`,
      cpc.rounds
        ? `${f1(cpc.threes / cpc.rounds)} a round · ${pct(ctp.threePutts, ctp.holes)} of ${plural(ctp.holes, "hole")}`
        : "—",
      "holes with three or more putts",
    );
    if (pm !== null) {
      reads.push(
        `${f1(pm)} putts a round (career ${cpm === null ? "—" : f1(cpm)}): ${f1(pc.threes / pc.rounds)} three-putts a round, ` +
          `${pct(tp.threePutts, tp.holes)} of holes, against ${f1(pc.ones / pc.rounds)} one-putts.`,
      );
    }
  }

  // ── penalties ────────────────────────────────────────────────────────────
  const pen = penaltyTally(window);
  const cpen = penaltyTally(career);
  if (pen.cards > 0) {
    const perCard = (n: number, cards: number) => (cards > 0 ? f1(n / cards) : "—");
    row(
      "Penalties",
      "Penalty strokes",
      `${perCard(pen.penaltyStrokes, pen.cards)} a card (${plural(pen.cards, "card")})`,
      `${perCard(cpen.penaltyStrokes, cpen.cards)} a card (${plural(cpen.cards, "card")})`,
      "W, D and O on the penalty row; a blank cell counts as clean, so a floor",
    );
    row(
      "Penalties",
      "By type: drop / penalty area / OB",
      `${pen.byCode.D} / ${pen.byCode.W} / ${pen.byCode.O}`,
      `${cpen.byCode.D} / ${cpen.byCode.W} / ${cpen.byCode.O}`,
      pen.unknown > 0 ? `${pen.unknown} letters outside Grint's legend, carried and not read` : "",
    );
    row(
      "Penalties",
      "Bunker shots",
      `${perCard(pen.bunkerShots, pen.cards)} a card · ${pen.byCode.S} greenside, ${pen.byCode.F} fairway`,
      `${perCard(cpen.bunkerShots, cpen.cards)} a card · ${cpen.byCode.S} greenside, ${cpen.byCode.F} fairway`,
      "S and F on the row — a lie, not a penalty stroke; same floor",
    );
    row(
      "Penalties",
      "Cards with a blank row",
      `${pen.cards - pen.cardsMarked} of ${pen.cards}`,
      `${cpen.cards - cpen.cardsMarked} of ${cpen.cards}`,
      "clean, or never filled in — the record cannot tell which",
    );
    reads.push(
      `${perCard(pen.penaltyStrokes, pen.cards)} penalty strokes a card on the row — ${pen.byCode.D} drops, ${pen.byCode.W} penalty areas, ` +
        `${pen.byCode.O} out of bounds — and ${perCard(pen.bunkerShots, pen.cards)} bunker shots a card; ` +
        `${pen.cards - pen.cardsMarked} of ${pen.cards} cards blank throughout. Career: ${perCard(cpen.penaltyStrokes, cpen.cards)} and ` +
        `${perCard(cpen.bunkerShots, cpen.cards)} a card. A blank cell is Grint's "not counted", so every one of these is a floor.`,
    );
  }

  // ── handicap ─────────────────────────────────────────────────────────────
  const tail = differentialTail(h, count);
  if (tail !== null) {
    const all = h.differentials;
    const allMean = mean(all.map((p) => p.differential)) as number;
    const first = all[0]?.trendingHdcp ?? null;
    const end = all[all.length - 1]?.trendingHdcp ?? null;
    row(
      "Handicap",
      "Differential",
      `${f1(tail.mean)} (last ${tail.points} charted)`,
      `${f1(allMean)} (${all.length} charted)`,
      "Grint's handicap chart, sliced by position",
    );
    if (tail.trendingStart !== null && tail.trendingEnd !== null) {
      row(
        "Handicap",
        "Trending handicap",
        `${f1(tail.trendingStart)} → ${f1(tail.trendingEnd)}`,
        first !== null && end !== null ? `${f1(first)} → ${f1(end)}` : "—",
        "where the chart's trending line stood at the slice's first and last point",
      );
      reads.push(
        `The chart's last ${tail.points} differentials average ${f1(tail.mean)} (career ${f1(allMean)}) and moved the trending ` +
          `handicap from ${f1(tail.trendingStart)} to ${f1(tail.trendingEnd)}.`,
      );
    }
  }

  return {
    asOf,
    from,
    count: window.length,
    rounds,
    heard,
    chartNamesMatch,
    scoring: { mean: sm, best, worst, careerMean: cm, careerN: career.length },
    rows,
    reads,
  };
}
