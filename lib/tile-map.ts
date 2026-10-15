/* A static map from raster tiles, with no map library: the Web Mercator
 * arithmetic that turns a point into a tile and a pixel, the zoom that fits a
 * set of points into a box, and the list of tiles that box covers. A trip
 * page draws its map as a grid of <img> tiles with pins laid over them, so
 * the map is plain HTML that renders in a static build, prints, and costs no
 * script. The tiles are Esri World Imagery, the same source the /courses map
 * draws, and the page credits them. Pure and tested. */

export interface LonLat {
  lon: number;
  lat: number;
}

export const TILE = 256;

/** The fractional tile coordinate of a point at a zoom (Web Mercator). */
export function tileXY(p: LonLat, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latR = (Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n,
  };
}

/** Great-circle miles between two points. */
export function haversineMiles(a: LonLat, b: LonLat): number {
  const R = 3958.7613;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface MosaicTile {
  z: number;
  x: number;
  y: number;
  /** Pixel offset inside the box. */
  left: number;
  top: number;
}

export interface Mosaic {
  zoom: number;
  width: number;
  height: number;
  tiles: MosaicTile[];
  /** Pixel position of a point inside the box (may fall outside it). */
  project: (p: LonLat) => { x: number; y: number };
}

/** The box `width`×`height` centred on `center` at `zoom`: which tiles cover
 *  it and where each sits. */
export function centerMosaic(center: LonLat, zoom: number, width: number, height: number): Mosaic {
  const c = tileXY(center, zoom);
  const originX = c.x * TILE - width / 2;
  const originY = c.y * TILE - height / 2;
  const n = 2 ** zoom;
  const tiles: MosaicTile[] = [];
  const x0 = Math.floor(originX / TILE);
  const y0 = Math.floor(originY / TILE);
  const x1 = Math.floor((originX + width - 1) / TILE);
  const y1 = Math.floor((originY + height - 1) / TILE);
  for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) {
    for (let x = x0; x <= x1; x++) {
      tiles.push({ z: zoom, x: ((x % n) + n) % n, y, left: x * TILE - originX, top: y * TILE - originY });
    }
  }
  return {
    zoom,
    width,
    height,
    tiles,
    project: (p) => {
      const t = tileXY(p, zoom);
      return { x: t.x * TILE - originX, y: t.y * TILE - originY };
    },
  };
}

/** The largest zoom at which every point sits inside the box with `pad` of
 *  the box's width and height to spare on each side, then the box centred
 *  on the points' bounds. One point gets `maxZoom`. */
export function fitMosaic(
  points: LonLat[],
  width: number,
  height: number,
  { minZoom = 4, maxZoom = 13, pad = 0.14 }: { minZoom?: number; maxZoom?: number; pad?: number } = {},
): Mosaic {
  if (points.length === 0) throw new Error("fitMosaic needs a point");
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const center = { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
  const usableW = width * (1 - 2 * pad);
  const usableH = height * (1 - 2 * pad);
  let zoom = maxZoom;
  for (; zoom > minZoom; zoom--) {
    const xs = points.map((p) => tileXY(p, zoom).x * TILE);
    const ys = points.map((p) => tileXY(p, zoom).y * TILE);
    if (Math.max(...xs) - Math.min(...xs) <= usableW && Math.max(...ys) - Math.min(...ys) <= usableH) break;
  }
  // Centre on the pixel midpoint at the chosen zoom, not the degree midpoint,
  // so a north–south spread sits evenly under Mercator's stretch.
  const xs = points.map((p) => tileXY(p, zoom).x);
  const ys = points.map((p) => tileXY(p, zoom).y);
  const midTile = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const n = 2 ** zoom;
  const midLon = (midTile.x / n) * 360 - 180;
  const midLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * midTile.y) / n))) * 180) / Math.PI;
  void center;
  return centerMosaic({ lon: midLon, lat: midLat }, zoom, width, height);
}

export const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
export const ESRI_NATGEO = "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile";
export const tileUrl = (base: string, t: MosaicTile) => `${base}/${t.z}/${t.y}/${t.x}`;

/** Push pins apart until no two are closer than `minDist` pixels, each pair
 *  moving half the overlap along the line between them (a coincident pair
 *  splits sideways). The order is kept; the drawn position is nudged, the
 *  point underneath is not. Converges in a handful of passes for a few pins. */
export function spreadPins(px: { x: number; y: number }[], minDist: number, passes = 40): { x: number; y: number }[] {
  const out = px.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (minDist - d) / 2;
        out[i].x -= (dx / d) * push;
        out[i].y -= (dy / d) * push;
        out[j].x += (dx / d) * push;
        out[j].y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}
