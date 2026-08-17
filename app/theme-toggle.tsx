"use client";

import { useEffect, useState } from "react";

/* Three states, not two. Day and Dusk are choices; Auto hands it back to the
 * OS. Light is the default for anyone who has never touched this, so arriving
 * at the site shows the paper rather than whatever the machine happens to be
 * set to — the theme is part of how the page reads, not a system preference the
 * page is obliged to inherit.
 *
 * All this does is stamp `data-theme` and remember it. The palette lives
 * entirely in globals.css, keyed off `color-scheme`, so nothing downstream of
 * here needs to know a theme exists. */

const ORDER = ["light", "dark", "auto"] as const;
type Theme = (typeof ORDER)[number];

const LABEL: Record<Theme, string> = { light: "Day", dark: "Dusk", auto: "Auto" };
const TITLE: Record<Theme, string> = {
  light: "Light. Click for dark.",
  dark: "Dark. Click to follow the system.",
  auto: "Following the system. Click for light.",
};

/** A sun, a crescent, a half of each — 9px, in the current text colour. */
function Glyph({ theme }: { theme: Theme }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden focusable="false">
      {theme === "light" && <circle cx="5" cy="5" r="3.4" fill="currentColor" />}
      {theme === "dark" && (
        <path
          d="M7.6 6.6A3.9 3.9 0 0 1 3.4 1.1a4 4 0 1 0 4.2 5.5Z"
          fill="currentColor"
        />
      )}
      {theme === "auto" && (
        <>
          <circle
            cx="5"
            cy="5"
            r="3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M5 1.6a3.4 3.4 0 0 1 0 6.8Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function ThemeToggle() {
  /* null until mounted: the server cannot know what is in localStorage, and
   * rendering a guess would either flash the wrong word or fail hydration. The
   * button keeps its width either way, so nothing shifts when the word lands. */
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setTheme(ORDER.includes(stored as Theme) ? (stored as Theme) : "light");
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme ?? "light") + 1) % ORDER.length];
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private browsing; the choice just will not survive the tab */
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={theme ? TITLE[theme] : undefined}
      aria-label={theme ? `Theme: ${LABEL[theme]}. ${TITLE[theme]}` : "Theme"}
      className="stamp inline-flex w-[62px] items-center gap-1.5 text-ink-3 transition-colors hover:text-accent-ink"
    >
      {theme && (
        <>
          <Glyph theme={theme} />
          {LABEL[theme]}
        </>
      )}
    </button>
  );
}
