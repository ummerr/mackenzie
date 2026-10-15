import { notFound } from "next/navigation";
import { approachMisses, holeViews } from "@/lib/break80";
import { loadHoleGeometry, loadLinks, loadScoutCourses } from "@/lib/load";
import { buildScoutCourse, roundsHere, scoutPlayer } from "@/lib/scout";
import { buildSiteData } from "@/lib/site-data";
import { buildSources } from "@/lib/sources";
import { Provenance } from "../../provenance";
import { Scout } from "../scout";

/* Server component. Every option — each tee set, each of nine pins, each
 * tee club — is computed here in lib/scout.ts, which is pure and tested;
 * the client component only indexes into it (the bag page's pattern). */

export const dynamicParams = false;

export function generateStaticParams() {
  return loadScoutCourses().map((c) => ({ course: c.facilitySlug }));
}

export async function generateMetadata({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  const c = loadScoutCourses().find((x) => x.facilitySlug === course);
  return {
    title: `${c?.name ?? "Scout"} — Scout — Mackenzie`,
    description: c ? `How to play ${c.name}, hole by hole, from the plan and your own bands.` : "Scout",
  };
}

export default async function ScoutCourse({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const course = loadScoutCourses().find((x) => x.facilitySlug === slug);
  if (!course) notFound();
  const d = buildSiteData();
  const misses = approachMisses(holeViews(d.garminShots, d.linked));
  const player = scoutPlayer(d.garminShots, d.profiles, d.plan.yours.index, misses.shortShareOfMisses);
  const here = roundsHere(course, d.garminShots, d.roundHistory?.rounds ?? [], loadLinks());
  const geo = loadHoleGeometry(course.facilitySlug);
  const view = geo ? buildScoutCourse(course, geo, player, here) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      {view ? (
        <Scout course={view} />
      ) : (
        <p className="font-mono text-[12px] text-ink-2">
          No hole plan for {course.name} in public/data/holes — run <code>pnpm data:holes</code>.
        </p>
      )}
      <section className="mt-10 border-t pt-4 rule">
        <h2 className="stamp text-ink-2">The notes&rsquo; sources</h2>
        <dl className="mt-3 space-y-1 font-mono text-[11px] leading-5">
          {Object.entries(course.sources).map(([k, s]) => (
            <div key={k} className="flex flex-wrap gap-x-3">
              <dt className="w-28 shrink-0 text-ink-1">{k}</dt>
              <dd className="text-ink-3">
                {s.url ? (
                  <a href={s.url} className="underline decoration-dotted underline-offset-2 hover:text-ink-0" target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
                {s.note ? ` — ${s.note}` : ""}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-2xl font-mono text-[10px] leading-4 text-ink-3">
          The hole plan is OpenStreetMap&rsquo;s (bunkers, greens, centrelines; distances computed from it, never typed).
          Imagery &copy; Esri, Maxar, Earthstar Geographics — World Imagery tiles, loaded by your browser from Esri&rsquo;s
          public service. Your bands: driver and hybrid from where the ball finished on the watch&rsquo;s rounds, irons
          from the range&rsquo;s carries. Nothing is copied from Garmin.
        </p>
      </section>
      <Provenance
        sources={buildSources({ shots: d.shots, sessions: d.sessions, garminShots: d.garminShots, roundHistory: d.roundHistory }).filter(
          (s) => s.id !== "map",
        )}
      />
    </div>
  );
}
