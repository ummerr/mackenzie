// Orchestration: preflight → trend views → handicap → round discovery →
// scorecards → course metadata → bundle → download.
//
// Runs in the isolated world of a logged-in thegrint.com tab, so every fetch
// is same-origin and rides the session cookie. Nothing here reads
// document.cookie and no request/response headers are recorded — the bundle
// is committable by construction.

(async () => {
  if (window.__GRINT_SCRAPER_RUNNING) {
    try {
      chrome.runtime.sendMessage({
        type: "grint-progress",
        phase: "already-running",
        note: "A scrape is already in progress in this tab.",
      });
    } catch (_) {}
    return;
  }
  window.__GRINT_SCRAPER_RUNNING = true;

  const C = window.__GRINT.constants;
  const X = window.__GRINT.extract;

  // Incremental mode: the popup distilled a previous bundle into round ids and
  // course/tee pairs already captured. Known scorecards and course data are
  // skipped, and round discovery stops at the first listing wave that yields
  // nothing new — the listing is newest-first, so everything past that wave is
  // already in the baseline. Trend views and the handicap record are always
  // refetched: they are aggregates that change with every round.
  const baseline = window.__GRINT_BASELINE || null;
  const knownRounds = new Set(baseline ? baseline.roundIds : []);
  const knownCourseTees = new Set(baseline ? baseline.courseTees : []);

  const bundle = {
    format: C.FORMAT,
    capturedAt: new Date().toISOString(),
    source: "thegrint.com classic web client",
    userId: null,
    extensionVersion: C.VERSION,
    discovery: { scorePagesFetched: 0, roundIdsFound: 0 },
    resources: [],
    errors: [],
    warnings: [],
    summary: {},
  };
  if (baseline) {
    bundle.baseline = {
      rawFile: baseline.rawFile,
      knownRounds: knownRounds.size,
      skippedScorecards: 0,
      skippedCourseTees: 0,
    };
  }

  let consecutiveAuthFailures = 0;

  function report(msg) {
    try {
      const p = chrome.runtime.sendMessage({ type: "grint-progress", ...msg });
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      // Popup closed; keep scraping.
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const politeDelay = () => sleep(C.DELAY_MS + Math.random() * C.JITTER_MS);

  async function fetchOnce(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        signal: ctrl.signal,
        ...opts,
      });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** One retry on 429/5xx/network error, then give up (caller records it). */
  async function fetchText(url, opts = {}) {
    try {
      const first = await fetchOnce(url, opts);
      if (first.res.status === 429 || first.res.status >= 500) {
        await sleep(C.RETRY_BACKOFF_MS);
        return await fetchOnce(url, opts);
      }
      return first;
    } catch (e) {
      await sleep(C.RETRY_BACKOFF_MS);
      return await fetchOnce(url, opts);
    }
  }

  const parser = new DOMParser();

  /**
   * Fetch an HTML page, parse it, and run the auth check. Returns null (and
   * records the error) when the response is unusable; throws AuthExhausted
   * when the session is clearly gone.
   */
  async function fetchDoc(url, opts, errStage, errMeta) {
    let r;
    try {
      r = await fetchText(url, opts);
    } catch (e) {
      bundle.errors.push({ stage: errStage, url, ...errMeta, message: String(e) });
      return null;
    }
    const doc = parser.parseFromString(r.text, "text/html");
    if (X.detectLoggedOut(doc, r.res.url)) {
      consecutiveAuthFailures++;
      bundle.errors.push({ stage: errStage, url, ...errMeta, message: "logged out" });
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
    return { doc, text: r.text, res: r.res };
  }

  /**
   * Build a resource entry. When the extraction found nothing, fall back to
   * storing the full page so selector drift shows up as a bigger file plus a
   * warning, never a hole.
   */
  function pushResource(kind, url, method, requestBody, page, payload, selectors, meta = {}) {
    const empty =
      (!payload.scripts || payload.scripts.length === 0) &&
      !payload.html &&
      (!payload.tables || payload.tables.length === 0) &&
      !payload.json;
    const entry = {
      kind,
      url,
      method,
      fetchedAt: new Date().toISOString(),
      status: page ? page.res.status : null,
      extraction: { mode: empty ? "fullPage" : "fragments", selectors },
      payload: empty && page ? { html: page.text } : payload,
      meta,
    };
    if (requestBody) entry.requestBody = requestBody;
    if (empty) {
      bundle.warnings.push({ url, message: "selectors matched nothing; stored full page" });
    }
    bundle.resources.push(entry);
    return entry;
  }

  function download() {
    // Incremental bundles carry an HHMM suffix so a same-day full bundle and
    // its follow-ups never collide; the parser orders bundles by capturedAt,
    // not by filename.
    const stamp = new Date().toISOString();
    const name = baseline
      ? `grint-export-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}.json`
      : `grint-export-${stamp.slice(0, 10)}.json`;
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
    const scorecards = bundle.resources.filter((r) => r.kind === "scorecard");
    bundle.summary = {
      trendViews: bundle.resources.filter((r) => r.kind === "trend").length,
      rounds: bundle.discovery.roundIdsFound,
      scorecardsOk: scorecards.length,
      courses: new Set(
        bundle.resources
          .filter((r) => r.kind === "courseData")
          .map((r) => r.meta.courseId)
      ).size,
      errors: bundle.errors.length,
    };
    if (baseline) bundle.summary.skippedScorecards = bundle.baseline.skippedScorecards;
    const filename = download();
    report({
      phase: "done",
      note: `${note} Saved ${filename}. Move it to data/raw/ and run pnpm data:rounds.`,
      summary: bundle.summary,
      errors: bundle.errors.length,
    });
  }

  try {
    // ---- Phase 0: preflight -------------------------------------------------
    report({ phase: "preflight", note: "Checking login…" });
    const pre = await fetchDoc(`${C.BASE}/trend`, {}, "preflight", {});
    if (!pre) throw new Error("Preflight failed — see errors.");
    const userId = X.extractUserId(pre.doc);
    if (!userId) {
      report({
        phase: "error",
        note: "Not logged in (no user id on /trend). Log in at thegrint.com and retry.",
      });
      window.__GRINT_SCRAPER_RUNNING = false;
      return;
    }
    bundle.userId = userId;

    // ---- Phase 1: trend views ----------------------------------------------
    const trendBody =
      `filterUserId=${encodeURIComponent(userId)}&isFilter=1&range=ALL` +
      `&dateStart=&dateEnd=&compare=&coursePar=ALL&courseId=&courseName=` +
      `&tee=&handicapCompanyId=3`;
    for (let i = 0; i < C.TREND_VIEWS.length; i++) {
      const view = C.TREND_VIEWS[i];
      const url = `${C.BASE}/trend/${view}`;
      report({ phase: "trend views", done: i, total: C.TREND_VIEWS.length, errors: bundle.errors.length });
      await politeDelay();
      const page = await fetchDoc(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: trendBody,
        },
        "trend",
        { view: view || "handicap_index" }
      );
      if (!page) continue;
      const ex = X.extractTrend(page.doc);
      pushResource(
        "trend", url, "POST", trendBody, page,
        { scripts: ex.scripts, html: ex.html },
        ["script:not([src]) with chart data", ".col-lg-29"],
        { view: view || "handicap_index", noData: !ex.hasData }
      );
    }

    // ---- Phase 2: handicap record ------------------------------------------
    report({ phase: "handicap", errors: bundle.errors.length });
    await politeDelay();
    {
      const url = `${C.BASE}/handicap`;
      const page = await fetchDoc(url, {}, "handicap", {});
      if (page) {
        const ex = X.extractHandicap(page.doc);
        pushResource(
          "handicap", url, "GET", null, page,
          { scripts: ex.scripts, tables: ex.tables, html: ex.html },
          ["table within .col-lg-29", "script:not([src]) with chart data"],
          {}
        );
      }
    }

    // ---- Phase 3: round discovery ------------------------------------------
    const roundById = new Map(); // roundId -> absolute href
    const visitedPages = new Set();

    /**
     * Fetch one /score listing page, record it (full HTML kept — the 0.1.0
     * run proved the listing's pagination machinery is invisible unless the
     * whole page is captured), and return how many new rounds it yielded.
     * Returns -1 when the fetch itself failed.
     */
    async function ingestIndexPage(pageUrl) {
      visitedPages.add(pageUrl);
      report({
        phase: "round discovery",
        done: visitedPages.size,
        note: `${roundById.size} rounds found`,
        errors: bundle.errors.length,
      });
      await politeDelay();
      const page = await fetchDoc(pageUrl, {}, "scoreIndex", {});
      if (!page) return -1;
      const ex = X.extractScoreIndex(page.doc);
      let fresh = 0;
      for (const { href, roundId } of ex.roundLinks) {
        if (!roundById.has(roundId)) {
          roundById.set(roundId, new URL(href, C.BASE).href);
          fresh++;
        }
      }
      pushResource(
        "scoreIndex", pageUrl, "GET", null, page,
        { json: JSON.stringify({ roundLinks: ex.roundLinks, pageLinks: ex.pageLinks }), html: page.text },
        ["a[href] matching ROUND_LINK_RE / PAGE_LINK_RE", "full page"],
        { newRoundIds: fresh }
      );
      return { fresh, pageLinks: ex.pageLinks, doc: page.doc };
    }

    // Page 1, plus any real pagination hrefs it (or its successors) expose.
    let scoreDoc = null;
    const pageQueue = [`${C.BASE}/score`];
    let emptyStreak = 0;
    while (pageQueue.length && visitedPages.size < C.MAX_SCORE_PAGES && emptyStreak < 3) {
      const pageUrl = pageQueue.shift();
      if (visitedPages.has(pageUrl)) continue;
      const r = await ingestIndexPage(pageUrl);
      if (r === -1) continue;
      if (!scoreDoc) scoreDoc = r.doc;
      emptyStreak = r.fresh === 0 ? emptyStreak + 1 : 0;
      for (const href of r.pageLinks) {
        const abs = new URL(href, C.BASE).href;
        if (!visitedPages.has(abs)) pageQueue.push(abs);
      }
    }

    // The listing is infinite-scroll: its own scroll handler POSTs
    // /score/listMoreScores with an incrementing wave and the current row
    // count, and appends the returned <tr> rows. Replay that loop verbatim,
    // with the filter values the page itself carries (typeScore defaults to
    // "0" = All Rounds), until the server sends an empty body — or, with a
    // baseline, until a wave brings only rounds the baseline already has.
    const firstPageAllKnown =
      baseline && [...roundById.keys()].every((id) => knownRounds.has(id));
    if (scoreDoc && firstPageAllKnown) {
      // Every round on the first listing page is already captured; anything
      // deeper in the scroll is older still. Nothing new to page through.
      bundle.discovery.stoppedEarly = "first page all known";
    } else if (scoreDoc) {
      const filters = X.extractScoreFilters(scoreDoc);
      let offset =
        scoreDoc.querySelectorAll(".tableListScore > tbody > tr").length ||
        roundById.size;
      let wave = 1;
      let emptyWaves = 0;
      bundle.discovery.paginationPattern = "POST /score/listMoreScores";
      const url = `${C.BASE}${C.LIST_MORE_PATH}`;
      while (wave <= C.MAX_WAVES && emptyWaves < 2) {
        report({
          phase: "round discovery",
          done: wave,
          note: `${roundById.size} rounds found`,
          errors: bundle.errors.length,
        });
        await politeDelay();
        const body =
          `wave=${wave}&wave18=${offset}&wave9=${offset}` +
          `&userId=${encodeURIComponent(filters.userId || userId)}` +
          `&courseId=${encodeURIComponent(filters.courseId)}` +
          `&typeScore=${encodeURIComponent(filters.typeScore)}` +
          `&handicap_company_id=${encodeURIComponent(filters.provider)}`;
        let r;
        try {
          r = await fetchText(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest",
            },
            body,
          });
        } catch (e) {
          bundle.errors.push({ stage: "scoreIndex", url, message: String(e) });
          break;
        }
        if (!r.res.ok) {
          bundle.errors.push({ stage: "scoreIndex", url, status: r.res.status, message: `HTTP ${r.res.status}` });
          break;
        }
        if (!r.text.trim()) break; // exhausted — the site's own stop condition
        const parsed = X.parseListMoreResponse(r.text);
        let fresh = 0;
        for (const { href, roundId } of parsed.roundLinks) {
          if (!roundById.has(roundId)) {
            roundById.set(roundId, new URL(href, C.BASE).href);
            fresh++;
          }
        }
        pushResource(
          "scoreIndex", url, "POST", body,
          { res: r.res, text: r.text },
          { json: JSON.stringify({ roundLinks: parsed.roundLinks }), html: r.text },
          ["listMoreScores <tr> rows"],
          { wave, offset, rowCount: parsed.rowCount, newRoundIds: fresh }
        );
        offset += parsed.rowCount;
        emptyWaves = fresh === 0 ? emptyWaves + 1 : 0;
        wave++;
        if (
          baseline &&
          parsed.roundLinks.length > 0 &&
          parsed.roundLinks.every(({ roundId }) => knownRounds.has(roundId))
        ) {
          // Newest-first listing: a wave of nothing-but-known rounds means the
          // rest of the scroll is older than the baseline. Stop here.
          bundle.discovery.stoppedEarly = `wave ${wave - 1} all known`;
          break;
        }
      }
      bundle.discovery.wavesFetched = wave - 1;
    }
    bundle.discovery.scorePagesFetched = visitedPages.size;
    bundle.discovery.roundIdsFound = roundById.size;
    if (baseline) {
      bundle.discovery.newRoundIds = [...roundById.keys()].filter(
        (id) => !knownRounds.has(id),
      ).length;
    }

    // ---- Phase 4: scorecards ------------------------------------------------
    const toFetch = [...roundById].filter(([id]) => !knownRounds.has(id));
    if (baseline) bundle.baseline.skippedScorecards = roundById.size - toFetch.length;
    const courseTeePairs = new Map(); // "courseId/teeId" -> {courseId, teeId, guessed}
    let done = 0;
    for (const [roundId, url] of toFetch) {
      report({ phase: "scorecards", done, total: toFetch.length, errors: bundle.errors.length });
      done++;
      // Belt and braces: never GET anything destructive-shaped, whatever the
      // link regexes let through.
      if (C.ROUND_LINK_EXCLUDE_RE.test(url)) {
        bundle.warnings.push({ url, message: "skipped destructive-shaped round url" });
        continue;
      }
      await politeDelay();
      const page = await fetchDoc(url, {}, "scorecard", { roundId });
      if (!page) continue;
      const ex = X.extractScorecard(page.doc, page.text);
      for (const w of ex.warnings) bundle.warnings.push({ url, message: w });
      pushResource(
        "scorecard", url, "GET", null, page,
        { scripts: ex.scripts, tables: ex.tables, html: ex.html },
        ["table within .col-lg-29", "script:not([src]) with chart data"],
        { roundId, courseId: ex.courseId, teeId: ex.teeId, teeName: ex.teeName }
      );
      if (ex.courseId) {
        // The edit pages expose the tee as a NAME (input.tees-db), not a
        // numeric id; get_course_data wants an index, so tee 1 is fetched and
        // the name recorded for the adapter to match up.
        const teeId = ex.teeId || "1";
        const key = `${ex.courseId}/${teeId}`;
        if (!courseTeePairs.has(key)) {
          courseTeePairs.set(key, {
            courseId: ex.courseId,
            teeId,
            teeName: ex.teeName,
            guessed: !ex.teeId,
          });
        }
      }
    }

    // ---- Phase 5: course metadata -------------------------------------------
    let cdone = 0;
    for (const { courseId, teeId, teeName, guessed } of courseTeePairs.values()) {
      report({ phase: "course data", done: cdone, total: courseTeePairs.size, errors: bundle.errors.length });
      cdone++;
      if (baseline && knownCourseTees.has(`${courseId}/${teeId}`)) {
        bundle.baseline.skippedCourseTees++;
        continue;
      }
      await politeDelay();
      const url = `${C.BASE}/ajax/get_course_data/${courseId}/${teeId}`;
      try {
        const r = await fetchText(url);
        if (!r.res.ok) {
          bundle.errors.push({ stage: "courseData", url, status: r.res.status, message: `HTTP ${r.res.status}` });
          continue;
        }
        bundle.resources.push({
          kind: "courseData",
          url,
          method: "GET",
          fetchedAt: new Date().toISOString(),
          status: r.res.status,
          extraction: { mode: "fragments", selectors: ["raw response body"] },
          payload: { json: r.text },
          meta: { courseId, teeId, teeName, teeGuessed: guessed },
        });
      } catch (e) {
        bundle.errors.push({ stage: "courseData", url, message: String(e) });
      }
    }

    finalize("Scrape complete.");
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
    window.__GRINT_SCRAPER_RUNNING = false;
  }
})();
