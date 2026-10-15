import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Photo, TripView } from "@/lib/california100";
import { photoCredit, tripFeeLine } from "@/lib/california100";

/* The unfurl card: what iMessage, WhatsApp and Slack show beside the link.
 * Built at deploy by next/og from the same data as the page: the trip's
 * hero photograph full-bleed, the title set into it, the three courses,
 * the airport and the fee band, and the photograph's credit in the corner.
 * The photograph is read from public/ as bytes, so the card builds with no
 * network; the serif is fetched from Google Fonts at build and, if that
 * fails, the card falls back to the default face rather than failing the
 * build. */

export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = "#f7f4ec";
const PAPER_DIM = "#e5dfd0";
const ACCENT = "#ff6b35";

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

function heroData(ph: Photo | null): string | null {
  if (!ph) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", "california", "photos", ph.file));
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function tripImage(t: TripView, hero: Photo | null) {
  const font = await serif();
  const fee = tripFeeLine(t.fee);
  const src = heroData(hero);
  const serifFace = font ? "Instrument Serif" : "serif";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#161a15", color: PAPER }}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            background: "linear-gradient(to top, rgba(10,12,10,0.92) 0%, rgba(10,12,10,0.55) 45%, rgba(10,12,10,0.05) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 150,
            background: "linear-gradient(to bottom, rgba(10,12,10,0.7) 0%, rgba(10,12,10,0) 100%)",
          }}
        />
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 12, background: ACCENT }} />
        <div
          style={{
            position: "absolute",
            top: 36,
            left: 56,
            right: 56,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 19,
            letterSpacing: "0.16em",
            color: PAPER_DIM,
          }}
        >
          <span>CALIFORNIA 100 · A TRIP</span>
          <span>
            {t.trip.nights} NIGHTS · FLY {t.trip.airport.code}
            {fee === "—" ? "" : ` · ${fee} A HEAD`}
          </span>
        </div>
        <div style={{ position: "absolute", left: 56, right: 56, bottom: 44, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: serifFace,
              fontSize: 96,
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
              textShadow: "0 2px 18px rgba(0,0,0,0.75)",
            }}
          >
            {t.trip.title}
          </div>
          <div style={{ marginTop: 14, fontSize: 26, color: PAPER_DIM, lineHeight: 1.25, textShadow: "0 1px 10px rgba(0,0,0,0.85)" }}>
            {t.trip.tagline}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 24, fontSize: 24, textShadow: "0 1px 10px rgba(0,0,0,0.85)" }}>
            {t.rows.map((r) => (
              <div key={r.entry.slug} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ color: ACCENT, fontSize: 18 }}>#{r.entry.rank}</span>
                <span>{r.entry.name}</span>
              </div>
            ))}
          </div>
        </div>
        {hero && (
          <div style={{ position: "absolute", right: 56, bottom: 16, fontSize: 13, color: PAPER_DIM, opacity: 0.85 }}>
            {photoCredit(hero)}
          </div>
        )}
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "Instrument Serif", data: font, style: "normal", weight: 400 }] : undefined,
    },
  );
}
