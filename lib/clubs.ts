/* The club vocabulary, once.
 *
 * Every club in this app is a bare string — the value the R50 wrote in its
 * `Club Type` column. That is deliberate and stays: the ledger must be able to
 * hold a club nobody owns, because an export is evidence and evidence is not
 * edited to match a bag. What this module adds is the two things a string
 * cannot carry: an order, and whatever is known about the physical club behind
 * the name.
 *
 * ── Two different axes, and they are not the same axis ──────────────────────
 *
 *   family()   the club's ROLE, read off its name. Which clubs start a hole,
 *              which finish one. Works for any name an export might contain,
 *              including clubs that are not in the bag.
 *
 *   headType   the club's PHYSICAL HEAD, asserted in data/bag.json. Only known
 *              for clubs actually owned.
 *
 * They disagree, and the disagreement is real rather than a bug: the Callaway
 * UW is keyed `"3 Hybrid"` because that is the slot the R50 logs it in, so its
 * family is "rescue" while its headType is "wood". Role grouping asks the
 * name; loft comparison asks the head.
 *
 * ── Bag order is asserted, not derived from loft ────────────────────────────
 *
 * It would be tempting to sort BAG_ORDER by the lofts in bag.json now that
 * they exist. Two reasons not to. It has to order clubs nobody owns and has no
 * loft for; and in this bag it could not do the job anyway — the 3 iron and the
 * utility wood are both 19 degrees, so loft does not even totally order the bag
 * it describes. Loft cross-checks this order. It does not define it.
 */

// ── the names ───────────────────────────────────────────────────────────────

/* Loft order, longest first. Gap flags compare clubs that are adjacent *here*,
 * not adjacent by measured carry — the question is "what do I reach for next",
 * and a club that carries out of loft order is the finding, not the sort key. */
export const BAG_ORDER: readonly string[] = [
  "Driver",
  "3 Wood", "4 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron",
  "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Putter",
];

const BAG_INDEX = new Map(BAG_ORDER.map((c, i) => [c, i]));

/** Unknown clubs sort to the end, in name order, rather than throwing. */
export function bagRank(club: string): number {
  return BAG_INDEX.get(club) ?? BAG_ORDER.length;
}

export function sortByBag<T extends { club: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => bagRank(a.club) - bagRank(b.club) || a.club.localeCompare(b.club),
  );
}

/** The abbreviation, for column headings and chart labels. */
export function short(club: string): string {
  return club
    .replace("Pitching Wedge", "PW")
    .replace("Gap Wedge", "GW")
    .replace("Sand Wedge", "SW")
    .replace("Lob Wedge", "LW")
    .replace(" Iron", "i")
    .replace(" Hybrid", "H")
    .replace(" Wood", "W");
}

// ── families, read off the name ─────────────────────────────────────────────

export type Family = "tee" | "rescue" | "long-iron" | "iron" | "wedge" | "putter" | "unknown";

const LONG_IRON_NUMBERS = new Set(["1", "2", "3", "4"]);

/**
 * The club's role, from its name alone.
 *
 * Name-driven rather than table-driven so that a club the bag has never heard
 * of still lands somewhere sensible — an export naming a "2 Wood" is a tee club
 * whether or not anybody owns one.
 */
export function family(club: string): Family {
  if (club === "Driver" || club.endsWith(" Wood")) return "tee";
  if (club.endsWith(" Hybrid")) return "rescue";
  if (club.endsWith(" Iron")) {
    return LONG_IRON_NUMBERS.has(club.split(" ")[0]) ? "long-iron" : "iron";
  }
  if (club.endsWith(" Wedge")) return "wedge";
  if (club === "Putter") return "putter";
  return "unknown";
}

/* The clubs that decide where the next shot is played from, versus the clubs
 * that play it. A range export has no putter and never will, so it is not in
 * either list — see profile.ts `unknowns`. */
const STARTS_A_HOLE: readonly Family[] = ["tee", "rescue", "long-iron"];

export function startsAHole(club: string): boolean {
  return STARTS_A_HOLE.includes(family(club));
}

/** Clubs that get `wedgePartialCarryRatio` instead of `reviewCarryRatio`. */
export const WEDGE_CLUBS: readonly string[] = BAG_ORDER.filter((c) => family(c) === "wedge");

// ── the bag itself ──────────────────────────────────────────────────────────

export type HeadType = "wood" | "iron" | "wedge" | "putter";
export type ClaimConfidence = "high" | "medium" | "low";

/**
 * One asserted number with its provenance, in the same shape as the map's
 * `data/facts.json`.
 *
 * Loft gets this treatment and brand, model, shaft and grip do not, because
 * loft is the field that can be wrong while you are looking straight at it. A
 * driver's sleeve is adjustable, an iron bends a degree in a bag, and a wedge
 * is ground to order. Everything below is what the club left the factory as.
 */
export interface LoftClaim {
  value: number;
  source: string;
  confidence: ClaimConfidence;
  /** ISO date the claim was entered or last re-read. */
  checked: string;
  /** True only once a loft gauge or a human has confirmed it on THIS club. */
  verified: boolean;
  note?: string;
}

