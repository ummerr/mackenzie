import { photoCredit, type Photo } from "@/lib/california100";

/* A photograph with the credit its licence asks for, printed under it and
 * linked to the Commons page. Plain <img> with width and height so the
 * page does not jump; the files are 1100px wide and lazy. */

export const photoSrc = (ph: Photo) => `/california/photos/${ph.file}`;

export function Credit({ ph, className = "" }: { ph: Photo; className?: string }) {
  return (
    <span className={className}>
      <a href={ph.source.page} target="_blank" rel="noopener noreferrer" className="hover:text-accent-ink">
        {photoCredit(ph)}
      </a>
    </span>
  );
}

export function Picture({
  ph,
  aspect = "4 / 3",
  eager = false,
  className = "",
  caption = true,
}: {
  ph: Photo;
  /** CSS aspect-ratio; the picture is cropped to it with object-fit. */
  aspect?: string;
  eager?: boolean;
  className?: string;
  caption?: boolean;
}) {
  return (
    <figure className={className}>
      <img
        src={photoSrc(ph)}
        alt={ph.caption}
        width={ph.width}
        height={ph.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="block w-full border bg-paper-2 object-cover rule"
        style={{ aspectRatio: aspect }}
      />
      {caption && (
        <figcaption className="mt-1 flex flex-wrap justify-between gap-x-3 font-mono text-[10px] leading-4 text-ink-3">
          <span>{ph.caption}</span>
          <Credit ph={ph} />
        </figcaption>
      )}
    </figure>
  );
}

/** The hero: the picture full-bleed across the column with the title set
 *  into its lower-left over a dark gradient, the credit in the corner. */
export function Hero({ ph, children }: { ph: Photo; children: React.ReactNode }) {
  return (
    <figure className="relative overflow-hidden border rule">
      <img
        src={photoSrc(ph)}
        alt={ph.caption}
        width={ph.width}
        height={ph.height}
        loading="eager"
        fetchPriority="high"
        className="block aspect-[4/3] w-full object-cover sm:aspect-[21/9]"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(10,12,10,0.9) 0%, rgba(10,12,10,0.6) 35%, rgba(10,12,10,0.15) 60%, rgba(10,12,10,0) 78%, rgba(10,12,10,0.45) 100%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 p-4 text-[#f7f4ec] sm:p-6">{children}</div>
      <figcaption className="absolute right-2 top-2 bg-[rgba(10,12,10,0.55)] px-1.5 py-0.5 font-mono text-[9px] leading-4 text-[#e5dfd0]">
        {ph.caption} · <Credit ph={ph} />
      </figcaption>
    </figure>
  );
}
