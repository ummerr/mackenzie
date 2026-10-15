import { joinCalifornia100, tripStops } from "@/lib/california100";
import { loadCalifornia100, loadCalifornia100Geo, loadFacilityIndex } from "@/lib/load";
import { OG_SIZE, tripImage } from "../og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamicParams = false;

function load() {
  const file = loadCalifornia100();
  const index = loadFacilityIndex();
  const list = file && index ? joinCalifornia100(file, index.bySlug, index.capturedAt) : null;
  return { list, geo: loadCalifornia100Geo() };
}

export function generateStaticParams() {
  const { list } = load();
  return (list?.trips ?? []).map((t) => ({ slug: t.trip.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { list, geo } = load();
  const t = list?.trips.find((x) => x.trip.slug === slug);
  if (!t) return new Response("no such trip", { status: 404 });
  return tripImage(t, tripStops(t, geo));
}
