/* Provenance, said once — the one list every "read from" block renders.
 *
 * Order is a rule, not a favourite: longest record first. The scorecards
 * reach back five seasons; the course map is built from them; the range
 * ledger opened in July 2026; the watch has heard a handful of rounds. The
 * site once printed Range first because Range came first to the repo —
 * that is a fact about the repo, not about the golfer.
 *
 * A missing source keeps its row. Absence is a state every source can be in,
 * not a demotion — the row says what would fill it. */

import { totalRounds, type CourseHistory } from "./course-history";
import { shotRounds, type GarminShots } from "./garmin-shots";
import type { LedgerSession, LedgerShot } from "./ledger";
import type { RoundHistory } from "./round-history";

export type SourceId = "scorecards" | "map" | "range" | "watch";

export interface SourceRef {
  id: SourceId;
  label: string;
  detail: string;
  /** Null when the artifact exists; the command that builds it when not. */
  missing: string | null;
}

/* Every field is optional so a page can build only the rows it reads —
 * filter the result by id; a source the page never touches just goes
 * unrendered rather than falsely reported missing. */
export function buildSources({
  shots = [],
  sessions = [],
  history = null,
  roundHistory = null,
  garminShots = null,
}: {
  shots?: LedgerShot[];
  sessions?: LedgerSession[];
  history?: CourseHistory | null;
  roundHistory?: RoundHistory | null;
  garminShots?: GarminShots | null;
}): SourceRef[] {
  return [
    roundHistory
      ? {
          id: "scorecards",
          label: "Scorecards",
          detail:
            `${roundHistory.rounds.length} dated scorecards, ` +
            `${roundHistory.rounds[0]?.date} to ${roundHistory.rounds[roundHistory.rounds.length - 1]?.date}, ` +
            `from the Grint export bundle, captured ${roundHistory.capturedAt.slice(0, 10)}`,
          missing: null,
        }
      : {
          id: "scorecards",
          label: "Scorecards",
          detail: "no data/rounds.json — run `pnpm data:rounds`",
          missing: "pnpm data:rounds",
        },
    history
      ? {
          id: "map",
          label: "Courses",
          detail: `${totalRounds(history)} rounds over ${history.played.length} layouts, from The Grint, captured ${history.capturedAt}`,
          missing: null,
        }
      : {
          id: "map",
          label: "Courses",
          detail: "no public/data/courses.json — run `pnpm data:build`",
          missing: "pnpm data:build",
        },
    {
      id: "range",
      label: "Range",
      detail:
        `${shots.length} shots over ${sessions.length} Garmin R50 sessions` +
        (sessions.length > 0
          ? `, ${sessions[0].id.slice(0, 10)} to ${sessions[sessions.length - 1].id.slice(0, 10)}`
          : ""),
      missing: null,
    },
    garminShots
      ? {
          id: "watch",
          label: "Shots on course",
          detail:
            `${shotRounds(garminShots).reduce((a, r) => a + r.shotCount, 0)} AutoShot shots ` +
            `over ${shotRounds(garminShots).length} of ${garminShots.rounds.length} rounds ` +
            `(the rest are R50 simulator rounds, which carry no shots), from the Garmin ` +
            `export bundle, captured ${garminShots.capturedAt.slice(0, 10)}`,
          missing: null,
        }
      : {
          id: "watch",
          label: "Shots on course",
          detail: "no data/garmin-rounds.json — run `pnpm data:garmin`",
          missing: "pnpm data:garmin",
        },
  ];
}
