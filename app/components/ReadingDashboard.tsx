"use client";
import { memo, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookCheck, BookOpen, CalendarDays, Clock3, Menu } from "./PaperyIcons";
import { durationLabel, readingStats, type StatsBook, type StatsSession } from "../lib/reading-stats";
import { BookArtwork } from "./BookArtwork";

type Book = StatsBook & { title: string; author: string; coverDataUrl?: string | null };
import { SelectionGroup } from "./SelectionGroup";
import { RollingNumber } from "./RollingNumber";
let chartsPresented = false;

export const ReadingDashboard = memo(function ReadingDashboard({ books, sessions, onMenu, onRead }: {
  books: Book[]; sessions: StatsSession[]; onMenu: () => void; onRead: (book: Book) => void;
}) {
  const [range, setRange] = useState(7);
  const [intro, setIntro] = useState(() => !chartsPresented);
  useEffect(() => { chartsPresented = true; const timer = setTimeout(() => setIntro(false), 700); return () => clearTimeout(timer); }, []);
  const stats = useMemo(() => readingStats(books, sessions, range), [books, sessions, range]);
  const max = Math.max(60, ...stats.days.map(day => day.seconds));
  const minutes = Math.floor(stats.seconds / 60);
  const dotSeconds = Math.max(60, Math.ceil(max / 12 / 60) * 60);
  const ranked = books.filter(book => stats.bookSeconds[book.id] > 0).sort((a, b) => stats.bookSeconds[b.id] - stats.bookSeconds[a.id]);
  const maxBookSeconds = Math.max(1, ...Object.values(stats.bookSeconds));
  const dominant = stats.formats.reduce((largest, format) => format.count > largest.count ? format : largest, stats.formats[0]);
  const dominantType = dominant.type;
  const arcs = stats.formats.map((format, index) => {
    const fraction = books.length ? format.count / books.length : 0;
    const emphasized = format.count > 0 && format.type === dominantType;
    return { ...format, fraction, color: emphasized ? "var(--blue-deep)" : "var(--neutral-chart)", fill: emphasized ? "var(--blue-soft)" : index % 2 ? "var(--surface-muted)" : "var(--surface-inset)" };
  });

  return <div className="page statsPage">
    <div className="pageHeader"><div className="headerTitle"><button className="menuButton" aria-label="打开导航" onClick={onMenu}><Menu size={21}/></button><h1>阅读数据</h1></div>
      <SelectionGroup className="segmented rangeSwitch" label="统计时间范围">{[7, 30].map(value => <button key={value} aria-pressed={range === value} className={range === value ? "active" : ""} onClick={() => { setIntro(false); setRange(value); }}>近 {value} 天</button>)}</SelectionGroup>
    </div>
    <div className={`readingDashboard ${intro ? "chartIntro" : ""}`}>
      <article className="timeWidget">
        <div className="widgetHeading"><span className="roundIcon"><Clock3 size={20}/></span><h2>阅读时长</h2><span className="periodLabel">近 {range} 天</span></div>
        <div className="timeValue" aria-label={durationLabel(stats.seconds)}><RollingNumber value={minutes >= 60 ? Math.floor(minutes / 60) : minutes}/><span>{minutes >= 60 ? "小时" : "分钟"}</span>{minutes >= 60 && <div><b>{minutes % 60}</b><span>分钟</span></div>}</div>
        {stats.seconds > 0 && stats.seconds < 60 && <p className="timeCaption">这段阅读不足 1 分钟</p>}
        <div className="timeInset"><div><CalendarDays size={17}/><span>阅读天数<strong>{stats.activeDays}<small> / {range} 天</small></strong></span></div><div><BookOpen size={17}/><span>阅读次数<strong>{stats.sessionCount}<small> 次</small></strong></span></div></div>
        <div className="allTime">累计阅读<span>{durationLabel(stats.totalSeconds)}</span></div>
      </article>

      <article className="rhythmWidget">
        <div className="widgetHeading"><h2>每天留下的阅读</h2><span className="chartUnit">近 {range} 天</span></div>
        <div className={`activityMatrix ${range === 30 ? "activityCalendar" : "activityWeek"}`} role="img" aria-label={`近 ${range} 天的阅读记录，每点约 ${durationLabel(dotSeconds)}`}>
          {stats.days.map((day, index) => <div className={`activityDay ${index === range - 1 ? "today" : ""}`} key={day.date.getTime()} title={`${day.date.toLocaleDateString("zh-CN")} · ${durationLabel(day.seconds)}`}>
            <span className="activityDate">{range === 7 ? ["日", "一", "二", "三", "四", "五", "六"][day.date.getDay()] : day.date.getDate()}</span>
            {range === 7 ? <div className="activityDots">{Array.from({ length: 12 }, (_, dot) => <i key={dot} className={day.seconds > dot * dotSeconds ? "filled" : ""} style={{ opacity: day.seconds > dot * dotSeconds ? .3 + .7 * Math.min(1, day.seconds / dotSeconds - dot) : 1 }}/>)}</div> : <i className={`calendarDot ${day.seconds ? "filled" : ""}`} style={{ opacity: day.seconds ? .35 + .65 * day.seconds / max : 1 }}/>}
            {range === 7 && <strong>{Math.round(day.seconds / 60)}<small>分</small></strong>}
          </div>)}
        </div>
        <div className="rhythmFooter"><span>{range === 7 ? `每点约 ${durationLabel(dotSeconds)}` : "深浅表示阅读时长"}</span><span>{stats.days[0].date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} — {stats.days[range - 1].date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span><strong>日均 {durationLabel(stats.seconds / range)}</strong></div>

      </article>

      <article className="bookTimeWidget">
        <div className="widgetHeading"><h2>各书阅读时长</h2><span className="periodLabel">近 {range} 天</span></div>
        {ranked.length ? <div className="bookTimeLayout">
          <div className="bookTimeRows">{ranked.slice(0, 4).map((book, index) => <button key={book.id} onClick={() => onRead(book)}><span className="bookRank">{index + 1}</span><BookArtwork book={book}/><span className="bookTimeCopy"><strong>{book.title}</strong><small>{durationLabel(stats.bookSeconds[book.id])} · 已读 {Math.round(book.progress)}%</small><i><b style={{ width: `${stats.bookSeconds[book.id] / maxBookSeconds * 100}%` }}/></i></span><ArrowUpRight size={17}/></button>)}</div>
        </div> : <div className="statsEmpty"><BookOpen size={32}/><strong>尚无阅读记录</strong></div>}
        <div className="completionStrip"><span className="roundIcon"><BookCheck size={19}/></span><strong>{stats.completed} 本已读完</strong><span>书库共 {books.length} 本</span><div className="completionTrack" role="progressbar" aria-label="书库已读完比例" aria-valuemin={0} aria-valuemax={books.length || 1} aria-valuenow={stats.completed}><i style={{ width: `${books.length ? stats.completed / books.length * 100 : 0}%` }}/></div></div>
      </article>

      <article className="formatWidget">
        <div className="widgetHeading"><h2>书库构成</h2><span>{books.length} 本</span></div>
        <div className="formatComposition">
          {books.length ? <><div className="formatLead"><div><span>占比最多</span><strong>{dominant.type}</strong></div><p>{Math.round(dominant.count / books.length * 100)}<small>%</small></p></div><div className="formatRail" role="img" aria-label={arcs.map(arc=>`${arc.type} ${arc.count} 本，占 ${Math.round(arc.fraction*100)}%`).join("，")}>{arcs.filter(arc=>arc.count>0).map(arc=><i key={arc.type} style={{flex:arc.count,background:arc.type===dominantType?"var(--blue)":arc.type==="PDF"?"var(--neutral-chart)":"var(--surface-inset)"}}/>)}</div></> : <div className="formatNoBooks"><strong>0<span>本</span></strong><p>导入书籍后，在这里查看格式分布。</p></div>}
        </div>
        <div className="formatRows">{arcs.map(arc => <div key={arc.type}><span className="formatDot" style={{ background: arc.color }}/><strong>{arc.type}</strong><span>{arc.count} 本</span><b>{Math.round(arc.fraction * 100)}<small>%</small></b></div>)}</div>
      </article>
    </div>
    <p className="statsFootnote">时长按阅读页停留记录统计，切回书库后更新；读完以阅读进度达到 99% 计。</p>
  </div>;
});
