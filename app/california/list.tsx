"use client";

import { useMemo, useState } from "react";
import type { ListLens, RecordState } from "@/lib/california100";

/* The table, with the one piece of client state on the page: which prepared
 * ordering to show and which rows to hide. Nothing is computed here — the
 * four orders arrive from the server as index lists (the same move the bag
 * page makes with its two distance bases), and a filter is a predicate over
 * fields the server already formatted. Nothing persists: the record says what
 * was played, and a browser-side checkbox that disagreed with it would be
 * lying, which is the rule /sessions already lives by. */

export interface TableRow {
  rank: number;
  slug: string;
  name: string;
  locality: string;
  region: string;
  area: string;
  status: "open" | "closed";
  architect: string | null;
  yards: number | null;
  slope: number | null;
  fee: string;
  feeNote: string | null;
  access: string[];
  value: string | null;
  valueNote: string | null;
  tags: string[];
  /** "GW CA7 · US60 · GD 3.9 · YCP 45" — the lists it was compiled from. */
  lists: string;
  housing: string;
  drive: string;
  driveMinutes: number;
  amarRank: number;
  amarTier: string;
  amarScore: number;
  /** The nine components, already worded for a tooltip. */
  amarComponents: string;
  verified: boolean;
  state: RecordState;
  /** The record's line, already worded: "6 rds · avg 83.2 · your #4". */
  record: string;
}

const STATE_WORD: Record<RecordState, string> = {
  played: "played",
  "facility-played": "facility played, not this course",
  unplayed: "to play",
};

export interface Lens {
  key: ListLens;
  word: string;
  gloss: string;
}

