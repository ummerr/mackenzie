/* The bag chart is Phase 2 and this page becomes it. Deliberately not a stub
 * of that chart: an empty axis with no data behind it looks like a bug, and a
 * fake one would be worse. */
export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-serif text-4xl">The bag chart lands next.</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-6 text-cream-1">
        Ingest is live. Median carry, interquartile bands, the 80th-percentile
        dispersion cone and gap flags come in the next phase, once there are
        enough sessions on file for the numbers to mean anything.
      </p>
      <p className="mt-6 max-w-xl font-mono text-[11px] leading-5 text-cream-3">
        Adding a session: drop the Garmin export in{" "}
        <span className="text-cream-1">data/raw/</span>, run{" "}
        <span className="text-cream-1">pnpm ingest</span>, commit. Only
        range and practice sessions export at all — Home Tee Hero and on-course
        practice do not.
      </p>
    </div>
  );
}
