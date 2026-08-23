const btn = document.getElementById("scrape-btn");
const phaseEl = document.getElementById("phase");
const fillEl = document.getElementById("fill");
const noteEl = document.getElementById("note");
const errorsEl = document.getElementById("errors");
const prevEl = document.getElementById("prev-bundle");

let tabId = null;

// Distilled from the previous bundle the user picked: just enough for the
// scraper to skip what's already captured. Null means a full capture. A
// scorecard only counts as captured when the bundle holds BOTH its detail
// and its hole shots — a detail without shots is refetched.
let baseline = null;

prevEl.addEventListener("change", () => {
  baseline = null;
  btn.textContent = "Capture all";
  const file = prevEl.files && prevEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bundle = JSON.parse(reader.result);
      if (bundle.format !== "garmin-export/1") {
        throw new Error(`not a garmin-export/1 bundle (format: ${bundle.format})`);
      }
      const detailIds = new Set();
      const shotIds = new Set();
      for (const r of bundle.resources || []) {
        if (!r.meta || r.meta.scorecardId == null) continue;
        if (r.kind === "scorecardDetail") detailIds.add(String(r.meta.scorecardId));
        if (r.kind === "holeShots") shotIds.add(String(r.meta.scorecardId));
      }
      const scorecardIds = [...detailIds].filter((id) => shotIds.has(id));
      if (scorecardIds.length === 0) {
        throw new Error("bundle has no complete scorecards — run a full capture instead");
      }
      baseline = { rawFile: file.name, scorecardIds };
      btn.textContent = "Capture new rounds";
      noteEl.classList.remove("ok");
      noteEl.textContent = `Incremental: ${scorecardIds.length} scorecards already captured will be skipped.`;
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
  if (!tab || !/^https:\/\/connect\.garmin\.com\//.test(tab.url || "")) {
    btn.disabled = true;
    noteEl.textContent = "Open a logged-in connect.garmin.com tab first, then click the icon again.";
    return;
  }
  tabId = tab.id;
});

btn.addEventListener("click", async () => {
  if (tabId == null) return;
  btn.disabled = true;
  phaseEl.textContent = "starting…";
  try {
    // Always set the baseline slot — explicitly null for a full capture — so
    // a re-run in the same tab never inherits a stale one.
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (b) => {
        window.__GARMIN_BASELINE = b;
      },
      args: [baseline],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["constants.js", "scraper.js"],
    });
  } catch (e) {
    btn.disabled = false;
    phaseEl.textContent = "error";
    noteEl.textContent = String(e);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "garmin-progress") return;

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
  }
  if (msg.phase === "error") {
    btn.disabled = false;
  }
});
