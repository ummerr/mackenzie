import type { TripStop } from "@/lib/california100";
import { centerMosaic, ESRI_IMAGERY, ESRI_NATGEO, fitMosaic, spreadPins, tileUrl, type LonLat, type Mosaic } from "@/lib/tile-map";

/* The maps, drawn without a map library: one inline SVG whose <image>s are
 * map tiles and whose circles are the pins, from lib/tile-map.ts. An SVG
 * scales to its column on its own, so tiles and pins shrink together with
 * no script and no measuring; a trip page stays static HTML. The trip map
 * is Esri's National Geographic style — an atlas page, with the terrain and
 * the town names a trip is planned on — and the course squares are Esri
 * World Imagery, the source the /courses map draws. Both are credited. */

const CREDIT = "Esri, Maxar, Earthstar Geographics";
const CREDIT_ATLAS = "National Geographic, Esri, Garmin, HERE, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA";
const MONO = "Geist Mono, ui-monospace, Menlo, monospace";

function Tiles({ m, base }: { m: Mosaic; base: string }) {
  return (
    <>
      {m.tiles.map((t) => (
        <image key={`${t.z}/${t.x}/${t.y}`} href={tileUrl(base, t)} x={t.left} y={t.top} width={256} height={256} />
      ))}
    </>
  );
}

/** The trip's map: the airport and the courses, pinned and joined in order. */
export function TripMap({
  stops,
  width = 800,
  height = 480,
  caption = true,
}: {
  stops: TripStop[];
  width?: number;
  height?: number;
  caption?: boolean;
}) {
  if (stops.length === 0) return null;
  const m = fitMosaic(
    stops.map((s) => s.point),
    width,
    height,
    { maxZoom: 11 },
  );
  const at = stops.map((s) => m.project(s.point));
  // The line runs through the true positions; a crowded pin is nudged off
  // its point so the number can be read, and a short leader shows the nudge.
  const px = spreadPins(at, 36);
  const path = at.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const title = `${stops[0].label} then ${stops.slice(1).map((s) => s.name).join(", ")}`;
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full border bg-paper-2 rule"
        role="img"
        aria-label={`Map: ${title}`}
      >
        <clipPath id={`clip-${width}-${height}`}>
          <rect width={width} height={height} />
        </clipPath>
        <g clipPath={`url(#clip-${width}-${height})`}>
          <Tiles m={m} base={ESRI_NATGEO} />
          <path d={path} fill="none" stroke="#f7f4ec" strokeWidth={6} strokeOpacity={0.7} strokeLinejoin="round" />
          <path d={path} fill="none" stroke="#b8420f" strokeWidth={2.5} strokeDasharray="7 5" strokeLinejoin="round" />
          {stops.map((s, i) => {
            const p = px[i];
            const r = s.kind === "airport" ? 13 : 15;
            const moved = Math.hypot(p.x - at[i].x, p.y - at[i].y) > 0.5;
            return (
              <g key={`${s.kind}-${s.label}`}>
                {moved && <line x1={at[i].x} y1={at[i].y} x2={p.x} y2={p.y} stroke="#f7f4ec" strokeWidth={2} />}
                <g transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}>
                <circle r={r + 2} fill="#f7f4ec" fillOpacity={0.95} />
                <circle r={r} fill={s.kind === "airport" ? "#161a15" : "#b8420f"} />
                <text
                  y={s.kind === "airport" ? 4 : 5}
                  textAnchor="middle"
                  fill="#f7f4ec"
                  fontFamily={MONO}
                  fontSize={s.kind === "airport" ? 10 : 13}
                  fontWeight={600}
                >
                  {s.kind === "airport" ? s.label : `#${s.label}`}
                </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {caption && (
        <figcaption className="mt-1.5 flex flex-wrap justify-between gap-x-3 font-mono text-[10px] leading-4 text-ink-3">
          <span>
            {stops[0].label} ✈ then {stops.slice(1).map((s) => `#${s.label}`).join(" → ")} · the dashed line is the order, not the
            road
          </span>
          <span>map {CREDIT_ATLAS}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** A course from above: a square of imagery centred on its point. */
export function FromAbove({
  point,
  name,
  size = 320,
  zoom = 15,
  precision,
}: {
  point: LonLat;
  name: string;
  size?: number;
  zoom?: number;
  precision: string | null;
}) {
  const m = centerMosaic(point, zoom, size, size);
  const centroid = precision === "city_centroid";
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="block h-auto w-full border bg-paper-2 rule" role="img" aria-label={`${name} from above`}>
        <clipPath id={`sq-${size}`}>
          <rect width={size} height={size} />
        </clipPath>
        <g clipPath={`url(#sq-${size})`}>
          <Tiles m={m} base={ESRI_IMAGERY} />
        </g>
      </svg>
      <figcaption className="mt-1 font-mono text-[10px] leading-4 text-ink-3">
        {centroid ? `${name}'s town — the course itself was not found on the map` : `${name} from above`} · {CREDIT}
      </figcaption>
    </figure>
  );
}
