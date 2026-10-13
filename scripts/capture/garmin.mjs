#!/usr/bin/env node
/**
 * Unattended Garmin capture (DECISIONS.md 2026-10-12): the same bundle the
 * garmin-extension downloads, produced from a runner instead of a browser.
 *
 *   node scripts/capture/garmin.mjs           capture what is new into data/raw/
 *   node scripts/capture/garmin.mjs --dry-run  say what is new, write nothing
 *
 * Reads GARMIN_AUTH_FILE (written by garmin-token.py --refresh: the request
 * headers for connectapi.garmin.com). Every endpoint, delay, exclusion and
 * phase is the extension's — the constants are loaded verbatim from
 * garmin-extension/constants.js and the orchestration mirrors
 * garmin-extension/scraper.js phase for phase — so the inventory gate and
 * the parser see the bundle they already know. The two differences are the
 * host (connectapi.garmin.com answers the bearer the native app uses; the
 * SPA's cookie+CSRF scheme exists only inside a browser) and that no auth
 * strategy is probed: the strategy is recorded as "connectapi".
 *
 * Headers are sent, never recorded. The bundle must pass
 * capture/secret-shaped.mjs — the tests prove it does.
 *
 * Incremental by construction: the summary call is the discovery, scorecards
 * already in data/garmin-rounds.json are skipped, and the bundle carries the
 * same `baseline` block the extension's incremental mode writes, so
 * parse-garmin-export.mjs layers it over the newest full bundle. Nothing new
 * means nothing written.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data", "raw");

/** The extension's constants, evaluated verbatim against a stub window. */
export function loadExtensionConstants() {
  const src = readFileSync(resolve(ROOT, "garmin-extension", "constants.js"), "utf8");
  const window = {};
  new Function("window", src)(window);
  return window.__GARMIN.constants;
}

export const API_CONNECT = "https://connectapi.garmin.com/gcs-golfcommunity/api/v2";
export const AUTH_STRATEGY = "connectapi";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The capture, as a pure orchestration over an injected fetch. Mirrors
 * garmin-extension/scraper.js: summary → scorecard details → hole shots
 * (all-in-one first, per-hole fill) → aggregates → bundle.
 *
 *   fetchText(url)        → { status, url, text }  (one attempt; retried here)
 *   knownScorecards       Set of scorecard ids already in the record
 *   baselineRawFile       the newest raw bundle's filename, or null (→ full)
 *   now()                 the clock (tests pin it)
 *   wait(ms)              the politeness delay (tests skip it)
 *   report(msg)           progress line
 *
 * Returns { bundle, filename, newScorecardIds, nothingNew }.
 */
