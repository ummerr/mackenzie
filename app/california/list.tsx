"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AMAR_COMPONENTS,
  AMAR_COMPONENT_WORD,
  type AmarComponent,
  type CheckGroup,
  type RecordState,
} from "@/lib/california100";

/* The table, and the client state it needs: which columns show, which column
 * orders the rows, which rows the filters keep, which rows are opened. The
 * server formats every cell (page.tsx builds TableRow); this file only sorts,
 * hides and shows. Sorting a hundred prepared rows is cheap enough to do here,
 * and doing it here is what lets any column be the order. The column set is
 * the one thing that persists, in localStorage, because it is a viewing
 * preference and nothing about the record; played / not played still comes
 * from the record alone, the rule /sessions lives by. */

export interface RowCheck {
  group: CheckGroup;
  word: string;
  verified: boolean;
  /** The source as the file states it — a URL or a `_sources` key. */
  source: string | null;
  /** The URL to open, when the source is one or names one. */
  href: string | null;
  note: string | null;
}

export interface TableRow {
  rank: number;
  slug: string;
  name: string;
  locality: string;
  region: string;
  area: string;
  areaWord: string;
  status: "open" | "closed";
  architect: string | null;
  yards: number | null;
  slope: number | null;
  rating: number | null;
  teeName: string | null;
  fee: string;
  feeLow: number | null;
  feeNote: string | null;
  access: string[];
  value: string | null;
  valueOrd: number;
  valueNote: string | null;
  tags: string[];
  housing: string;
  gwCA: number | null;
  gwUS: number | null;
  gdScore: number | null;
  gdCA: number | null;
  gdPublic: number | null;
  ycp: number | null;
  drive: string;
  driveMinutes: number;
  amarRank: number;
  amarTier: string;
  amarScore: number;
  components: Record<AmarComponent, number>;
  verified: boolean;
  checksVerified: number;
  checks: RowCheck[];
  state: RecordState;
  timesPlayed: number;
  /** The record's line, already worded: "6 rds · avg 83.2 · your 4th". */
  record: string;
}

const STATE_WORD: Record<RecordState, string> = {
  played: "played",
  "facility-played": "facility played, not this course",
  unplayed: "to play",
};

const HOUSING_ORD: Record<string, number> = { none: 0, low: 1, med: 2, high: 3 };

const fmtNum = (n: number | null) => (n === null ? null : n.toLocaleString("en-US"));
const dash = (v: ReactNode | null | undefined) => (v === null || v === undefined || v === "" ? <span className="text-ink-3">—</span> : v);

/* ── columns ─────────────────────────────────────────────────────────────── */

type Dir = "asc" | "desc";
type SortKey = (r: TableRow) => number | string | null;

interface Col {
  key: string;
  /** The header. */
  label: string;
  /** The toggle's word, when the header is too short to mean anything alone. */
  word?: string;
  group: string;
  title?: string;
  align?: "right";
  /** Shown before the viewer has chosen. */
  on: boolean;
  /** Always on: the row makes no sense without it. */
  fixed?: boolean;
  /** Folds away on a phone while the columns are at their defaults. */
  fold?: boolean;
  sort?: SortKey;
  /** The direction a first click gives: "best first" for a score, lowest first for a fee. */
  dir?: Dir;
  cell: (r: TableRow, ctx: Ctx) => ReactNode;
}

interface Ctx {
  access: Record<string, string>;
}

function Bar({ v, max, className = "" }: { v: number; max: number; className?: string }) {
  return (
    <span aria-hidden className={`inline-block h-1.5 w-10 bg-paper-2 align-middle max-sm:hidden ${className}`}>
      <span className="block h-full bg-accent-ink" style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} />
    </span>
  );
}

const Rank = (word: string, key: SortKey, group: string, title?: string): Col => ({
  key: word,
  label: word,
  group,
  title,
  align: "right",
  on: false,
  sort: key,
  dir: "asc",
  cell: (r) => dash(fmtNum(key(r) as number | null)),
});

