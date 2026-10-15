import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tripFeeLine } from "@/lib/california100";
import { TripFull } from "../../trips";
import { loadTrips } from "../bits";

/* One trip, at its own URL: the page to send. Static — every trip is built
 * at deploy from the data file, and a slug the file lacks is a 404. The
 * unfurl card beside it is opengraph-image.tsx. */

export const dynamicParams = false;

export function generateStaticParams() {
  const { list } = loadTrips();
  return (list?.trips ?? []).map((t) => ({ slug: t.trip.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { list } = loadTrips();
  const t = list?.trips.find((x) => x.trip.slug === slug);
  if (!t) return { title: "Trip — Mackenzie" };
  const courses = t.rows.map((r) => r.entry.name).join(", ");
  const description = `${t.trip.tagline}. ${courses}. Fly ${t.trip.airport.code}, ${t.trip.nights} nights, green fees ${tripFeeLine(t.fee)} a head.`;
  return {
    title: `${t.trip.title} — a California 100 trip — Mackenzie`,
    description,
    openGraph: { title: t.trip.title, description, type: "article" },
    twitter: { card: "summary_large_image", title: t.trip.title, description },
  };
}

export default async function TripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { list, bits } = loadTrips();
  const t = list?.trips.find((x) => x.trip.slug === slug);
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <TripFull t={t} {...bits(t)} />
    </div>
  );
}
