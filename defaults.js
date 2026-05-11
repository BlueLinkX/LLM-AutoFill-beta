export const DEFAULT_SETTINGS = {
  model: "gpt-5.4",
  includeScreenshot: true,
  reasoningEffort: "low"
};

export const DEFAULT_PROFILE = {
  fullName: "Jane Example",
  fullNameEnglish: "JANE EXAMPLE",
  fullNameChinese: "",
  fullNameHiragana: "",
  fullNameKatakana: "",
  birthDate: "1998年1月1日",
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
    "Birth date: 1998年1月1日",
    "Residence: Tokyo, Japan",
    "Phone: 000-0000-0000",
    "Personal email: jane@example.com",
    "Postal code: 100-0001",
    "国家：Japan",
    "Address: 1-1 Example, Chiyoda-ku, Tokyo",
    "Bachelor: Example University, Computer Science, enrolled April 2017, graduated March 2021.",
    "Master: Example Graduate School, Computer Science, enrolled April 2022, graduated September 2023."
  ].join("\n")
};

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
