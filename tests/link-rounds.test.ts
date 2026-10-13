import { describe, expect, it } from "vitest";
import {
  AUTO_CONFIRM_BASIS,
  AUTO_CONFIRM_NOTE,
  needsHuman,
  proposeLink,
  // @ts-expect-error — plain .mjs script module, no type declarations
} from "../scripts/link-rounds.mjs";

/* The one machine-made join (DECISIONS.md 2026-10-12): a single candidate
 * that agrees on facility, date and strokes is confirmed; anything weaker is
 * proposed for a person; zero candidates is an open question re-asked on
 * every run. `needsHuman` is the shared definition of "waiting on a person"
 * used by refresh.mjs, validate.mjs and lib/data-status.ts. */

function garmin(over: Record<string, unknown> = {}) {
  return {
    scorecardId: "385587137",
    date: "2026-09-26",
    courseName: "Lincoln Park Golf Course ~ Blue",
    totals: { strokes: 77 },
    flags: [] as string[],
    ...over,
  };
}

function grint(over: Record<string, unknown> = {}) {
  return {
    roundId: "63717115",
    date: "2026-09-26",
    courseName: "Blue | Lincoln Park Golf Course",
    totals: { strokes: 77 },
    ...over,
  };
}

describe("proposeLink", () => {
  it("confirms one candidate that agrees on facility, date and strokes", () => {
    const link = proposeLink(garmin(), [grint()]);
    expect(link.status).toBe("confirmed");
    expect(link.roundId).toBe("63717115");
    expect(link.basis).toBe(AUTO_CONFIRM_BASIS);
    expect(link.note).toBe(AUTO_CONFIRM_NOTE);
    expect(needsHuman(link)).toBe(false);
  });

  it("leaves a strokes disagreement to a person", () => {
    const link = proposeLink(garmin(), [grint({ totals: { strokes: 78 } })]);
    expect(link.status).toBe("proposed");
    expect(link.roundId).toBe("63717115");
    expect(link.basis).toBe("same facility, same date");
    expect(link.note).toMatch(/strokes differ: Garmin 77, Grint 78/);
    expect(needsHuman(link)).toBe(true);
  });

  it("leaves two candidates to a person", () => {
    const link = proposeLink(garmin(), [grint(), grint({ roundId: "63717116" })]);
    expect(link.status).toBe("proposed");
    expect(link.roundId).toBeNull();
    expect(link.candidates).toHaveLength(2);
    expect(needsHuman(link)).toBe(true);
  });

  it("keeps a zero-candidate round proposed, not pending", () => {
    const link = proposeLink(garmin({ flags: ["simulation"] }), []);
    expect(link.status).toBe("proposed");
    expect(link.roundId).toBeNull();
    expect(link.candidates).toHaveLength(0);
    expect(link.note).toMatch(/simulator round is Garmin-only/);
    expect(needsHuman(link)).toBe(false);
  });

  it("does not confirm across a different facility or date", () => {
    expect(proposeLink(garmin(), [grint({ date: "2026-09-27" })]).candidates).toHaveLength(0);
    expect(
      proposeLink(garmin(), [grint({ courseName: "Blue | Presidio Golf Course" })]).candidates,
    ).toHaveLength(0);
  });

  it("widens the date by a day only for a UTC-flagged Garmin date", () => {
    const flagged = garmin({ date: "2026-09-27", flags: ["date_from_utc"] });
    expect(proposeLink(flagged, [grint()]).status).toBe("confirmed");
    expect(proposeLink(garmin({ date: "2026-09-27" }), [grint()]).candidates).toHaveLength(0);
  });
});
