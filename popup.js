import { getLocalDefaultProfile } from "./defaults.js";

const state = {
  tab: null,
  fields: [],
  plan: null
};

const elements = {
  setupState: document.getElementById("setupState"),
  status: document.getElementById("status"),
  fieldCount: document.getElementById("fieldCount"),
  actionCount: document.getElementById("actionCount"),
  scanPage: document.getElementById("scanPage"),
  generatePlan: document.getElementById("generatePlan"),
  applyPlan: document.getElementById("applyPlan"),
  openProfile: document.getElementById("openProfile"),
  openLogs: document.getElementById("openLogs"),
  previewSection: document.getElementById("previewSection"),
  previewList: document.getElementById("previewList"),
  notesSection: document.getElementById("notesSection"),
  notes: document.getElementById("notes"),
  selectHighConfidence: document.getElementById("selectHighConfidence"),
  usageSection: document.getElementById("usageSection"),
  usageText: document.getElementById("usageText")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.openProfile.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.openLogs.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("logs.html") });
  });
  elements.scanPage.addEventListener("click", scanCurrentPage);
  elements.generatePlan.addEventListener("click", generatePlan);
  elements.applyPlan.addEventListener("click", applyPlan);
  elements.selectHighConfidence.addEventListener("click", selectHighConfidence);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab;

  await refreshSetupState();
}

async function refreshSetupState() {
  const { apiKey, profile } = await chrome.storage.local.get(["apiKey", "profile"]);
  const hasKey = Boolean(apiKey);
  const activeProfile = profile || await getLocalDefaultProfile();
  const hasProfile = Object.values(flatten(activeProfile)).some((value) => String(value || "").trim());

  if (hasKey && hasProfile) {
    elements.setupState.textContent = "配置已就绪";
  } else if (!hasKey && !hasProfile) {
    elements.setupState.textContent = "需要配置 API Key 和个人资料";
  } else if (!hasKey) {
    elements.setupState.textContent = "需要配置 API Key";
  } else {
    elements.setupState.textContent = "需要填写个人资料";
  }
}

async function scanCurrentPage() {
  await runWithStatus("正在扫描当前页面字段...", async () => {
    await ensureContentScript();
    const response = await chrome.tabs.sendMessage(state.tab.id, { type: "GET_FORM_FIELDS" });
    if (!response?.ok) {
      throw new Error(response?.error || "字段扫描失败。");
    }
    state.fields = response.fields || [];
    state.plan = null;
    state.usage = null;
    renderCounts();
    renderUsage();
    renderPlan();
    setStatus(`发现 ${state.fields.length} 个可填写字段。`);
  });
}

async function generatePlan() {
  await runWithStatus("正在生成填表方案...", async () => {
    await ensureContentScript();

    if (!state.fields.length) {
      const response = await chrome.tabs.sendMessage(state.tab.id, { type: "GET_FORM_FIELDS" });
      if (!response?.ok) {
        throw new Error(response?.error || "字段扫描失败。");
      }
      state.fields = response.fields || [];
    }

    if (!state.fields.length) {
      throw new Error("当前页面没有发现可填写字段。");
    }

    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_FILL_PLAN",
      tabId: state.tab.id,
      fields: state.fields
    });

    if (!response?.ok) {
      throw new Error(response?.error || "生成失败。");
    }

    state.plan = response.plan;
    state.usage = response.usage || null;
    await saveClientLog(response.logEntry);
    renderCounts();
    renderUsage();
    renderPlan();
    setStatus(`已生成 ${state.plan.actions.length} 条填表建议。`);
  });
}

async function saveClientLog(logEntry) {
  if (!logEntry) {
    return;
  }

  try {
    const { autofillLogs } = await chrome.storage.local.get("autofillLogs");
    const logs = Array.isArray(autofillLogs) ? autofillLogs : [];
    const deduped = logs.filter((log) => log.responseId !== logEntry.responseId || !logEntry.responseId);
    deduped.unshift({ ...logEntry, savedByPopup: true });
    await chrome.storage.local.set({
      autofillLogs: deduped.slice(0, 30)
    });
  } catch (error) {
    console.warn("Failed to save autofill log", error);
  }
}

