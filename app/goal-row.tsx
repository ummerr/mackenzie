import type { GoalProgress } from "@/lib/goals";

/* One committed goal against the record. Lives here because the plan page
 * renders the week and the command center renders its one-line summary —
 * two surfaces, one row. */

export function fmtVal(v: number | null, unit: string): string {
  if (v === null) return "—";
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

export function GoalRow({ g }: { g: GoalProgress }) {
  const accent = g.status === "achieved";
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-3 sm:px-4"
      style={{ borderColor: accent ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`stamp ${accent ? "text-accent-ink" : "text-ink-3"}`}>{g.status}</span>
        <span className="text-[15px] leading-snug text-ink-0">{g.label}</span>
      </div>
      {g.status !== "invalid" && (
        <p className="mt-1.5 font-mono text-[11px] leading-5 text-ink-2 sm:pl-8">
          now {fmtVal(g.value, g.unit)} · target{" "}
          {g.direction === "down" ? "under " : ""}
          {fmtVal(g.goal.target, g.unit)}
          {g.sample ? ` · over ${g.sample.n} ${g.sample.unit}` : ""}
        </p>
      )}
      {g.goal.note && (
        <p className="mt-1 font-mono text-[10px] leading-4 text-ink-3 sm:pl-8">{g.goal.note}</p>
      )}
      {g.orphaned && (
        <p className="mt-1 font-mono text-[10px] leading-4 text-ink-3 sm:pl-8">⚠ {g.orphaned}</p>
      )}
    </li>
  );
}
