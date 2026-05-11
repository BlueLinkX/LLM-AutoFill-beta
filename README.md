# LLM Smart Autofill

LLM Smart Autofill is a Chrome Manifest V3 extension prototype that maps saved profile and resume data to web forms. It extracts field metadata from the active page, optionally captures an annotated screenshot, asks an OpenAI model for a structured fill plan, then lets the user review and apply the suggested values.

## Features

- Save an OpenAI API key, model settings, personal profile, and resume text in Chrome local extension storage.
- Detect common form controls: `input`, `select`, `textarea`, `contenteditable`, checkbox, radio, and basic custom combobox controls.
- Add temporary field markers before screenshot capture so vision-capable models can understand the page layout.
- Request strict JSON output for `fieldId -> value` fill plans.
- Preview, edit, select, and apply suggested values from the popup.
- Skip high-risk fields such as passwords, verification codes, file uploads, and CVV/security-code fields.
- Store recent local logs with page URL, model, token usage, field summaries, model notes, and generated actions.
- Improve dropdown matching with normalized text, value/label matching, date-part extraction, and basic custom-combobox selection.

## Privacy Notes

The public repository contains only sample profile data. Real personal data should be entered through the extension options page or stored locally in a git-ignored `profile.local.json` file.

Do not commit:

- OpenAI API keys
- Real names, addresses, phone numbers, emails, or resumes
- Exported logs that include page URLs or form details
- Packaged ZIP files intended for private distribution

## Local Private Profile

For local development, you can create `profile.local.json` in the project root. It is ignored by git. When Chrome storage does not already contain a saved profile, the extension will try to load this file before falling back to the public sample profile.

Example shape:

```json
{
  "fullName": "Jane Example",
  "email": "jane@example.com",
  "phone": "000-0000-0000",
  "country": "Japan",
  "address": "1-1 Example, Tokyo",
  "education": "Bachelor: Example University, Computer Science, graduated March 2021.",
  "resumeText": "Short resume text..."
}
```

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this project directory.
5. Open the extension options page.
6. Save your OpenAI API key and profile.

## Usage

1. Open a web page that contains a form.
2. Click the extension icon.
3. Click "Scan Fields".
4. Click "Generate Fill Plan".
5. Review, edit, and select suggested fields.
6. Click "Fill Selected Fields".
7. Manually verify the page before submitting the form.

## Logs and Token Usage

Click the log button in the popup to open the local log page. Logs are stored in Chrome local extension storage under `autofillLogs` and keep the latest 30 entries.

Each log can include:

- Page title and URL
- Model, reasoning effort, and screenshot usage
- OpenAI API `usage` values for input/output/total tokens
- Scanned field summaries
- Model-generated actions and notes

## Test Page

Open `demo-form.html` in a browser to test common shopping and job-application fields. For `file://` pages, Chrome may require enabling "Allow access to file URLs" in the extension details page.

## Files

- `manifest.json`: Chrome MV3 extension manifest.
- `popup.html` / `popup.js`: popup UI, field scanning, plan generation, preview, and fill actions.
- `profile.html` / `profile.js`: API key, model, and profile settings.
- `content.js`: form field extraction, screenshot markers, and fill execution.
- `background.js`: screenshot capture and OpenAI Responses API call.
- `defaults.js`: public sample defaults and local private-profile loader.
- `logs.html` / `logs.js`: local log viewer.
- `demo-form.html`: local test form.

## Default Model

The default model is `gpt-5.4`. You can change it in the options page to another model that supports the Responses API, image input, and structured JSON output.
