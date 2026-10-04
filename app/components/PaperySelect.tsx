"use client";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, X } from "./PaperyIcons";
import { useDialogFocus } from "./use-dialog-focus";

type Option = { value: string; label: string };
export function PaperySelect({label,value,options,onChange,className=""}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;className?:string}) {
  const [open,setOpen]=useState(false),[container,setContainer]=useState<Element|null>(null),id=useId();
  return <><button className={`paperySelect ${className}`} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={event=>{setContainer(event.currentTarget.closest(".appShell")||document.body);setOpen(true)}}><span>{options.find(item=>item.value===value)?.label||label}</span><ChevronRight size={16}/></button>{open&&createPortal(<SelectChoices id={id} label={label} value={value} options={options} onClose={()=>setOpen(false)} onChange={next=>{onChange(next);setOpen(false)}}/>,container||document.body)}</>;
}
function SelectChoices({id,label,value,options,onClose,onChange}:{id:string;label:string;value:string;options:Option[];onClose:()=>void;onChange:(value:string)=>void}) {
  const root=useDialogFocus(onClose);
  return <><button className="choiceScrim" aria-label={`关闭${label}`} onClick={onClose}/><div ref={root} id={id} role="dialog" aria-modal="true" aria-label={label} className="choiceDialog"><header><h2>{label}</h2><button aria-label="关闭" onClick={onClose}><X size={20}/></button></header><div role="listbox" aria-label={label} onKeyDown={event=>{const controls=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button")),index=controls.indexOf(document.activeElement as HTMLButtonElement);let next=index;if(event.key==="ArrowDown")next=(index+1)%controls.length;else if(event.key==="ArrowUp")next=(index-1+controls.length)%controls.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=controls.length-1;else return;event.preventDefault();controls[next]?.focus();}}>{options.map(option=><button key={option.value} role="option" aria-selected={option.value===value} onClick={()=>onChange(option.value)}><span>{option.label}</span>{option.value===value&&<Check size={18}/>}</button>)}</div></div></>;
}
