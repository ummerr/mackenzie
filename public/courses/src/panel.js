/* The dossier — everything known about one facility, with its citations shown
 * rather than footnoted. Depends on shared.js. */

/* eslint-disable no-unused-vars */

const BARS = [
  ["Rating", "overall"],
  ["Fun", "fun"],
  ["Condition", "condition"],
];

/** A curated claim renders its source next to it. A claim without a visible
 *  source is indistinguishable from an assertion, which is the thing this
 *  whole data model exists to avoid. */
function claim(label, c) {
  if (!c) return "";
  const val = Array.isArray(c.value) ? c.value.join(" · ") : c.value;
  const unverified = c.verified ? "" : `<span class="badge warn">unverified</span>`;
  const conf = c.confidence && c.confidence !== "high" ? `<span class="badge">${esc(c.confidence)}</span>` : "";
  const src = /^https?:/.test(c.source ?? "")
    ? `<a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.source.replace(/^https?:\/\/(www\.)?/, "").slice(0, 42))}</a>`
    : esc(c.source ?? "");
  return `<dt>${esc(label)}</dt><dd>${esc(val)}${conf}${unverified}<small>${src}</small></dd>`;
}

/** OSM tags are facts too, but from a different source, so they get their own
 *  block and their own attribution rather than being blended into the curated
 *  set. */
function osmClaim(label, value, osmId) {
  if (value == null || value === "") return "";
  const shown = /^https?:/.test(value)
    ? `<a href="${esc(value)}" target="_blank" rel="noopener">${esc(value.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38))}</a>`
    : esc(value);
  return `<dt>${esc(label)}</dt><dd>${shown}<small>OpenStreetMap ${esc(osmId ?? "")}</small></dd>`;
}

function bar(label, value) {
  if (value == null) return "";
  return `
    <div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, value))}%"></span></span>
      <span class="bar-val">${value.toFixed(1)}</span>
    </div>`;
}

function layoutBlock(l, facilityLayoutCount) {
  const name = l.grintLayoutName ?? (facilityLayoutCount > 1 ? "Main course" : "The course");
  const plays = l.timesPlayed === 1 ? "1 round" : `${l.timesPlayed} rounds`;
  const avg = l.avgScore ? `avg ${l.avgScore.toFixed(1)}` : "no score";
  const flags = l.flags.length
    ? `<div class="flagline">${l.flags.map((f) => `▲ ${esc(FLAG_LABEL[f] ?? f)}`).join("<br>")}</div>`
    : "";

  return `
    <div class="layout">
      <div class="layout-head">
        <span class="layout-name">${esc(name)}</span>
        <span class="layout-rank">${ordinal(l.personalRank)} of 94</span>
      </div>
      <div class="layout-sub">${esc(plays)} · ${esc(avg)}</div>
      ${BARS.map(([lab, k]) => bar(lab, l.ratings[k])).join("")}
      ${flags}
    </div>`;
}

function renderDossier(f) {
  const facts = f.facts ?? {};
  const t = f.osmTags ?? {};

  const identity = [
    claim("Architect", facts.architect),
    claim("Opened", facts.yearOpened),
    claim("Access", facts.access),
    claim("Championships", facts.championships),
  ].join("");

  const osm = [
    osmClaim("Holes", t.holes, f.osmId),
    osmClaim("Par", t.par, f.osmId),
    osmClaim("Access", facts.access ? null : t.access, f.osmId),
    osmClaim("Architect", facts.architect ? null : t.architect, f.osmId),
    osmClaim("Operator", t.operator, f.osmId),
    osmClaim("Website", t.website, f.osmId),
    f.areaAcres ? `<dt>Area</dt><dd>${f.areaAcres} acres<small>derived from the OSM boundary</small></dd>` : "",
  ].join("");

  const notes = facts.notes
    ? `<p class="note">${esc(facts.notes.value)}
        <span class="cite">${
          /^https?:/.test(facts.notes.source)
            ? `<a href="${esc(facts.notes.source)}" target="_blank" rel="noopener">${esc(facts.notes.source)}</a>`
            : esc(facts.notes.source)
        }${facts.notes.verified ? "" : " · unverified"}</span></p>`
    : "";

  const rankings = (facts.rankings ?? [])
    .map(
      (r) => `<dt>#${r.rank}</dt><dd>${esc(r.list)} <span class="badge">${r.year}</span>${
        r.verified ? "" : `<span class="badge warn">unverified</span>`
      }<small>${esc((r.source ?? "").replace(/^https?:\/\/(www\.)?/, "").slice(0, 42))}</small></dd>`,
    )
    .join("");

  const section = (n, label, body, emptyMsg) => {
    if (!body && !emptyMsg) return "";
    return `
      <div class="spec-rule"><span class="spec-index">${n}</span><span class="spec-label">${label}</span></div>
      ${body ? `<dl class="kv">${body}</dl>` : `<p class="empty">${emptyMsg}</p>`}`;
  };

  return `
    <div class="dos-body">
      <h2 class="dos-name">${esc(f.name)}</h2>
      <div class="dos-place">${esc(place(f))}</div>

      ${section("01", "Your record", "", "")}
      ${f.layouts.map((l) => layoutBlock(l, f.layoutCount)).join("")}

      ${section(
        "02",
        "Identity",
        identity,
        "No curated facts yet. Add an entry to <code>data/facts.json</code> keyed <code>" + esc(f.slug) + "</code>.",
      )}
      ${notes}

      ${rankings ? section("03", "Published rankings", rankings, "") : ""}
      ${osm ? section(rankings ? "04" : "03", "From OpenStreetMap", osm, "") : ""}

      ${section(
        rankings && osm ? "05" : rankings || osm ? "04" : "03",
        "Provenance",
        `<dt>Pin</dt><dd>${esc(PRECISION_LABEL[f.precision] ?? f.precision ?? "unknown")}<small>${
          f.lat != null ? `${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}` : "no coordinate"
        }</small></dd>
         <dt>Boundary</dt><dd>${
           f.hasPolygon ? `matched <code>${esc(f.osmId)}</code>` : "not found in OSM"
         }<small>${f.hasPolygon ? "outline drawn on the map" : "renders as a pin only"}</small></dd>
         <dt>Grint name</dt><dd>${esc(f.grintName)}<small>data/raw/grint-played-2026-08-01.txt</small></dd>
         ${f.aliases?.length ? `<dt>Also listed</dt><dd>${f.aliases.map(esc).join("<br>")}<small>merged into one facility</small></dd>` : ""}`,
        "",
      )}
    </div>`;
}
