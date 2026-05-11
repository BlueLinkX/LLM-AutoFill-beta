import { DEFAULT_PROFILE, DEFAULT_SETTINGS, getLocalDefaultProfile } from "./defaults.js";

const fields = [
  "apiKey",
  "model",
  "reasoningEffort",
  "includeScreenshot",
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

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("settingsForm").addEventListener("submit", save);
  document.getElementById("loadDefaultProfile").addEventListener("click", loadDefaultProfile);

  const { apiKey, profile, settings } = await chrome.storage.local.get([
    "apiKey",
    "profile",
    "settings"
  ]);
  const mergedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  setValue("apiKey", apiKey || "");
  setValue("model", mergedSettings.model);
  setValue("reasoningEffort", mergedSettings.reasoningEffort);
  setValue("includeScreenshot", mergedSettings.includeScreenshot);

  const visibleProfile = hasProfileContent(profile || {}) ? profile : await getLocalDefaultProfile();
  for (const key of fields) {
    if (["apiKey", "model", "reasoningEffort", "includeScreenshot"].includes(key)) {
      continue;
    }
    setValue(key, visibleProfile?.[key] || "");
  }
}

async function save(event) {
  event.preventDefault();

  const profile = {};
  for (const key of fields) {
    if (["apiKey", "model", "reasoningEffort", "includeScreenshot"].includes(key)) {
      continue;
    }
    profile[key] = getValue(key);
  }

  await chrome.storage.local.set({
    apiKey: getValue("apiKey"),
    settings: {
      model: getValue("model") || DEFAULT_SETTINGS.model,
      reasoningEffort: getValue("reasoningEffort") || DEFAULT_SETTINGS.reasoningEffort,
      includeScreenshot: getValue("includeScreenshot")
    },
    profile
  });

  const saveState = document.getElementById("saveState");
  saveState.textContent = "已保存";
  setTimeout(() => {
    saveState.textContent = "";
  }, 1800);
}

async function loadDefaultProfile() {
  const profile = await getLocalDefaultProfile();
  for (const [key, value] of Object.entries(profile)) {
    setValue(key, value);
  }
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
