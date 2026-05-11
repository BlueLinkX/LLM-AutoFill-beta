import {
  DEFAULT_SETTINGS,
  getDefaultModelForProvider,
  getLocalDefaultProfile,
  normalizeApiKeys,
  normalizeSettings
} from "./defaults.js";
import { setDocumentLanguage, t } from "./i18n.js";

const profileFields = [
  "fullName",
  "fullNameEnglish",
  "fullNameChinese",
  "fullNameHiragana",
  "fullNameKatakana",
  "birthDate",
  "gender",
  "nationality",
  "residence",
  "email",
  "personalEmail",
  "schoolEmail",
  "phone",
  "city",
  "country",
  "postalCode",
  "address",
  "targetRole",
  "availability",
  "preferredLocation",
  "workAuthorization",
  "education",
  "workExperience",
  "skills",
  "resumeText"
];

const keyFields = {
  openai: "apiKeyOpenAI",
  openrouter: "apiKeyOpenRouter",
  gemini: "apiKeyGemini",
  anthropic: "apiKeyAnthropic"
};

let currentSettings = normalizeSettings();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("settingsForm").addEventListener("submit", save);
  document.getElementById("loadDefaultProfile").addEventListener("click", loadDefaultProfile);
  document.getElementById("provider").addEventListener("change", handleProviderChange);
  document.getElementById("uiLanguage").addEventListener("change", handleLanguageChange);

  const { apiKey, apiKeys, profile, settings } = await chrome.storage.local.get([
    "apiKey",
    "apiKeys",
    "profile",
    "settings"
  ]);

  currentSettings = normalizeSettings(settings);
  const normalizedApiKeys = normalizeApiKeys(apiKeys, apiKey);
  const visibleProfile = hasProfileContent(profile || {}) ? profile : await getLocalDefaultProfile();

  setValue("provider", currentSettings.provider);
  setValue("model", currentSettings.model);
  setValue("reasoningEffort", currentSettings.reasoningEffort);
  setValue("uiLanguage", currentSettings.uiLanguage);
  setValue("includeScreenshot", currentSettings.includeScreenshot);

  setValue(keyFields.openai, normalizedApiKeys.openai);
  setValue(keyFields.openrouter, normalizedApiKeys.openrouter);
  setValue(keyFields.gemini, normalizedApiKeys.gemini);
  setValue(keyFields.anthropic, normalizedApiKeys.anthropic);

  for (const key of profileFields) {
    setValue(key, visibleProfile?.[key] || "");
  }

  applyStaticText();
  updateModelHint();
}

async function save(event) {
  event.preventDefault();

  const settings = normalizeSettings({
    provider: getValue("provider"),
    model: getValue("model"),
    reasoningEffort: getValue("reasoningEffort"),
    uiLanguage: getValue("uiLanguage"),
    includeScreenshot: getValue("includeScreenshot")
  });

  const apiKeys = normalizeApiKeys({
    openai: getValue(keyFields.openai),
    openrouter: getValue(keyFields.openrouter),
    gemini: getValue(keyFields.gemini),
    anthropic: getValue(keyFields.anthropic)
  });

  const profile = {};
  for (const key of profileFields) {
    profile[key] = getValue(key);
  }

  await chrome.storage.local.set({
    apiKey: apiKeys.openai || "",
    apiKeys,
    settings,
    profile
  });

  currentSettings = settings;
  applyStaticText();
  updateModelHint();

  const saveState = document.getElementById("saveState");
  saveState.textContent = t(currentSettings.uiLanguage, "saved");
  setTimeout(() => {
    saveState.textContent = "";
  }, 1800);
}

async function loadDefaultProfile() {
  const profile = await getLocalDefaultProfile();
  for (const [key, value] of Object.entries(profile)) {
    if (profileFields.includes(key)) {
      setValue(key, value);
    }
  }
}

function handleProviderChange() {
  const provider = getValue("provider");
  const model = getValue("model");
  const previousDefault = getDefaultModelForProvider(currentSettings.provider);
  if (!model || model === previousDefault) {
    setValue("model", getDefaultModelForProvider(provider));
  }
  currentSettings = {
    ...currentSettings,
    provider
  };
  updateModelHint();
}

function handleLanguageChange() {
  currentSettings = {
    ...currentSettings,
    uiLanguage: getValue("uiLanguage") || DEFAULT_SETTINGS.uiLanguage
  };
  applyStaticText();
  updateModelHint();
}

