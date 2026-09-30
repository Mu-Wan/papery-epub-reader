"use client";
import type { CSSProperties } from "react";

export function RollingNumber({ value }: { value: number }) {
  return <strong className="rollingNumber" aria-label={String(value)}>{String(value).split("").map((digit, index) => <span className="numberWindow" aria-hidden="true" key={index}><span className="numberReel" style={{ "--digit": Number(digit), animationDelay: `${index * 40}ms` } as CSSProperties}>{Array.from({ length: 10 }, (_, number) => <span key={number}>{number}</span>)}</span></span>)}</strong>;
}
