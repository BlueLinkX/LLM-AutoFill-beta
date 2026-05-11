import {
  getLocalDefaultProfile,
  normalizeApiKeys,
  normalizeSettings
} from "./defaults.js";
import { setDocumentLanguage, t } from "./i18n.js";

const state = {
  tab: null,
  fields: [],
  plan: null,
  usage: null,
  settings: normalizeSettings()
};

const elements = {
  appTitle: document.getElementById("appTitle"),
  setupState: document.getElementById("setupState"),
  status: document.getElementById("status"),
  fieldCount: document.getElementById("fieldCount"),
  actionCount: document.getElementById("actionCount"),
  fieldsLabel: document.getElementById("fieldsLabel"),
  suggestionsLabel: document.getElementById("suggestionsLabel"),
  usageLabel: document.getElementById("usageLabel"),
  usageText: document.getElementById("usageText"),
  notesTitle: document.getElementById("notesTitle"),
  previewTitle: document.getElementById("previewTitle"),
  quickAutofill: document.getElementById("quickAutofill"),
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
  usageSection: document.getElementById("usageSection")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadSettings();
  applyStaticText();

  elements.openProfile.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.openLogs.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("logs.html") });
  });
  elements.quickAutofill.addEventListener("click", quickAutofill);
  elements.scanPage.addEventListener("click", scanCurrentPage);
  elements.generatePlan.addEventListener("click", generatePlan);
  elements.applyPlan.addEventListener("click", applyPlan);
  elements.selectHighConfidence.addEventListener("click", selectHighConfidence);

  await refreshActiveTab();

  await refreshSetupState();
  setStatus(t(state.settings.uiLanguage, "openPageFirst"));
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  state.settings = normalizeSettings(settings);
  setDocumentLanguage(state.settings.uiLanguage);
}

function applyStaticText() {
  const lang = state.settings.uiLanguage;
  document.title = t(lang, "appName");
  elements.appTitle.textContent = t(lang, "appName");
  elements.openLogs.title = t(lang, "logs");
  elements.openProfile.title = t(lang, "settings");
  elements.quickAutofill.textContent = t(lang, "quickAutofill");
  elements.scanPage.textContent = t(lang, "scanFields");
  elements.generatePlan.textContent = t(lang, "generatePlan");
  elements.applyPlan.textContent = t(lang, "fillSelectedFields");
  elements.selectHighConfidence.textContent = t(lang, "highConfidenceOnly");
  elements.fieldsLabel.textContent = t(lang, "fields");
  elements.suggestionsLabel.textContent = t(lang, "suggestions");
  elements.usageLabel.textContent = t(lang, "tokenUsage");
  elements.notesTitle.textContent = t(lang, "notes");
  elements.previewTitle.textContent = t(lang, "fillPreview");
  if (!state.plan) {
    elements.setupState.textContent = t(lang, "checkingConfig");
  }
}

async function refreshSetupState() {
  const { apiKey, apiKeys, profile, settings } = await chrome.storage.local.get([
    "apiKey",
    "apiKeys",
    "profile",
    "settings"
  ]);

  state.settings = normalizeSettings(settings);
  setDocumentLanguage(state.settings.uiLanguage);

  const normalizedApiKeys = normalizeApiKeys(apiKeys, apiKey);
  const hasKey = Boolean(normalizedApiKeys[state.settings.provider]);
  const activeProfile =
    profile && Object.values(flatten(profile)).some((value) => String(value || "").trim())
      ? profile
      : await getLocalDefaultProfile();
  const hasProfile = Object.values(flatten(activeProfile)).some((value) => String(value || "").trim());
  const lang = state.settings.uiLanguage;

  applyStaticText();

  if (hasKey && hasProfile) {
    elements.setupState.textContent = t(lang, "configReady");
  } else if (!hasKey && !hasProfile) {
    elements.setupState.textContent = t(lang, "needKeyAndProfile");
  } else if (!hasKey) {
    elements.setupState.textContent = t(lang, "needKey");
  } else {
    elements.setupState.textContent = t(lang, "needProfile");
  }
}

