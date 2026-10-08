"use client";
import { useId, useState } from "react";
import { ChevronRight } from "./PaperyIcons";

export function CollectionGroup({ label, count, unit, children }: { label: string; count: number; unit: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true), id = useId();
  return <section className="collectionGroup">
    <h3 className="collectionGroupHeading"><button aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><ChevronRight size={17}/><span>{label}</span><small>{count} {unit}</small></button></h3>
    <div id={id} hidden={!open}>{open && children}</div>
  </section>;
}
