// Shared constants for the Garmin Golf Export scraper.
//
// These files are injected with chrome.scripting.executeScript on every click,
// so nothing here may use top-level const/let in the global scope — everything
// hangs off one namespace object that survives (and tolerates) re-injection.

window.__GARMIN = window.__GARMIN || {};

window.__GARMIN.constants = {
  BASE: "https://connect.garmin.com",
  // The golf community API. The current /app SPA calls it at /golf-api,
  // same-origin, authenticated by the session cookie alone plus a CSRF token
  // echoed from the page (confirmed by capturing the SPA's own request,
  // 2026-08-22) — no bearer token, no DI-Backend, no NK header. The two
  // legacy paths (/modern/proxy and bare) are kept only as fallbacks. Unlike
  // TheGrint there is no HTML to scrape: every endpoint answers JSON, and the
  // bundle stores each response body verbatim.
  API_GOLF: "https://connect.garmin.com/golf-api/gcs-golfcommunity/api/v2",
  API_PROXY: "https://connect.garmin.com/modern/proxy/gcs-golfcommunity/api/v2",
  API_DIRECT: "https://connect.garmin.com/gcs-golfcommunity/api/v2",
  FORMAT: "garmin-export/1",
  VERSION: "0.1.0",

  // One call is both the login check and round discovery — no pagination
  // waves. 10000 should be exhaustive; the scraper probes page 2 and records
  // a loud warning if the summary comes back full.
  SUMMARY_PAGE_SIZE: 10000,
  SUMMARY_PATH: "/scorecard/summary?per-page=10000&user-locale=en",

  DETAIL_PATH: (id) =>
    `/scorecard/detail?scorecard-ids=${id}&include-longest-shot-distance=true`,
  // The SPA fetches a whole scorecard's shots with no hole-numbers; that
  // all-at-once call is tried first (discovery.holeShotPattern records what
  // was used). A single hole-numbers value fills any gaps — a multi-value
  // list answers HTTP 400. image-size is part of the URL the SPA sends;
  // images themselves are never fetched.
  HOLE_SHOTS_ALL_PATH: (id) =>
    `/shot/scorecard/${id}/hole?image-size=IMG_730X730`,
  HOLE_SHOTS_PATH: (id, hole) =>
    `/shot/scorecard/${id}/hole?hole-numbers=${hole}&image-size=IMG_730X730`,
  CLUBS_PATH: "/club/player?per-page=1000&include-stats=true",
  // The clubId → club-type map the SPA loads alongside the club list.
  CLUB_TYPES_PATH: "/club/types?maxClubTypeId=42",
  PLAYER_STATS_PATH: "/player/stats",
  SHOT_STATS_VIEWS: ["drive", "approach", "chip", "putt"],
  SHOT_STATS_PATH: (view) => `/shot/stats/${view}`,

  // Belt and braces: every endpoint here is a read, but nothing
  // mutation-shaped may ever be fetched, whatever the code constructs.
  URL_EXCLUDE_RE: /delete|remove|update|create|\bedit\b|\bpost\b|\bput\b/i,

  // Politeness. Sequential fetches only; ~2 req/s worst case.
  DELAY_MS: 500,
  JITTER_MS: 250,
  FETCH_TIMEOUT_MS: 20000,
  RETRY_BACKOFF_MS: 3000,

  // Stop the run after this many consecutive logged-out responses.
  MAX_AUTH_FAILURES: 3,
};
