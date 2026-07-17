import { stageReadingTime, syncReadingTime } from "./stats-store.js";

let bookOpen = false;
let lastWall = 0;
let active = false;
let pending = Promise.resolve();

const isActive = () => bookOpen && document.visibilityState === "visible" && document.hasFocus();
const dateKey = (time) => {
  const date = new Date(time);
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
};

function nextMidnight(time) {
  const date = new Date(time);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function saveRange(start, end) {
  const parts = [];
  let cursor = start;
  while (cursor < end) {
    const boundary = Math.min(nextMidnight(cursor), end);
    parts.push([dateKey(cursor), boundary - cursor]);
    cursor = boundary;
  }
  parts.forEach(([date, milliseconds]) => stageReadingTime(date, milliseconds));
  pending = pending.then(async () => {
    for (const [date] of parts) await syncReadingTime(date);
  });
  return pending;
}

function capture() {
  const now = Date.now();
  if (active && lastWall && now > lastWall) saveRange(lastWall, now);
  active = isActive();
  lastWall = active ? now : 0;
}

export function startReadingTimer() {
  bookOpen = true;
  capture();
}

export async function stopReadingTimer() {
  capture();
  bookOpen = false;
  active = false;
  lastWall = 0;
  await pending;
}

function stateChanged() {
  capture();
}

window.addEventListener("focus", stateChanged);
window.addEventListener("blur", stateChanged);
document.addEventListener("visibilitychange", stateChanged);
window.addEventListener("beforeunload", capture);
setInterval(capture, 15000);
