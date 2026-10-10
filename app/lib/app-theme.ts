import type { AppPreferences, ReaderSettings } from "./reader-types";

export const themePresets = [
  {id:"sea",name:"海雾",color:"#4E8FC3"}, {id:"grove",name:"松林",color:"#5F9C70"},
  {id:"ember",name:"落日",color:"#D47643"}, {id:"iris",name:"鸢尾",color:"#8572B3"},
] as const;
export type ThemePreset = typeof themePresets[number]["id"] | "custom";
export const canvasPresets = [
  {id:"neutral",name:"素白",color:"#FCFBFA"}, {id:"mist",name:"雾蓝",color:"#EDF3F6"},
  {id:"sage",name:"浅苔",color:"#EEF3EB"}, {id:"sand",name:"暖砂",color:"#F5EFE4"},
  {id:"lilac",name:"淡紫",color:"#F1EDF5"},
] as const;
export function validThemeColor(value:unknown): value is string {return typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value);}
const channels=(hex:string)=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16));
function mix(a:string,b:string,weight:number){return "#"+channels(a).map((v,i)=>Math.round(v*(1-weight)+channels(b)[i]*weight).toString(16).padStart(2,"0")).join("");}
export function colorContrast(a:string,b:string){
  const luminance=(hex:string)=>channels(hex).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const aa=luminance(a),bb=luminance(b);return(Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);
}
function readable(color:string,background:string,dark:boolean){let result=color;for(let step=0;step<32&&colorContrast(result,background)<4.5;step++)result=mix(result,dark?"#ffffff":"#000000",.13);return colorContrast(result,background)>=4.5?result:colorContrast(background,dark?"#ffffff":"#000000")>=4.5?(dark?"#ffffff":"#000000"):colorContrast(background,"#ffffff")>colorContrast(background,"#000000")?"#ffffff":"#000000";}
export function resolveTheme(preferences:AppPreferences,systemDark:boolean){
  const dark=preferences.appTheme==="system"?systemDark:preferences.appTheme==="dark";
  const preset=themePresets.find(item=>item.id===preferences.themePreset)||themePresets[0];
  const accent=preferences.themePreset==="custom"&&validThemeColor(preferences.customAccent)?preferences.customAccent:preset.color;
  const canvasChoice=canvasPresets.find(item=>item.id===preferences.canvasPreset)||canvasPresets[0];
  const base=preferences.canvasPreset==="custom"&&validThemeColor(preferences.customCanvas)?preferences.customCanvas:canvasChoice.color;
  const neutral=(preferences.canvasPreset||"neutral")==="neutral";
  const canvas=dark?(neutral?"#1c2022":mix("#151a1c",base,.10)):base;
  const surfacesDark=colorContrast(canvas,"#ffffff")>colorContrast(canvas,"#000000");
  const textEndpoint=surfacesDark?"#ffffff":"#000000";
  const surfaceTone=(weight:number)=>{let color=mix(canvas,channels(canvas).every(c=>c>248)?"#262b2d":"#ffffff",weight);for(let i=0;i<24&&colorContrast(color,textEndpoint)<4.5;i++)color=mix(color,canvas,.25);return color;};
  const surface=neutral?(dark?"#252a2c":"#FBFAF9"):surfaceTone(surfacesDark?.06:channels(canvas).every(c=>c>248)?.025:.42);
  const mutedSurface=neutral?(dark?"#2b3133":"#F8F6F4"):surfaceTone(surfacesDark?.09:channels(canvas).every(c=>c>248)?.015:.15);
  const inset=neutral?(dark?"#343c3e":"#F5F2EF"):surfaceTone(surfacesDark?.14:channels(canvas).every(c=>c>248)?.04:.25);
  const accentSoft=mix(accent,surface,surfacesDark?.78:.90),accentInk=readable(accent,accentSoft,surfacesDark);
  const accessibleSurface=(start:string)=>{let result=start;for(let i=0;i<32&&colorContrast(result,textEndpoint)<4.5;i++)result=mix(result,canvas,.25);return colorContrast(result,textEndpoint)>=4.5?result:canvas;};
  const sidebar=canvas;
  const wash=accessibleSurface(mix(canvas,accent,surfacesDark?.12:.065));
  const backgrounds=[canvas,surface,mutedSurface,inset,sidebar,wash];
  const hardest=backgrounds.reduce((a,b)=>colorContrast(a,textEndpoint)<colorContrast(b,textEndpoint)?a:b);
  const ink=readable(surfacesDark?"#ecefea":"#202124",hardest,surfacesDark);
  const secondary=readable(surfacesDark?"#bfc8c5":"#5B5C60",hardest,surfacesDark);
  const muted=readable(surfacesDark?"#a0aba7":"#77797d",hardest,surfacesDark);
  const rgba=(hex:string,alpha:number)=>`rgba(${channels(hex).join(",")},${alpha})`;
  const onAccent=colorContrast(accent,"#ffffff")>=4.5?"#ffffff":"#000000";
  const tokens:Record<string,string>={
    "--sidebar":sidebar,"--accent-wash":wash,"--accent-wash-hover":accessibleSurface(mix(canvas,accent,surfacesDark?.18:.10)),"--accent-wash-ink":readable(accent,wash,surfacesDark),
    "--canvas":canvas,"--surface":surface,"--surface-muted":mutedSurface,"--surface-inset":inset,
    "--ink":ink,"--secondary":secondary,"--muted":muted,
    "--line":neutral?(dark?"#3a4345":"#ECE7E3"):mix(canvas,surfacesDark?"#ffffff":"#262b2d",.14),
    "--outline":neutral?(dark?"#566265":"#E2DDDA"):mix(canvas,surfacesDark?"#ffffff":"#262b2d",.24),
    "--accent":accent,"--accent-ink":accentInk,"--accent-soft":accentSoft,"--on-accent":onAccent,
    "--blue":accent,"--blue-deep":readable(accent,surface,surfacesDark),"--blue-text":accentInk,"--blue-soft":accentSoft,
    "--surface-selected":accentSoft,"--surface-hover":inset,
    "--solid":surfacesDark?"#e2e9e6":"#24292c","--on-solid":surfacesDark?"#1c2022":"#FCFBFA",
    "--orange-text":dark?"#eeb597":"#a9562d","--orange-soft":dark?"#47352c":"#FDEDE4",
    "--green-text":dark?"#a5d9b2":"#487C59","--green-soft":dark?"#2e4235":"#E8F3EA",
    "--danger":dark?"#f2b29b":"#a0472f","--danger-soft":dark?"#47352c":"#FDEDE4",
    "--frost":rgba(surface,.92),"--frost-control":rgba(mutedSurface,.94),
    "--frost-overlay":rgba(surface,.98),"--panel":surface,"--card":surface,
    "--shadow-control":dark?"0 4px 18px rgba(0,0,0,.16)":"0 4px 16px rgba(26,29,35,.04)",
    "--shadow-overlay":dark?"0 20px 64px rgba(0,0,0,.4)":"0 20px 64px rgba(26,29,35,.14)",
  };
  return {dark,accent,canvas,tokens};
}
export function themedReaderSettings(settings:ReaderSettings,dark:boolean):ReaderSettings {
  return dark?{...settings,pageColor:"#222729"}:settings;
}

