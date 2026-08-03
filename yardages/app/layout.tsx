import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { InlineNav, TabStrip } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

/* A flagstick on card stock. Drawn inline rather than shipped as a file so the
 * icon travels with the palette it was cut from. */
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" fill="#f7f4ec"/>` +
      `<path d="M7.5 26.5h17" stroke="#5a6650" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M13 26.5V5" stroke="#161a15" stroke-width="2"/>` +
      `<path d="M14 5.4l10.5 4.1L14 13.6z" fill="#ff6b35"/>` +
      `</svg>`,
  );

export const metadata: Metadata = {
  title: "YARDAGES — every shot I've hit",
  description: "A longitudinal shot ledger for Garmin Approach R50 range sessions.",
  icons: { icon: FAVICON },
};

/* One value, not a pair keyed to prefers-color-scheme: light is the default for
 * everyone until they say otherwise, so the browser chrome should match it.
 *
 * `width` and `initialScale` are Next's defaults and are written out anyway:
 * this app is read on a phone at the range, and the one meta tag that decides
 * whether that works at all should not be inherited silently. `maximumScale`
 * is deliberately absent — a to-scale plan view is exactly the thing somebody
 * will want to pinch into, and blocking that to stop iOS zooming on an input
 * would trade an accessibility floor for a cosmetic fix. The inputs are 16px
 * instead. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f4ec",
};

/* Stamps the stored choice on <html> before first paint. Inline and blocking on
 * purpose — anything deferred renders one frame of the wrong theme, which is
 * the exact thing a theme switch is judged on. */
const SET_THEME = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="auto"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SET_THEME }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-paper-0 text-ink-0 min-h-screen antialiased">
        {/* The top of the card: a filled band under a heavy rule, rather than a
            hairline floating on the page ground. Below `sm` the sections drop
            out of this row into their own strip — see site-nav.tsx. */}
        <header className="border-b-2 bg-paper-1 rule-hard">
          <div className="flex h-12 items-center justify-between gap-3 px-4 sm:h-14 sm:px-5">
            <div className="flex items-baseline gap-5">
              <Link
                href="/"
                className="font-serif text-[23px] leading-none tracking-[0.02em] sm:text-[27px]"
              >
                YARD<span className="text-accent-ink">AGES</span>
              </Link>
              <InlineNav />
            </div>
            <div className="flex items-center gap-4 sm:gap-5">
              <ThemeToggle />
              <a
                href="https://courses.ummerr.com/"
                className="stamp text-ink-3 hover:text-accent-ink"
              >
                {/* The word is the link on a phone; the arrow alone would be a
                    16px target with nothing to read. */}
                Mackenzie<span className="hidden sm:inline"> ↗</span>
              </a>
            </div>
          </div>
          <TabStrip />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
