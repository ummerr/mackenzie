import type { Metadata } from "next";
import Link from "next/link";
import { joinCalifornia100, tripStops } from "@/lib/california100";
import { loadCalifornia100, loadCalifornia100Geo, loadFacilityIndex } from "@/lib/load";
import { ShareTrip } from "../share";
import { TripCard } from "../trips";

/* Every trip on one page: the thing to send to the group chat when the
 * question is "which weekend". The cards are the section's own; the page
 * exists so the whole set has a URL and an unfurl of its own. */

export const metadata: Metadata = {
  title: "Trips — California 100 — Mackenzie",
  description: "Nine golf weekends with friends across the California Public 100: the courses, the airport, where to sleep, and the plan.",
  openGraph: { title: "California 100 trips", description: "Nine golf weekends with friends: the courses, the airport, where to sleep, and the plan." },
};

export default function TripsPage() {
  const file = loadCalifornia100();
  const index = loadFacilityIndex();
  const geo = loadCalifornia100Geo();
  const list = file && index ? joinCalifornia100(file, index.bySlug, index.capturedAt) : null;
  if (!list || !file?.trips) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
        <p className="stamp text-ink-3">no trips on this checkout</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <p className="stamp text-ink-3">
        <Link href="/california#trips" className="hover:text-accent-ink">
          California 100
        </Link>{" "}
        · the trips
      </p>
      <h1 className="mt-2 font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">TRIPS</h1>
      <p className="mt-4 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">{file.trips.note}</p>
      <div className="mt-4">
        <ShareTrip path="/california/trips" title="California 100 trips" directions={null} />
      </div>
      <ol className="mt-6 space-y-4">
        {list.trips.map((t) => (
          <TripCard key={t.trip.slug} t={t} stops={tripStops(t, geo)} />
        ))}
      </ol>
    </div>
  );
}