export async function captureGarmin({
  fetchText,
  knownScorecards = new Set(),
  baselineRawFile = null,
  now = () => new Date(),
  wait = sleep,
  report = () => {},
  constants = loadExtensionConstants(),
  apiBase = API_CONNECT,
}) {
  const C = constants;
  const api = (path) => apiBase + path;
  const iso = () => now().toISOString();
  const incremental = baselineRawFile !== null;

  const bundle = {
    format: C.FORMAT,
    capturedAt: iso(),
    source: "connect.garmin.com gcs-golfcommunity v2 API",
    userId: null,
    extensionVersion: `ci-${C.VERSION}`,
    discovery: { scorecardIdsFound: 0, summaryPages: 1, holeShotPattern: null },
    resources: [],
    errors: [],
    warnings: [],
    summary: {},
  };
  if (incremental) {
    bundle.baseline = {
      rawFile: baselineRawFile,
      knownScorecards: knownScorecards.size,
      skippedScorecards: 0,
    };
  }

  let consecutiveAuthFailures = 0;
  const politeDelay = () => wait(C.DELAY_MS + Math.random() * C.JITTER_MS);

  /** One retry on 429/5xx/network error, then give up (caller records it). */
  async function fetchRetrying(url) {
    try {
      const first = await fetchText(url);
      if (first.status === 429 || first.status >= 500) {
        await wait(C.RETRY_BACKOFF_MS);
        return await fetchText(url);
      }
      return first;
    } catch (e) {
      await wait(C.RETRY_BACKOFF_MS);
      return await fetchText(url);
    }
  }

  function authDead(r) {
    if (r.status === 401 || r.status === 402 || r.status === 403) return true;
    if (/sso\.garmin\.com|\/signin/i.test(r.url || "")) return true;
    return r.text.trimStart().startsWith("<");
  }

  async function fetchJson(url, errStage, errMeta) {
    if (C.URL_EXCLUDE_RE.test(url)) {
      bundle.warnings.push({ url, message: "skipped mutation-shaped url" });
      return null;
    }
    let r;
    try {
      r = await fetchRetrying(url);
    } catch (e) {
      bundle.errors.push({ stage: errStage, url, ...errMeta, message: String(e) });
      return null;
    }
    if (authDead(r)) {
      consecutiveAuthFailures++;
      const redirected = /sso\.garmin\.com|\/signin/i.test(r.url || "");
      bundle.errors.push({
        stage: errStage, url, ...errMeta,
        status: r.status,
        message: `logged out (HTTP ${r.status}${redirected ? ", redirected to SSO" : ""})`,
      });
      if (consecutiveAuthFailures >= C.MAX_AUTH_FAILURES) throw new Error("AuthExhausted");
      return null;
    }
    consecutiveAuthFailures = 0;
    if (r.status < 200 || r.status >= 300) {
      bundle.errors.push({ stage: errStage, url, ...errMeta, status: r.status, message: `HTTP ${r.status}` });
      return null;
    }
    let data = null;
    try {
      data = JSON.parse(r.text);
    } catch (_) {
      bundle.warnings.push({ url, message: "200 but body is not JSON" });
    }
    return { status: r.status, text: r.text, data };
  }

  /** The payload is the raw response text, byte-verbatim. */
  function pushResource(kind, url, page, meta = {}) {
    bundle.resources.push({
      kind,
      url,
      method: "GET",
      fetchedAt: iso(),
      status: page.status,
      extraction: { mode: "verbatim-json", selectors: ["raw response body"] },
      payload: { json: page.text },
      meta,
    });
  }

  function filename() {
    const stamp = iso();
    return incremental
      ? `garmin-export-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}${stamp.slice(14, 16)}.json`
      : `garmin-export-${stamp.slice(0, 10)}.json`;
  }

  function finalize() {
    const byKind = (k) => bundle.resources.filter((r) => r.kind === k).length;
    bundle.summary = {
      scorecardDetails: byKind("scorecardDetail"),
      holeShotResources: byKind("holeShots"),
      clubs: byKind("clubs"),
      playerStats: byKind("playerStats"),
      shotStats: byKind("shotStats"),
      errors: bundle.errors.length,
    };
    if (incremental) bundle.summary.skippedScorecards = bundle.baseline.skippedScorecards;
  }

  function cardOf(detailData) {
    const list = detailData && detailData.scorecardDetails;
    if (!Array.isArray(list)) return null;
    const el = list.find((x) => x && x.scorecard !== undefined);
    return el ? el.scorecard : null;
  }

  let newScorecardIds = [];
  try {
    // ---- Phase 1: summary — login check + discovery in one call ------------
    report({ phase: "summary", note: "Checking the token…" });
    const summaryUrl = api(C.SUMMARY_PATH);
    bundle.discovery.authAttempts = [];
    let summaryPage = null;
    try {
      summaryPage = await fetchJson(summaryUrl, "summary", { authMode: AUTH_STRATEGY });
    } catch (_) {
      /* AuthExhausted on the first call: recorded below */
    }
    const lastErr = bundle.errors[bundle.errors.length - 1];
    bundle.discovery.authAttempts.push({
      mode: AUTH_STRATEGY,
      ok: !!(summaryPage && summaryPage.data),
      status: summaryPage ? summaryPage.status : (lastErr && lastErr.status) || "err",
    });
    bundle.discovery.authStrategy = AUTH_STRATEGY;
    if (!summaryPage || !summaryPage.data) {
      const why = lastErr ? `${lastErr.message}` : "no data";
      throw new Error(`Could not read the scorecard summary (${why}). Is the Garmin token still good?`);
    }
    pushResource("scorecardSummary", summaryUrl, summaryPage, { page: 1 });

    const summaries = Array.isArray(summaryPage.data.scorecardSummaries)
      ? summaryPage.data.scorecardSummaries
      : [];
    if (summaries.length === 0) throw new Error("No golf scorecards found on this account.");
    const scorecardIds = summaries
      .map((s) => (s && s.id != null ? String(s.id) : null))
      .filter(Boolean);
    bundle.discovery.scorecardIdsFound = scorecardIds.length;
    const first = summaries[0] || {};
    bundle.userId = first.playerProfileId ?? first.playerId ?? first.profileId ?? null;

    if (summaries.length >= C.SUMMARY_PAGE_SIZE) {
      await politeDelay();
      const p2url = `${summaryUrl}&page=2`;
      const p2 = await fetchJson(p2url, "summary", { page: 2 });
      if (p2) pushResource("scorecardSummary", p2url, p2, { page: 2 });
      bundle.discovery.summaryPages = 2;
      bundle.warnings.push({
        url: summaryUrl,
        message: "summary returned a full page — pagination assumption broke; discovery may be truncated",
      });
    }

    const toFetch = scorecardIds.filter((id) => !knownScorecards.has(id));
    newScorecardIds = toFetch;
    if (incremental) {
      bundle.baseline.skippedScorecards = scorecardIds.length - toFetch.length;
      bundle.discovery.newScorecardIds = toFetch.length;
    }
    if (toFetch.length === 0) {
      report({ phase: "done", note: "nothing new" });
      return { bundle: null, filename: null, newScorecardIds: [], nothingNew: true };
    }

    // ---- Phase 2: scorecard details ----------------------------------------
    const holesById = new Map();
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
        bundle.warnings.push({ url, message: "detail carried no hole numbers; hole shots will assume 1–18" });
        holesById.set(id, Array.from({ length: 18 }, (_, i) => i + 1));
      }
    }

    // ---- Phase 3: hole shots ------------------------------------------------
    const shotTargets = toFetch.filter((id) => holesById.has(id));
    let allWorks = null;

    async function fetchShotsAll(id) {
      const url = api(C.HOLE_SHOTS_ALL_PATH(id));
      const page = await fetchJson(url, "holeShots", { scorecardId: id });
      if (!page || !page.data || !Array.isArray(page.data.holeShots)) return null;
      const covered = page.data.holeShots.map((h) => h && h.holeNumber).filter((n) => n != null);
      pushResource("holeShots", url, page, { scorecardId: id, pattern: "all-in-one", holesReturned: covered });
      return new Set(covered);
    }

    async function fetchShotsPerHole(id, holeNums) {
      for (const n of holeNums) {
        await politeDelay();
        const url = api(C.HOLE_SHOTS_PATH(id, n));
        const page = await fetchJson(url, "holeShots", { scorecardId: id, holeNumber: n });
        if (!page) continue;
        pushResource("holeShots", url, page, { scorecardId: id, holeNumbers: [n], pattern: "per-hole" });
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
        else if (allWorks === null) allWorks = false;
      }
      const missing = covered ? holes.filter((h) => !covered.has(h)) : holes;
      if (missing.length) await fetchShotsPerHole(id, missing);
    }
    bundle.discovery.holeShotPattern = allWorks ? "all-in-one" : "per-hole";

    // ---- Phase 4: aggregates — always refetched -----------------------------
    const aggregates = [
      ["clubs", api(C.CLUBS_PATH), {}],
      ["clubTypes", api(C.CLUB_TYPES_PATH), {}],
      ["playerStats", api(C.PLAYER_STATS_PATH), {}],
      ...C.SHOT_STATS_VIEWS.map((v) => ["shotStats", api(C.SHOT_STATS_PATH(v)), { view: v }]),
    ];
    let adone = 0;
    for (const [kind, url, meta] of aggregates) {
      report({ phase: "aggregates", done: adone, total: aggregates.length, errors: bundle.errors.length });
      adone++;
      await politeDelay();
      const page = await fetchJson(url, kind, meta);
      if (page) pushResource(kind, url, page, meta);
    }

    finalize();
    report({ phase: "done", note: "Capture complete.", summary: bundle.summary });
    return { bundle, filename: filename(), newScorecardIds, nothingNew: false };
  } catch (e) {
    if (String(e && e.message).includes("AuthExhausted")) {
      bundle.errors.push({ stage: "fatal", message: "session expired mid-run — partial bundle" });
      finalize();
      return { bundle, filename: filename(), newScorecardIds, nothingNew: false, partial: true };
    }
    throw e;
  }
}

