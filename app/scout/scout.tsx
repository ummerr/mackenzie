"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { short } from "@/lib/clubs";
import { pickApproach, SCOUT_RULES, type PinPos, type ScoutCourseView } from "@/lib/scout";

/* The scout card. Everything numeric arrived precomputed from lib/scout.ts;
 * this component chooses between prepared answers — a tee set, a hole, a
 * pin, a club — and draws them. Phone-first: it is read standing on the
 * tee, so every control is a 44px target and the next hole is a swipe. */

const IMAGERY = {
  loading: "#15251b",
  line: "#ffffff",
  halo: "rgba(0, 0, 0, 0.5)",
  ghost: "rgba(255, 255, 255, 0.55)",
  accent: "#ffb03a",
  sand: "rgba(255, 230, 170, 0.32)",
  sandLine: "#ffe6aa",
  green: "#b6ffb0",
  greenFill: "rgba(182, 255, 176, 0.14)",
  warn: "#ff5a5a",
  water: "#7fd0ff",
  fairway: "rgba(255, 255, 255, 0.18)",
} as const;

const key = (slug: string, what: string) => `scout:${slug}:${what}`;
const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
const PIN_ROWS: PinPos[][] = [
  ["back-left", "back-centre", "back-right"],
  ["middle-left", "middle-centre", "middle-right"],
  ["front-left", "front-centre", "front-right"],
];

