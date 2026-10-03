export const annotationColors = [
  { color: "#EBC14C", label: "黄色" },
  { color: "#EE9A6C", label: "橙色" },
  { color: "#6DAFDF", label: "蓝色" },
  { color: "#78B98A", label: "绿色" },
] as const;

const legacyColors: Record<string, string> = {
  "#FDEDE4": "#EE9A6C", "#FFECE0": "#EE9A6C",
  "#E8F4FB": "#6DAFDF", "#D9EFFD": "#6DAFDF",
  "#E8F3EA": "#78B98A", "#DCF2DF": "#78B98A",
  "#F5F2EF": "#EBC14C", "#F1EEEC": "#EBC14C",
};

/** Improve the presentation of old pale marks without rewriting saved notes. */
export function annotationColor(value?: string) {
  const normalized = value?.trim().toUpperCase() || annotationColors[0].color;
  if (legacyColors[normalized]) return legacyColors[normalized];
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9A-F]{3}$/.test(normalized)) return `#${[...normalized.slice(1)].map(c => c + c).join("")}`;
  if (/^#[0-9A-F]{8}$/.test(normalized)) return normalized.slice(0, 7);
  return annotationColors[0].color;
}

export function annotationPaint(value: string | undefined, style: string) {
  const color = annotationColor(value);
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(",")},${style === "underline" ? .86 : .38})`;
}
