"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* The three sections, once. Rendered twice — inline in the masthead from `sm`
 * up, and as a tab strip under it below that — because a phone cannot fit the
 * wordmark, three links and the theme control on one 360px line without one of
 * them becoming unreadable or untappable.
 *
 * The strip is where a scorecard already puts its sections: a row of equal
 * boxes under the heading, ruled apart. Each box is 44px tall, which is the
 * floor for a tap target, and the current one is pressed rather than coloured —
 * the accent is spent on data everywhere else on this site and a nav tab is not
 * data.
 */

const SECTIONS = [
  { href: "/", label: "Bag" },
  { href: "/practice", label: "Practice" },
  { href: "/profile", label: "Profile" },
  { href: "/sessions", label: "Sessions" },
] as const;

export function InlineNav() {
  const here = usePathname();
  return (
    <nav className="stamp hidden gap-4 text-ink-2 sm:flex">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={s.href === here ? "page" : undefined}
          className={s.href === here ? "text-ink-0" : "hover:text-ink-0"}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabStrip() {
  const here = usePathname();
  return (
    <nav
      className="grid border-t sm:hidden rule"
      style={{ gridTemplateColumns: `repeat(${SECTIONS.length}, minmax(0,1fr))` }}
    >
      {SECTIONS.map((s) => {
        const on = s.href === here;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`stamp flex h-11 items-center justify-center border-r last:border-r-0 rule ${
              on ? "bg-paper-2 text-ink-0" : "text-ink-2"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
