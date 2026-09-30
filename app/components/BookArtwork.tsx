"use client";
import { memo, useState } from "react";

type ArtworkBook = { title: string; author: string; type: string; coverDataUrl?: string | null };

export const BookArtwork = memo(function BookArtwork({ book, className = "" }: { book: ArtworkBook; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`bookArtwork ${className}`}>
    {book.coverDataUrl && book.coverDataUrl !== failedUrl
      ? <img src={book.coverDataUrl} alt={`${book.title}封面`} onError={() => setFailedUrl(book.coverDataUrl || null)} />
      : <span className="textArtwork"><small>{book.type}</small><strong>{book.title}</strong><span>{book.author}</span></span>}
  </span>;
},(previous,next)=>previous.className===next.className&&previous.book.title===next.book.title&&previous.book.author===next.book.author&&previous.book.type===next.book.type&&previous.book.coverDataUrl===next.book.coverDataUrl);
