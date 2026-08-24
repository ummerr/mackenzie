/* The one stat tile. Three pages grew three private copies of the same form —
 * a stamped label, a big number, a small mono note — differing only in which
 * line came first. One component, label first (the dt/dd order the markup
 * already implies), so a tile reads the same wherever it appears.
 *
 * The static pages (/courses, /ball-flight) keep their hand-written HTML twins
 * on purpose: both are zero-build, and importing React into them would not be.
 */

export interface StatTile {
  label: string;
  value: string | number;
  /** Small print under the value — sample size, caveat, unit. */
  note?: string;
  /** The one number a grid is allowed to emphasise. */
  accent?: boolean;
}

export function StatTiles({
  tiles,
  className = "grid grid-cols-2 gap-px border bg-paper-2 rule sm:grid-cols-4",
}: {
  tiles: StatTile[];
  /** The grid wrapper — column counts differ per page, the tiles do not. */
  className?: string;
}) {
  return (
    <dl className={className}>
      {tiles.map((t) => (
        <div key={t.label} className="bg-paper-1 px-4 py-3">
          <dt className="stamp text-ink-3">{t.label}</dt>
          <dd
            className={`mt-1.5 font-sans text-[24px] font-medium leading-none tabular-nums ${
              t.accent ? "text-accent-ink" : "text-ink-0"
            }`}
          >
            {t.value}
          </dd>
          {t.note && (
            <p className="mt-1.5 font-mono text-[10px] leading-4 text-ink-3">{t.note}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