const Component = (k: AmarComponent): Col => ({
  key: `c:${k}`,
  label: AMAR_COMPONENT_WORD[k],
  group: "index",
  align: "right",
  on: false,
  sort: (r) => r.components[k],
  dir: "desc",
  cell: (r) => (
    <>
      <Bar v={r.components[k]} max={10} className="mr-2 w-8" />
      {r.components[k].toFixed(1)}
    </>
  ),
});

const COLUMNS: Col[] = [
  {
    key: "rank",
    label: "#",
    word: "rank",
    group: "course",
    align: "right",
    on: true,
    fixed: true,
    sort: (r) => r.rank,
    dir: "asc",
    cell: (r) => r.rank,
  },
  {
    key: "name",
    label: "Course",
    group: "course",
    on: true,
    fixed: true,
    sort: (r) => r.name,
    dir: "asc",
    cell: () => null, // rendered by the row: it carries the verdict and the opener
  },
  {
    key: "area",
    label: "Area",
    group: "course",
    on: false,
    sort: (r) => r.areaWord,
    dir: "asc",
    cell: (r) => r.areaWord,
  },
  {
    key: "architect",
    label: "Architect",
    group: "course",
    on: false,
    sort: (r) => r.architect,
    dir: "asc",
    cell: (r) => <span className="block max-w-[14rem] truncate" title={r.architect ?? undefined}>{dash(r.architect)}</span>,
  },
  {
    key: "housing",
    label: "Housing",
    group: "course",
    title: "how much of the routing sees houses",
    on: false,
    sort: (r) => HOUSING_ORD[r.housing] ?? null,
    dir: "asc",
    cell: (r) => (r.housing === "none" ? <span className="text-ink-3">none</span> : r.housing),
  },
  {
    key: "amar",
    label: "Amar",
    word: "amar score",
    group: "index",
    title: "the index's own score, 0–100 — open the row for its nine parts",
    align: "right",
    on: true,
    sort: (r) => r.amarScore,
    dir: "desc",
    cell: (r) => (
      <>
        <Bar v={r.amarScore} max={100} className="mr-2" />
        <span className="text-ink-0">{r.amarScore.toFixed(1)}</span>
        <span className="ml-1.5 inline-block w-5 text-left font-mono text-[10px] text-ink-3" title={`${r.amarTier} · the index's #${r.amarRank}`}>
          {r.amarTier}
        </span>
      </>
    ),
  },
  ...AMAR_COMPONENTS.map(Component),
  {
    key: "fee",
    label: "Fee",
    group: "cost",
    title: "approximate 2026 posted band, never a quotation",
    align: "right",
    on: true,
    sort: (r) => r.feeLow,
    dir: "asc",
    cell: (r) => <span title={r.feeNote ?? undefined}>{r.fee}</span>,
  },
  {
    key: "value",
    label: "Value",
    group: "cost",
    title: "the compilation's value grade, A++ to D-",
    on: true,
    fold: true,
    sort: (r) => (r.valueOrd < 0 ? null : r.valueOrd),
    dir: "desc",
    cell: (r) => (
      <>
        <span className={r.valueOrd >= 12 ? "text-ink-0" : ""}>{dash(r.value)}</span>
        {r.valueNote && (
          <span className="text-ink-3" title={r.valueNote}>
            *
          </span>
        )}
      </>
    ),
  },
  {
    key: "drive",
    label: "Drive",
    group: "cost",
    title: "typical drive from central San Francisco",
    align: "right",
    on: true,
    sort: (r) => r.driveMinutes,
    dir: "asc",
    cell: (r) => <span className="font-mono text-[10px] text-ink-2">{r.drive}</span>,
  },
  {
    key: "access",
    label: "Access",
    group: "cost",
    on: true,
    fold: true,
    sort: (r) => r.access.join(" "),
    dir: "asc",
    cell: (r, ctx) => (
      <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
        {r.access.map((a) => (
          <span key={a} title={ctx.access[a]} className="mr-1">
            {a}
          </span>
        ))}
      </span>
    ),
  },
  {
    key: "yards",
    label: "Yards",
    group: "tee",
    title: "the rated back tee",
    align: "right",
    on: true,
    fold: true,
    sort: (r) => r.yards,
    dir: "desc",
    cell: (r) => dash(fmtNum(r.yards)),
  },
  {
    key: "slope",
    label: "Slope",
    group: "tee",
    align: "right",
    on: true,
    fold: true,
    sort: (r) => r.slope,
    dir: "desc",
    cell: (r) => dash(r.slope),
  },
  {
    key: "rating",
    label: "Rating",
    word: "course rating",
    group: "tee",
    align: "right",
    on: false,
    sort: (r) => r.rating,
    dir: "desc",
    cell: (r) => dash(r.rating?.toFixed(1)),
  },
  Rank("GW CA", (r) => r.gwCA, "lists", "Golfweek 2026, California public-access"),
  Rank("GW US", (r) => r.gwUS, "lists", "Golfweek 2026, U.S. public-access top 100"),
  {
    key: "GD score",
    label: "GD score",
    group: "lists",
    title: "Golf Digest 2025–26 panel score, out of 5",
    align: "right",
    on: false,
    sort: (r) => r.gdScore,
    dir: "desc",
    cell: (r) => dash(r.gdScore?.toFixed(1)),
  },
  Rank("GD CA", (r) => r.gdCA, "lists", "Golf Digest 2025–26 Best in State, California (public and private)"),
  Rank("GD public", (r) => r.gdPublic, "lists", "Golf Digest 2025–26 America's 100 Greatest Public"),
  Rank("GOLF YCP", (r) => r.ycp, "lists", "GOLF's 2024–25 Top 100 You Can Play"),
  {
    key: "record",
    label: "Your record",
    group: "record",
    on: true,
    sort: (r) => (r.state === "played" ? 2000 + r.timesPlayed : r.state === "facility-played" ? 1000 : 0),
    dir: "desc",
    cell: (r) => (
      <span className={`font-mono text-[10px] ${r.state === "played" ? "text-accent-ink" : "text-ink-3"}`}>{r.record}</span>
    ),
  },
  {
    key: "checks",
    label: "Checked",
    word: "checks",
    group: "record",
    title: "how many of the row's five claims have been read against a source",
    align: "right",
    on: false,
    sort: (r) => r.checksVerified,
    dir: "desc",
    cell: (r) => (
      <span className={`font-mono text-[10px] ${r.verified ? "text-ink-1" : "text-ink-3"}`}>{r.checksVerified}/5</span>
    ),
  },
];