async function scanCurrentPage() {
  await runWithStatus(t(state.settings.uiLanguage, "scanning"), async () => {
    await scanFieldsInternal();
    setStatus(t(state.settings.uiLanguage, "foundFields", { count: state.fields.length }));
  });
}

async function generatePlan() {
  await runWithStatus(t(state.settings.uiLanguage, "generating"), async () => {
    await generatePlanInternal();
    setStatus(t(state.settings.uiLanguage, "generatedSuggestions", { count: state.plan.actions.length }));
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
  await runWithStatus(t(state.settings.uiLanguage, "applying"), async () => {
    const filled = await applySelectedInternal();
    setStatus(
      t(state.settings.uiLanguage, "fillResult", {
        filled,
        total: getSelectedActions().length
      })
    );
  });
}

async function quickAutofill() {
  await runWithStatus(t(state.settings.uiLanguage, "quickAutofillRunning"), async () => {
    await scanFieldsInternal();
    await generatePlanInternal();
    const selectedActions = getSelectedActions();
    if (!selectedActions.length) {
      throw new Error(t(state.settings.uiLanguage, "noSelectedActions"));
    }
    const filled = await applyActionsInternal(selectedActions);
    setStatus(
      t(state.settings.uiLanguage, "quickAutofillDone", {
        filled,
        total: selectedActions.length
      })
    );
  });
}

async function ensureContentScript() {
  if (!state.tab?.id) {
    throw new Error(t(state.settings.uiLanguage, "missingTab"));
  }
  if (/^(chrome|edge|about):\/\//i.test(state.tab.url || "")) {
    throw new Error(t(state.settings.uiLanguage, "unsupportedPage"));
  }

  await chrome.scripting.executeScript({
    target: { tabId: state.tab.id },
    files: ["content.js"]
  });
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tab = tab || null;
}

async function scanFieldsInternal() {
  await refreshActiveTab();
  await ensureContentScript();
  const response = await chrome.tabs.sendMessage(state.tab.id, { type: "GET_FORM_FIELDS" });
  if (!response?.ok) {
    throw new Error(response?.error || t(state.settings.uiLanguage, "fieldScanFailed"));
  }
  state.fields = response.fields || [];
  state.plan = null;
  state.usage = null;
  renderCounts();
  renderUsage();
  renderPlan();
  return state.fields;
}

async function generatePlanInternal() {
  await refreshActiveTab();
  await ensureContentScript();

  if (!state.fields.length) {
    await scanFieldsInternal();
  }

  if (!state.fields.length) {
    throw new Error(t(state.settings.uiLanguage, "noFieldsFound"));
  }

  const response = await chrome.runtime.sendMessage({
    type: "GENERATE_FILL_PLAN",
    tabId: state.tab.id,
    fields: state.fields
  });

  if (!response?.ok) {
    throw new Error(response?.error || t(state.settings.uiLanguage, "generationFailed"));
  }

  state.plan = response.plan;
  state.usage = response.usage || null;
  await saveClientLog(response.logEntry);
  renderCounts();
  renderUsage();
  renderPlan();
  return state.plan;
}

async function applySelectedInternal() {
  const actions = getSelectedActions();
  if (!actions.length) {
    throw new Error(t(state.settings.uiLanguage, "noSelectedActions"));
  }
  return applyActionsInternal(actions);
}

async function applyActionsInternal(actions) {
  await refreshActiveTab();
  await ensureContentScript();
  const response = await chrome.tabs.sendMessage(state.tab.id, {
    type: "FILL_FORM_FIELDS",
    actions
  });

  if (!response?.ok) {
    throw new Error(response?.error || t(state.settings.uiLanguage, "fillFailed"));
  }

  return (response.result || []).filter((item) => item.filled).length;
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
  elements.usageText.textContent = t(state.settings.uiLanguage, "usageFormat", {
    input,
    output,
    total
  });
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
  elements.quickAutofill.disabled = busy;
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
  return `${action.fieldId} - ${field.label || field.placeholder || field.name || field.nearbyText || field.kind}`;
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
