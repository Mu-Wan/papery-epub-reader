"use client";

import { memo } from "react";
import { CalendarDays, Clock3, Hash, Menu, Sparkles } from "lucide-react";

type StatsBook = { type: "TXT" | "EPUB" | "PDF"; progress: number };
type StatsSession = { id: string; started_at: number; duration_seconds: number; words_read: number };

export const StatsView = memo(function StatsView({
  books,
  sessions,
  onMenu,
}: {
  books: StatsBook[];
  sessions: StatsSession[];
  onMenu: () => void;
}) {
  const totalSeconds = sessions.reduce((sum, item) => sum + item.duration_seconds, 0);
  const minutes = Math.round(totalSeconds / 60);
  const words = sessions.reduce((sum, item) => sum + item.words_read, 0);
  const days = new Set(sessions.map(item => new Date(item.started_at).toDateString())).size;
  const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];
  const today = new Date();
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + mondayOffset + index);
    return day;
  });
  const todayIndex = chartDays.findIndex(day => day.toDateString() === today.toDateString());
  const bars = chartDays.map(day => sessions
    .filter(item => new Date(item.started_at).toDateString() === day.toDateString())
    .reduce((sum, item) => sum + item.duration_seconds / 60, 0));
  const weekMinutes = Math.round(bars.reduce((sum, value) => sum + value, 0));
  const maxMinutes = Math.max(1, ...bars);
  const finishedBooks = books.filter(book => book.progress >= 99).length;
  const formats = (["EPUB", "PDF", "TXT"] as const).map(format => ({
    format,
    count: books.filter(book => book.type === format).length,
  }));
  const formatMax = Math.max(1, ...formats.map(item => item.count));

  return <div className="page simplePage statsPage">
    <div className="pageHeader">
      <div className="headerTitle"><button className="menuButton" onClick={onMenu} aria-label="打开导航"><Menu size={21}/></button><div><p>真实阅读记录</p><h1>阅读数据</h1></div></div>
    </div>
    <section className="statGrid">
      <article className="statHero">
        <div className="statHeroMain"><span className="eyebrow"><Sparkles size={15}/>累计阅读</span>
          <h2>{Math.floor(minutes / 60)}<small>小时</small><span>{minutes % 60}</span><small>分钟</small></h2>
          <p>按每次实际阅读记录累计</p>
        </div>
        <div className="statHeroAside"><div><span>本周阅读</span><strong>{weekMinutes}<small>分钟</small></strong><em>{bars.filter(value => value > 0).length} 天有阅读</em></div>
          <div className="statSpark" aria-label={`本周阅读 ${weekMinutes} 分钟`}>
            {bars.map((value, index) => <i key={index} className={index === todayIndex && value > 0 ? "today" : ""} style={{ height: `${Math.max(7, value / maxMinutes * 100)}%` }} title={`${weekLabels[index]}：${Math.round(value)} 分钟`}/>) }
          </div>
        </div>
      </article>
      <article className="smallStat"><span><CalendarDays size={16}/>阅读天数</span><h3>{days}<small>天</small></h3><em>累计有阅读记录的日期</em></article>
      <article className="smallStat"><span><Hash size={16}/>阅读字数</span><h3>{Math.round(words / 1000)}<small>千字</small></h3><em>按阅读会话累计</em></article>
      <article className="smallStat"><span><Clock3 size={16}/>读完书籍</span><h3>{finishedBooks}<small>本</small></h3><em>进度达到 99% 的书籍</em></article>
    </section>
    <section className="chartRow">
      <article className="chartCard">
        <div className="cardTitle"><div><h3>本周阅读</h3><p>每天实际阅读时长</p></div><span>合计 {weekMinutes} 分钟</span></div>
        {sessions.length ? <div className="barChart">
          {bars.map((value, index) => <div className={index === todayIndex ? "today" : ""} key={index}>
            <span style={{ height: `${Math.max(value ? 6 : 2, value / maxMinutes * 100)}%` }} className={value && index === todayIndex ? "hot" : ""}>
              {value > 0 && <i>{Math.round(value)}</i>}
            </span><small>{weekLabels[index]}</small>
          </div>)}
        </div> : <div className="statsEmpty">开始阅读后，这里会显示本周每天的阅读时长。</div>}
      </article>
      <article className="distribution">
        <div className="cardTitle"><div><h3>书库格式</h3><p>按当前书库统计</p></div><span>{books.length} 本</span></div>
        {books.length ? <ul className="formatList">{formats.map((item, index) => <li key={item.format}>
          <div className="formatMeta"><span><i className={`c${index + 1}`}/>{item.format}</span><strong>{item.count}<small> 本</small></strong></div>
          <div className="formatTrack"><i className={`c${index + 1}`} style={{ width: `${item.count / formatMax * 100}%` }}/></div>
          <em>{Math.round(item.count / books.length * 100)}%</em>
        </li>)}</ul> : <div className="statsEmpty">导入 EPUB、PDF 或 TXT 后，这里会显示格式占比。</div>}
      </article>
    </section>
  </div>;
});
