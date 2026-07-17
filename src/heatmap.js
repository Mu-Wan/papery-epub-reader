import { listReadingDays } from "./stats-store.js";

const keyFor = (date) => {
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
};

function levelFor(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

function readableDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export async function renderHeatmap() {
  const days = await listReadingDays();
  const values = new Map(days.map((day) => [day.date, day.milliseconds]));
  const mobile = matchMedia("(max-width: 760px)").matches;
  const weekCount = mobile ? 26 : 53;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset - (weekCount - 1) * 7);
  const grid = document.querySelector("#heatmap");
  const chart = document.querySelector(".heatmap-chart");
  chart.style.setProperty("--heatmap-weeks", String(weekCount));
  const years = document.querySelector("#heatmapYears");
  const months = document.querySelector("#heatmapMonths");
  const cells = [];
  const monthLabels = [];
  const yearStarts = [{ year: start.getFullYear(), column: 1 }];
  for (let week = 1; week < weekCount; week += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + week * 7);
    if (date.getFullYear() !== yearStarts.at(-1).year) {
      yearStarts.push({ year: date.getFullYear(), column: week + 1 });
    }
  }
  const yearLabels = yearStarts.map((item, index) => {
    const label = document.createElement("span");
    label.textContent = String(item.year);
    label.style.gridColumn = `${item.column} / ${yearStarts[index + 1]?.column || weekCount + 1}`;
    return label;
  });
  const dividerColumns = new Set(yearStarts.slice(1).map((item) => item.column));
  let total = 0;
  for (let index = 0; index < weekCount * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    if (date.getDate() <= 7 && date.getDay() === 1) {
      const label = document.createElement("span");
      label.textContent = `${date.getMonth() + 1}月`;
      label.style.gridColumn = String(Math.floor(index / 7) + 1);
      monthLabels.push(label);
    }
    const milliseconds = date > today ? 0 : values.get(keyFor(date)) || 0;
    const minutes = Math.floor(milliseconds / 60000);
    if (date <= today) total += milliseconds;
    const cell = document.createElement("button");
    cell.type = "button";
    if (dividerColumns.has(Math.floor(index / 7) + 1)) cell.classList.add("year-start");
    cell.dataset.level = date > today ? "future" : levelFor(minutes);
    cell.title = `${readableDate(date)} · ${minutes} 分钟`;
    cell.setAttribute("aria-label", cell.title);
    cell.addEventListener("click", () => {
      document.querySelector("#heatmapSummary").textContent = cell.title;
    });
    cells.push(cell);
  }
  grid.replaceChildren(...cells);
  years.replaceChildren(...yearLabels);
  months.replaceChildren(...monthLabels);
  const range = mobile ? "近半年" : "过去一年";
  document.querySelector("#heatmapSummary").textContent = `${range} ${Math.floor(total / 60000)} 分钟`;
}

matchMedia("(max-width: 760px)").addEventListener("change", renderHeatmap);
