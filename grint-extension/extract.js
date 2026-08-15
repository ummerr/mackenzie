// Pure DOM-extraction functions. No fetch, no chrome.*, no timers — every
// function takes a parsed Document (plus strings) and returns plain data.
// Keeping these pure means the future Node adapter can be tested against the
// same captured fragments these produce.
//
// VERBATIM POLICY: everything returned here is character-for-character what
// the server sent (script text, outerHTML). Extraction selects; it never
// rewrites. When a selector matches nothing, the caller stores the full page
// instead — nothing is silently dropped.

window.__GRINT = window.__GRINT || {};

window.__GRINT.extract = (() => {
  const C = () => window.__GRINT.constants;

  /** All inline <script> bodies that carry chart/data payloads, verbatim. */
  function extractInlineCharts(doc) {
    const out = [];
    for (const s of doc.querySelectorAll("script:not([src])")) {
      const t = s.textContent || "";
      if (/Highcharts|series\s*:|data\s*:\s*\[\s*\{/.test(t)) out.push(t);
    }
    return out;
  }

  /**
   * The main content column of the classic client layout. Header, nav, ads
   * and the friends feed live outside it, so this is the "data subtree" for
   * pages whose exact markup we don't control.
   */
  function contentColumn(doc) {
    return (
      doc.querySelector(".col-lg-29") ||
      doc.querySelector(".wrapper-page .col") ||
      null
    );
  }

  /**
   * Logged-out detection. Primary signal: the response landed on the login
   * page (fetch follows redirects, so res.url tells us). Secondary: the page
   * has no logout link but does present a login form.
   */
  function detectLoggedOut(doc, responseUrl) {
    if (/\/passthru|\/login\b/i.test(responseUrl || "")) return true;
    const hasLogout = !!doc.querySelector('a[href*="logout"]');
    const hasLoginForm = !!doc.querySelector(
      'form[action*="passthru"], form[action*="login"], input[name="password"]'
    );
    return !hasLogout && hasLoginForm;
  }

  /** The logged-in user's id, from the trend filter form. */
  function extractUserId(doc) {
    const el = doc.querySelector("#filterUserId");
    return el && el.value ? String(el.value) : null;
  }

  /** Fragments for a /trend/<view> page: chart scripts + content column. */
  function extractTrend(doc) {
    const scripts = extractInlineCharts(doc);
    const col = contentColumn(doc);
    const hasChartData = scripts.some((t) => /new\s+Highcharts\.Chart|series\s*:\s*\[/.test(t));
    // Some views (hdcp_card, summary) are tables, not charts — a table in the
    // content column counts as data too.
    const hasTableData = !!(col && col.querySelector("table td"));
    return {
      scripts,
      html: col ? col.outerHTML : null,
      hasChartData,
      hasData: hasChartData || hasTableData,
    };
  }

  /** Fragments for /handicap: every table in the content column + scripts. */
  function extractHandicap(doc) {
    const col = contentColumn(doc);
    const root = col || doc.body;
    const tables = root
      ? Array.from(root.querySelectorAll("table")).map((t) => t.outerHTML)
      : [];
    return {
      scripts: extractInlineCharts(doc),
      tables,
      html: col ? col.outerHTML : null,
    };
  }

  /**
   * Round discovery on a /score listing page: every anchor that looks like a
   * scorecard link, plus every anchor that looks like pagination. IDs are the
   * long numeric segment of the href; the caller dedupes across pages.
   */
  function extractScoreIndex(doc) {
    const c = C();
    const roundLinks = [];
    const pageLinks = [];
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (c.ROUND_LINK_EXCLUDE_RE.test(href)) continue;
      const m = href.match(c.ROUND_LINK_RE);
      if (m) {
        roundLinks.push({ href, roundId: m[1] });
        continue;
      }
      if (
        /\/score\b/i.test(href) &&
        (c.PAGE_LINK_RE.test(href) || a.getAttribute("rel") === "next")
      ) {
        pageLinks.push(href);
      }
    }
    return { roundLinks, pageLinks };
  }

  /**
   * Fragments for one scorecard page: all tables in the content column, all
   * inline data scripts, and any (courseId, teeId) discoverable — from
   * /ajax/get_course_data hrefs, hidden inputs, or inline script variables.
   */
  function extractScorecard(doc, pageHtml) {
    const c = C();
    const col = contentColumn(doc);
    const root = col || doc.body;
    const tables = root
      ? Array.from(root.querySelectorAll("table")).map((t) => t.outerHTML)
      : [];
    const scripts = extractInlineCharts(doc);
    const warnings = [];

    // Observed on the live edit_score pages (2026-08-15 capture):
    //   <input type="hidden" name="course" id="cid" value="12821">
    //   <input type="hidden" class="tees-db" value="White">
    // The tees <select> is empty server-side (JS fills it), so the tee is a
    // NAME here, not a numeric id.
    let courseId = null;
    let teeId = null;
    let teeName = null;
    const cid = doc.querySelector('#cid, input[name="course"]');
    if (cid && cid.value) courseId = String(cid.value);
    const tdb = doc.querySelector("input.tees-db");
    if (tdb && tdb.value) teeName = tdb.value;
    const m = (pageHtml || "").match(c.COURSE_DATA_RE);
    if (m) {
      if (!courseId) courseId = m[1];
      teeId = m[2];
    }
    if (!courseId) {
      const ci = doc.querySelector(
        'input[name="courseId"], input[id="courseId"], input[name="course_id"]'
      );
      if (ci && ci.value) courseId = String(ci.value);
      const sv = (pageHtml || "").match(/course_?id["']?\s*[:=]\s*["']?(\d+)/i);
      if (!courseId && sv) courseId = sv[1];
    }
    if (!courseId) warnings.push("no courseId found on scorecard page");

    return {
      tables,
      scripts,
      html: col ? col.outerHTML : null,
      courseId,
      teeId,
      teeName,
      warnings,
    };
  }

  /**
   * The /score listing's filter state, read off the page itself so the
   * listMoreScores loop replays exactly what the page's own scroll handler
   * would send. The typeScore select defaults to "0" (All Rounds).
   */
  function extractScoreFilters(doc) {
    const val = (sel) => {
      const el = doc.querySelector(sel);
      return el && el.value != null ? String(el.value) : null;
    };
    return {
      userId: val("#filterUserIdScore"),
      courseId: val("#filterCourseIdScore") || "",
      typeScore: val("#filterTypeScore") || "0",
      provider: val("#filterHandicapProvider") || "3",
    };
  }

  /**
   * Parse one listMoreScores response: raw <tr> rows. Bare rows are stripped
   * by the HTML parser unless given table context, hence the wrapping.
   */
  function parseListMoreResponse(text) {
    const doc = new DOMParser().parseFromString(
      `<table><tbody>${text}</tbody></table>`,
      "text/html"
    );
    const { roundLinks } = extractScoreIndex(doc);
    return {
      roundLinks,
      rowCount: doc.querySelectorAll("tbody > tr").length,
    };
  }

  return {
    extractInlineCharts,
    contentColumn,
    detectLoggedOut,
    extractUserId,
    extractTrend,
    extractHandicap,
    extractScoreIndex,
    extractScoreFilters,
    parseListMoreResponse,
    extractScorecard,
  };
})();
