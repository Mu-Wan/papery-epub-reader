export type StatsSession = { book_id: string; started_at: number; duration_seconds: number };
export type StatsBook = { id: string; type: "EPUB" | "PDF" | "TXT"; progress: number };

export function readingStats(books: StatsBook[], sessions: StatsSession[], range: number, now = new Date()) {
  const end = new Date(now); end.setHours(24, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - range);
  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const next = new Date(date); next.setDate(date.getDate() + 1);
    return { date, end: next.getTime(), seconds: 0 };
  });
  let totalSeconds = 0, sessionCount = 0;
  const bookSeconds: Record<string, number> = {};
  for (const session of sessions) {
    if (!Number.isFinite(session.started_at) || !Number.isFinite(session.duration_seconds) || session.duration_seconds <= 0 || session.started_at > now.getTime()) continue;
    totalSeconds += session.duration_seconds;
    const sessionEnd = session.started_at + session.duration_seconds * 1000;
    let secondsInRange = 0;
    for (const day of days) {
      const overlap = Math.max(0, Math.min(day.end, sessionEnd) - Math.max(day.date.getTime(), session.started_at)) / 1000;
      day.seconds += overlap; secondsInRange += overlap;
    }
    if (secondsInRange > 0) {
      sessionCount++;
      bookSeconds[session.book_id] = (bookSeconds[session.book_id] || 0) + secondsInRange;
    }
  }
  const seconds = days.reduce((sum, day) => sum + day.seconds, 0);
  return {
    days, seconds, totalSeconds, sessionCount, bookSeconds,
    activeDays: days.filter(day => day.seconds > 0).length,
    completed: books.filter(book => book.progress >= 100).length,
    formats: (["EPUB", "PDF", "TXT"] as const).map(type => ({ type, count: books.filter(book => book.type === type).length })),
  };
}

export function durationLabel(seconds: number) {
  if (seconds > 0 && seconds < 60) return "不足 1 分钟";
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}
