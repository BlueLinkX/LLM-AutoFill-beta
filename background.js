import {
  DEFAULT_SETTINGS,
  getLocalDefaultProfile,
  normalizeApiKeys,
  normalizeSettings
} from "./defaults.js";
import { t } from "./i18n.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_LOG_ENTRIES = 30;

const AUTOFILL_SCHEMA = {
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
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "GENERATE_FILL_PLAN") {
    return false;
  }

  generateFillPlan(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function generateFillPlan({ tabId, fields }) {
  const { apiKey, apiKeys, profile, settings } = await chrome.storage.local.get([
    "apiKey",
    "apiKeys",
    "profile",
    "settings"
  ]);
  const mergedSettings = normalizeSettings(settings);
  const normalizedApiKeys = normalizeApiKeys(apiKeys, apiKey);
  const uiLanguage = mergedSettings.uiLanguage || DEFAULT_SETTINGS.uiLanguage;

  if (!tabId) {
    throw new Error(t(uiLanguage, "missingTabId"));
  }

  const selectedApiKey = normalizedApiKeys[mergedSettings.provider];
  if (!selectedApiKey) {
    throw new Error(t(uiLanguage, "providerRequiredKey"));
  }

  const activeProfile = hasProfileContent(profile || {}) ? profile : await getLocalDefaultProfile();
  if (!hasProfileContent(activeProfile)) {
    throw new Error(t(uiLanguage, "saveProfileFirst"));
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error(t(uiLanguage, "noFieldsFound"));
  }

  let screenshot = null;
  if (mergedSettings.includeScreenshot) {
    screenshot = await captureAnnotatedScreenshot(tabId);
  }

  const apiResult = await callProvider({
    provider: mergedSettings.provider,
    apiKey: selectedApiKey,
    model: mergedSettings.model,
    reasoningEffort: mergedSettings.reasoningEffort,
    profile: activeProfile,
    fields,
    screenshot,
    uiLanguage
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

  const notes = Array.isArray(rawPlan.notes) ? rawPlan.notes.map(String) : [];
  const logEntry = {
    timestamp: new Date().toISOString(),
    tab: await getTabSummary(tabId),
    provider: mergedSettings.provider,
    model: mergedSettings.model,
    reasoningEffort: mergedSettings.reasoningEffort,
    screenshotUsed: Boolean(screenshot),
    fieldCount: fields.length,
    actionCount: actions.length,
    usage: apiResult.usage || null,
    responseId: apiResult.responseId || "",
    fields: summarizeFields(fields),
    plan: {
      actions,
      notes
    }
  };

  const result = {
    plan: {
      actions,
      notes
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

async function callProvider({
  provider,
  apiKey,
  model,
  reasoningEffort,
  profile,
  fields,
  screenshot,
  uiLanguage
}) {
  const userPayload = {
    task: "Map the user's saved profile and resume information to the web form fields.",
    localeHint: uiLanguage,
    profile,
    fields
  };

  switch (provider) {
    case "openrouter":
      return callOpenRouter({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage });
    case "gemini":
      return callGemini({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage });
    case "anthropic":
      return callAnthropic({ apiKey, model, userPayload, screenshot, uiLanguage });
    case "openai":
    default:
      return callOpenAI({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage });
  }
}

async function callOpenAI({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage }) {
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
        content: [{ type: "input_text", text: buildSystemPrompt() }]
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
        schema: AUTOFILL_SCHEMA
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
    throw buildProviderError("OpenAI", uiLanguage, response, data);
  }

  return {
    parsed: parseOpenAIResponse(data, "OpenAI", uiLanguage),
    usage: data?.usage || null,
    responseId: data?.id || ""
  };
}

async function callOpenRouter({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage }) {
  const userContent = [
    {
      type: "text",
      text: JSON.stringify(userPayload)
    }
  ];

  if (screenshot) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: screenshot
      }
    });
  }

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: userContent
      }
    ],
    reasoning: {
      effort: reasoningEffort
    },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "autofill_plan",
        strict: true,
        schema: AUTOFILL_SCHEMA
      }
    },
    plugins: [{ id: "response-healing" }]
  };

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/BlueLinkX/LLM-AutoFill",
      "X-Title": "LLM Smart Autofill"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw buildProviderError("OpenRouter", uiLanguage, response, data);
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return {
    parsed: parseJsonText(text, "OpenRouter", uiLanguage),
    usage: data?.usage || null,
    responseId: data?.id || ""
  };
}

