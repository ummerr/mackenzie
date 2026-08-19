import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { deriveAdditions, slugify, splitCourseName } from "../scripts/rounds-to-spine.mjs";

/* The paste-less path onto the map: a course in the round record but not in
 * the spine is appended with only what the record can honestly say — verbatim
 * name, a count of real rounds, null for everything the paste alone knows
 * (rank, ratings, locality). Slug rules must match parse-grint.mjs exactly,
 * or the same place arrives twice under two slugs. */

function round(courseName: string, over: Record<string, unknown> = {}) {
  return { roundId: "1", courseName, courseGrintId: null, ...over };
}

function layout(slug: string, facilitySlug = slug) {
  return { slug, facilitySlug, personalRank: 1 };
}

function facility(slug: string, over: Record<string, unknown> = {}) {
  return { slug, grintName: slug, layoutSlugs: [slug], aliases: [], ...over };
}

describe("slugify", () => {
  it("matches the paste adapter's rules", () => {
    expect(slugify("Ke'olu")).toBe("keolu");
    expect(slugify("Waikoloa Beach & Kings'")).toBe("waikoloa-beach-and-kings");
    expect(slugify("Bennett Valley Golf Course")).toBe("bennett-valley-golf-course");
  });
});

describe("splitCourseName", () => {
  it("splits layout | facility on the first pipe", () => {
    expect(splitCourseName("Battlefield | Legends On The Niagara Golf Club")).toEqual({
      layout: "Battlefield",
      facility: "Legends On The Niagara Golf Club",
    });
  });
  it("treats an unpiped name as facility only", () => {
    expect(splitCourseName("Brambles Golf")).toEqual({ layout: null, facility: "Brambles Golf" });
  });
});

describe("deriveAdditions", () => {
  it("appends a course the spine has never seen, counting its real rounds", () => {
    const rounds = [
      round("Bennett Valley Golf Course", { roundId: "1" }),
      round("Bennett Valley Golf Course", { roundId: "2", courseGrintId: "43725" }),
    ];
    const add = deriveAdditions(rounds, [layout("elsewhere")], [facility("elsewhere")]);

    expect(add.layouts).toHaveLength(1);
    expect(add.facilities).toHaveLength(1);
    const l = add.layouts[0];
    expect(l.slug).toBe("bennett-valley-golf-course");
    expect(l.timesPlayed).toBe(2);
    expect(l.grintCourseId).toBe("43725");
    expect(l.personalRank).toBeNull();
    expect(l.avgScore).toBeNull();
    expect(l.ratings).toEqual({ overall: null, fun: null, condition: null });
    expect(l.flags).toEqual(["rounds_only"]);
    expect(add.facilities[0]).toMatchObject({
      slug: "bennett-valley-golf-course",
      grintName: "Bennett Valley Golf Course",
      locality: null,
      region: null,
      country: null,
      layoutSlugs: ["bennett-valley-golf-course"],
      origin: "rounds",
    });
  });

  it("adds nothing when the spine already covers the record", () => {
    const add = deriveAdditions(
      [round("Bennett Valley Golf Course")],
      [layout("bennett-valley-golf-course")],
      [facility("bennett-valley-golf-course")],
    );
    expect(add.layouts).toHaveLength(0);
    expect(add.facilities).toHaveLength(0);
  });

  it("is idempotent: re-deriving after an append adds nothing", () => {
    const rounds = [round("Bennett Valley Golf Course")];
    const layouts = [layout("elsewhere")];
    const facilities = [facility("elsewhere")];
    const first = deriveAdditions(rounds, layouts, facilities);
    layouts.push(...first.layouts);
    facilities.push(...first.facilities);
    const second = deriveAdditions(rounds, layouts, facilities);
    expect(second.layouts).toHaveLength(0);
    expect(second.facilities).toHaveLength(0);
  });

  it("attaches a new layout to an existing facility instead of duplicating it", () => {
    const fac = facility("legends-on-the-niagara-golf-club", {
      layoutSlugs: ["legends-on-the-niagara-golf-club--battlefield"],
    });
    const add = deriveAdditions(
      [round("Ussher's Creek | Legends On The Niagara Golf Club")],
      [layout("legends-on-the-niagara-golf-club--battlefield", "legends-on-the-niagara-golf-club")],
      [fac],
    );
    expect(add.facilities).toHaveLength(0);
    expect(add.layouts).toHaveLength(1);
    expect(add.layouts[0].slug).toBe("legends-on-the-niagara-golf-club--usshers-creek");
    expect(fac.layoutSlugs).toContain("legends-on-the-niagara-golf-club--usshers-creek");
  });

  it("merges a renamed course into its facility as a new layout, keeping one pin", () => {
    // Brambles = the redesigned Hidden Valley Lake course. No pipe in the
    // round's name, so the layout needs its own slug or it would collide with
    // the layout already occupying the facility slug.
    const fac = facility("hidden-valley-lake-golf-and-country-club", {
      grintName: "Hidden Valley Lake Golf & Country Club",
      layoutSlugs: ["hidden-valley-lake-golf-and-country-club"],
    });
    const add = deriveAdditions(
      [round("Brambles Golf")],
      [layout("hidden-valley-lake-golf-and-country-club")],
      [fac],
    );
    expect(add.facilities).toHaveLength(0);
    expect(add.layouts).toHaveLength(1);
    expect(add.layouts[0].slug).toBe(
      "hidden-valley-lake-golf-and-country-club--brambles-golf",
    );
    expect(add.layouts[0].grintFacilityName).toBe("Brambles Golf");
    expect(fac.aliases).toContain("Brambles Golf");
  });

  it("routes aliased facility names to the canonical slug", () => {
    const fac = facility("sepulveda-golf-complex", { layoutSlugs: ["sepulveda-golf-complex"] });
    const add = deriveAdditions(
      [round("Encino | Sepulveda Golf Club")],
      [layout("sepulveda-golf-complex")],
      [fac],
    );
    expect(add.facilities).toHaveLength(0);
    expect(add.layouts[0].facilitySlug).toBe("sepulveda-golf-complex");
  });

  it("skips rounds with no course name rather than minting a blank facility", () => {
    const add = deriveAdditions([round(null as unknown as string)], [], []);
    expect(add.layouts).toHaveLength(0);
  });
});
