// Orchestration: summary (login check + discovery) → scorecard details →
// hole shots → aggregates (clubs, player stats, shot stats) → bundle →
// download.
//
// Runs in the isolated world of a logged-in connect.garmin.com tab, so every
// fetch is same-origin. Two auth strategies, probed in order on the summary
// call: the legacy cookie-authenticated /modern/proxy path, then the direct
// service path the /app SPA itself uses, authorized with the SPA's own
// runtime token read from page storage (the new client no longer establishes
// the legacy session, first live run 2026-08-22). The token lives in a local
// variable for the duration of the run and is NEVER written into the bundle
// — no request or response headers are recorded, and the inventory gate
// refuses any bundle containing token-shaped text — so the bundle stays
// committable by construction.

(async () => {
  if (window.__GARMIN_SCRAPER_RUNNING) {
    try {
      chrome.runtime.sendMessage({
        type: "garmin-progress",
        phase: "already-running",
        note: "A capture is already in progress in this tab.",
      });
    } catch (_) {}
    return;
  }
  window.__GARMIN_SCRAPER_RUNNING = true;

  const C = window.__GARMIN.constants;

  // Incremental mode: the popup distilled a previous bundle into the
  // scorecard ids that already have BOTH their detail and their hole shots
  // captured. Those are skipped; the summary and all aggregates are always
  // refetched — they change with every round.
  const baseline = window.__GARMIN_BASELINE || null;
  const knownScorecards = new Set(baseline ? baseline.scorecardIds : []);

  const bundle = {
    format: C.FORMAT,
    capturedAt: new Date().toISOString(),
    source: "connect.garmin.com gcs-golfcommunity v2 API",
    userId: null,
    extensionVersion: C.VERSION,
    discovery: { scorecardIdsFound: 0, summaryPages: 1, holeShotPattern: null },
    resources: [],
    errors: [],
    warnings: [],
    summary: {},
  };
  if (baseline) {
    bundle.baseline = {
      rawFile: baseline.rawFile,
      knownScorecards: knownScorecards.size,
      skippedScorecards: 0,
    };
  }

  let consecutiveAuthFailures = 0;

  // Auth strategies, probed in order on the summary call; the first that
  // returns data carries the whole run. Ordered by what the live runs on
  // 2026-08-22 taught: the legacy /modern/proxy path redirects the /app
  // client to SSO, and the direct path answered 401 to a bearer token — so
  // the untested combination (direct path, session cookie, NO bearer) is
  // tried first. A bearer is only ever added when a strategy asks for it and
  // a runtime token was found; the token lives in memory and never enters
  // the bundle.
  // Auth strategies, probed in order on the summary call; the first that
  // returns parseable data carries the run. `golf-api` is the scheme the
  // current SPA actually uses — /golf-api base, session cookie, a CSRF token,
  // nothing else — and is overwhelmingly the likely winner; the rest are
  // legacy fallbacks. `nk` sends the NK: NT header the old proxy needs; `di`
  // sends DI-Backend; `bearer` attaches a runtime token if one is found.
  const STRATEGIES = [
    { mode: "golf-api", base: C.API_GOLF, nk: false, di: false, bearer: false },
    { mode: "proxy-di", base: C.API_PROXY, nk: true, di: true, bearer: false },
    { mode: "proxy", base: C.API_PROXY, nk: true, di: false, bearer: false },
    { mode: "direct", base: C.API_DIRECT, nk: false, di: false, bearer: false },
  ];
  const auth = { base: C.API_GOLF, nk: false, di: false, bearer: false, token: null };
  const api = (path) => auth.base + path;

  /**
   * The CSRF token the SPA echoes in the connect-csrf-token header. It is a
   * double-submit token, not a session secret — read from page storage / a
   * meta tag / the readable CSRF cookie, held in memory, and never written
   * into the bundle. Best-effort: most GETs don't validate it.
   */
  function findCsrfToken() {
    try {
      const meta = document.querySelector('meta[name*="csrf" i]');
      if (meta && meta.content) return meta.content;
      const m = document.cookie.match(
        /(?:^|;\s*)(?:connect-csrf-token|csrf[-_]?token|__csrf)=([^;]+)/i,
      );
      if (m) return decodeURIComponent(m[1]);
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (/csrf/i.test(k)) {
            const v = store.getItem(k);
            if (v) return v.replace(/^"|"$/g, "");
          }
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * A runtime bearer token in page storage, only used by the bearer fallback
   * strategies. Scans for any JSON value carrying an access_token rather than
   * assuming a key name. Held in memory, never written into the bundle.
   */
  function findBearerToken() {
    try {
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const v = store.getItem(store.key(i));
          if (!v || v.length > 20000 || v.indexOf("access_token") === -1) continue;
          try {
            const o = JSON.parse(v);
            const t =
              o && (o.access_token || (o.token && o.token.access_token));
            if (typeof t === "string" && t.length > 20) return t;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  }

  const csrfToken = findCsrfToken();

  function report(msg) {
    try {
      const p = chrome.runtime.sendMessage({ type: "garmin-progress", ...msg });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      // Popup closed; keep capturing.
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const politeDelay = () => sleep(C.DELAY_MS + Math.random() * C.JITTER_MS);

  async function fetchOnce(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.FETCH_TIMEOUT_MS);
    try {
      // Match the SPA's own request: Accept */* and the CSRF token, cookies
      // via credentials:include. The legacy fallbacks add NK / DI-Backend /
      // Authorization as their strategy dictates. Headers are sent, never
      // recorded into the bundle.
      const headers = { Accept: "*/*" };
      if (csrfToken) headers["connect-csrf-token"] = csrfToken;
      if (auth.nk) headers["NK"] = "NT";
      if (auth.di) headers["DI-Backend"] = "connectapi.garmin.com";
      if (auth.bearer && auth.token) headers.Authorization = `Bearer ${auth.token}`;
      const res = await fetch(url, {
        credentials: "include",
        signal: ctrl.signal,
        headers,
      });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** One retry on 429/5xx/network error, then give up (caller records it). */
  async function fetchText(url) {
    try {
      const first = await fetchOnce(url);
      if (first.res.status === 429 || first.res.status >= 500) {
        await sleep(C.RETRY_BACKOFF_MS);
        return await fetchOnce(url);
      }
      return first;
    } catch (e) {
      await sleep(C.RETRY_BACKOFF_MS);
      return await fetchOnce(url);
    }
  }

  /**
   * A dead session answers with a redirect to SSO or an HTML shell. 402 is
   * Garmin's rejection of proxy calls it doesn't like (missing NK header);
   * with the header sent, a 402 is auth-shaped and systematic — counting it
   * here stops a broken run after MAX_AUTH_FAILURES instead of grinding
   * through every scorecard.
   */
  function authDead(res, text) {
    if (res.status === 401 || res.status === 402 || res.status === 403) return true;
    if (/sso\.garmin\.com|\/signin/i.test(res.url || "")) return true;
    return text.trimStart().startsWith("<");
  }

  /**
   * Fetch one JSON endpoint with the auth check. Returns {res, text, data}
   * where data is null when the body isn't JSON; returns null entirely (and
   * records the error) when the response is unusable; throws AuthExhausted
   * when the session is clearly gone.
   */
  async function fetchJson(url, errStage, errMeta, retried = false) {
    if (C.URL_EXCLUDE_RE.test(url)) {
      bundle.warnings.push({ url, message: "skipped mutation-shaped url" });
      return null;
    }
    let r;
    try {
      r = await fetchText(url);
    } catch (e) {
      bundle.errors.push({ stage: errStage, url, ...errMeta, message: String(e) });
      return null;
    }
    if (authDead(r.res, r.text)) {
      // The SPA refreshes its token periodically; a mid-run expiry in a
      // bearer strategy is recoverable by re-reading storage once.
      if (auth.bearer && !retried) {
        const fresh = findBearerToken();
        if (fresh && fresh !== auth.token) {
          auth.token = fresh;
          return fetchJson(url, errStage, errMeta, true);
        }
      }
      consecutiveAuthFailures++;
      const redirected = /sso\.garmin\.com|\/signin/i.test(r.res.url || "");
      bundle.errors.push({
        stage: errStage, url, ...errMeta,
        status: r.res.status,
        message: `logged out (HTTP ${r.res.status}${redirected ? ", redirected to SSO" : ""})`,
      });
      if (consecutiveAuthFailures >= C.MAX_AUTH_FAILURES) {
        throw new Error("AuthExhausted");
      }
      return null;
    }
    consecutiveAuthFailures = 0;
    if (!r.res.ok) {
      bundle.errors.push({
        stage: errStage, url, ...errMeta, status: r.res.status,
        message: `HTTP ${r.res.status}`,
      });
      return null;
    }
    let data = null;
    try {
      data = JSON.parse(r.text);
    } catch (_) {
      // Parse probe only — the resource still stores the verbatim text; the
      // warning is the drift signal (an HTML error body on a 200, say).
      bundle.warnings.push({ url, message: "200 but body is not JSON" });
    }
    return { res: r.res, text: r.text, data };
  }

  /**
   * Record one resource. The payload is the raw response text, byte-verbatim
   * — never re-serialized JSON — so the capture stays replayable however the
   * parser's field mapping evolves.
   */
  function pushResource(kind, url, page, meta = {}) {
    bundle.resources.push({
      kind,
      url,
      method: "GET",
      fetchedAt: new Date().toISOString(),
      status: page.res.status,
      extraction: { mode: "verbatim-json", selectors: ["raw response body"] },
      payload: { json: page.text },
      meta,
    });
  }

  function download() {
    // Incremental bundles carry an HHMM suffix so a same-day full bundle and
    // its follow-ups never collide; the parser orders bundles by capturedAt,
    // not by filename.
    const stamp = new Date().toISOString();
    const name = baseline
      ? `garmin-export-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}.json`
      : `garmin-export-${stamp.slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return name;
  }

  function finalize(note) {
    const byKind = (k) => bundle.resources.filter((r) => r.kind === k).length;
    bundle.summary = {
      scorecardDetails: byKind("scorecardDetail"),
      holeShotResources: byKind("holeShots"),
      clubs: byKind("clubs"),
      playerStats: byKind("playerStats"),
      shotStats: byKind("shotStats"),
      errors: bundle.errors.length,
    };
    if (baseline) bundle.summary.skippedScorecards = bundle.baseline.skippedScorecards;
    const filename = download();
    report({
      phase: "done",
      note: `${note} Saved ${filename}. Move it to data/raw/ and run pnpm data:garmin:inventory.`,
      summary: bundle.summary,
      errors: bundle.errors.length,
    });
  }

  /** The scorecard field lives inside a find-the-right-element wrapper. */
  function cardOf(detailData) {
    const list = detailData && detailData.scorecardDetails;
    if (!Array.isArray(list)) return null;
    const el = list.find((x) => x && x.scorecard !== undefined);
    return el ? el.scorecard : null;
  }

  try {
    // ---- Phase 1: summary — login check + discovery in one call ------------
    report({ phase: "summary", note: "Checking login…" });
    // Bootstrap: try each strategy's summary call until one returns data.
    // Every attempt's status is recorded so a failed run is diagnosable.
    let summaryPage = null;
    let summaryUrl = null;
    let chosenMode = null;
    const runtimeToken = findBearerToken();
    bundle.discovery.authAttempts = [];
    for (const strat of STRATEGIES) {
      if (strat.bearer && !runtimeToken) {
        bundle.discovery.authAttempts.push({ mode: strat.mode, skipped: "no runtime token" });
        continue;
      }
      auth.base = strat.base;
      auth.nk = strat.nk;
      auth.di = strat.di;
      auth.bearer = strat.bearer;
      auth.token = strat.bearer ? runtimeToken : null;
      summaryUrl = api(C.SUMMARY_PATH);
      const errorsBefore = bundle.errors.length;
      let page = null;
      try {
        page = await fetchJson(summaryUrl, "summary", { authMode: strat.mode });
      } catch (_) {
        // AuthExhausted during bootstrap just means "this strategy is dead".
      }
      consecutiveAuthFailures = 0;
      const lastErr = bundle.errors[bundle.errors.length - 1];
      // Record enough to diagnose a 200-but-no-data from the popup alone.
      const attempt = {
        mode: strat.mode,
        ok: !!(page && page.data),
        status: page
          ? page.res.status
          : bundle.errors.length > errorsBefore
            ? (lastErr && lastErr.status) || "err"
            : "no-data",
      };
      if (page && !page.data) {
        attempt.contentType = page.res.headers.get("content-type") || "?";
        attempt.bodyLen = page.text.length;
        attempt.bodyHead = page.text.slice(0, 60);
      }
      bundle.discovery.authAttempts.push(attempt);
      if (page && page.data) {
        summaryPage = page;
        chosenMode = strat.mode;
        break;
      }
      await politeDelay();
    }
    bundle.discovery.authStrategy = chosenMode;
    if (!summaryPage || !summaryPage.data) {
      const tried = (bundle.discovery.authAttempts || [])
        .map((a) => {
          if (a.skipped) return `${a.mode}: skipped`;
          if (a.bodyLen != null)
            return `${a.mode}: ${a.status} ${a.contentType} len=${a.bodyLen} «${a.bodyHead}»`;
          return `${a.mode}: ${a.status}`;
        })
        .join("  ·  ");
      report({
        phase: "error",
        note: `Could not read the scorecard summary. Tried — ${tried}. Are you logged in at connect.garmin.com?`,
      });
      window.__GARMIN_SCRAPER_RUNNING = false;
      return;
    }
    pushResource("scorecardSummary", summaryUrl, summaryPage, { page: 1 });

    const summaries = Array.isArray(summaryPage.data.scorecardSummaries)
      ? summaryPage.data.scorecardSummaries
      : [];
    if (summaries.length === 0) {
      report({ phase: "error", note: "No golf scorecards found on this account." });
      finalize("Nothing to capture — empty scorecard summary.");
      window.__GARMIN_SCRAPER_RUNNING = false;
      return;
    }
    const scorecardIds = summaries
      .map((s) => (s && s.id != null ? String(s.id) : null))
      .filter(Boolean);
    bundle.discovery.scorecardIdsFound = scorecardIds.length;

    // The player id, when the payload itself carries one — never sourced from
    // anywhere else.
    const first = summaries[0] || {};
    bundle.userId =
      first.playerProfileId ?? first.playerId ?? first.profileId ?? null;

    // Page-2 probe: 10000 should be exhaustive; a full first page means the
    // assumption broke and discovery may be truncated — loud warning.
    if (summaries.length >= C.SUMMARY_PAGE_SIZE) {
      await politeDelay();
      const p2url = `${summaryUrl}&page=2`;
      const p2 = await fetchJson(p2url, "summary", { page: 2 });
      if (p2) pushResource("scorecardSummary", p2url, p2, { page: 2 });
      bundle.discovery.summaryPages = 2;
      bundle.warnings.push({
        url: summaryUrl,
        message:
          "summary returned a full page — pagination assumption broke; discovery may be truncated",
      });
    }

    const toFetch = scorecardIds.filter((id) => !knownScorecards.has(id));
    if (baseline) {
      bundle.baseline.skippedScorecards = scorecardIds.length - toFetch.length;
      bundle.discovery.newScorecardIds = toFetch.length;
    }

    // ---- Phase 2: scorecard details ----------------------------------------
    // One id per request — resource granularity matches the merge key.
    const holesById = new Map(); // scorecardId -> hole numbers from its detail
    let done = 0;
    for (const id of toFetch) {
      report({ phase: "scorecard details", done, total: toFetch.length, errors: bundle.errors.length });
      done++;
      await politeDelay();
      const url = api(C.DETAIL_PATH(id));
      const page = await fetchJson(url, "scorecardDetail", { scorecardId: id });
      if (!page) continue;
      pushResource("scorecardDetail", url, page, { scorecardId: id });
      const card = cardOf(page.data);
      const holes = card && Array.isArray(card.holes)
        ? card.holes.map((h) => h && h.number).filter((n) => n != null)
        : null;
      if (holes && holes.length) {
        holesById.set(id, holes);
      } else {
        bundle.warnings.push({
          url,
          message: "detail carried no hole numbers; hole shots will assume 1–18",
        });
        holesById.set(id, Array.from({ length: 18 }, (_, i) => i + 1));
      }
    }

    // ---- Phase 3: hole shots ------------------------------------------------
    // The SPA fetches a whole scorecard's shots with one call — hole?image-size
    // and NO hole-numbers — and each returned entry carries its own holeNumber,
    // so coverage is verifiable. We try that all-at-once call first (far fewer
    // requests, which matters against a session that can expire mid-run), then
    // per-hole only for any hole in the detail it didn't return. A multi-value
    // hole-numbers list is NOT used — it answers HTTP 400 (first live run,
    // 2026-08-22); only a single hole-numbers value works per-hole.
    const shotTargets = toFetch.filter((id) => holesById.has(id));
    let allWorks = null; // null = undecided, true/false after the first attempt

    async function fetchShotsAll(id) {
      const url = api(C.HOLE_SHOTS_ALL_PATH(id));
      const page = await fetchJson(url, "holeShots", { scorecardId: id });
      if (!page || !page.data || !Array.isArray(page.data.holeShots)) return null;
      const covered = page.data.holeShots
        .map((h) => h && h.holeNumber)
        .filter((n) => n != null);
      pushResource("holeShots", url, page, {
        scorecardId: id,
        pattern: "all-in-one",
        holesReturned: covered,
      });
      return new Set(covered);
    }

    async function fetchShotsPerHole(id, holeNums) {
      for (const n of holeNums) {
        await politeDelay();
        const url = api(C.HOLE_SHOTS_PATH(id, n));
        const page = await fetchJson(url, "holeShots", { scorecardId: id, holeNumber: n });
        if (!page) continue;
        pushResource("holeShots", url, page, {
          scorecardId: id,
          holeNumbers: [n],
          pattern: "per-hole",
        });
      }
    }

    let sdone = 0;
    for (const id of shotTargets) {
      report({ phase: "hole shots", done: sdone, total: shotTargets.length, errors: bundle.errors.length });
      sdone++;
      const holes = holesById.get(id);
      let covered = null;
      if (allWorks !== false) {
        await politeDelay();
        covered = await fetchShotsAll(id);
        if (covered) allWorks = true;
        else if (allWorks === null) allWorks = false; // the all-at-once call isn't available
      }
      // Fill any hole the all-at-once call didn't return (and everything, when
      // that call isn't available). Holes with no shots return empty — cheap.
      const missing = covered ? holes.filter((h) => !covered.has(h)) : holes;
      if (missing.length) await fetchShotsPerHole(id, missing);
    }
    bundle.discovery.holeShotPattern = allWorks ? "all-in-one" : "per-hole";

    // ---- Phase 4: aggregates — always refetched -----------------------------
    const aggregates = [
      ["clubs", api(C.CLUBS_PATH), {}],
      ["clubTypes", api(C.CLUB_TYPES_PATH), {}],
      ["playerStats", api(C.PLAYER_STATS_PATH), {}],
      ...C.SHOT_STATS_VIEWS.map((v) => [
        "shotStats",
        api(C.SHOT_STATS_PATH(v)),
        { view: v },
      ]),
    ];
    let adone = 0;
    for (const [kind, url, meta] of aggregates) {
      report({ phase: "aggregates", done: adone, total: aggregates.length, errors: bundle.errors.length });
      adone++;
      await politeDelay();
      const page = await fetchJson(url, kind, meta);
      if (page) pushResource(kind, url, page, meta);
    }

    finalize("Capture complete.");
  } catch (e) {
    if (String(e && e.message).includes("AuthExhausted")) {
      finalize("Session expired mid-run — partial bundle.");
    } else {
      bundle.errors.push({ stage: "fatal", message: String(e) });
      if (bundle.resources.length > 0) {
        finalize("Stopped on an unexpected error — partial bundle.");
      } else {
        report({ phase: "error", note: `Failed before capturing anything: ${e}` });
      }
    }
  } finally {
    window.__GARMIN_SCRAPER_RUNNING = false;
  }
})();
