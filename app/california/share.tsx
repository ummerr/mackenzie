"use client";

import { useState } from "react";

/* The share bar. The one piece of a trip page that needs the browser: the
 * share sheet where there is one, the clipboard where there is not, and a
 * directions link that hands the stops to Google Maps in order. The URL is
 * read from the page so the same component serves the section's cards and
 * the trip's own page. */

export function ShareTrip({ path, title, directions }: { path: string; title: string; directions: string | null }) {
  const [said, setSaid] = useState<string | null>(null);
  const url = () => `${window.location.origin}${path}`;

  async function share() {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url: url() });
        return;
      }
      await navigator.clipboard.writeText(url());
      setSaid("link copied");
    } catch {
      setSaid(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setSaid("link copied");
    } catch {
      setSaid("could not copy");
    }
  }

  const btn =
    "border bg-paper-1 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2 rule hover:text-accent-ink";
  return (
    <div className="flex flex-wrap items-center gap-px" role="group" aria-label="Share this trip">
      <button type="button" onClick={share} className={btn}>
        share
      </button>
      <button type="button" onClick={copy} className={btn}>
        copy link
      </button>
      {directions && (
        <a href={directions} target="_blank" rel="noopener noreferrer" className={btn}>
          directions ↗
        </a>
      )}
      {said && <span className="ml-2 font-mono text-[10px] text-accent-ink">{said}</span>}
    </div>
  );
}
