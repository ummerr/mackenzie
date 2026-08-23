import type { ReactNode } from "react";
import type { SourceRef } from "@/lib/sources";

/* The one "read from" block, everywhere. Four pages used to say where their
 * numbers came from in four different shapes; provenance is one fact-family
 * and gets one rendering. Each page passes the subset of sources it actually
 * reads — lib/sources.ts owns the order and the wording, including what a
 * missing artifact says. */
export function Provenance({ sources, note }: { sources: SourceRef[]; note?: ReactNode }) {
  return (
    <section className="mt-10 border-t pt-4 rule">
      <h2 className="stamp text-ink-2">Read from</h2>
      <dl className="mt-3 space-y-1 font-mono text-[11px] leading-5">
        {sources.map((s) => (
          <div key={s.id} className="flex flex-wrap gap-x-3">
            <dt className="w-28 shrink-0 text-ink-1">{s.label}</dt>
            <dd className="text-ink-3">{s.detail}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="mt-3 max-w-2xl font-mono text-[10px] leading-4 text-ink-3">{note}</p>
      )}
    </section>
  );
}
