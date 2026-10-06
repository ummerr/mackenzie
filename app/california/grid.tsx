import type { ListRow } from "@/lib/california100";

/* The hundred as a hundred squares. Filled is played, a pressed square is a
 * facility the record holds under another course, hollow is still to play.
 * Each square is an anchor into the table row below it, so the grid is the
 * page's index as well as its scoreboard. State is carried by the label as
 * well as the fill — a reader who cannot see the fill still gets the word. */

const STATE_WORD = {
  played: "played",
  "facility-played": "facility played, not this course",
  unplayed: "to play",
} as const;

export function ProgressGrid({ rows }: { rows: ListRow[] }) {
  return (
    <div>
      <ol className="mt-4 grid grid-cols-10 gap-px border bg-paper-2 rule" aria-label="The hundred, by rank">
        {rows.map((r) => {
          const e = r.entry;
          const fill =
            r.state === "played"
              ? "bg-accent-ink text-paper-0"
              : r.state === "facility-played"
                ? "bg-paper-2 text-ink-1"
                : "bg-paper-0 text-ink-3";
          return (
            <li key={e.slug} className={e.status === "closed" ? "opacity-40" : ""}>
              <a
                href={`#r-${e.rank}`}
                title={`${e.rank}. ${e.name} — ${STATE_WORD[r.state]}${e.status === "closed" ? " (closed)" : ""}`}
                aria-label={`${e.rank}, ${e.name}, ${STATE_WORD[r.state]}`}
                className={`flex aspect-square items-center justify-center font-mono text-[9px] tabular-nums sm:text-[10px] ${fill}`}
              >
                {e.rank}
              </a>
            </li>
          );
        })}
      </ol>
      <p className="stamp mt-2 text-ink-3">
        <span className="inline-block h-2 w-2 bg-accent-ink align-middle" aria-hidden /> played ·{" "}
        <span className="inline-block h-2 w-2 bg-paper-2 align-middle" aria-hidden /> facility played, not this course ·{" "}
        <span className="inline-block h-2 w-2 border bg-paper-0 align-middle rule" aria-hidden /> to play · faded is closed
      </p>
    </div>
  );
}
