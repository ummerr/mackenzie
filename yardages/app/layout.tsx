import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YARDAGES — every shot I've hit",
  description: "A longitudinal shot ledger for Garmin Approach R50 range sessions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-ink-0 text-cream-0 min-h-screen antialiased">
        <header className="flex h-14 items-center justify-between gap-4 border-b px-5 rule">
          <div className="flex items-baseline gap-5">
            <Link href="/" className="font-serif text-[27px] leading-none tracking-[0.02em]">
              YARD<span className="text-accent">AGES</span>
            </Link>
            <nav className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.08em] text-cream-2">
              <Link href="/" className="hover:text-cream-0">
                Bag
              </Link>
              <Link href="/sessions" className="hover:text-cream-0">
                Sessions
              </Link>
            </nav>
          </div>
          <a
            href="https://courses.ummerr.com/"
            className="font-mono text-[11px] uppercase tracking-[0.08em] text-cream-3 hover:text-accent"
          >
            Mackenzie ↗
          </a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
