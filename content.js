(() => {
  if (window.__llmSmartAutofillLoaded) {
    return;
  }
  window.__llmSmartAutofillLoaded = true;

  const state = {
    fields: [],
    refs: new Map(),
    overlayNodes: []
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message.type === "GET_FORM_FIELDS") {
        const fields = collectFields();
        sendResponse({ ok: true, fields });
        return false;
      }
      if (message.type === "SHOW_FIELD_OVERLAY") {
        const fields = collectFields();
        showOverlay(fields);
        sendResponse({ ok: true, count: fields.length });
        return false;
      }
      if (message.type === "HIDE_FIELD_OVERLAY") {
        hideOverlay();
        sendResponse({ ok: true });
        return false;
      }
      if (message.type === "FILL_FORM_FIELDS") {
        fillFields(message.actions || [])
          .then((result) => sendResponse({ ok: true, result }))
          .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
        return true;
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
      return false;
    }
    return false;
  });

  function collectFields() {
    hideOverlay();
    state.refs.clear();

    const elements = Array.from(
      document.querySelectorAll(
        [
          "input",
          "select",
          "textarea",
          "[contenteditable='true']",
          "[role='textbox']",
          "[role='combobox']"
        ].join(",")
      )
    ).filter(isFillableElement);

    const fields = [];
    const radioGroups = new Map();

    for (const element of elements) {
      const inputType = getInputType(element);
      if (inputType === "radio") {
        const key = getRadioGroupKey(element);
        if (!radioGroups.has(key)) {
          radioGroups.set(key, []);
        }
        radioGroups.get(key).push(element);
        continue;
      }

      const fieldId = `f_${fields.length + 1}`;
      const descriptor = buildFieldDescriptor(fieldId, element, inputType);
      state.refs.set(fieldId, { kind: inputType, element, field: descriptor });
      fields.push(descriptor);
    }

    for (const group of radioGroups.values()) {
      const fieldId = `f_${fields.length + 1}`;
      state.refs.set(fieldId, { kind: "radio", elements: group });
      fields.push(buildRadioDescriptor(fieldId, group));
    }

    state.fields = fields;
    return fields;
  }

  async function fillFields(actions) {
    if (!state.refs.size) {
      collectFields();
    }

    const results = [];
    for (const action of actions) {
      const ref = state.refs.get(action.fieldId);
      if (!ref) {
        results.push({
          fieldId: action.fieldId,
          filled: false,
          message: "fieldId not found on current page"
        });
        continue;
      }

      try {
        await applyValue(ref, action.value);
        results.push({ fieldId: action.fieldId, filled: true });
      } catch (error) {
        results.push({
          fieldId: action.fieldId,
          filled: false,
          message: error.message || String(error)
        });
      }
    }

    return results;
  }

  async function applyValue(ref, rawValue) {
    const value = rawValue == null ? "" : String(rawValue);

    if (ref.kind === "checkbox") {
      setChecked(ref.element, parseBoolean(value));
      return;
    }

    if (ref.kind === "radio") {
      const target = findBestRadio(ref.elements, value);
      if (!target) {
        throw new Error(`No matching radio option for "${value}"`);
      }
      target.focus();
      target.click();
      setChecked(target, true);
      return;
    }

    if (ref.kind === "select") {
      setSelectValue(ref.element, value, ref.field);
      return;
    }

    if (ref.kind === "combobox") {
      await setComboboxValue(ref.element, value, ref.field);
      return;
    }

    if (isContentEditable(ref.element)) {
      ref.element.focus();
      ref.element.textContent = value;
      dispatchEditEvents(ref.element);
      return;
    }

    ref.element.focus();
    setNativeValue(ref.element, value);
    dispatchEditEvents(ref.element);
  }

  function setSelectValue(select, value, field) {
    const option = findBestOption(Array.from(select.options), value, field);

    if (option) {
      select.value = option.value;
    } else {
      select.value = value;
    }

    dispatchEditEvents(select);
  }

  async function setComboboxValue(element, value, field) {
    const input = element.matches("input, textarea") ? element : element.querySelector("input, textarea");
    element.focus();
    element.click();
    await sleep(180);

    const option = findBestVisibleOption(value, field);
    if (option) {
      option.click();
      dispatchEditEvents(element);
      return;
    }

    if (input) {
      setNativeValue(input, value);
      dispatchEditEvents(input);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } else if (isContentEditable(element)) {
      element.textContent = value;
      dispatchEditEvents(element);
    } else {
      element.setAttribute("data-autofill-value", value);
      dispatchEditEvents(element);
    }
  }

  function setChecked(element, checked) {
    element.focus();
    element.checked = checked;
    dispatchEditEvents(element);
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchEditEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function buildFieldDescriptor(fieldId, element, kind) {
    const rect = element.getBoundingClientRect();
    return {
      fieldId,
      kind,
      tag: element.tagName.toLowerCase(),
      htmlType: getInputType(element),
      label: getLabelText(element),
      placeholder: getAttribute(element, "placeholder"),
      name: getAttribute(element, "name"),
      id: getAttribute(element, "id"),
      ariaLabel: getAttribute(element, "aria-label"),
      autocomplete: getAttribute(element, "autocomplete"),
      nearbyText: getNearbyText(element),
      sectionText: getSectionText(element),
      tableContext: getTableContext(element),
      ancestorText: getAncestorText(element),
      options: kind === "select" ? getSelectOptions(element) : getComboboxOptions(element),
      currentValue: getCurrentValue(element, kind),
      required: Boolean(element.required || element.getAttribute("aria-required") === "true"),
      rect: rectToObject(rect)
    };
  }

  function buildRadioDescriptor(fieldId, elements) {
    const first = elements[0];
    const rect = first.getBoundingClientRect();
    return {
      fieldId,
      kind: "radio",
      tag: "input",
      htmlType: "radio",
      label: getRadioGroupLabel(elements),
      placeholder: "",
      name: getAttribute(first, "name"),
      id: getAttribute(first, "id"),
      ariaLabel: getAttribute(first, "aria-label"),
      autocomplete: getAttribute(first, "autocomplete"),
      nearbyText: getNearbyText(first),
      sectionText: getSectionText(first),
      tableContext: getTableContext(first),
      ancestorText: getAncestorText(first),
      options: elements.map((element) => ({
        value: element.value || getLabelText(element),
        label: getLabelText(element),
        checked: Boolean(element.checked)
      })),
      currentValue: elements.find((element) => element.checked)?.value || "",
      required: elements.some((element) => element.required),
      rect: rectToObject(rect)
    };
  }

  function isFillableElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (!isVisible(element)) {
      return false;
    }
    if (element.disabled || element.readOnly) {
      return false;
    }

    const type = getInputType(element);
    const blockedTypes = new Set([
      "hidden",
      "password",
      "file",
      "submit",
      "button",
      "reset",
      "image",
      "range",
      "color"
    ]);

    if (blockedTypes.has(type)) {
      return false;
    }

    const text = [
      getLabelText(element),
      getAttribute(element, "name"),
      getAttribute(element, "id"),
      getAttribute(element, "autocomplete"),
      getNearbyText(element)
    ].join(" ");

    if (/(password|passcode|otp|one.?time|verification|captcha|cvv|cvc|security code)/i.test(text)) {
      return false;
    }

    return true;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) !== 0
    );
  }

  function getInputType(element) {
    if (element.tagName === "SELECT") {
      return "select";
    }
    if (element.tagName === "TEXTAREA") {
      return "textarea";
    }
    if (element.getAttribute("role") === "combobox") {
      return "combobox";
    }
    if (isContentEditable(element)) {
      return "contenteditable";
    }
    if (element instanceof HTMLInputElement) {
      return (element.type || "text").toLowerCase();
    }
    return element.getAttribute("role") || "text";
  }

  function getLabelText(element) {
    const parts = [];
    if ("labels" in element && element.labels) {
      for (const label of element.labels) {
        parts.push(label.textContent);
      }
    }

    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      for (const id of ariaLabelledBy.split(/\s+/)) {
        const label = document.getElementById(id);
        if (label) {
          parts.push(label.textContent);
        }
      }
    }

    const id = element.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label) {
        parts.push(label.textContent);
      }
    }

    parts.push(element.getAttribute("aria-label"));
    parts.push(findLegendText(element));
    parts.push(findNearbyExplicitLabel(element));

    return cleanText(parts.filter(Boolean).join(" "));
  }

  function getRadioGroupLabel(elements) {
    const common = findLegendText(elements[0]);
    if (common) {
      return common;
    }
    return cleanText(elements.map(getLabelText).join(" / "));
  }

  function findLegendText(element) {
    const fieldset = element.closest("fieldset");
    const legend = fieldset?.querySelector("legend");
    return cleanText(legend?.textContent || "");
  }

  function findNearbyExplicitLabel(element) {
    let cursor = element.previousElementSibling;
    for (let i = 0; i < 3 && cursor; i += 1) {
      const text = cleanText(cursor.textContent || "");
      if (text && text.length < 120) {
        return text;
      }
      cursor = cursor.previousElementSibling;
    }
    return "";
  }

  function getNearbyText(element) {
    const container =
      element.closest("label, .form-group, .field, .input-group, .form-item, .ant-form-item, .MuiFormControl-root") ||
      element.parentElement;
    if (!container) {
      return "";
    }

    const clone = container.cloneNode(true);
    for (const item of clone.querySelectorAll("input, select, textarea, button, script, style")) {
      item.remove();
    }
    return cleanText(clone.textContent || "").slice(0, 260);
  }

  function getSectionText(element) {
    const section = element.closest(
      "section, article, fieldset, form, .section, .panel, .card, .group, .ant-card, .MuiPaper-root"
    );
    if (!section) {
      return "";
    }

    const heading = section.querySelector("h1, h2, h3, h4, h5, h6, legend, [role='heading']");
    const headingText = cleanText(heading?.textContent || "");
    const sectionText = getTextWithoutControls(section).slice(0, 420);
    return cleanText([headingText, sectionText].filter(Boolean).join(" | "));
  }

  function getTableContext(element) {
    const cell = element.closest("td, th");
    const row = element.closest("tr");
    if (!cell || !row) {
      return "";
    }

    const cells = Array.from(row.children);
    const index = cells.indexOf(cell);
    const rowText = cleanText(cells.map(getTextWithoutControls).join(" | "));
    const table = element.closest("table");
    const headerRow = table?.querySelector("thead tr") || table?.querySelector("tr");
    const headers = headerRow ? Array.from(headerRow.children).map(getTextWithoutControls) : [];
    const headerText = headers[index] || "";

    return cleanText([headerText && `column: ${headerText}`, rowText && `row: ${rowText}`].filter(Boolean).join("; ")).slice(0, 420);
  }

  function getAncestorText(element) {
    const parts = [];
    let cursor = element.parentElement;
    for (let depth = 0; depth < 4 && cursor && cursor !== document.body; depth += 1) {
      const text = getTextWithoutControls(cursor);
      if (text && text.length <= 220) {
        parts.push(text);
      }
      cursor = cursor.parentElement;
    }
    return cleanText(parts.join(" | ")).slice(0, 420);
  }

  function getTextWithoutControls(element) {
    if (!element) {
      return "";
    }
    const clone = element.cloneNode(true);
    for (const item of clone.querySelectorAll("input, select, textarea, button, script, style, option")) {
      item.remove();
    }
    return cleanText(clone.textContent || "");
  }

  function getSelectOptions(select) {
    return Array.from(select.options).map((option, index) => ({
      index,
      value: option.value,
      label: cleanText(option.textContent || ""),
      selected: Boolean(option.selected),
      disabled: Boolean(option.disabled)
    }));
  }

  function getComboboxOptions(element) {
    if (getInputType(element) !== "combobox") {
      return null;
    }

    const ids = [
      element.getAttribute("aria-controls"),
      element.getAttribute("aria-owns")
    ].filter(Boolean);
    const containers = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const localOptions = containers.flatMap((container) => Array.from(container.querySelectorAll("[role='option']")));
    const options = localOptions.length ? localOptions : Array.from(document.querySelectorAll("[role='option']")).filter(isVisible);

    return options.slice(0, 80).map((option, index) => ({
      index,
      value: option.getAttribute("data-value") || cleanText(option.textContent || ""),
      label: cleanText(option.textContent || ""),
      selected: option.getAttribute("aria-selected") === "true",
      disabled: option.getAttribute("aria-disabled") === "true"
    }));
  }

  function getCurrentValue(element, kind) {
    if (kind === "checkbox") {
      return element.checked ? "true" : "false";
    }
    if (kind === "select") {
      return element.value || "";
    }
    if (isContentEditable(element)) {
      return cleanText(element.textContent || "");
    }
    return element.value || "";
  }

  function getRadioGroupKey(element) {
    const formKey = element.form ? Array.from(document.forms).indexOf(element.form) : "document";
    return `${formKey}:${element.name || element.id || element.value || getLabelText(element)}`;
  }

  function findBestRadio(elements, value) {
    const wanted = normalizeText(value);
    const wantedCompact = compactText(value);
    return elements.find((element) => {
      const candidates = [element.value, getLabelText(element)];
      return candidates.some((candidate) => {
        const normalized = normalizeText(candidate);
        const compact = compactText(candidate);
        return normalized === wanted || compact === wantedCompact || compact.includes(wantedCompact) || wantedCompact.includes(compact);
      });
    });
  }

  function findBestOption(options, value, field) {
    const candidates = buildWantedCandidates(value, field);
    const usableOptions = options.filter((option) => !option.disabled);

    for (const wanted of candidates) {
      const exact = usableOptions.find((option) => optionMatches(option, wanted, "exact"));
      if (exact) {
        return exact;
      }
    }

    for (const wanted of candidates) {
      const fuzzy = usableOptions.find((option) => optionMatches(option, wanted, "fuzzy"));
      if (fuzzy) {
        return fuzzy;
      }
    }

    return null;
  }

  function findBestVisibleOption(value, field) {
    const options = Array.from(document.querySelectorAll("[role='option'], option, li, [data-value]")).filter(isVisible);
    const wrapped = options.map((element) => ({
      value: element.getAttribute("data-value") || element.getAttribute("value") || cleanText(element.textContent || ""),
      textContent: element.textContent || "",
      element
    }));
    return findBestOption(wrapped, value, field)?.element || null;
  }

  function optionMatches(option, wanted, mode) {
    if (!wanted) {
      return false;
    }

    const optionValues = [
      option.value,
      option.label,
      option.textContent,
      option.innerText
    ].filter(Boolean);
    const wantedNormalized = normalizeText(wanted);
    const wantedCompact = compactText(wanted);

    return optionValues.some((candidate) => {
      const normalized = normalizeText(candidate);
      const compact = compactText(candidate);
      if (mode === "exact") {
        return normalized === wantedNormalized || compact === wantedCompact;
      }
      if (wantedCompact.length <= 1 || compact.length <= 1) {
        return false;
      }
      return compact.includes(wantedCompact) || wantedCompact.includes(compact);
    });
  }

  function buildWantedCandidates(value, field) {
    const base = cleanText(value);
    const context = normalizeText(
      [
        field?.label,
        field?.placeholder,
        field?.name,
        field?.id,
        field?.ariaLabel,
        field?.nearbyText,
        field?.sectionText,
        field?.tableContext
      ].filter(Boolean).join(" ")
    );
    const candidates = [base];
    const parts = extractDateParts(base);

    if (parts.year && /(year|yyyy|年|入学|卒業|毕业|expected|予定)/i.test(context)) {
      candidates.push(parts.year, `${parts.year}年`);
    }
    if (parts.month && /(month|mm|月)/i.test(context)) {
      candidates.push(parts.month, String(Number(parts.month)), `${Number(parts.month)}月`, `${parts.month}月`);
    }
    if (parts.day && /(day|dd|日)/i.test(context)) {
      candidates.push(parts.day, String(Number(parts.day)), `${Number(parts.day)}日`, `${parts.day}日`);
    }

    if (/中国|china|chinese/i.test(base)) {
      candidates.push("China", "中国", "Chinese", "中華人民共和国");
    }
    if (/日本|japan|japanese/i.test(base)) {
      candidates.push("Japan", "日本", "Japanese");
    }
    if (/男|male|男性/i.test(base)) {
      candidates.push("Male", "男", "男性");
    }

    return [...new Set(candidates.filter(Boolean))];
  }

  function extractDateParts(value) {
    const text = cleanText(value);
    const japanese = text.match(/(\d{4})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?/);
    if (japanese) {
      return {
        year: japanese[1],
        month: japanese[2] || "",
        day: japanese[3] || ""
      };
    }

    const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      return {
        year: iso[1],
        month: iso[2],
        day: iso[3]
      };
    }

    return {
      year: "",
      month: "",
      day: ""
    };
  }

  function parseBoolean(value) {
    return /^(true|yes|y|1|on|checked|是|有|同意)$/i.test(String(value).trim());
  }

  function showOverlay(fields) {
    hideOverlay();
    for (const field of fields) {
      const marker = document.createElement("div");
      marker.textContent = field.fieldId;
      marker.style.cssText = [
        "position:fixed",
        `left:${Math.max(4, field.rect.left)}px`,
        `top:${Math.max(4, field.rect.top - 22)}px`,
        "z-index:2147483647",
        "background:#111827",
        "color:#fff",
        "font:12px/1.2 Arial,sans-serif",
        "padding:3px 6px",
        "border-radius:4px",
        "box-shadow:0 2px 8px rgba(0,0,0,.25)",
        "pointer-events:none"
      ].join(";");

      const outline = document.createElement("div");
      outline.style.cssText = [
        "position:fixed",
        `left:${field.rect.left}px`,
        `top:${field.rect.top}px`,
        `width:${field.rect.width}px`,
        `height:${field.rect.height}px`,
        "z-index:2147483646",
        "border:2px solid #2563eb",
        "border-radius:4px",
        "background:rgba(37,99,235,.08)",
        "pointer-events:none"
      ].join(";");

      document.documentElement.append(outline, marker);
      state.overlayNodes.push(outline, marker);
    }
  }

  function hideOverlay() {
    for (const node of state.overlayNodes) {
      node.remove();
    }
    state.overlayNodes = [];
  }

  function rectToObject(rect) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function getAttribute(element, name) {
    return cleanText(element.getAttribute(name) || "");
  }

  function cleanText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(text) {
    return cleanText(text).toLowerCase();
  }

  function compactText(text) {
    return normalizeText(text)
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function isContentEditable(element) {
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