async function applyPlan() {
  await runWithStatus("正在填入选中字段...", async () => {
    await ensureContentScript();
    const actions = getSelectedActions();
    if (!actions.length) {
      throw new Error("没有选中的填表项。");
    }

    const response = await chrome.tabs.sendMessage(state.tab.id, {
      type: "FILL_FORM_FIELDS",
      actions
    });

    if (!response?.ok) {
      throw new Error(response?.error || "填入失败。");
    }

    const filled = (response.result || []).filter((item) => item.filled).length;
    setStatus(`已填入 ${filled}/${actions.length} 个字段，请在网页上检查后再提交。`);
  });
}

async function ensureContentScript() {
  if (!state.tab?.id) {
    throw new Error("找不到当前标签页。");
  }
  if (/^(chrome|edge|about):\/\//i.test(state.tab.url || "")) {
    throw new Error("浏览器内部页面不能注入扩展脚本，请打开普通网页或本地测试页。");
  }

  await chrome.scripting.executeScript({
    target: { tabId: state.tab.id },
    files: ["content.js"]
  });
}

function renderPlan() {
  const actions = state.plan?.actions || [];
  elements.previewList.textContent = "";
  elements.notes.textContent = "";
  elements.previewSection.classList.toggle("hidden", actions.length === 0);

  for (const action of actions) {
    const field = state.fields.find((item) => item.fieldId === action.fieldId);
    const item = document.createElement("article");
    item.className = "preview-item";
    item.dataset.fieldId = action.fieldId;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = action.confidence >= 0.55;

    const body = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = fieldLabel(field, action);

    const input = document.createElement("input");
    input.type = "text";
    input.value = action.value;
    input.dataset.role = "value";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span class="confidence">${Math.round(action.confidence * 100)}%</span> ${escapeHtml(action.reason || "")}`;

    body.append(label, input, meta);
    item.append(checkbox, body);
    elements.previewList.append(item);
  }

  const notes = state.plan?.notes || [];
  elements.notesSection.classList.toggle("hidden", notes.length === 0);
  for (const note of notes) {
    const li = document.createElement("li");
    li.textContent = note;
    elements.notes.append(li);
  }
}

function renderUsage() {
  const usage = state.usage;
  elements.usageSection.classList.toggle("hidden", !usage);
  if (!usage) {
    elements.usageText.textContent = "-";
    return;
  }

  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? input + output;
  elements.usageText.textContent = `input ${input} / output ${output} / total ${total}`;
}

function getSelectedActions() {
  const actions = [];
  for (const item of elements.previewList.querySelectorAll(".preview-item")) {
    const checkbox = item.querySelector("input[type='checkbox']");
    const input = item.querySelector("input[data-role='value']");
    if (!checkbox.checked) {
      continue;
    }
    actions.push({
      fieldId: item.dataset.fieldId,
      value: input.value
    });
  }
  return actions;
}

function selectHighConfidence() {
  const actions = state.plan?.actions || [];
  for (const item of elements.previewList.querySelectorAll(".preview-item")) {
    const action = actions.find((candidate) => candidate.fieldId === item.dataset.fieldId);
    const checkbox = item.querySelector("input[type='checkbox']");
    checkbox.checked = Boolean(action && action.confidence >= 0.8);
  }
}

function renderCounts() {
  elements.fieldCount.textContent = String(state.fields.length);
  elements.actionCount.textContent = String(state.plan?.actions?.length || 0);
}

async function runWithStatus(message, callback) {
  setBusy(true);
  setStatus(message);
  try {
    await callback();
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  elements.scanPage.disabled = busy;
  elements.generatePlan.disabled = busy;
  elements.applyPlan.disabled = busy;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.borderColor = isError ? "#fca5a5" : "#dbe3f0";
  elements.status.style.color = isError ? "#b42318" : "#475467";
}

function fieldLabel(field, action) {
  if (!field) {
    return action.fieldId;
  }
  return `${action.fieldId} · ${field.label || field.placeholder || field.name || field.nearbyText || field.kind}`;
}

function flatten(value, prefix = "", output = {}) {
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, output);
    }
  } else {
    output[prefix] = value;
  }
  return output;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
