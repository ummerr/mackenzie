// Shared constants for the Grint Export scraper.
//
// These files are injected with chrome.scripting.executeScript on every click,
// so nothing here may use top-level const/let in the global scope — everything
// hangs off one namespace object that survives (and tolerates) re-injection.

window.__GRINT = window.__GRINT || {};

window.__GRINT.constants = {
  BASE: "https://thegrint.com",
  FORMAT: "grint-export/1",
  VERSION: "0.1.2",

  // The 13 stats views enumerated in the /trend sidebar. "" is the default
  // view (Handicap Index).
  TREND_VIEWS: [
    "",
    "hdcp_card",
    "score",
    "putt",
    "grint",
    "gir",
    "fwy_round",
    "tee_round",
    "scrambling_par_saves",
    "putt_streak",
    "career",
    "summary",
    "course_rounds",
  ],

  // Anchor hrefs that link to one round's data page. The first live run
  // (2026-08-15) showed the /score listing offers exactly three actions per
  // round: edit_score, edit_short_score, delete_score. The edit pages carry
  // the full per-hole form (fH1..fH18 etc.) and are safe GETs; delete_score
  // is a destructive GET and must NEVER be fetched — hence the strict
  // allowlist plus a belt-and-braces exclusion checked again before fetching.
  ROUND_LINK_RE: /\/score\/(?:edit_score|edit_short_score|view_score|scorecard|score_visual)\/(\d{4,})/i,
  ROUND_LINK_EXCLUDE_RE: /delete|remove|add_|copy_|proshop/i,

  // Pagination candidates on the /score listing.
  PAGE_LINK_RE: /[?&/](?:page|offset|start|per_page)[=/]\d+/i,
  MAX_SCORE_PAGES: 100,

  // The /score listing is infinite-scroll (decoded from the page's own JS in
  // the 2026-08-15 capture): the scroll handler POSTs here with an
  // incrementing `wave` and the current table row count as wave18/wave9, and
  // the server answers with raw <tr> rows — empty body when exhausted.
  LIST_MORE_PATH: "/score/listMoreScores",
  MAX_WAVES: 100,

  // /ajax/get_course_data/<courseId>/<teeId> — confirmed alive in RECON.md.
  COURSE_DATA_RE: /ajax\/get_course_data\/(\d+)\/(\d+)/i,

  // Politeness. Sequential fetches only; ~2 req/s worst case.
  DELAY_MS: 500,
  JITTER_MS: 250,
  FETCH_TIMEOUT_MS: 20000,
  RETRY_BACKOFF_MS: 3000,

  // Stop the run after this many consecutive logged-out responses.
  MAX_AUTH_FAILURES: 3,
};