async function callGemini({ apiKey, model, reasoningEffort, userPayload, screenshot, uiLanguage }) {
  const parts = [
    {
      text: JSON.stringify(userPayload)
    }
  ];

  if (screenshot) {
    const image = parseDataUrl(screenshot);
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }]
    },
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: AUTOFILL_SCHEMA,
      thinkingConfig: {
        thinkingBudget: mapGeminiThinkingBudget(reasoningEffort)
      }
    }
  };

  const response = await fetch(
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw buildProviderError("Gemini", uiLanguage, response, data);
  }

  const text = extractGeminiText(data);
  return {
    parsed: parseJsonText(text, "Gemini", uiLanguage),
    usage: {
      input_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: data?.usageMetadata?.totalTokenCount ?? 0
    },
    responseId: data?.responseId || ""
  };
}

async function callAnthropic({ apiKey, model, userPayload, screenshot, uiLanguage }) {
  const content = [
    {
      type: "text",
      text: JSON.stringify(userPayload)
    }
  ];

  if (screenshot) {
    const image = parseDataUrl(screenshot);
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mimeType,
        data: image.data
      }
    });
  }

  const body = {
    model,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content
      }
    ]
  };

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw buildProviderError("Claude", uiLanguage, response, data);
  }

  const text = (data?.content || [])
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("");

  return {
    parsed: parseJsonText(text, "Claude", uiLanguage),
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
    "For Japanese date dropdowns, use formats such as 1996, 10, 22, 2027 when the option list contains numbers, and match visible options that include 年, 月, or 日.",
    "For checkboxes, use value \"true\" or \"false\".",
    "Do not invent unavailable facts such as salary, ID number, visa status, or dates.",
    "Never fill passwords, verification codes, payment CVV, one-time codes, or submit buttons.",
    "Prefer the user's explicit profile fields over inferred resume text.",
    "The profile may include education in Chinese, Japanese, or English. Split education records into school, faculty or department, degree level, enrollment date, graduation date, and expected graduation date when fields ask for those parts.",
    "If a field's direct label is blank, use nearbyText, sectionText, tableContext, ancestorText, placeholder, name, id, and screenshot marker context before deciding it is unclear.",
    "For education fields, use the user's saved education records when the field context asks for undergraduate, master's, doctoral, school, department, enrollment, graduation, or expected graduation.",
    "Keep values concise and directly suitable for the form field.",
    "If a field asks for a cover-letter style answer, use the resume or profile facts and write a short professional answer."
  ].join("\n");
}

function parseOpenAIResponse(data, providerName, uiLanguage) {
  if (data?.output_text) {
    return JSON.parse(data.output_text);
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
    throw new Error(t(uiLanguage, "providerNoText", { provider: providerName }));
  }

  return JSON.parse(chunks.join(""));
}

function parseJsonText(text, providerName, uiLanguage) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    throw new Error(t(uiLanguage, "providerNoText", { provider: providerName }));
  }

  try {
    return JSON.parse(normalized);
  } catch (_error) {
    const extracted = extractJsonBlock(normalized);
    if (!extracted) {
      throw new Error(t(uiLanguage, "providerNoText", { provider: providerName }));
    }
    return JSON.parse(extracted);
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("");
}

function buildProviderError(providerName, uiLanguage, response, data) {
  const message =
    data?.error?.message ||
    data?.error?.details?.[0]?.message ||
    data?.message ||
    `${response.status} ${response.statusText}`;
  return new Error(t(uiLanguage, "providerRequestFailed", { provider: providerName, message }));
}

function extractJsonBlock(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return "";
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl || "");
  if (!match) {
    throw new Error("Unsupported image format for screenshot.");
  }
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function mapGeminiThinkingBudget(reasoningEffort) {
  switch (reasoningEffort) {
    case "xhigh":
      return 4096;
    case "high":
      return 2048;
    case "medium":
      return 512;
    case "low":
    default:
      return 0;
  }
}

async function captureAnnotatedScreenshot(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "SHOW_FIELD_OVERLAY" });
    await sleep(350);
    const tab = await chrome.tabs.get(tabId);
    return await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png"
    });
  } finally {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "HIDE_FIELD_OVERLAY" });
    } catch (_error) {
      // Ignore navigation races.
    }
  }
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
    autofillLogs: logs.slice(0, MAX_LOG_ENTRIES)
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
