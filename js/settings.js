// Reader customisation: font, size, spacing, colours and the paragraph separator.
//
// Every setting is listed in SETTINGS. Most become a CSS custom property on the reader element
// (index.html uses them with var()); the rest call a function. Any element with
// data-setting="<key>" inside the settings container is bound to that setting automatically,
// so adding a control is: add an entry here + add an input with that data-setting.
// Values are saved to localStorage and restored on the next visit.
//
// Width-changing settings (font, size, spacing) need no extra call: display.js re-measures
// the text through its ResizeObserver and keeps the reading position.

import { setParagraphSeparator } from "./display.js";

const STORAGE_KEY = "lineature.settings";
const CUSTOM_FONT_PREFIX = "LineatureCustomFont"; // font-family names given to uploaded fonts

const SETTINGS = {
    fontFamily:         { default: "serif",   cssVar: "--reader-font-family" },
    fontSize:           { default: 32,        cssVar: "--reader-font-size", unit: "px", number: true },
    fontWeight:         { default: 400,       cssVar: "--reader-font-weight", number: true },
    letterSpacing:      { default: 0,         cssVar: "--reader-letter-spacing", unit: "em", number: true },
    wordSpacing:        { default: 0,         cssVar: "--reader-word-spacing", unit: "em", number: true },
    textColor:          { default: "#000000", cssVar: "--reader-color" },
    backgroundColor:    { default: "#ffffff", cssVar: "--reader-bg" },
    paragraphSeparator: { default: "  ¶  ",   apply: setParagraphSeparator },
};

let reader = null;
let values = {};
const inputs = new Map(); // setting key -> bound input element
let customFontCount = 0;

// reader: the element the CSS variables are set on
// container: the element holding the [data-setting] inputs
// fontFileInput / resetButton: optional
export function initSettings({ reader: readerEl, container, fontFileInput, resetButton }) {
    reader = readerEl;
    values = { ...getDefaults(), ...loadSaved() };

    for (const input of container.querySelectorAll("[data-setting]")) {
        const key = input.dataset.setting;
        if (!(key in SETTINGS)) {
            console.warn(`Unknown data-setting "${key}"`, input);
            continue;
        }
        inputs.set(key, input);
        input.addEventListener("input", () => handleInput(key, input));
    }

    for (const key of Object.keys(SETTINGS)) {
        writeInput(key);
        applySetting(key);
    }

    fontFileInput?.addEventListener("change", () => loadCustomFont(fontFileInput));
    resetButton?.addEventListener("click", resetSettings);
}

export function getSetting(key) {
    return values[key];
}

// Changes a setting from code: applies it, saves it and updates its input
export function setSetting(key, value) {
    if (!(key in SETTINGS)) return;
    values[key] = value;
    applySetting(key);
    writeInput(key);
    save();
}

export function resetSettings() {
    values = getDefaults();
    for (const key of Object.keys(SETTINGS)) {
        applySetting(key);
        writeInput(key);
    }
    save();
}

function handleInput(key, input) {
    let value = input.value;
    if (SETTINGS[key].number) {
        value = parseFloat(value);
        if (!Number.isFinite(value)) return; // empty or half-typed: keep the current value
        if (input.min !== "") value = Math.max(value, parseFloat(input.min));
        if (input.max !== "") value = Math.min(value, parseFloat(input.max));
    }
    values[key] = value;
    applySetting(key);
    save();
}

function applySetting(key) {
    const def = SETTINGS[key];
    const value = values[key];
    if (def.cssVar) reader.style.setProperty(def.cssVar, def.unit ? `${value}${def.unit}` : String(value));
    if (def.apply) def.apply(value);
}

function writeInput(key) {
    const input = inputs.get(key);
    if (!input) return;
    input.value = String(values[key]);

    // a <select> silently ends up empty if the value isn't one of its options
    if (input.tagName === "SELECT" && input.value !== String(values[key])) {
        values[key] = SETTINGS[key].default;
        input.value = String(values[key]);
        applySetting(key);
    }
}

function getDefaults() {
    return Object.fromEntries(Object.entries(SETTINGS).map(([key, def]) => [key, def.default]));
}

// Saved values, keeping only known keys with the right type
function loadSaved() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        return {};
    }
    if (!saved || typeof saved !== "object") return {};

    const result = {};
    for (const [key, def] of Object.entries(SETTINGS)) {
        const value = saved[key];
        if (def.number ? Number.isFinite(value) : typeof value === "string") result[key] = value;
    }
    // uploaded fonts only exist for the session they were uploaded in
    if (result.fontFamily?.includes(CUSTOM_FONT_PREFIX)) delete result.fontFamily;
    return result;
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
        // storage unavailable (private mode, blocked): settings just won't persist
    }
}

// Lets the user pick a .ttf/.otf/.woff/.woff2 file and read with it
async function loadCustomFont(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const family = `${CUSTOM_FONT_PREFIX}${++customFontCount}`;
    try {
        const face = new FontFace(family, await file.arrayBuffer());
        await face.load();
        document.fonts.add(face);
    } catch (err) {
        console.error(err);
        alert(`Couldn't load "${file.name}" as a font.`);
        fileInput.value = "";
        return;
    }

    const value = `"${family}", serif`;
    const select = inputs.get("fontFamily");
    if (select?.tagName === "SELECT") select.add(new Option(`${file.name} (uploaded)`, value));
    setSetting("fontFamily", value);
}
