"use client";
import {useEffect,useMemo,useSyncExternalStore} from "react";
import type {AppPreferences} from "../lib/reader-types";
import {resolveTheme} from "../lib/app-theme";
const subscribe=(notify:()=>void)=>{const query=window.matchMedia("(prefers-color-scheme: dark)");if(query.addEventListener){query.addEventListener("change",notify);return()=>query.removeEventListener("change",notify);}query.addListener(notify);return()=>query.removeListener(notify);};
const snapshot=()=>window.matchMedia("(prefers-color-scheme: dark)").matches;
export function useAppTheme(preferences:AppPreferences){
  const systemDark=useSyncExternalStore(subscribe,snapshot,()=>false);
  const theme=useMemo(()=>resolveTheme(preferences,systemDark),[preferences,systemDark]);
  useEffect(()=>{const root=document.documentElement;for(const [key,value]of Object.entries(theme.tokens))root.style.setProperty(key,value);root.style.colorScheme=theme.dark?"dark":"light";root.style.backgroundColor=theme.tokens["--canvas"];root.dataset.appearance=theme.dark?"dark":"light";},[theme]);
  return theme;
}
