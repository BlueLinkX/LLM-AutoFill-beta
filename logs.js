const logList = document.getElementById("logList");
const exportLogs = document.getElementById("exportLogs");
const clearLogs = document.getElementById("clearLogs");

document.addEventListener("DOMContentLoaded", render);
exportLogs.addEventListener("click", exportJson);
clearLogs.addEventListener("click", clearAll);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.autofillLogs) {
    render();
  }
});

async function render() {
  const { autofillLogs } = await chrome.storage.local.get("autofillLogs");
  const logs = Array.isArray(autofillLogs) ? autofillLogs : [];
  logList.textContent = "";

  if (!logs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有日志。生成一次填表方案后，这里会显示请求结果、字段摘要和 token 用量。";
    logList.append(empty);
    return;
  }

  logs.forEach((log, index) => {
    const detail = document.createElement("details");
    detail.className = "log";
    detail.open = index === 0;

    const summary = document.createElement("summary");
    summary.textContent = `${formatTime(log.timestamp)} · ${log.tab?.title || "Untitled"}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      metaItem("URL", log.tab?.url || ""),
      metaItem("模型", `${log.model || "-"} / ${log.reasoningEffort || "-"}`),
      metaItem("字段/建议", `${log.fieldCount || 0} / ${log.actionCount || 0}`),
      metaItem("Token", formatUsage(log.usage))
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

function formatUsage(usage) {
  if (!usage) {
    return "-";
  }
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? input + output;
  return `input ${input} / output ${output} / total ${total}`;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}
