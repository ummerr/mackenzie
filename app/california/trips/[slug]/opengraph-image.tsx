import { OG_SIZE, tripImage } from "../og";
import { loadTrips } from "../bits";

export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamicParams = false;

export function generateStaticParams() {
  const { list } = loadTrips();
  return (list?.trips ?? []).map((t) => ({ slug: t.trip.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { list, bits } = loadTrips();
  const t = list?.trips.find((x) => x.trip.slug === slug);
  if (!t) return new Response("no such trip", { status: 404 });
  return tripImage(t, bits(t).photos.hero);
}
