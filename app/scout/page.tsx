import Link from "next/link";
import { loadHoleGeometry, loadLinks, loadScoutCourses } from "@/lib/load";
import { buildScoutCourse, roundsHere, scoutPlayer } from "@/lib/scout";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../provenance";

/* The scout's front door: every course that has a sourced notes file under
 * data/scout/, with what the record knows about it. One today; the list is
 * the shape the next one drops into. */

export const metadata = {
  title: "Scout — Mackenzie",
  description: "How to play each hole: the tee club, the side, the pin to refuse — from the course plan, the notes, and the record.",
};

export default function ScoutIndex() {
  const d = buildSiteData();
  const courses = loadScoutCourses();
  const player = scoutPlayer(d.garminShots, d.profiles, d.plan.yours.index, null);
  const links = loadLinks();
  const rows = courses.map((c) => {
    const geo = loadHoleGeometry(c.facilitySlug);
    const here = roundsHere(c, d.garminShots, d.roundHistory?.rounds ?? [], links);
    const view = geo ? buildScoutCourse(c, geo, player, here) : null;
    return { c, view, here };
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">SCOUT</h1>
      <p className="stamp mt-3 text-ink-3">
        one hole at a time · {courses.length} course{courses.length === 1 ? "" : "s"} scouted · index {d.plan.yours.index ?? "—"}
      </p>
      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        The plan says where the strokes leak; the scout takes it to the tee. For every hole: the club whose landing band
        touches no sand, the side to favour, the number in, the pins to refuse — computed from the course plan and your own
        bands, with the notes&rsquo; sources beside them.
      </p>
      <ul className="mt-6 space-y-3">
        {rows.map(({ c, view, here }) => (
          <li key={c.facilitySlug} className="card">
            <Link href={`/scout/${c.facilitySlug}`} className="block px-4 py-4 hover:bg-paper-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-[26px] leading-none">{c.name}</span>
                <span className="stamp text-ink-3">{view ? `${view.holes.length} holes drawn` : "no hole plan"}</span>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-5 text-ink-2">
                {c.tees.map((t) => `${t.name} ${t.yards.reduce((a, b) => a + b, 0)}`).join(" · ")}
                {here.length ? ` · last round ${here[0].date}${here[0].strokes !== null ? `, ${here[0].strokes}` : ""}` : " · never on the watch"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <Provenance sources={buildSources({ shots: d.shots, sessions: d.sessions, garminShots: d.garminShots, roundHistory: d.roundHistory }).filter((s) => s.id !== "map")} />
    </div>
  );
}
