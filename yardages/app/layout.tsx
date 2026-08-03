import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
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
 * everyone until they say otherwise, so the browser chrome should match it. */
export const viewport: Viewport = { themeColor: "#f7f4ec" };

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
            hairline floating on the page ground. */}
        <header className="flex h-14 items-center justify-between gap-4 border-b-2 bg-paper-1 px-5 rule-hard">
          <div className="flex items-baseline gap-5">
            <Link href="/" className="font-serif text-[27px] leading-none tracking-[0.02em]">
              YARD<span className="text-accent-ink">AGES</span>
            </Link>
            <nav className="stamp flex gap-4 text-ink-2">
              <Link href="/" className="hover:text-ink-0">
                Bag
              </Link>
              <Link href="/practice" className="hover:text-ink-0">
                Practice
              </Link>
              <Link href="/sessions" className="hover:text-ink-0">
                Sessions
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-5">
            <ThemeToggle />
            <a
              href="https://courses.ummerr.com/"
              className="stamp text-ink-3 hover:text-accent-ink"
            >
              Mackenzie ↗
            </a>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