function applyStaticText() {
  const lang = currentSettings.uiLanguage;
  setDocumentLanguage(lang);
  document.title = t(lang, "profileTitle");
  document.getElementById("pageTitle").textContent = t(lang, "profileTitle");
  document.getElementById("pageDescription").textContent = t(lang, "profileDescription");
  document.getElementById("providerApiTitle").textContent = t(lang, "providerAndApi");
  document.getElementById("providerLabel").textContent = t(lang, "provider");
  document.getElementById("modelLabel").textContent = t(lang, "model");
  document.getElementById("reasoningLabel").textContent = t(lang, "reasoningEffort");
  document.getElementById("uiLanguageLabel").textContent = t(lang, "uiLanguage");
  document.getElementById("providerHelp").textContent = t(lang, "providerHelp");
  document.getElementById("includeScreenshotLabel").textContent = t(lang, "includeScreenshot");
  document.getElementById("apiKeysTitle").textContent = t(lang, "apiKeys");
  document.getElementById("openaiKeyLabel").textContent = t(lang, "openaiKey");
  document.getElementById("openrouterKeyLabel").textContent = t(lang, "openrouterKey");
  document.getElementById("geminiKeyLabel").textContent = t(lang, "geminiKey");
  document.getElementById("anthropicKeyLabel").textContent = t(lang, "anthropicKey");
  document.getElementById("personalInfoTitle").textContent = t(lang, "personalInfo");
  document.getElementById("jobInfoTitle").textContent = t(lang, "jobInfo");
  document.getElementById("fullNameEnglishLabel").textContent = t(lang, "fullNameEnglish");
  document.getElementById("fullNameChineseLabel").textContent = t(lang, "fullNameChinese");
  document.getElementById("fullNameHiraganaLabel").textContent = t(lang, "fullNameHiragana");
  document.getElementById("fullNameKatakanaLabel").textContent = t(lang, "fullNameKatakana");
  document.getElementById("fullNameLabel").textContent = t(lang, "fullName");
  document.getElementById("birthDateLabel").textContent = t(lang, "birthDate");
  document.getElementById("genderLabel").textContent = t(lang, "gender");
  document.getElementById("nationalityLabel").textContent = t(lang, "nationality");
  document.getElementById("residenceLabel").textContent = t(lang, "residence");
  document.getElementById("emailLabel").textContent = t(lang, "email");
  document.getElementById("personalEmailLabel").textContent = t(lang, "personalEmail");
  document.getElementById("schoolEmailLabel").textContent = t(lang, "schoolEmail");
  document.getElementById("phoneLabel").textContent = t(lang, "phone");
  document.getElementById("cityLabel").textContent = t(lang, "city");
  document.getElementById("countryLabel").textContent = t(lang, "country");
  document.getElementById("postalCodeLabel").textContent = t(lang, "postalCode");
  document.getElementById("addressLabel").textContent = t(lang, "address");
  document.getElementById("targetRoleLabel").textContent = t(lang, "targetRole");
  document.getElementById("availabilityLabel").textContent = t(lang, "availability");
  document.getElementById("preferredLocationLabel").textContent = t(lang, "preferredLocation");
  document.getElementById("workAuthorizationLabel").textContent = t(lang, "workAuthorization");
  document.getElementById("educationLabel").textContent = t(lang, "education");
  document.getElementById("workExperienceLabel").textContent = t(lang, "workExperience");
  document.getElementById("skillsLabel").textContent = t(lang, "skills");
  document.getElementById("resumeTextLabel").textContent = t(lang, "resumeText");
  document.getElementById("loadDefaultProfile").textContent = t(lang, "loadPrivateProfile");
  document.querySelector("button[type='submit']").textContent = t(lang, "save");
  document.querySelector("#provider option[value='openai']").textContent = t(lang, "providerOpenAI");
  document.querySelector("#provider option[value='openrouter']").textContent = t(lang, "providerOpenRouter");
  document.querySelector("#provider option[value='gemini']").textContent = t(lang, "providerGemini");
  document.querySelector("#provider option[value='anthropic']").textContent = t(lang, "providerAnthropic");
  document.querySelector("#uiLanguage option[value='zh-CN']").textContent = t(lang, "languageChinese");
  document.querySelector("#uiLanguage option[value='en']").textContent = t(lang, "languageEnglish");
  document.querySelector("#uiLanguage option[value='ja']").textContent = t(lang, "languageJapanese");
}

function updateModelHint() {
  const lang = currentSettings.uiLanguage;
  const provider = getValue("provider") || currentSettings.provider;
  const hintKey = {
    openai: "modelOptionHintOpenAI",
    openrouter: "modelOptionHintOpenRouter",
    gemini: "modelOptionHintGemini",
    anthropic: "modelOptionHintAnthropic"
  }[provider];

  document.getElementById("modelHint").textContent = `${t(lang, "providerModelHint")} ${t(lang, hintKey)}`;
  document.getElementById("model").placeholder = t(lang, hintKey);
}

function hasProfileContent(profile) {
  return Object.values(profile).some((value) => {
    if (value == null) {
      return false;
    }
    return String(value).trim().length > 0;
  });
}

function getValue(id) {
  const element = document.getElementById(id);
  if (element.type === "checkbox") {
    return element.checked;
  }
  return element.value.trim();
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else {
    element.value = value || "";
  }
}
