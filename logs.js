import { normalizeSettings } from "./defaults.js";
import { setDocumentLanguage, t } from "./i18n.js";

const logList = document.getElementById("logList");
const exportLogs = document.getElementById("exportLogs");
const clearLogs = document.getElementById("clearLogs");

document.addEventListener("DOMContentLoaded", render);
exportLogs.addEventListener("click", exportJson);
clearLogs.addEventListener("click", clearAll);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.autofillLogs || changes.settings)) {
    render();
  }
});

async function render() {
  const { autofillLogs, settings } = await chrome.storage.local.get(["autofillLogs", "settings"]);
  const mergedSettings = normalizeSettings(settings);
  const lang = mergedSettings.uiLanguage;
  const logs = Array.isArray(autofillLogs) ? autofillLogs : [];

  setDocumentLanguage(lang);
  document.title = t(lang, "logsTitle");
  document.getElementById("logsTitle").textContent = t(lang, "logsTitle");
  document.getElementById("logsDescription").textContent = t(lang, "logsDescription");
  exportLogs.textContent = t(lang, "exportJson");
  clearLogs.textContent = t(lang, "clearLogs");

  logList.textContent = "";

  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t(lang, "noLogsYet");
    logList.append(empty);
    return;
  }

  logs.forEach((log, index) => {
    const detail = document.createElement("details");
    detail.className = "log";
    detail.open = index === 0;

    const summary = document.createElement("summary");
    summary.textContent = `${formatTime(log.timestamp)} - ${log.tab?.title || t(lang, "untitled")}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      metaItem("URL", log.tab?.url || ""),
      metaItem(t(lang, "logModel"), `${log.provider || "-"} / ${log.model || "-"} / ${log.reasoningEffort || "-"}`),
      metaItem(t(lang, "logFieldActions"), `${log.fieldCount || 0} / ${log.actionCount || 0}`),
      metaItem(t(lang, "tokenUsage"), formatUsage(log.usage, lang))
    );

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(log, null, 2);

    detail.append(summary, meta, pre);
    logList.append(detail);
  });
}

async function exportJson() {
  const { autofillLogs } = await chrome.storage.local.get("autofillLogs");
  const logs = Array.isArray(autofillLogs) ? autofillLogs : [];
  const blob = new Blob([JSON.stringify(logs, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `autofill-logs-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function clearAll() {
  await chrome.storage.local.set({ autofillLogs: [] });
  await render();
}

function metaItem(label, value) {
  const span = document.createElement("span");
  span.textContent = `${label}: ${value}`;
  return span;
}

function formatUsage(usage, lang) {
  if (!usage) {
    return "-";
  }
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? input + output;
  return t(lang, "usageFormat", { input, output, total });
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}
