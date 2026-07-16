const KEY = "papery.preferences";
const clamp = (value, minimum, maximum) => Math.min(Math.max(Number(value), minimum), maximum);

export const PAPERS = [
  { id: "warm", label: "暖纸", color: "#f6f0e4", ink: "#292a27" },
  { id: "white", label: "白纸", color: "#fbfbf8", ink: "#242522" },
  { id: "green", label: "护眼绿", color: "#e6eee4", ink: "#27302a" },
  { id: "gray", label: "雾灰", color: "#e8e7e3", ink: "#292a28" },
];

export function loadPreferences() {
  const defaults = { fontSize: 18, lineHeight: 1.8, margin: 48, paper: "warm" };
  try {
    const stored = { ...defaults, ...JSON.parse(localStorage.getItem(KEY)) };
    return {
      fontSize: clamp(stored.fontSize, 14, 28),
      lineHeight: clamp(stored.lineHeight, 1.3, 2.4),
      margin: clamp(stored.margin, 16, 96),
      paper: PAPERS.some((paper) => paper.id === stored.paper) ? stored.paper : defaults.paper,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences) {
  localStorage.setItem(KEY, JSON.stringify(preferences));
}
