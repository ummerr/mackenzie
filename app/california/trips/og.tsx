import { ImageResponse } from "next/og";
import type { TripStop, TripView } from "@/lib/california100";
import { tripFeeLine } from "@/lib/california100";
import { fitMosaic, spreadPins } from "@/lib/tile-map";

/* The unfurl card: what iMessage, WhatsApp and Slack show beside the link.
 * Built at deploy by next/og from the same data as the page — the title,
 * the three courses, the airport, the fee band, and a small route diagram
 * drawn from the stops' real positions (no tiles: the card must build with
 * no network). The serif is fetched from Google Fonts at build and, if that
 * fails, the card falls back to the default face rather than failing the
 * build. */

export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = "#f7f4ec";
const PAPER2 = "#f1ece1";
const INK = "#161a15";
const INK2 = "#5a6650";
const INK3 = "#666d63";
const ACCENT = "#b8420f";
const LINE = "#d9d2c2";

async function serif(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap", {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => r.text());
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype|woff)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

/** The stops as a small diagram: the real positions, fitted into a box.
 *  Satori draws SVG paths and circles but no <text>, so the labels are
 *  absolutely placed divs over the drawing. */
function Route({ stops, w, h }: { stops: TripStop[]; w: number; h: number }) {
  if (stops.length === 0) return null;
  const m = fitMosaic(
    stops.map((s) => s.point),
    w,
    h,
    { maxZoom: 14, pad: 0.16 },
  );
  const at = stops.map((s) => m.project(s.point));
  const px = spreadPins(at, 50);
  const d = at.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, background: PAPER2 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", top: 0, left: 0 }}>
        <path d={d} fill="none" stroke={ACCENT} strokeWidth={3} strokeDasharray="8 7" />
        {stops.map((s, i) => (
          <circle key={i} cx={px[i].x} cy={px[i].y} r={s.kind === "airport" ? 18 : 22} fill={s.kind === "airport" ? INK : ACCENT} />
        ))}
      </svg>
      {stops.map((s, i) => {
        const r = s.kind === "airport" ? 18 : 22;
        return (
          <div
            key={`t${i}`}
            style={{
              position: "absolute",
              left: px[i].x - r,
              top: px[i].y - r,
              width: r * 2,
              height: r * 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: PAPER,
              fontSize: s.kind === "airport" ? 14 : 18,
              fontWeight: 600,
            }}
          >
            {s.kind === "airport" ? s.label : `#${s.label}`}
          </div>
        );
      })}
    </div>
  );
}

export async function tripImage(t: TripView, stops: TripStop[]) {
  const font = await serif();
  const fee = tripFeeLine(t.fee);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          color: INK,
          padding: "56px 64px",
          borderTop: `14px solid ${ACCENT}`,
          fontFamily: "Geist, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, letterSpacing: "0.16em", color: INK3 }}>
          <span>CALIFORNIA 100 · A TRIP</span>
          <span>
            {t.trip.nights} NIGHTS · FLY {t.trip.airport.code} · {fee === "—" ? "" : `${fee} A HEAD`}
          </span>
        </div>
        <div style={{ display: "flex", flex: 1, marginTop: 28, gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: font ? "Instrument Serif" : "serif", fontSize: 88, lineHeight: 0.95, letterSpacing: "-0.01em" }}>
                {t.trip.title}
              </div>
              <div style={{ marginTop: 20, fontSize: 28, color: INK2, lineHeight: 1.25 }}>{t.trip.tagline}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${LINE}`, paddingTop: 20 }}>
              {t.rows.map((r) => (
                <div key={r.entry.slug} style={{ display: "flex", alignItems: "baseline", gap: 18, fontSize: 30 }}>
                  <span style={{ width: 70, color: r.state === "played" ? ACCENT : INK3, fontSize: 22 }}>#{r.entry.rank}</span>
                  <span>{r.entry.name}</span>
                  <span style={{ color: INK3, fontSize: 22 }}>{r.entry.locality}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", width: 380, border: `1px solid ${LINE}` }}>
            <Route stops={stops} w={378} h={430} />
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "Instrument Serif", data: font, style: "normal", weight: 400 }] : undefined,
    },
  );
}
