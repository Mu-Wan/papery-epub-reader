"use client";
import type {AppPreferences} from "../lib/reader-types";
import {canvasPresets,themePresets,validThemeColor} from "../lib/app-theme";
export function ThemeSettings({value,onChange}:{value:AppPreferences;onChange:(value:AppPreferences)=>void}){
  return <>
    <section><label>日夜外观</label><div className="choiceGrid">{[["system","跟随系统"],["light","日间"],["dark","夜间"]].map(([id,name])=><button key={id} aria-pressed={value.appTheme===id} className={value.appTheme===id?"active":""} onClick={()=>onChange({...value,appTheme:id as AppPreferences["appTheme"]})}>{name}</button>)}</div></section>
    <section><label>界面底色</label><div className="canvasPalette">{canvasPresets.map(preset=><button key={preset.id} className={(value.canvasPreset||"neutral")===preset.id?"active":""} aria-pressed={(value.canvasPreset||"neutral")===preset.id} onClick={()=>onChange({...value,canvasPreset:preset.id})}><i style={{background:preset.color}}/><span>{preset.name}</span></button>)}</div><ThemeColorControl label="自定义底色" color={validThemeColor(value.customCanvas)?value.customCanvas:"#FCFBFA"} selected={value.canvasPreset==="custom"} onChange={customCanvas=>onChange({...value,canvasPreset:"custom",customCanvas})}/></section>
    <section><label>主题色</label><div className="themePalette">{themePresets.map(preset=><button key={preset.id} className={(value.themePreset||"sea")===preset.id?"active":""} aria-pressed={(value.themePreset||"sea")===preset.id} onClick={()=>onChange({...value,themePreset:preset.id})}><i style={{background:preset.color}}/><span>{preset.name}</span></button>)}</div><ThemeColorControl label="自定义主题色" color={validThemeColor(value.customAccent)?value.customAccent:"#4E8FC3"} selected={value.themePreset==="custom"} onChange={customAccent=>onChange({...value,themePreset:"custom",customAccent})}/></section>
  </>;
}
function ThemeColorControl({label,color,selected,onChange}:{label:string;color:string;selected:boolean;onChange:(color:string)=>void}){
  return <label className="themeColorControl" data-selected={selected||undefined}><span className="themeColorSwatch" style={{background:color}}><input type="color" aria-label={label} value={color} onChange={event=>onChange(event.target.value)}/></span><span className="themeColorLabel">{label}</span><span className="themeColorHex" aria-hidden="true">{color.toUpperCase()}</span></label>;
}
