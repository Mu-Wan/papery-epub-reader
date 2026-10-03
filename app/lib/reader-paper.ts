export const readerPapers = [
  { name: "净白", color: "#FCFBFA" },
  { name: "浅灰", color: "#ECEDEF" },
  { name: "豆绿", color: "#DCE8D7" },
  { name: "牛皮", color: "#E7D6B6" },
  { name: "羊皮", color: "#F0E6D2" },
  { name: "夜读", color: "#242628" },
] as const;

export function paperBackground(texture: "plain" | "paper" | "soft") {
  if (texture === "plain") return "none";
  const path = texture === "paper" ? "/paper/fiber.png" : "/paper/fine.png";
  const url = typeof window === "undefined" ? path : new URL(path, window.location.href).href;
  return `url("${url}")`;
}
