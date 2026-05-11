import { DEFAULT_SETTINGS, getLocalDefaultProfile } from "./defaults.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "GENERATE_FILL_PLAN") {
    return false;
  }

  generateFillPlan(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function generateFillPlan({ tabId, fields }) {
  if (!tabId) {
    throw new Error("缺少当前标签页 ID。");
  }

  const { apiKey, profile, settings } = await chrome.storage.local.get([
    "apiKey",
    "profile",
    "settings"
  ]);
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  if (!apiKey) {
    throw new Error("请先在配置页保存 OpenAI API Key。");
  }
  const activeProfile = hasProfileContent(profile || {}) ? profile : await getLocalDefaultProfile();
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("当前页面没有发现可填写字段。");
  }

  let screenshot = null;
  if (mergedSettings.includeScreenshot) {
    screenshot = await captureAnnotatedScreenshot(tabId);
  }

  const apiResult = await callOpenAI({
    apiKey,
    model: mergedSettings.model || DEFAULT_SETTINGS.model,
    reasoningEffort: mergedSettings.reasoningEffort || DEFAULT_SETTINGS.reasoningEffort,
    profile: activeProfile,
    fields,
    screenshot
  });
  const rawPlan = apiResult.parsed;

  const fieldIds = new Set(fields.map((field) => field.fieldId));
  const actions = (rawPlan.actions || [])
    .filter((action) => fieldIds.has(action.fieldId))
    .map((action) => ({
      fieldId: String(action.fieldId),
      value: action.value == null ? "" : String(action.value),
      confidence: normalizeConfidence(action.confidence),
      reason: String(action.reason || "")
    }));

  const logEntry = {
    timestamp: new Date().toISOString(),
    tab: await getTabSummary(tabId),
    model: mergedSettings.model || DEFAULT_SETTINGS.model,
    reasoningEffort: mergedSettings.reasoningEffort || DEFAULT_SETTINGS.reasoningEffort,
    screenshotUsed: Boolean(screenshot),
    fieldCount: fields.length,
    actionCount: actions.length,
    usage: apiResult.usage || null,
    responseId: apiResult.responseId || "",
    fields: summarizeFields(fields),
    plan: {
      actions,
      notes: Array.isArray(rawPlan.notes) ? rawPlan.notes.map(String) : []
    }
  };

  const result = {
    plan: {
      actions,
      notes: Array.isArray(rawPlan.notes) ? rawPlan.notes.map(String) : []
    },
    usage: apiResult.usage || null,
    responseId: apiResult.responseId || "",
    screenshotUsed: Boolean(screenshot),
    logEntry
  };

  try {
    await appendAutofillLog(logEntry);
  } catch (error) {
    result.logError = error.message || String(error);
  }

  return result;
}

async function captureAnnotatedScreenshot(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SHOW_FIELD_OVERLAY" });
    await sleep(350);
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png"
    });
    return dataUrl;
  } finally {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "HIDE_FIELD_OVERLAY" });
    } catch (_error) {
      // The page may have navigated. The screenshot failure path will report the real error.
    }
  }
}

async function callOpenAI({ apiKey, model, reasoningEffort, profile, fields, screenshot }) {
  const userPayload = {
    task: "Map the user's saved profile and resume information to the web form fields.",
    localeHint: navigator.language || "zh-CN",
    profile,
    fields
  };

  const content = [
    {
      type: "input_text",
      text: JSON.stringify(userPayload)
    }
  ];

  if (screenshot) {
    content.push({
      type: "input_image",
      image_url: screenshot
    });
  }

  const body = {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt()
          }
        ]
      },
      {
        role: "user",
        content
      }
    ],
    reasoning: {
      effort: reasoningEffort
    },
    text: {
      format: {
        type: "json_schema",
        name: "autofill_plan",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["actions", "notes"],
          properties: {
            actions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["fieldId", "value", "confidence", "reason"],
                properties: {
                  fieldId: { type: "string" },
                  value: { type: "string" },
                  confidence: { type: "number" },
                  reason: { type: "string" }
                }
              }
            },
            notes: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      }
    }
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`OpenAI API 调用失败：${message}`);
  }

  return {
    parsed: parseResponseJson(data),
    usage: data?.usage || null,
    responseId: data?.id || ""
  };
}

function buildSystemPrompt() {
  return [
    "You are a precise form autofill planner.",
    "Return only JSON matching the schema.",
    "Use the fieldId values exactly as provided.",
    "Create actions only for fields that can be confidently filled from the profile or resume.",
    "For selects and radio groups, choose the exact option text or option value when possible.",
    "For date dropdowns, fill only the requested part: year fields get the year, month fields get the month, and day fields get the day.",
    "For Japanese date dropdowns, use formats such as 1996, 10, 22, 2027 when the option list contains numbers, and match the exact visible option if it includes 年, 月, or 日.",
    "For checkboxes, use value \"true\" or \"false\".",
    "Do not invent unavailable facts such as salary, ID number, visa status, or dates.",
    "Never fill passwords, verification codes, payment CVV, one-time codes, or submit buttons.",
    "Prefer the user's explicit profile fields over inferred resume text.",
    "The profile may include education in Chinese, Japanese, or English. Split education records into school, faculty/department, degree level, enrollment date, graduation date, and expected graduation date when fields ask for those parts.",
    "If a field's direct label is blank, use nearbyText, sectionText, tableContext, ancestorText, placeholder, name, id, and screenshot marker context before deciding it is unclear.",
    "For education fields, use the user's saved education records when the field context asks for undergraduate, master's, doctoral, school, department, enrollment, graduation, or expected graduation.",
    "Keep values concise and directly suitable for the form field.",
    "If a field asks for a cover-letter style answer, use the resume/profile facts and write a short professional answer."
  ].join("\n");
}

function parseResponseJson(data) {
  const direct = data?.output_text;
  if (direct) {
    return JSON.parse(direct);
  }

  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  if (!chunks.length) {
    throw new Error("OpenAI API 没有返回可解析的文本结果。");
  }

  return JSON.parse(chunks.join(""));
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(1, number));
}

function hasProfileContent(profile) {
  return Object.values(profile).some((value) => {
    if (value == null) {
      return false;
    }
    if (typeof value === "object") {
      return hasProfileContent(value);
    }
    return String(value).trim().length > 0;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTabSummary(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      title: tab.title || "",
      url: tab.url || ""
    };
  } catch (_error) {
    return {
      title: "",
      url: ""
    };
  }
}

async function appendAutofillLog(entry) {
  const { autofillLogs } = await chrome.storage.local.get("autofillLogs");
  const logs = Array.isArray(autofillLogs) ? autofillLogs : [];
  logs.unshift(entry);
  await chrome.storage.local.set({
    autofillLogs: logs.slice(0, 30)
  });
}

function summarizeFields(fields) {
  return fields.map((field) => ({
    fieldId: field.fieldId,
    kind: field.kind,
    label: field.label,
    placeholder: field.placeholder,
    name: field.name,
    id: field.id,
    autocomplete: field.autocomplete,
    nearbyText: truncate(field.nearbyText, 180),
    sectionText: truncate(field.sectionText, 180),
    tableContext: truncate(field.tableContext, 180),
    options: Array.isArray(field.options)
      ? field.options.slice(0, 40).map((option) => ({
          value: truncate(option.value, 80),
          label: truncate(option.label, 80),
          selected: Boolean(option.selected),
          disabled: Boolean(option.disabled)
        }))
      : null
  }));
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
