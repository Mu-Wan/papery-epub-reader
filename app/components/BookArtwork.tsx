"use client";
import { memo, useEffect, useRef, useState } from "react";
import { loadDisplayCover } from "../lib/book-cover-cache";

type ArtworkBook = { id?:string; title: string; author: string; type: string; coverDataUrl?: string | null; hasCover?:boolean };

export const BookArtwork = memo(function BookArtwork({ book, className = "" }: { book: ArtworkBook; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loaded,setLoaded]=useState<{id:string;url:string|null}|null>(null),host=useRef<HTMLSpanElement>(null);
  const direct=book.coverDataUrl&&book.coverDataUrl.length<80_000?book.coverDataUrl:null;
  const url=direct||(loaded?.id===book.id?loaded?.url:null);
  useEffect(()=>{
    if(direct||!book.id||!book.hasCover)return;
    let active=true,started=false;const load=()=>{if(started)return;started=true;void loadDisplayCover(book.id!).then(url=>{if(active)setLoaded({id:book.id!,url})})};
    const observer=typeof IntersectionObserver==="function"?new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();load()}},{rootMargin:"100px"}):null;
    if(observer&&host.current)observer.observe(host.current);else load();
    return()=>{active=false;observer?.disconnect()};
  },[book.id,book.hasCover,direct]);
  return <span ref={host} className={`bookArtwork ${className}`}>
    {url && url !== failedUrl
      ? <img src={url} loading="lazy" decoding="async" alt={`${book.title}封面`} onError={() => setFailedUrl(url)} />
      : <span className="textArtwork"><small>{book.type}</small><strong>{book.title}</strong><span>{book.author}</span></span>}
  </span>;
},(previous,next)=>previous.className===next.className&&previous.book.id===next.book.id&&previous.book.hasCover===next.book.hasCover&&previous.book.title===next.book.title&&previous.book.author===next.book.author&&previous.book.type===next.book.type&&previous.book.coverDataUrl===next.book.coverDataUrl);
