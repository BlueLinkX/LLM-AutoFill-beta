export const PROVIDERS = ["openai", "openrouter", "gemini", "anthropic"];
export const UI_LANGUAGES = ["zh-CN", "en", "ja"];

export const DEFAULT_PROVIDER_MODELS = {
  openai: "gpt-5.4",
  openrouter: "openai/gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-sonnet-4-20250514"
};

export const DEFAULT_SETTINGS = {
  provider: "openai",
  model: DEFAULT_PROVIDER_MODELS.openai,
  includeScreenshot: true,
  reasoningEffort: "low",
  uiLanguage: "zh-CN"
};

export const DEFAULT_PROFILE = {
  fullName: "Jane Example",
  fullNameEnglish: "JANE EXAMPLE",
  fullNameChinese: "",
  fullNameHiragana: "",
  fullNameKatakana: "",
  birthDate: "1998-01-01",
  gender: "",
  nationality: "",
  residence: "Tokyo, Japan",
  email: "jane@example.com",
  personalEmail: "jane@example.com",
  schoolEmail: "",
  phone: "000-0000-0000",
  city: "Tokyo",
  country: "Japan",
  postalCode: "100-0001",
  address: "1-1 Example, Chiyoda-ku, Tokyo",
  targetRole: "Software Engineer",
  availability: "Two weeks after offer acceptance",
  preferredLocation: "Tokyo or remote",
  workAuthorization: "",
  education: [
    "Bachelor: Example University, Computer Science, enrolled April 2017, graduated March 2021.",
    "Master: Example Graduate School, Computer Science, enrolled April 2022, graduated September 2023."
  ].join("\n"),
  workExperience: "Software Engineer at Example Inc. Built browser automation tools and API integrations.",
  skills: "JavaScript, TypeScript, Chrome Extensions, LLM API integration",
  resumeText: [
    "Name: Jane Example",
    "Birth date: 1998-01-01",
    "Residence: Tokyo, Japan",
    "Phone: 000-0000-0000",
    "Personal email: jane@example.com",
    "Postal code: 100-0001",
    "Country: Japan",
    "Address: 1-1 Example, Chiyoda-ku, Tokyo",
    "Bachelor: Example University, Computer Science, enrolled April 2017, graduated March 2021.",
    "Master: Example Graduate School, Computer Science, enrolled April 2022, graduated September 2023."
  ].join("\n")
};

export function getDefaultModelForProvider(provider) {
  return DEFAULT_PROVIDER_MODELS[provider] || DEFAULT_PROVIDER_MODELS.openai;
}

export function normalizeProvider(provider) {
  return PROVIDERS.includes(provider) ? provider : DEFAULT_SETTINGS.provider;
}

export function normalizeUiLanguage(language) {
  return UI_LANGUAGES.includes(language) ? language : DEFAULT_SETTINGS.uiLanguage;
}

export function normalizeSettings(settings = {}) {
  const provider = normalizeProvider(settings.provider);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    provider,
    model: settings.model || getDefaultModelForProvider(provider),
    uiLanguage: normalizeUiLanguage(settings.uiLanguage)
  };
}

export function normalizeApiKeys(apiKeys = {}, legacyApiKey = "") {
  const normalized = {
    openai: "",
    openrouter: "",
    gemini: "",
    anthropic: "",
    ...(apiKeys || {})
  };

  if (legacyApiKey && !normalized.openai) {
    normalized.openai = legacyApiKey;
  }

  return normalized;
}

export async function getLocalDefaultProfile() {
  try {
    const response = await fetch(chrome.runtime.getURL("profile.local.json"), {
      cache: "no-store"
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (_error) {
    // Missing local profile is expected in the public repository.
  }
  return DEFAULT_PROFILE;
}