function LensPicker({
  lens,
  lenses,
  onChange,
}: {
  lens: ListLens;
  lenses: Lens[];
  onChange: (l: ListLens) => void;
}) {
  /* A radiogroup is one tab stop and the arrows move within it — roving
   * tabindex below, as the bag's basis picker does. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const i = lenses.findIndex((o) => o.key === lens);
    const next = lenses[(i + step + lenses.length) % lenses.length];
    onChange(next.key);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-lens="${next.key}"]`)?.focus();
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="stamp text-ink-3" id="lens-label">
        Ordered by
      </span>
      <div role="radiogroup" aria-labelledby="lens-label" onKeyDown={onKeyDown} className="flex flex-wrap gap-px">
        {lenses.map((o) => {
          const on = lens === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              data-lens={o.key}
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.key)}
              className={`border px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition-colors rule ${
                on ? "bg-paper-2 text-ink-0" : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {o.word}
              <span className={`ml-2 normal-case tracking-normal ${on ? "text-ink-2" : "text-ink-3"}`}>{o.gloss}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 border bg-paper-1 px-2 text-ink-0 rule"
      >
        <option value="all">all</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CaliforniaList({
  rows,
  order,
  lenses,
  access,
  areas,
  tags,
  housing,
}: {
  rows: TableRow[];
  order: Record<ListLens, number[]>;
  lenses: Lens[];
  access: Record<string, string>;
  areas: Record<string, string>;
  tags: Record<string, string>;
  housing: Record<string, string>;
}) {
  const [lens, setLens] = useState<ListLens>("rank");
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  const [area, setArea] = useState("all");
  const [acc, setAcc] = useState("all");
  const [tag, setTag] = useState("all");
  const [house, setHouse] = useState("all");

  const visible = useMemo(
    () =>
      order[lens]
        .map((i) => rows[i])
        .filter(
          (r) =>
            (!unplayedOnly || r.state !== "played") &&
            (area === "all" || r.area === area) &&
            (acc === "all" || r.access.includes(acc)) &&
            (tag === "all" || r.tags.includes(tag)) &&
            (house === "all" || r.housing === house),
        ),
    [rows, order, lens, unplayedOnly, area, acc, tag, house],
  );
  const word = lenses.find((l) => l.key === lens)?.word ?? lens;

  return (
    <div className="mt-4">
      <LensPicker lens={lens} lenses={lenses} onChange={setLens} />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* The label is the tap target, not the 13px box. */}
        <label className="flex min-h-9 items-center gap-2 font-mono text-[11px] text-ink-2">
          <input type="checkbox" checked={unplayedOnly} onChange={(e) => setUnplayedOnly(e.target.checked)} />
          still to play only
        </label>
        <Select id="area" label="Area" value={area} onChange={setArea} options={Object.entries(areas)} />
        <Select id="access" label="Access" value={acc} onChange={setAcc} options={Object.entries(access)} />
        <Select id="tag" label="Trip" value={tag} onChange={setTag} options={Object.entries(tags)} />
        <Select id="housing" label="Housing" value={house} onChange={setHouse} options={Object.entries(housing)} />
      </div>
      <p className="stamp mt-3 text-ink-3" aria-live="polite">
        {visible.length} of {rows.length} · by {word}
      </p>

      {/* The index's score, the fee, the drive and the record fit a phone;
          the tee, access, the lists it came from and the grade fold away
          below `sm`. The frame still scrolls sideways if it must. */}
      <div className="mt-2 pan-x">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1 pr-3 text-right">#</th>
              <th className="py-1 pr-3">Course</th>
              <th className="py-1 pr-3 text-right" title="the index's own score, 0–100">Amar</th>
              <th className="py-1 pr-3 text-right">Fee</th>
              <th className="py-1 pr-3 text-right" title="typical drive from central San Francisco">Drive</th>
              <th className="hidden py-1 pr-3 text-right sm:table-cell">Yds / slope</th>
              <th className="hidden py-1 pr-3 sm:table-cell">Access</th>
              <th className="hidden py-1 pr-3 sm:table-cell">Value</th>
              <th className="hidden py-1 pr-3 sm:table-cell">Lists</th>
              <th className="py-1 pr-3">Your record</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.slug}
                id={`r-${r.rank}`}
                className={`scroll-mt-16 border-t align-top rule ${r.status === "closed" ? "text-ink-3" : "text-ink-1"}`}
              >
                <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-ink-2">
                  {/* The record's verdict, carried by the fill AND the label. */}
                  <span
                    role="img"
                    aria-label={STATE_WORD[r.state]}
                    title={STATE_WORD[r.state]}
                    className={`mr-2 inline-block h-2.5 w-2.5 align-[-1px] ${
                      r.state === "played"
                        ? "bg-accent-ink"
                        : r.state === "facility-played"
                          ? "border bg-paper-2 rule"
                          : "border bg-paper-0 rule"
                    }`}
                  />
                  {r.rank}
                </td>
                <td className="py-1.5 pr-3">
                  <div className="text-[13px] leading-snug text-ink-0">
                    {r.name}
                    {r.status === "closed" && <span className="ml-2 stamp text-ink-3">closed</span>}
                    {!r.verified && (
                      <span className="ml-2 stamp text-ink-3" title="at least one of its five checks is still open">
                        unverified
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] leading-4 text-ink-3">
                    {r.locality} · {r.region}
                    {r.architect ? ` · ${r.architect}` : ""}
                    {r.housing !== "none" ? ` · housing ${r.housing}` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums" title={r.amarComponents}>
                  <span className="text-ink-0">{r.amarScore.toFixed(1)}</span>
                  <span className="ml-1 font-mono text-[10px] text-ink-3">
                    {r.amarTier} · #{r.amarRank}
                  </span>
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums" title={r.feeNote ?? undefined}>
                  {r.fee}
                  {r.feeNote && <span className="text-ink-3">*</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right font-mono text-[10px] tabular-nums text-ink-2">{r.drive}</td>
                <td className="hidden whitespace-nowrap py-1.5 pr-3 text-right tabular-nums sm:table-cell">
                  {r.yards === null ? "—" : r.yards.toLocaleString("en-US")} / {r.slope ?? "—"}
                </td>
                <td className="hidden py-1.5 pr-3 font-mono text-[10px] uppercase tracking-[0.08em] sm:table-cell">
                  {r.access.map((a) => (
                    <span key={a} title={access[a]} className="mr-1">
                      {a}
                    </span>
                  ))}
                </td>
                <td className="hidden py-1.5 pr-3 tabular-nums sm:table-cell" title={r.valueNote ?? undefined}>
                  {r.value ?? "—"}
                  {r.valueNote && <span className="text-ink-3">*</span>}
                </td>
                <td className="hidden py-1.5 pr-3 font-mono text-[10px] text-ink-2 sm:table-cell">{r.lists || "—"}</td>
                <td
                  className={`py-1.5 pr-3 font-mono text-[10px] ${
                    r.state === "played" ? "text-accent-ink" : "text-ink-3"
                  }`}
                >
                  {r.record}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
        * carries a condition — hover or long-press the number. Hover the Amar score for its nine
        components. Fees are approximate 2026 posted bands, never a quotation; drives are estimates from
        central SF; GW is Golfweek 2026 (CA / US), GD Golf Digest 2025–26 (panel score · CA rank ·
        national public rank), YCP GOLF&rsquo;s 2024–25 Top 100 You Can Play.
      </p>
    </div>
  );
}