export interface BagClub {
  /** The R50 `Club Type` string. Always a member of BAG_ORDER. */
  club: string;
  brand?: string;
  model?: string;
  headType: HeadType;
  shaft?: string;
  grip?: string;
  /** Absent when the loft is genuinely unknown. Never guessed. */
  loftDeg?: LoftClaim;
  note?: string;
}

export interface BagSpec {
  /** In bag order. */
  clubs: BagClub[];
  /** Keys in the file that match nothing in BAG_ORDER. Reported, never dropped silently. */
  orphans: string[];
}

const HEAD_TYPES = new Set<string>(["wood", "iron", "wedge", "putter"]);

/**
 * Read `data/bag.json`. Pure — the caller does the filesystem, the same way
 * `app/page.tsx` loads the ledger and `course-history.ts` takes its snapshot
 * already parsed.
 *
 * An unrecognised key is returned as an orphan rather than thrown on, matching
 * how `ledger.ts` treats an exclusions override that matches no shot: a typo
 * surfaces on the next run instead of silently doing nothing, and one bad key
 * does not cost you the other twelve clubs.
 */
export function parseBag(raw: unknown): BagSpec {
  const clubsRaw = (raw as { clubs?: Record<string, unknown> } | null)?.clubs;
  if (!clubsRaw || typeof clubsRaw !== "object") return { clubs: [], orphans: [] };

  const clubs: BagClub[] = [];
  const orphans: string[] = [];

  for (const [club, value] of Object.entries(clubsRaw)) {
    if (!BAG_INDEX.has(club)) {
      orphans.push(club);
      continue;
    }
    const v = value as Record<string, unknown>;
    const headType = typeof v.headType === "string" && HEAD_TYPES.has(v.headType)
      ? (v.headType as HeadType)
      : inferHeadType(club);

    clubs.push({
      club,
      headType,
      ...str(v, "brand"),
      ...str(v, "model"),
      ...str(v, "shaft"),
      ...str(v, "grip"),
      ...str(v, "note"),
      ...loft(v.loftDeg),
    });
  }

  return { clubs: sortByBag(clubs), orphans };
}

/** Only for a club whose file entry omits headType; the name is the fallback. */
function inferHeadType(club: string): HeadType {
  const f = family(club);
  if (f === "tee" || f === "rescue") return "wood";
  if (f === "wedge") return "wedge";
  if (f === "putter") return "putter";
  return "iron";
}

function str(v: Record<string, unknown>, key: string): Record<string, string> {
  const raw = v[key];
  return typeof raw === "string" && raw !== "" ? { [key]: raw } : {};
}

function loft(raw: unknown): { loftDeg?: LoftClaim } {
  const l = raw as Record<string, unknown> | null | undefined;
  if (!l || typeof l !== "object" || typeof l.value !== "number") return {};
  return {
    loftDeg: {
      value: l.value,
      source: typeof l.source === "string" ? l.source : "",
      confidence: (l.confidence as ClaimConfidence) ?? "low",
      checked: typeof l.checked === "string" ? l.checked : "",
      verified: l.verified === true,
      ...(typeof l.note === "string" ? { note: l.note } : {}),
    },
  };
}

// ── reading the bag ─────────────────────────────────────────────────────────

/** The clubs owned, by name. */
export function ownedClubs(bag: BagSpec | null): Set<string> {
  return new Set((bag?.clubs ?? []).map((c) => c.club));
}

export function clubSpec(bag: BagSpec | null, club: string): BagClub | null {
  return bag?.clubs.find((c) => c.club === club) ?? null;
}

export function loftOf(bag: BagSpec | null, club: string): number | null {
  return clubSpec(bag, club)?.loftDeg?.value ?? null;
}

/**
 * Owned clubs sitting strictly between two others in bag order.
 *
 * The gap list is built over clubs that have been MEASURED, so two rows apart
 * on that table can be four clubs apart in the bag. A carry gap across the
 * skipped clubs is still a real gap — there is genuinely that much distance
 * between the two swings you have. A *loft* gap across them is not: the bag
 * does not have the driver and the 5 iron 13 degrees apart, it has three clubs
 * in between doing that work. Printing the number anyway would invite exactly
 * the wrong comparison.
 */
export function clubsBetween(bag: BagSpec | null, a: string, b: string): string[] {
  const lo = Math.min(bagRank(a), bagRank(b));
  const hi = Math.max(bagRank(a), bagRank(b));
  return (bag?.clubs ?? [])
    .map((c) => c.club)
    .filter((c) => bagRank(c) > lo && bagRank(c) < hi);
}

/**
 * Whether two clubs' lofts mean the same thing.
 *
 * Degrees are degrees, so the arithmetic is always valid — but 5 degrees
 * between two P790 irons and 5 degrees between a distance-iron pitching wedge
 * and a ground Vokey are not the same claim about the bag. Head type is the
 * honest divider, so the number is always computed and the interpretation is
 * flagged. Flags, never corrections.
 */
export function loftComparable(bag: BagSpec | null, a: string, b: string): boolean {
  const ha = clubSpec(bag, a)?.headType;
  const hb = clubSpec(bag, b)?.headType;
  return ha !== undefined && ha === hb;
}