const GROUPS: [string, string][] = [
  ["course", "the course"],
  ["tee", "the tee"],
  ["cost", "cost & distance"],
  ["index", "the index"],
  ["lists", "published lists"],
  ["record", "the record"],
];

const DEFAULT_COLS = COLUMNS.filter((c) => c.on).map((c) => c.key);
const STORE_KEY = "ca100.columns";
const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

function compare(a: TableRow, b: TableRow, key: SortKey, dir: Dir): number {
  const ka = key(a);
  const kb = key(b);
  // Unknowns sort last under either direction; ties break on the compiled rank.
  if (ka === null && kb === null) return a.rank - b.rank;
  if (ka === null) return 1;
  if (kb === null) return -1;
  const d = typeof ka === "string" || typeof kb === "string" ? String(ka).localeCompare(String(kb)) : ka - kb;
  return (dir === "asc" ? d : -d) || a.rank - b.rank;
}

/* ── controls ────────────────────────────────────────────────────────────── */

function Select({
  id,
  label,
  value,
  onChange,
  options,
  all = "all",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  all?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 max-w-[11rem] border bg-paper-1 px-2 text-ink-0 rule"
      >
        <option value="all">{all}</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-9 items-center border px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors sm:min-h-0 sm:py-1 rule ${
        on ? "bg-paper-2 text-ink-0" : "text-ink-3 hover:text-ink-1"
      } ${disabled ? "cursor-default opacity-60" : ""}`}
    >
      {children}
    </button>
  );
}

function Verdict({ state }: { state: RecordState }) {
  return (
    <span
      role="img"
      aria-label={STATE_WORD[state]}
      title={STATE_WORD[state]}
      className={`inline-block h-2.5 w-2.5 shrink-0 align-[-1px] ${
        state === "played" ? "bg-accent-ink" : state === "facility-played" ? "border bg-paper-2 rule" : "border bg-paper-0 rule"
      }`}
    />
  );
}

/* ── the opened row ──────────────────────────────────────────────────────── */

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="stamp text-ink-3">{label}</div>
      <div className="mt-1.5 text-[12px] leading-5 text-ink-1">{children}</div>
    </div>
  );
}

function Detail({ r, ctx }: { r: TableRow; ctx: Ctx }) {
  const lists: string[] = [];
  if (r.gwCA !== null || r.gwUS !== null) {
    lists.push(`Golfweek 2026: ${[r.gwCA !== null ? `CA #${r.gwCA}` : null, r.gwUS !== null ? `US #${r.gwUS}` : null].filter(Boolean).join(", ")}`);
  }
  if (r.gdScore !== null || r.gdCA !== null || r.gdPublic !== null) {
    lists.push(
      `Golf Digest 2025–26: ${[
        r.gdScore !== null ? `${r.gdScore.toFixed(1)}/5` : null,
        r.gdCA !== null ? `CA #${r.gdCA}` : null,
        r.gdPublic !== null ? `public #${r.gdPublic}` : null,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }
  if (r.ycp !== null) lists.push(`GOLF Top 100 You Can Play: #${r.ycp}`);

  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Block label="where">
        {r.locality} · {r.region}
        <br />
        <span className="text-ink-2">{r.areaWord}</span> · {r.drive} from SF
        {r.housing !== "none" && (
          <>
            <br />
            <span className="text-ink-2">housing {r.housing}</span>
          </>
        )}
        {r.status === "closed" && (
          <>
            <br />
            <span className="stamp text-ink-3">closed</span>
          </>
        )}
      </Block>
      <Block label="architect">{dash(r.architect)}</Block>
      <Block label="the tee">
        {r.teeName ? `${r.teeName} tee · ` : ""}
        {dash(fmtNum(r.yards))} yds · slope {dash(r.slope)} · rating {dash(r.rating?.toFixed(1))}
      </Block>
      <Block label="fee & value">
        {r.fee} <span className="text-ink-2">· value {r.value ?? "—"}</span>
        {r.feeNote && <div className="text-ink-2">{r.feeNote}</div>}
        {r.valueNote && <div className="text-ink-2">{r.valueNote}</div>}
      </Block>
      <Block label="access">
        {r.access.map((a) => ctx.access[a] ?? a).join(" · ") || "—"}
        {r.tags.length > 0 && <div className="text-ink-2">{r.tags.join(" · ")}</div>}
      </Block>
      <Block label="published lists">
        {lists.length === 0 ? <span className="text-ink-3">on none of the three</span> : lists.map((l) => <div key={l}>{l}</div>)}
      </Block>
      <Block label={`the index · ${r.amarScore.toFixed(1)} · ${r.amarTier} · #${r.amarRank}`}>
        <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-2">
          {AMAR_COMPONENTS.map((k) => (
            <li key={k} className="contents">
              <span>{AMAR_COMPONENT_WORD[k]}</span>
              <span className="block h-1.5 w-full max-w-[8rem] bg-paper-2">
                <span className="block h-full bg-accent-ink" style={{ width: `${r.components[k] * 10}%` }} />
              </span>
              <span className="tabular-nums text-ink-1">{r.components[k].toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block label={`checks · ${r.checksVerified} of 5`}>
        <ul className="space-y-1 font-mono text-[10px] leading-4">
          {r.checks.map((c) => (
            <li key={c.group} className={c.verified ? "text-ink-1" : "text-ink-3"}>
              <span className="mr-1.5" aria-hidden>
                {c.verified ? "✓" : "·"}
              </span>
              {c.word}
              {c.href ? (
                <>
                  {" "}
                  <a href={c.href} target="_blank" rel="noreferrer" className="underline decoration-[var(--line-hard)] underline-offset-2">
                    source
                  </a>
                </>
              ) : null}
              {c.note && <span className="text-ink-3"> — {c.note}</span>}
            </li>
          ))}
        </ul>
      </Block>
      <Block label="your record">
        <span className={r.state === "played" ? "text-accent-ink" : "text-ink-2"}>{STATE_WORD[r.state]}</span>
        {r.record !== "—" && <div>{r.record}</div>}
      </Block>
    </div>
  );
}

/* ── the table ───────────────────────────────────────────────────────────── */

export function CaliforniaList({
  rows,
  access,
  areas,
  tags,
  housing,
}: {
  rows: TableRow[];
  access: Record<string, string>;
  areas: Record<string, string>;
  tags: Record<string, string>;
  housing: Record<string, string>;
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir }>({ key: "rank", dir: "asc" });
  /* The frame's width, so an opened row can be as wide as the frame and not
   * as wide as the table behind it, which pans. */
  const frame = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState<number | null>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS);
  const [pickingCols, setPickingCols] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [state, setState] = useState("all");
  const [area, setArea] = useState("all");
  const [acc, setAcc] = useState("all");
  const [tag, setTag] = useState("all");
  const [house, setHouse] = useState("all");

  /* The column set is the one viewing preference worth keeping. Read after
   * mount so the server's and the first client render agree. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const keys = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === "string" && COLUMNS.some((c) => c.key === k));
      setCols(COLUMNS.filter((c) => c.fixed || keys.includes(c.key)).map((c) => c.key));
    } catch {
      /* no storage: the defaults stand */
    }
  }, []);
  const customized = !same(cols, DEFAULT_COLS);
  const saveCols = (next: string[]) => {
    setCols(next);
    try {
      if (same(next, DEFAULT_COLS)) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* fine */
    }
  };
  const toggleCol = (key: string) =>
    saveCols(COLUMNS.filter((c) => c.fixed || (c.key === key ? !cols.includes(key) : cols.includes(c.key))).map((c) => c.key));
  const setGroup = (group: string, on: boolean) =>
    saveCols(COLUMNS.filter((c) => c.fixed || (c.group === group ? on : cols.includes(c.key))).map((c) => c.key));

  const ctx: Ctx = { access };
  const shown = COLUMNS.filter((c) => cols.includes(c.key));
  const sortCol = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kept = rows.filter(
      (r) =>
        (state === "all" || (state === "unplayed" ? r.state !== "played" : r.state === state)) &&
        (area === "all" || r.area === area) &&
        (acc === "all" || r.access.includes(acc)) &&
        (tag === "all" || r.tags.includes(tag)) &&
        (house === "all" || r.housing === house) &&
        (needle === "" || `${r.name} ${r.locality} ${r.region} ${r.architect ?? ""}`.toLowerCase().includes(needle)),
    );
    const key = sortCol.sort;
    return key ? [...kept].sort((a, b) => compare(a, b, key, sort.dir)) : kept;
  }, [rows, q, state, area, acc, tag, house, sortCol, sort.dir]);

  const clickHeader = (c: Col) => {
    if (!c.sort) return;
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.dir ?? "asc" }));
  };
  const toggleOpen = (slug: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  const filtered = q !== "" || state !== "all" || area !== "all" || acc !== "all" || tag !== "all" || house !== "all";
  const reset = () => {
    setQ("");
    setState("all");
    setArea("all");
    setAcc("all");
    setTag("all");
    setHouse("all");
    setSort({ key: "rank", dir: "asc" });
  };

  /* The rank and the name stay put while the rest pans; a sticky cell needs
   * its own paper, so it takes the row's and follows the row's hover. */
  const thCls = (c: Col, i: number, bg = "bg-paper-0") =>
    `${c.fold && !customized ? "max-sm:hidden" : ""} ${c.align === "right" ? "text-right" : "text-left"} ${
      i === 0
        ? `sticky left-0 z-10 w-10 min-w-10 sm:w-14 sm:min-w-14 ${bg} group-hover:bg-paper-2`
        : i === 1
          ? `sticky left-10 z-10 sm:left-14 sm:min-w-[11rem] ${bg} group-hover:bg-paper-2`
          : ""
    }`;

  return (
    <div className="mt-4">
      {/* ── filters ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor="q" className="flex items-center gap-2 font-mono text-[11px] text-ink-2">
          Find
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="course, town, architect"
            className="min-h-9 w-44 border bg-paper-1 px-2 text-ink-0 placeholder:text-ink-3 rule"
          />
        </label>
        <Select
          id="state"
          label="Record"
          value={state}
          onChange={setState}
          options={[
            ["unplayed", "still to play"],
            ["played", "played"],
            ["facility-played", "facility played, not this course"],
          ]}
        />
        <Select id="area" label="Area" value={area} onChange={setArea} options={Object.entries(areas)} />
        <Select id="access" label="Access" value={acc} onChange={setAcc} options={Object.entries(access)} />
        <Select id="tag" label="Trip" value={tag} onChange={setTag} options={Object.entries(tags)} />
        <Select id="housing" label="Housing" value={house} onChange={setHouse} options={Object.entries(housing)} />
        {(filtered || sort.key !== "rank") && (
          <button type="button" onClick={reset} className="stamp min-h-9 text-ink-3 underline decoration-[var(--line-hard)] underline-offset-4 hover:text-ink-1">
            reset
          </button>
        )}
      </div>

      {/* ── columns ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Chip on={pickingCols} onClick={() => setPickingCols((v) => !v)}>
          columns · {shown.length}
        </Chip>
        {!pickingCols && customized && (
          <button type="button" onClick={() => saveCols(DEFAULT_COLS)} className="stamp min-h-9 text-ink-3 underline decoration-[var(--line-hard)] underline-offset-4 hover:text-ink-1">
            default columns
          </button>
        )}
      </div>
      {pickingCols && (
        <div className="mt-2 grid gap-px border bg-paper-2 rule sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map(([g, word]) => {
            const members = COLUMNS.filter((c) => c.group === g);
            const allOn = members.every((c) => cols.includes(c.key));
            return (
              <fieldset key={g} className="min-w-0 bg-paper-1 p-3">
                <legend className="sr-only">{word}</legend>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="stamp text-ink-3">{word}</span>
                  <button type="button" onClick={() => setGroup(g, !allOn)} className="font-mono text-[10px] text-ink-3 hover:text-ink-1">
                    {allOn ? "none" : "all"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-px">
                  {members.map((c) => (
                    <Chip key={c.key} on={cols.includes(c.key)} disabled={c.fixed} onClick={() => toggleCol(c.key)}>
                      {c.word ?? c.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      {/* ── the count, the order, the legend ── */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="stamp text-ink-3" aria-live="polite">
          {visible.length} of {rows.length} · by {sortCol.word ?? sortCol.label.toLowerCase()} {sort.dir === "asc" ? "↑" : "↓"}
        </p>
        <ul className="flex flex-wrap gap-x-3 font-mono text-[10px] text-ink-3" aria-label="The record's verdict">
          {(["played", "facility-played", "unplayed"] as RecordState[]).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <Verdict state={s} />
              {s === "facility-played" ? "facility played" : STATE_WORD[s]}
            </li>
          ))}
        </ul>
      </div>

      {/* ── the table ── */}
      <div ref={frame} className="mt-2 border-t pan-x rule">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-ink-3">
              {shown.map((c, i) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`whitespace-nowrap px-1.5 py-2 font-normal sm:px-2 ${thCls(c, i)}`}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => clickHeader(c)}
                        title={c.title ?? `order by ${c.word ?? c.label.toLowerCase()}`}
                        className={`stamp inline-flex min-h-7 items-center gap-1 hover:text-ink-1 ${active ? "text-ink-0" : ""}`}
                      >
                        {c.label}
                        <span aria-hidden className={active ? "" : "opacity-0"}>
                          {sort.dir === "asc" ? "↑" : "↓"}
                        </span>
                      </button>
                    ) : (
                      <span className="stamp" title={c.title}>
                        {c.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, n) => {
              const isOpen = open.has(r.slug);
              const muted = r.status === "closed";
              const bg = isOpen || n % 2 ? "bg-paper-1" : "bg-paper-0";
              return (
                <Fragment key={r.slug}>
                  <tr
                    id={`r-${r.rank}`}
                    className={`group scroll-mt-16 border-t align-middle rule ${muted ? "text-ink-3" : "text-ink-1"} ${bg} hover:bg-paper-2`}
                  >
                    {shown.map((c, i) => {
                      if (c.key === "name") {
                        return (
                          <td key={c.key} className={`px-1.5 py-2 sm:px-2 ${thCls(c, i, bg)}`}>
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-controls={`d-${r.slug}`}
                              onClick={() => toggleOpen(r.slug)}
                              className="flex w-full items-start gap-2 text-left"
                            >
                              <span className="mt-[5px]">
                                <Verdict state={r.state} />
                              </span>
                              {/* On a phone the name wraps inside a fixed width so the score and the fee still fit beside it. */}
                              <span className="min-w-0 max-sm:w-[8.5rem]">
                                <span className={`block text-[13px] leading-snug ${muted ? "text-ink-3" : "text-ink-0"}`}>
                                  {r.name}
                                  {muted && <span className="ml-2 stamp text-ink-3">closed</span>}
                                  {!r.verified && !muted && (
                                    <span className="ml-2 stamp text-ink-3" title={`${r.checksVerified} of its five checks verified`}>
                                      {r.checksVerified}/5
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate font-mono text-[10px] leading-4 text-ink-3">
                                  {r.locality} · {r.region}
                                </span>
                              </span>
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={c.key}
                          className={`whitespace-nowrap px-1.5 py-2 tabular-nums sm:px-2 ${thCls(c, i, bg)} ${i === 0 ? "text-ink-2" : ""}`}
                        >
                          {c.cell(r, ctx)}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr id={`d-${r.slug}`} className="bg-paper-1">
                      <td colSpan={shown.length} className="p-0">
                        <div
                          className="sticky left-0 border-l-2 px-3 pb-4 pt-2 sm:px-4"
                          style={{ width: frameW ?? undefined, maxWidth: "100%", borderColor: r.state === "played" ? "var(--accent-ink)" : "var(--line)" }}
                        >
                          <Detail r={r} ctx={ctx} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr className="border-t rule">
                <td colSpan={shown.length} className="px-2 py-6 text-center font-mono text-[11px] text-ink-3">
                  nothing matches — loosen a filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
        Click a heading to order by it, again to reverse; a course name opens its row — the tee, the fee&rsquo;s
        condition, the nine parts of the index score, the published ranks, the five checks and their sources. Fees are
        approximate 2026 posted bands, never a quotation, and nearly every one carries a condition the opened row states;
        a * on a grade does the same. Drives are estimates from central SF; unknowns sort last.
      </p>
    </div>
  );
}
