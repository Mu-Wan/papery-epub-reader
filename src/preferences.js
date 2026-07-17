const KEY = "papery.preferences";
const clamp = (value, minimum, maximum) => Math.min(Math.max(Number(value), minimum), maximum);

export const PAPERS = [
  { id: "warm", label: "暖纸", color: "#f6f0e4", ink: "#292a27" },
  { id: "white", label: "白纸", color: "#fbfbf8", ink: "#242522" },
  { id: "green", label: "护眼绿", color: "#e6eee4", ink: "#27302a" },
  { id: "gray", label: "雾灰", color: "#e8e7e3", ink: "#292a28" },
];

export const FONTS = [
  { id: "wenkai", label: "霞鹜文楷", family: '"LXGW WenKai", "KaiTi", serif' },
  { id: "song", label: "宋体", family: '"Songti SC", "SimSun", "Noto Serif CJK SC", serif' },
  { id: "yahei", label: "雅黑", family: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { id: "kai", label: "楷体", family: '"KaiTi", "STKaiti", serif' },
  { id: "fangsong", label: "仿宋", family: '"FangSong", "STFangsong", serif' },
];

export const TEXTURES = [
  { id: "clean", label: "净面", image: "none", size: "auto" },
  { id: "fiber", label: "细纹", image: "repeating-linear-gradient(0deg, rgba(75, 65, 48, .028) 0 1px, transparent 1px 4px)", size: "auto" },
  { id: "cotton", label: "棉纸", image: "radial-gradient(circle, rgba(60, 55, 45, .05) .6px, transparent .8px), radial-gradient(circle, rgba(255, 255, 255, .3) .7px, transparent .9px)", size: "11px 11px, 17px 17px" },
  { id: "aged", label: "旧纸", image: "radial-gradient(circle at 18% 22%, rgba(150, 105, 55, .07), transparent 34%), radial-gradient(circle at 82% 74%, rgba(120, 85, 45, .055), transparent 32%)", size: "100% 100%" },
];

export function loadPreferences() {
  const defaults = { fontSize: 18, lineHeight: 1.8, margin: 48, mobileMargin: 20, paper: "warm", font: "song", texture: "clean" };
  try {
    const stored = { ...defaults, ...JSON.parse(localStorage.getItem(KEY)) };
    return {
      fontSize: clamp(stored.fontSize, 14, 28),
      lineHeight: clamp(stored.lineHeight, 1.3, 2.4),
      margin: clamp(stored.margin, 16, 96),
      mobileMargin: clamp(stored.mobileMargin, 8, 48),
      paper: PAPERS.some((paper) => paper.id === stored.paper) ? stored.paper : defaults.paper,
      font: FONTS.some((font) => font.id === stored.font) ? stored.font : defaults.font,
      texture: TEXTURES.some((texture) => texture.id === stored.texture) ? stored.texture : defaults.texture,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences) {
  localStorage.setItem(KEY, JSON.stringify(preferences));
}
