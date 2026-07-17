import { FONTS, PAPERS, TEXTURES, savePreferences } from "./preferences.js";

const byId = (id) => document.querySelector(`#${id}`);
const selected = (items, id) => items.find((item) => item.id === id) || items[0];

export function applyReaderTheme(rendition, preferences) {
  const paper = selected(PAPERS, preferences.paper);
  const font = selected(FONTS, preferences.font);
  const texture = selected(TEXTURES, preferences.texture);
  const readerView = byId("readerView");
  readerView.style.setProperty("--paper", paper.color);
  readerView.style.setProperty("--paper-texture", texture.image);
  readerView.style.setProperty("--paper-texture-size", texture.size);
  if (!rendition) return;
  rendition.themes.register("papery", {
    "html, body": {
      color: `${paper.ink} !important`,
      background: `${paper.color} !important`,
      "background-image": `${texture.image} !important`,
      "background-size": `${texture.size} !important`,
      margin: "0 !important",
      "touch-action": "none !important",
      "overscroll-behavior": "contain !important",
    },
    body: { position: "relative !important", "min-height": "100% !important" },
    html: { "padding-top": "0 !important", "padding-bottom": "0 !important" },
    "body, body *": { "font-family": `${font.family} !important` },
    p: { "line-height": `${preferences.lineHeight} !important` },
  });
  rendition.themes.select("papery");
  rendition.themes.fontSize(`${preferences.fontSize}px`);
}

function optionButton(item, active, className, onClick) {
  const button = document.createElement("button");
  button.className = `${className} ${active ? "active" : ""}`;
  button.type = "button";
  button.textContent = item.label;
  button.title = item.label;
  button.addEventListener("click", onClick);
  return button;
}

export function setupSettingControls(preferences, callbacks) {
  const elements = Object.fromEntries([
    "fontSize", "lineHeight", "horizontalMargin", "verticalMargin", "fontSizeOutput", "lineHeightOutput",
    "horizontalMarginOutput", "verticalMarginOutput",
    "fontChoices", "paperChoices", "textureChoices",
  ].map((id) => [id, byId(id)]));

  function choose(key, value) {
    preferences[key] = value;
    savePreferences(preferences);
    renderChoices();
    callbacks.onThemeChange();
  }

  function renderChoices() {
    elements.fontChoices.replaceChildren(...FONTS.map((font) => {
      const button = optionButton(font, font.id === preferences.font, "font-choice", () => choose("font", font.id));
      button.style.fontFamily = font.family;
      return button;
    }));
    elements.paperChoices.replaceChildren(...PAPERS.map((paper) => {
      const button = optionButton(paper, paper.id === preferences.paper, "paper-choice", () => choose("paper", paper.id));
      button.style.backgroundColor = paper.color;
      button.setAttribute("aria-label", paper.label);
      button.textContent = "";
      return button;
    }));
    const paper = selected(PAPERS, preferences.paper);
    elements.textureChoices.replaceChildren(...TEXTURES.map((texture) => {
      const button = optionButton(texture, texture.id === preferences.texture, "texture-choice", () => choose("texture", texture.id));
      button.style.backgroundColor = paper.color;
      button.style.backgroundImage = texture.image;
      button.style.backgroundSize = texture.size;
      return button;
    }));
  }

  function marginConfig() {
    const stage = byId("readerStage");
    const compact = stage.clientWidth <= 620;
    const width = Math.max(stage.clientWidth, 320);
    const height = Math.max(stage.clientHeight, 480);
    return compact ? {
      horizontal: ["compactHorizontalMargin", 8, Math.max(24, Math.min(48, Math.floor(width * .16 / 4) * 4)), 4],
      vertical: ["compactVerticalMargin", 4, Math.max(32, Math.min(64, Math.floor(height * .12 / 4) * 4)), 4],
    } : {
      horizontal: ["horizontalMargin", 16, Math.max(64, Math.min(112, Math.floor(width * .12 / 8) * 8)), 8],
      vertical: ["verticalMargin", 8, Math.max(48, Math.min(96, Math.floor(height * .12 / 8) * 8)), 8],
    };
  }

  function syncMargins() {
    const config = marginConfig();
    Object.entries(config).forEach(([axis, [key, minimum, maximum, step]]) => {
      const input = elements[`${axis}Margin`];
      preferences[key] = Math.min(Math.max(preferences[key], minimum), maximum);
      Object.assign(input, { min: minimum, max: maximum, step, value: preferences[key] });
      elements[`${axis}MarginOutput`].value = preferences[key];
    });
    savePreferences(preferences);
    callbacks.onMarginSync();
  }

  ["fontSize", "lineHeight"].forEach((name) => {
    elements[name].value = preferences[name];
    elements[`${name}Output`].value = preferences[name];
  });
  ["fontSize", "lineHeight"].forEach((name) => elements[name].addEventListener("input", (event) => {
    preferences[name] = Number(event.target.value);
    elements[`${name}Output`].value = preferences[name];
    savePreferences(preferences);
    callbacks.onThemeChange();
  }));
  ["horizontal", "vertical"].forEach((axis) => {
    elements[`${axis}Margin`].addEventListener("input", (event) => {
      const key = marginConfig()[axis][0];
      preferences[key] = Number(event.target.value);
      elements[`${axis}MarginOutput`].value = preferences[key];
      savePreferences(preferences);
      callbacks.onMarginInput();
    });
    elements[`${axis}Margin`].addEventListener("change", callbacks.onMarginCommit);
  });
  new ResizeObserver(syncMargins).observe(byId("readerStage"));
  syncMargins();
  renderChoices();
}
