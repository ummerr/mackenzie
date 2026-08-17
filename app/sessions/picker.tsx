"use client";

import { useMemo, useState } from "react";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";

/* The generated block is meant to be pasted into a file, and on a phone that
 * means the clipboard — selecting eight lines of JSON out of a <pre> by hand is
 * the kind of thing that makes you stop bothering to exclude bad shots. Falls
 * back to leaving the text there to select, which is all it ever was. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* no clipboard permission; the block is still on the page */
        }
      }}
      className="flex min-h-9 items-center border px-3 text-ink-2 rule"
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

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
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="reason" className="text-ink-2">
          Reason
        </label>
        <input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-9 min-w-0 flex-1 border bg-paper-1 px-2 text-ink-0 sm:flex-none rule"
        />
        {snippet && <CopyButton text={snippet} />}
        {Object.keys(flips).length > 0 && (
          <button
            onClick={() => setFlips({})}
            className="flex min-h-9 items-center border px-3 text-ink-2 rule"
          >
            reset {Object.keys(flips).length}
          </button>
        )}
      </div>

      {snippet && (
        <pre className="mt-4 border bg-paper-1 p-3 text-[11px] text-ink-1 pan-x rule">
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
            {/* Three of the nine columns are context rather than the decision —
                you exclude a shot for its carry, its club and the reason already
                on it. Those three fold away below `sm` so the checkbox and the
                numbers it turns on fit a phone without a sideways scroll; the
                frame still scrolls if a club name is long enough to need it. */}
            <div className="mt-2 pan-x">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-left text-ink-3">
                    <th className="py-1 pr-3">Excl</th>
                    <th className="py-1 pr-3">#</th>
                    <th className="hidden py-1 pr-3 sm:table-cell">Time</th>
                    <th className="py-1 pr-3">Club</th>
                    <th className="py-1 pr-3 text-right">Carry</th>
                    <th className="hidden py-1 pr-3 text-right sm:table-cell">Ball</th>
                    <th className="hidden py-1 pr-3 text-right sm:table-cell">Smash</th>
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
                        {/* The label is the tap target, not the box: a 13px
                            checkbox is half the 24px minimum, and padding the
                            cell around it would only make the miss quieter. */}
                        <td className="pr-3">
                          <label className="flex h-8 w-8 items-center justify-start sm:h-auto sm:w-auto sm:py-0.5">
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={() => toggle(s)}
                              aria-label={`Exclude shot ${s.shotIndex + 1}`}
                            />
                          </label>
                        </td>
                        <td className="py-0.5 pr-3 tabular-nums">{s.shotIndex + 1}</td>
                        <td className="hidden py-0.5 pr-3 tabular-nums sm:table-cell">
                          {s.shotTimestamp.slice(11)}
                        </td>
                        <td className="py-0.5 pr-3">{s.club}</td>
                        <td className="py-0.5 pr-3 text-right tabular-nums">
                          {f(s.carryYd)}
                        </td>
                        <td className="hidden py-0.5 pr-3 text-right tabular-nums sm:table-cell">
                          {f(s.ballSpeedMph)}
                        </td>
                        <td className="hidden py-0.5 pr-3 text-right tabular-nums sm:table-cell">
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
            </div>
          </section>
        );
      })}
    </>
  );
}
