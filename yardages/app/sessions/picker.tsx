"use client";

import { useMemo, useState } from "react";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";

export function ExclusionPicker({
  shots,
  sessions,
}: {
  shots: LedgerShot[];
  sessions: LedgerSession[];
}) {
  // timestamp -> the exclusion state the user has flipped it to
  const [flips, setFlips] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("hand-excluded");

  const snippet = useMemo(() => {
    const entries = Object.entries(flips);
    if (entries.length === 0) return "";
    const body = entries
      .map(
        ([ts, excluded]) =>
          `    ${JSON.stringify(ts)}: { "excluded": ${excluded}, ${JSON.stringify(
            "reason",
          )}: ${JSON.stringify(excluded ? reason : "")} }`,
      )
      .join(",\n");
    return `  "overrides": {\n${body}\n  }`;
  }, [flips, reason]);

  const toggle = (s: LedgerShot) => {
    setFlips((prev) => {
      const next = { ...prev };
      const target = !(next[s.shotTimestamp] ?? s.isExcluded);
      // Flipping back to what the ledger already says is not an override.
      if (target === s.isExcluded) delete next[s.shotTimestamp];
      else next[s.shotTimestamp] = target;
      return next;
    });
  };

  const f = (v: number | null, d = 1) => (v === null ? "—" : v.toFixed(d));

  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        <label htmlFor="reason" className="text-ink-2">
          Reason
        </label>
        <input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border bg-paper-1 px-2 py-1 text-ink-0 rule"
        />
        {Object.keys(flips).length > 0 && (
          <button onClick={() => setFlips({})} className="border px-2 py-1 text-ink-2 rule">
            reset {Object.keys(flips).length}
          </button>
        )}
      </div>

      {snippet && (
        <pre className="mt-4 overflow-x-auto border bg-paper-1 p-3 text-[11px] text-ink-1 rule">
          {snippet}
        </pre>
      )}

      {sessions.map((session) => {
        const mine = shots.filter((s) => s.sessionId === session.id);
        return (
          <section key={session.id} className="mt-8">
            <h2 className="text-ink-0">
              {session.id.replace("T", " ")}{" "}
              <span className="text-ink-3">
                · {mine.length} shots · {session.sourceFiles.join(", ")}
              </span>
            </h2>
            <table className="mt-2 w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-1 pr-3">Excl</th>
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Time</th>
                  <th className="py-1 pr-3">Club</th>
                  <th className="py-1 pr-3 text-right">Carry</th>
                  <th className="py-1 pr-3 text-right">Ball</th>
                  <th className="py-1 pr-3 text-right">Smash</th>
                  <th className="py-1 pr-3 text-right">Offline</th>
                  <th className="py-1 pr-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((s) => {
                  const excluded = flips[s.shotTimestamp] ?? s.isExcluded;
                  const flipped = s.shotTimestamp in flips;
                  return (
                    <tr
                      key={s.shotTimestamp}
                      className={excluded ? "text-ink-3" : "text-ink-1"}
                    >
                      <td className="py-0.5 pr-3">
                        <input
                          type="checkbox"
                          checked={excluded}
                          onChange={() => toggle(s)}
                          aria-label={`Exclude shot ${s.shotIndex + 1}`}
                        />
                      </td>
                      <td className="py-0.5 pr-3 tabular-nums">{s.shotIndex + 1}</td>
                      <td className="py-0.5 pr-3 tabular-nums">
                        {s.shotTimestamp.slice(11)}
                      </td>
                      <td className="py-0.5 pr-3">{s.club}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">
                        {f(s.carryYd)}
                      </td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">
                        {f(s.ballSpeedMph)}
                      </td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">
                        {f(s.smashFactor, 3)}
                      </td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">
                        {f(s.offlineYd)}
                      </td>
                      <td className="py-0.5 pr-3">
                        {s.exclusionReason ?? ""}
                        {flipped && <span className="text-accent-ink"> ← changed</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
