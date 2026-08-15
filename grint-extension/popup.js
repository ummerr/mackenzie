const btn = document.getElementById("scrape-btn");
const phaseEl = document.getElementById("phase");
const fillEl = document.getElementById("fill");
const noteEl = document.getElementById("note");
const errorsEl = document.getElementById("errors");

let tabId = null;

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