/* ── the CLI ──────────────────────────────────────────────────────────────── */

function knownFromRecord() {
  try {
    const rec = JSON.parse(readFileSync(resolve(ROOT, "data", "garmin-rounds.json"), "utf8"));
    return new Set(rec.rounds.map((r) => String(r.scorecardId)));
  } catch {
    return new Set();
  }
}

function newestRawBundle() {
  try {
    const files = readdirSync(RAW)
      .filter((f) => /^garmin-export-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/.test(f))
      .sort();
    return files[files.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const authFile = process.env.GARMIN_AUTH_FILE;
  if (!authFile || !existsSync(authFile)) {
    console.error("garmin: GARMIN_AUTH_FILE is not set or missing — run scripts/capture/garmin-token.py --refresh first");
    return 2;
  }
  const { headers } = JSON.parse(readFileSync(authFile, "utf8"));
  const C = loadExtensionConstants();

  const fetchText = async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
      return { status: res.status, url: res.url, text: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  };

  const known = knownFromRecord();
  const baselineRawFile = known.size > 0 ? newestRawBundle() : null;
  const { bundle, filename, newScorecardIds, nothingNew, partial } = await captureGarmin({
    fetchText,
    knownScorecards: known,
    baselineRawFile,
    constants: C,
    report: (m) => {
      const prog = typeof m.done === "number" ? ` ${m.done}/${m.total}` : "";
      console.log(`garmin: ${m.phase}${prog}${m.note ? ` — ${m.note}` : ""}`);
    },
  });

  if (nothingNew) {
    console.log(`garmin: nothing new (${known.size} scorecards already in the record)`);
    return 0;
  }
  console.log(`garmin: ${newScorecardIds.length} new scorecard(s): ${newScorecardIds.join(", ")}`);
  if (partial) console.error("garmin: the session died mid-run — partial bundle, not written");
  if (bundle.summary.scorecardDetails === 0) {
    console.error(`garmin: no scorecard detail captured (${bundle.errors.length} errors) — not written`);
    for (const e of bundle.errors) console.error(`  [${e.stage}] ${e.url ?? ""} ${e.status ?? ""} ${e.message}`);
    return 1;
  }
  if (partial) return 1;
  if (dryRun) {
    console.log(`garmin: --dry-run, would write data/raw/${filename}`);
    return 0;
  }
  const out = resolve(RAW, filename);
  writeFileSync(out, JSON.stringify(bundle, null, 2));
  console.log(`garmin: wrote data/raw/${filename} (${bundle.resources.length} resources, ${bundle.errors.length} errors)`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`garmin: ${e.message || e}`);
      process.exit(1);
    },
  );
}
