import { joinCalifornia100, tripPhotos, tripStops, type TripView } from "@/lib/california100";
import { loadCalifornia100, loadCalifornia100Geo, loadCalifornia100Photos, loadFacilityIndex } from "@/lib/load";
import type { TripBits } from "../trips";

/* What every trip page needs, loaded once: the joined list, the points and
 * the pictures, and a function that finds a trip's stops and photos. */

export function loadTrips() {
  const file = loadCalifornia100();
  const index = loadFacilityIndex();
  const list = file && index ? joinCalifornia100(file, index.bySlug, index.capturedAt) : null;
  const geo = loadCalifornia100Geo();
  const photos = loadCalifornia100Photos();
  const bits = (t: TripView): TripBits => ({ stops: tripStops(t, geo), photos: tripPhotos(t, photos) });
  return { file, list, geo, photos, bits };
}
