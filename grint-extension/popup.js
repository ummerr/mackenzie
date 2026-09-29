const btn = document.getElementById("scrape-btn");
const phaseEl = document.getElementById("phase");
const fillEl = document.getElementById("fill");
const noteEl = document.getElementById("note");
const errorsEl = document.getElementById("errors");
const prevEl = document.getElementById("prev-bundle");
const recentEl = document.getElementById("recent");
const fullEl = document.getElementById("full");

// Mirrors constants.js (the popup cannot see it — it is injected into the
// page, not loaded here). The scraper clamps again on its side.
const RECENT_DEFAULT = 10;
const RECENT_MIN = 1;
const RECENT_MAX = 40;

let tabId = null;

// Distilled from the previous FULL bundle the user picked: just enough for
// the scraper to skip what's already captured. Null means no baseline.
let baseline = null;

function recentCount() {
  const n = parseInt(recentEl.value, 10);
  return Number.isFinite(n) ? Math.min(RECENT_MAX, Math.max(RECENT_MIN, n)) : RECENT_DEFAULT;
}

// The three modes, in precedence order: an armed baseline is an exact delta,
// the checkbox is the full history, otherwise the newest N rounds.
function mode() {
  if (baseline) return { mode: "baseline" };
  if (fullEl.checked) return { mode: "full" };
  return { mode: "recent", rounds: recentCount() };
}

function setIdleLabel() {
  const m = mode();
  btn.textContent =
    m.mode === "baseline"
      ? "Scrape new rounds"
      : m.mode === "full"
        ? "Scrape all"
        : `Scrape last ${m.rounds} rounds`;
}

recentEl.addEventListener("input", setIdleLabel);
fullEl.addEventListener("change", setIdleLabel);

prevEl.addEventListener("change", () => {
  baseline = null;
  setIdleLabel();
  const file = prevEl.files && prevEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bundle = JSON.parse(reader.result);
      if (bundle.format !== "grint-export/1") {
        throw new Error(`not a grint-export/1 bundle (format: ${bundle.format})`);
      }
      // A delta knows only the handful of rounds it fetched; used as a
      // baseline it makes the "incremental" run refetch everything else
      // (2026-09-09 and 2026-09-29 both did exactly that). Refuse it.
      if (bundle.baseline || bundle.scope) {
        const n = (bundle.resources || []).filter((r) => r.kind === "scorecard").length;
        throw new Error(
          `that bundle is a delta with ${n} round${n === 1 ? "" : "s"} — pick the full bundle, or just scrape the last N rounds`,
        );
      }
      const roundIds = [];
      const courseTees = [];
      for (const r of bundle.resources || []) {
        if (r.kind === "scorecard" && r.meta && r.meta.roundId) {
          roundIds.push(String(r.meta.roundId));
        }
        if (r.kind === "courseData" && r.meta && r.meta.courseId) {
          courseTees.push(`${r.meta.courseId}/${r.meta.teeId}`);
        }
      }
      if (roundIds.length === 0) {
        throw new Error("bundle has no scorecards — run a full scrape instead");
      }
      baseline = { rawFile: file.name, roundIds, courseTees };
      setIdleLabel();
      noteEl.classList.remove("ok");
      noteEl.textContent = `Incremental: ${roundIds.length} rounds already captured will be skipped.`;
    } catch (e) {
      prevEl.value = "";
      noteEl.classList.remove("ok");
      noteEl.textContent = `Could not use that file: ${e.message || e}`;
    }
  };
  reader.onerror = () => {
    prevEl.value = "";
    noteEl.textContent = "Could not read that file.";
  };
  reader.readAsText(file);
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !/^https:\/\/(www\.)?thegrint\.com\//.test(tab.url || "")) {
    btn.disabled = true;
    noteEl.textContent = "Open a logged-in thegrint.com tab first, then click the icon again.";
    return;
  }
  tabId = tab.id;
});

btn.addEventListener("click", async () => {
  if (tabId == null) return;
  btn.disabled = true;
  phaseEl.textContent = "starting…";
  try {
    // Always set both slots — explicitly null / the chosen scope — so a
    // re-run in the same tab never inherits a stale mode.
    const scope = mode();
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (b, s) => {
        window.__GRINT_BASELINE = b;
        window.__GRINT_SCOPE = s;
      },
      args: [baseline, scope],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["constants.js", "extract.js", "scraper.js"],
    });
  } catch (e) {
    btn.disabled = false;
    phaseEl.textContent = "error";
    noteEl.textContent = String(e);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "grint-progress") return;

  phaseEl.textContent = msg.phase || "";

  if (typeof msg.done === "number" && typeof msg.total === "number" && msg.total > 0) {
    fillEl.style.width = `${Math.round((msg.done / msg.total) * 100)}%`;
    phaseEl.textContent = `${msg.phase} — ${msg.done}/${msg.total}`;
  }

  if (msg.note) noteEl.textContent = msg.note;

  if (typeof msg.errors === "number" && msg.errors > 0) {
    errorsEl.textContent = `${msg.errors} error${msg.errors === 1 ? "" : "s"} (recorded in the bundle)`;
  }

  if (msg.phase === "done") {
    fillEl.style.width = "100%";
    noteEl.classList.add("ok");
    btn.disabled = false;
    setIdleLabel();
  }
  if (msg.phase === "error") {
    btn.disabled = false;
    setIdleLabel();
  }
});

setIdleLabel();
