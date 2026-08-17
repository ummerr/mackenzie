"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query as a boolean, kept in sync.
 *
 * `useSyncExternalStore` rather than `useEffect` + `useState` because the
 * server has no viewport to measure: the third argument is the server
 * snapshot, and it is `false` on purpose. Everything on this site renders the
 * wide layout first and narrows on mount, so a crawler, a no-JS reader and the
 * static HTML all get the full drawing rather than a phone frame nobody asked
 * for.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
