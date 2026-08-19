const btn = document.getElementById("scrape-btn");
const phaseEl = document.getElementById("phase");
const fillEl = document.getElementById("fill");
const noteEl = document.getElementById("note");
const errorsEl = document.getElementById("errors");
const prevEl = document.getElementById("prev-bundle");

let tabId = null;

// Distilled from the previous bundle the user picked: just enough for the
// scraper to skip what's already captured. Null means a full scrape.
let baseline = null;

prevEl.addEventListener("change", () => {
  baseline = null;
  btn.textContent = "Scrape all";
  const file = prevEl.files && prevEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bundle = JSON.parse(reader.result);
      if (bundle.format !== "grint-export/1") {
        throw new Error(`not a grint-export/1 bundle (format: ${bundle.format})`);
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
      btn.textContent = "Scrape new rounds";
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
    // Always set the baseline slot — explicitly null for a full scrape — so a
    // re-run in the same tab never inherits a stale one.
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (b) => {
        window.__GRINT_BASELINE = b;
      },
      args: [baseline],
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
  }
  if (msg.phase === "error") {
    btn.disabled = false;
  }
});
