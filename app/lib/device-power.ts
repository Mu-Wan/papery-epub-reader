export type DevicePower = { percent: number; charging: boolean };
export function normalizeDevicePower(value: unknown): DevicePower | null {
  if (!value || typeof value !== "object") return null;
  const power = value as DevicePower;
  if (typeof power.percent !== "number" || !Number.isFinite(power.percent) || power.percent < 0 || power.percent > 100 || typeof power.charging !== "boolean") return null;
  return { percent: Math.round(power.percent), charging: power.charging };
}
export function batteryFillWidth(percent?: number) {
  return typeof percent === "number" && Number.isFinite(percent) ? 13 * Math.max(0, Math.min(100, percent)) / 100 : 0;
}
