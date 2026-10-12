"use client";
import { useId } from "react";
import { Check } from "./PaperyIcons";

export function Checkbox({checked,onChange,label,description,disabled=false,className=""}:{checked:boolean;onChange:(checked:boolean)=>void;label:string;description?:string;disabled?:boolean;className?:string}){
 const hintId=useId();
 return <button type="button" className={`checkboxControl ${className}`} role="checkbox" aria-checked={checked} aria-label={label} aria-describedby={description?hintId:undefined} disabled={disabled} onClick={()=>onChange(!checked)}>
  <span className="checkboxMark" aria-hidden="true"><Check size={14}/></span>
  <span className="checkboxCopy"><span>{label}</span>{description&&<small id={hintId}>{description}</small>}</span>
 </button>;
}
