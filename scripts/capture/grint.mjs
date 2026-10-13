#!/usr/bin/env node
/**
 * Unattended Grint capture (DECISIONS.md 2026-10-12): the grint-extension's
 * own three files, run verbatim in a headless Chromium tab that this script
 * logs in, with the download caught and placed in data/raw/.
 *
 *   node scripts/capture/grint.mjs            capture what is new
 *   node scripts/capture/grint.mjs --dry-run  say what is new, write nothing
 *
 * Env: GRINT_USERNAME, GRINT_PASSWORD (the login form's two fields), and
 * optionally GRINT_STATE_FILE — a Playwright storageState file that keeps the
 * session between local runs (never committed; CI logs in fresh each night).
 *
 * Grint has no API. Its classic web client is a PHP app behind a plain form
 * post (no captcha as of 2026-10-12), and the extension already captures by
 * same-origin fetch + DOM extraction inside a logged-in tab — exactly what a
 * Playwright page is. So nothing of the capture is re-implemented: the
 * constants, extractors and scraper are injected from grint-extension/ as
 * they are, the "Scrape last N rounds" scope is set the way the popup sets
 * it, and the Blob download the scraper fires is the file written here.
 *
 * Incremental by construction: the /score listing is read first and N is the
 * depth of the deepest round not yet in data/rounds.json. No new round means
 * nothing written.
 */

import { readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data", "raw");
const EXT = resolve(ROOT, "grint-extension");
const BASE = "https://thegrint.com";
const RECENT_MAX = 40; // mirrors grint-extension/constants.js
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;

// A plain desktop UA: the headless default advertises itself as headless.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function knownRoundIds() {
  try {
    const rec = JSON.parse(readFileSync(resolve(ROOT, "data", "rounds.json"), "utf8"));
    return new Set(rec.rounds.map((r) => String(r.roundId)));
  } catch {
    return new Set();
  }
}

async function loggedIn(page) {
  await page.goto(`${BASE}/trend`, { waitUntil: "domcontentloaded" });
  return (await page.locator("#filterUserId").count()) > 0;
}

async function login(page, username, password) {
  await page.goto(`${BASE}/passthru`, { waitUntil: "domcontentloaded" });
  await page.fill("#usernameLogin", username);
  await page.fill("#pwdLogin", password);
  const remember = page.locator('#form-login input[name="remember"]');
  if ((await remember.count()) > 0) await remember.first().check().catch(() => {});
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator("#form-login button[type=submit], #form-login input[type=submit]").first().click(),
  ]);
  return loggedIn(page);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const username = process.env.GRINT_USERNAME;
  const password = process.env.GRINT_PASSWORD;
  const stateFile = process.env.GRINT_STATE_FILE || null;
  if (!username || !password) {
    console.error("grint: GRINT_USERNAME and GRINT_PASSWORD are required");
    return 2;
  }

  const browser = await chromium.launch({ headless: true });
  let code = 1;
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent: USER_AGENT,
      storageState: stateFile && existsSync(stateFile) ? stateFile : undefined,
    });
    const page = await context.newPage();

    // ---- session ------------------------------------------------------------
    if (!(await loggedIn(page))) {
      console.log("grint: logging in");
      if (!(await login(page, username, password))) {
        console.error("grint: login failed — the form posted but /trend shows no user id (wrong password, or the login page changed)");
        return 3;
      }
    }
    if (stateFile) {
      mkdirSync(dirname(stateFile), { recursive: true });
      await context.storageState({ path: stateFile });
    }

    // ---- what is new --------------------------------------------------------
    await page.goto(`${BASE}/score`, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: resolve(EXT, "constants.js") });
    await page.addScriptTag({ path: resolve(EXT, "extract.js") });
    const listed = await page.evaluate(() =>
      window.__GRINT.extract.extractScoreIndex(document).roundLinks.map((l) => String(l.roundId)),
    );
    const known = knownRoundIds();
    const newIds = listed.filter((id) => !known.has(id));
    if (listed.length === 0) {
      console.error("grint: the /score listing shows no rounds — the listing markup changed, or the session is not really logged in");
      return 3;
    }
    if (newIds.length === 0) {
      console.log(`grint: nothing new (${listed.length} listed, all in the record)`);
      return 0;
    }
    // Depth of the deepest new round in the newest-first listing, so a card
    // posted late for an earlier date is still inside the window.
    const depth = Math.max(...newIds.map((id) => listed.indexOf(id))) + 1;
    const recentN = Math.min(RECENT_MAX, Math.max(1, depth));
    console.log(`grint: ${newIds.length} new round(s): ${newIds.join(", ")} — scraping the last ${recentN}`);
    if (dryRun) return 0;

    // ---- the extension's own run --------------------------------------------
    await page.exposeFunction("__grintReport", (msg) => {
      const prog = typeof msg.done === "number" && typeof msg.total === "number" ? ` ${msg.done}/${msg.total}` : "";
      console.log(`grint: ${msg.phase}${prog}${msg.note ? ` — ${msg.note}` : ""}`);
    });
    await page.evaluate((scope) => {
      window.__GRINT_BASELINE = null;
      window.__GRINT_SCOPE = scope;
      // The scraper's report() goes through chrome.runtime.sendMessage inside
      // a try/catch; giving it a stand-in turns the phases into log lines.
      window.chrome = { runtime: { sendMessage: (m) => window.__grintReport(m) } };
    }, { mode: "recent", rounds: recentN });

    const downloadPromise = page.waitForEvent("download", { timeout: CAPTURE_TIMEOUT_MS });
    await page.addScriptTag({ path: resolve(EXT, "scraper.js") });
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const out = resolve(RAW, filename);
    await download.saveAs(out);

    const bundle = JSON.parse(readFileSync(out, "utf8"));
    const ok = bundle.summary?.scorecardsOk ?? 0;
    const loggedOut = (bundle.errors ?? []).some((e) => /logged out/i.test(e.message ?? ""));
    if (ok === 0 || loggedOut) {
      console.error(`grint: capture unusable (${ok} scorecards, ${bundle.errors.length} errors${loggedOut ? ", session lost mid-run" : ""}) — ${filename} removed`);
      for (const e of bundle.errors.slice(0, 10)) console.error(`  [${e.stage}] ${e.url ?? ""} ${e.message}`);
      unlinkSync(out);
      return 1;
    }
    console.log(`grint: wrote data/raw/${filename} (${bundle.resources.length} resources, ${ok} scorecards, ${bundle.errors.length} errors)`);
    code = 0;
  } finally {
    await browser.close();
  }
  return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(`grint: ${e.message || e}`);
      process.exit(1);
    },
  );
}