export function Scout({ course }: { course: ScoutCourseView }) {
  const [teeIdx, setTeeIdx] = useState(() => Math.max(0, course.tees.findIndex((t) => t.name === "White")));
  const [holeIdx, setHoleIdx] = useState(0);
  const [pins, setPins] = useState<Record<number, PinPos>>({});
  const [clubs, setClubs] = useState<Record<number, string>>({});

  // The tee set and the hole are the two things worth remembering between
  // opens — the phone goes to sleep between shots. Read after mount so the
  // server's and the first client render agree.
  useEffect(() => {
    try {
      const t = localStorage.getItem(key(course.slug, "tee"));
      const i = course.tees.findIndex((x) => x.name === t);
      if (i !== -1) setTeeIdx(i);
      const h = Number(localStorage.getItem(key(course.slug, "hole")));
      if (Number.isInteger(h) && h >= 0 && h < course.holes.length) setHoleIdx(h);
    } catch {
      /* no storage: the defaults stand */
    }
  }, [course.slug, course.tees, course.holes.length]);
  const chooseTee = (i: number) => {
    setTeeIdx(i);
    try {
      localStorage.setItem(key(course.slug, "tee"), course.tees[i].name);
    } catch {
      /* fine */
    }
  };
  const go = useCallback(
    (i: number) => {
      const n = ((i % course.holes.length) + course.holes.length) % course.holes.length;
      setHoleIdx(n);
      try {
        localStorage.setItem(key(course.slug, "hole"), String(n));
      } catch {
        /* fine */
      }
    },
    [course.slug, course.holes.length],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(holeIdx + 1);
      if (e.key === "ArrowLeft") go(holeIdx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, holeIdx]);
  const touchX = useRef<number | null>(null);

  const hole = course.holes[holeIdx];
  const tee = course.tees[teeIdx];
  const tv = hole.byTee.find((t) => t.tee === tee.name) ?? hole.byTee[0];
  const pinPos = pins[hole.number] ?? "middle-centre";
  const pin = hole.pins.find((p) => p.pos === pinPos) ?? hole.pins[4];
  const rec = tv.plays.find((p) => p.recommended) ?? null;
  const play = tv.plays.find((p) => p.club === clubs[hole.number]) ?? rec;

  // The number in: to the centre from the landing band (or the tee on a par
  // 3), and to the flag with the pin's own offset. The club covers the flag
  // inside 140 and the centre beyond — the plan's standing rule.
  const toCentre = play ? play.remainingYd : tv.toCentreYd;
  const toFlag = Math.round(toCentre + pin.alongYd);
  const approachTarget = toFlag <= SCOUT_RULES.middleOfGreenBeyondYd ? toFlag : toCentre;
  const approach = pickApproach(course.player.approachClubs, approachTarget);
  const verdict =
    hole.par === 3
      ? `${tv.toCentreYd} to the middle: ${approach.club ? short(approach.club) : "—"}${approach.oneMore ? `, ${short(approach.oneMore)} if the flag is back` : ""}. ${hole.spec.target.text}`
      : play
        ? `${play.line} ${hole.spec.target.text}`
        : hole.spec.target.text;

  const vb = hole.viewBox;
  const u = Math.max(vb.w, vb.h); // viewBox units are metres
  const fs = u * 0.034;
  const r = u * 0.012;
  const flagH = u * 0.06;
  const aim: { x: number; y: number }[] = hole.par === 3 ? [tv.teePoint, pin.p] : play ? [tv.teePoint, play.landing.centre, pin.p] : [tv.teePoint, pin.p];

  return (
    <div
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) go(holeIdx + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px]">{course.name.toUpperCase()}</h1>
          <p className="stamp mt-3 text-ink-3">
            {tee.name} · {tee.yards} yd · {tee.rating}/{tee.slope} · course handicap {tee.courseHandicap ?? "—"} · plan {tee.planTotal}
            {course.lastRound ? ` · last time ${course.lastRound.strokes ?? "—"} (${course.lastRound.date})` : ""}
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Tee set">
          {course.tees.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => chooseTee(i)}
              aria-pressed={i === teeIdx}
              className={`stamp h-11 border px-3 rule ${i === teeIdx ? "bg-paper-2 text-ink-0" : "text-ink-2"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* The hole strip: 18 boxes, the current one pressed. */}
      <nav className="pan-x mt-5 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Holes">
        <ol className="flex gap-px border bg-paper-2 rule">
          {course.holes.map((h, i) => {
            const t = h.byTee.find((x) => x.tee === tee.name) ?? h.byTee[0];
            return (
              <li key={h.number} className="min-w-11 flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === holeIdx ? "step" : undefined}
                  className={`flex h-12 w-full flex-col items-center justify-center font-mono text-[12px] leading-none ${
                    i === holeIdx ? "bg-paper-2 text-ink-0" : "bg-paper-1 text-ink-2"
                  }`}
                >
                  <span className="font-medium">{h.number}</span>
                  <span className="mt-1 text-[9px] text-ink-3">{t.target}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-[64px] leading-none">{hole.number}</h2>
            <dl className="text-right font-mono text-[11px] leading-5 text-ink-2">
              <div>
                par {hole.par} · {tv.yards} yd · hcp {hole.hcp}
              </div>
              <div>
                target <span className="text-ink-0">{tv.target}</span> · refuse <span className="text-accent-ink">{tv.refuse}</span>
                {hole.lastTime?.strokes !== null && hole.lastTime ? ` · last ${hole.lastTime.strokes}` : ""}
              </div>
            </dl>
          </div>
          <svg
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="mt-2 aspect-[3/4] w-full rounded-sm"
            style={{ background: IMAGERY.loading }}
            role="img"
            aria-label={`Hole ${hole.number}: the plan over the hole`}
          >
            {hole.tiles.map((t) => (
              <image key={t.href} href={t.href} width={256} height={256} transform={t.transform} />
            ))}
            {hole.fairways.map((f, i) => (
              <polygon key={`f${i}`} points={poly(f)} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.fairway }} />
            ))}
            {hole.water.map((w, i) => (
              <polygon key={`w${i}`} points={poly(w)} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.water, fill: "rgba(127,208,255,0.2)" }} />
            ))}
            {hole.bunkers.map((b, i) => (
              <polygon key={`b${i}`} points={poly(b.pts)} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.sandLine, fill: IMAGERY.sand }} />
            ))}
            {hole.green.pts ? (
              <polygon points={poly(hole.green.pts)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.green, fill: IMAGERY.greenFill }} />
            ) : (
              <circle cx={hole.green.centre.x} cy={hole.green.centre.y} r={hole.green.depthYd * 0.9144 / 2} strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.green, fill: IMAGERY.greenFill }} />
            )}
            <polyline points={poly(hole.line)} fill="none" strokeWidth={1} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.ghost }} />
            {/* Last time: the watch's trace, ghosted. */}
            {hole.lastTime?.segs.map((s, i) => (
              <g key={`l${i}`}>
                <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.ghost }} />
                <circle cx={s.b.x} cy={s.b.y} r={r * 0.8} style={{ fill: IMAGERY.ghost }} />
              </g>
            ))}
            {/* The plan: landing band, aim line, the flag. */}
            {play && hole.par !== 3 && (
              <ellipse
                cx={play.landing.centre.x}
                cy={play.landing.centre.y}
                rx={play.landing.rx}
                ry={play.landing.ry}
                transform={`rotate(${play.landing.angle} ${play.landing.centre.x} ${play.landing.centre.y})`}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: IMAGERY.accent, fill: "rgba(255,176,58,0.22)" }}
              />
            )}
            <polyline points={poly(aim)} fill="none" strokeWidth={3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.halo }} />
            <polyline points={poly(aim)} fill="none" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.line }} />
            <circle cx={tv.teePoint.x} cy={tv.teePoint.y} r={r * 1.4} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.accent }} />
            <g>
              <line x1={pin.p.x} y1={pin.p.y} x2={pin.p.x} y2={pin.p.y - flagH} strokeWidth={3} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.halo }} />
              <line x1={pin.p.x} y1={pin.p.y} x2={pin.p.x} y2={pin.p.y - flagH} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ stroke: IMAGERY.line }} />
              <path
                d={`M${pin.p.x} ${pin.p.y - flagH}L${pin.p.x + flagH * 0.55} ${pin.p.y - flagH * 0.78}L${pin.p.x} ${pin.p.y - flagH * 0.56}Z`}
                style={{ fill: pin.sucker ? IMAGERY.warn : IMAGERY.accent }}
              />
            </g>
            {play && hole.par !== 3 && (
              <text x={play.landing.centre.x + play.landing.ry + fs * 0.4} y={play.landing.centre.y + fs * 0.35} fontSize={fs} fontFamily="ui-monospace, monospace" style={{ fill: IMAGERY.line, paintOrder: "stroke", stroke: IMAGERY.halo, strokeWidth: fs * 0.25 }}>
                {play.landing.medYd}
              </text>
            )}
            <text x={pin.p.x + fs * 0.6} y={pin.p.y - flagH * 0.1} fontSize={fs} fontFamily="ui-monospace, monospace" style={{ fill: IMAGERY.line, paintOrder: "stroke", stroke: IMAGERY.halo, strokeWidth: fs * 0.25 }}>
              {toFlag} in
            </text>
          </svg>
          <p className="mt-2 font-mono text-[10px] leading-4 text-ink-3">
            {hole.approximateLine ? "No OSM centreline — the line is the watch's tee→pin from the last round. " : ""}
            {hole.green.approximate ? "No OSM green — the circle stands in. " : ""}
            {tv.extended ? "This tee set lies beyond the drawn line; extended along it. " : ""}
            Green {hole.green.depthYd} deep × {hole.green.widthYd} wide.
          </p>
        </section>

        <section className="space-y-4">
          <p className="border-t pt-3 text-[17px] font-medium leading-6 text-ink-0 rule-hard">{verdict}</p>

          {hole.par !== 3 && (
            <div>
              <h3 className="stamp text-ink-3">Tee</h3>
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Tee club">
                {tv.plays.map((p) => {
                  const on = play?.club === p.club;
                  return (
                    <button
                      key={p.club}
                      type="button"
                      onClick={() => setClubs({ ...clubs, [hole.number]: p.club })}
                      aria-pressed={on}
                      className={`h-11 border px-3 font-mono text-[12px] rule ${on ? "bg-paper-2 text-ink-0" : "text-ink-2"}`}
                    >
                      {p.club}
                      {p.recommended ? " ✓" : ""}
                      <span className="ml-2 text-ink-3">{p.landing.nearYd}–{p.landing.farYd}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] leading-5 text-ink-1">
                {play?.cost ?? `${play ? short(play.club) : ""}: ${hole.spec.tee.why}`}
              </p>
              {play && !play.recommended && <p className="mt-1 text-[13px] leading-5 text-ink-2">{hole.spec.tee.why}</p>}
              {rec && rec.landing && !course.player.teeClubs.find((c) => c.club === rec.club)?.lateralMeasured && (
                <p className="mt-1 font-mono text-[10px] text-ink-3">band width is a default, not measured</p>
              )}
            </div>
          )}

          <div>
            <h3 className="stamp text-ink-3">Pin · {toFlag} to the flag, {toCentre} to the middle</h3>
            <div className="mt-2 grid w-fit grid-cols-3 gap-px border bg-paper-2 rule" role="group" aria-label="Pin position">
              {PIN_ROWS.flat().map((pos) => {
                const pr = hole.pins.find((p) => p.pos === pos)!;
                const on = pos === pinPos;
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setPins({ ...pins, [hole.number]: pos })}
                    aria-pressed={on}
                    aria-label={`${pos}${pr.sucker ? ", sucker pin" : ""}`}
                    className={`flex h-11 w-14 items-center justify-center ${on ? "bg-paper-2" : "bg-paper-1"}`}
                  >
                    <span
                      className="block h-3 w-3 rounded-full"
                      style={{
                        background: pr.sucker ? "var(--verdict-inverted)" : on ? "var(--accent)" : "var(--ink-3)",
                        outline: on ? "2px solid var(--ink-0)" : "none",
                        outlineOffset: 2,
                      }}
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] leading-5 text-ink-1">
              {pin.sucker ? <span className="stamp mr-2 text-[var(--verdict-inverted)]">sucker pin</span> : null}
              {pin.aim}
              {pin.why ? ` ${pin.why}` : ""}
            </p>
          </div>

          <div>
            <h3 className="stamp text-ink-3">Approach</h3>
            <p className="mt-2 text-[13px] leading-5 text-ink-1">
              {approach.club ? (
                <>
                  <span className="font-medium text-ink-0">{approach.club}</span>
                  {approach.oneMore ? ` — ${short(approach.oneMore)} is one more club` : ""}
                  {approach.reaches ? "" : " — no measured club reaches; lay up"}
                  {` (${approachTarget === toFlag ? "to the flag" : "to the middle — outside 140"}).`}
                </>
              ) : (
                "No measured approach club."
              )}{" "}
              {hole.spec.green.note} Miss: {hole.spec.green.missSafe.toLowerCase()}. Dead: {hole.spec.green.missDead.toLowerCase()}.
            </p>
            {play?.second && (
              <p className="mt-1 text-[13px] leading-5 text-ink-2">
                Three shots: {short(play.club)}, then {short(play.second.club)} to {play.second.leaveYd}, then{" "}
                {play.second.third.club ? short(play.second.third.club) : "a wedge"}.
              </p>
            )}
          </div>

          {hole.lastTime && (
            <div>
              <h3 className="stamp text-ink-3">Last time · {hole.lastTime.date}</h3>
              <p className="mt-2 font-mono text-[12px] leading-5 text-ink-2">{hole.lastTime.line}</p>
            </div>
          )}

          <p className="font-mono text-[10px] leading-4 text-ink-3">
            tee note: {course.sources[hole.spec.tee.source]?.title ?? hole.spec.tee.source} · green: {course.sources[hole.spec.green.source]?.title ?? hole.spec.green.source}
          </p>

          <div className="flex gap-px border bg-paper-2 rule">
            <button type="button" onClick={() => go(holeIdx - 1)} className="stamp h-12 flex-1 bg-paper-1 text-ink-1">
              ← {course.holes[(holeIdx + 17) % 18].number}
            </button>
            <button type="button" onClick={() => go(holeIdx + 1)} className="stamp h-12 flex-1 bg-paper-1 text-ink-1">
              {course.holes[(holeIdx + 1) % 18].number} →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
