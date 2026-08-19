/* The list — the same layouts the map plots, as a ranked table.
 *
 * The map answers "where"; this answers "in what order", which is the question
 * the Grint ranking paste was captured for in the first place. One source of
 * truth: rows come from the already-built courses.json, sorted by whichever
 * lens the rail has active — so RANK is the Grint personal ranking, SCORE is
 * where you score well, and so on. Unranked courses (rounds_only — played and
 * recorded, but newer than the last paste) sink to the bottom with their
 * absence labelled rather than faked.
 *
 * Depends on shared.js. Exposes a single global, like CoursePlan. */

/* eslint-disable no-unused-vars */

const CourseList = (() => {
  let data = null; // the courses.json payload
  let getLens = () => "grint";
  let onPick = () => {};
  let open = false;

  /** One row per layout, carrying its facility for place/name fields. */
  function rows() {
    const out = [];
    for (const f of data.facilities) {
      for (const l of f.layouts) out.push({ f, l });
    }
    const lens = getLens();
    out.sort((a, b) => {
      const sa = a.l.scores?.[lens]?.score;
      const sb = b.l.scores?.[lens]?.score;
      if (sa != null || sb != null) {
        if (sa == null) return 1;
        if (sb == null) return -1;
        if (sb !== sa) return sb - sa;
      }
      const ra = a.l.personalRank ?? Infinity;
      const rb = b.l.personalRank ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.f.name.localeCompare(b.f.name);
    });
    return out;
  }

  const rowName = (f, l) => {
    if (f.layoutCount > 1 && l.grintLayoutName) return `${f.name} — ${l.grintLayoutName}`;
    // A layout that arrived under its own facility name (a renamed course
    // merged by alias, e.g. Brambles at Hidden Valley Lake) keeps that name.
    if (l.grintFacilityName && l.grintFacilityName !== f.grintName)
      return `${f.name} — ${l.grintFacilityName}`;
    return f.name;
  };

  const num = (v, digits = 0) => (v == null ? "—" : Number(v).toFixed(digits));

  function scoreCell(l) {
    const s = l.scores?.[getLens()]?.score;
    if (s == null) return `<span class="list-score none">—</span>`;
    return `<span class="list-score"><i style="background:${rampAt(s)}"></i>${s.toFixed(2)}</span>`;
  }

  function render() {
    const rs = rows();
    const lensLabel = RAIL.find((r) => r.lens === getLens())?.label ?? getLens();
    const unranked = rs.filter((r) => r.l.personalRank == null).length;

    const head = `
      <div class="list-head">
        <span class="list-title">${rs.length} courses · by ${esc(lensLabel)}</span>
        ${
          unranked
            ? `<span class="list-note">▲ ${unranked} unranked — in the round record, awaiting the next ranking paste</span>`
            : ""
        }
      </div>`;

    const header = `
      <div class="list-row list-header">
        <span>#</span><span>Rank</span><span>Course</span><span>Where</span>
        <span class="num">Rounds</span><span class="num">Avg</span>
        <span class="num">Rating</span><span class="num">Fun</span><span class="num">Cond</span>
        <span class="num">${esc(lensLabel.toLowerCase())}</span>
      </div>`;

    const body = rs
      .map(({ f, l }, i) => {
        const flagged = l.flags.length
          ? ` title="${esc(l.flags.map((x) => FLAG_LABEL[x] ?? x).join(" · "))}"`
          : "";
        const mark = l.flags.length ? `<i class="list-flag">▲</i>` : "";
        return `
      <button class="list-row" data-slug="${esc(f.slug)}"${flagged}>
        <span class="list-pos">${i + 1}</span>
        <span class="list-rank">${l.personalRank == null ? "—" : ordinal(l.personalRank)}</span>
        <span class="list-name">${esc(rowName(f, l))}${mark}</span>
        <span class="list-place">${esc(place(f) || "—")}</span>
        <span class="num">${l.timesPlayed}</span>
        <span class="num">${num(l.avgScore, 1)}</span>
        <span class="num">${num(l.ratings.overall)}</span>
        <span class="num">${num(l.ratings.fun)}</span>
        <span class="num">${num(l.ratings.condition)}</span>
        ${scoreCell(l)}
      </button>`;
      })
      .join("");

    $("#list").innerHTML = `${head}<div class="list-grid">${header}${body}</div>`;
  }

  function install(courses, opts) {
    data = courses;
    getLens = opts.getLens ?? getLens;
    onPick = opts.onPick ?? onPick;
    $("#list").addEventListener("click", (e) => {
      const row = e.target.closest(".list-row[data-slug]");
      if (row) onPick(row.dataset.slug);
    });
  }

  function setOpen(v) {
    open = v;
    if (open) render();
    $("#list").classList.toggle("on", open);
  }

  return {
    install,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    isOpen: () => open,
    /** Re-sort in place when the rail switches lens while the list is up. */
    lensChanged: () => {
      if (open) render();
    },
  };
})();
