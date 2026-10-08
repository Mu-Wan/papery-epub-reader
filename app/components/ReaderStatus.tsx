"use client";
import { useEffect, useState } from "react";
import { Clock3 } from "./PaperyIcons";
import { BatteryLevel } from "./BatteryLevel";
import { normalizeDevicePower, type DevicePower as Power } from "../lib/device-power";

type BrowserBattery = EventTarget & { level:number;charging:boolean };
export function ReaderStatus() {
  const [time,setTime]=useState(""),[power,setPower]=useState<Power|null>(null);
  useEffect(()=>{
    let stopped=false, battery:BrowserBattery|undefined, pending=false;
    const updateBattery=()=>{if(battery&&!stopped)setPower(normalizeDevicePower({percent:battery.level*100,charging:battery.charging}))};
    const update=()=>{
      setTime(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}));
      if("__TAURI_INTERNALS__" in window&&!pending){pending=true;void import("@tauri-apps/api/core").then(({invoke})=>invoke<Power|null>("device_power_status")).then(value=>{if(!stopped)setPower(normalizeDevicePower(value)|| (battery?normalizeDevicePower({percent:battery.level*100,charging:battery.charging}):null))}).catch(()=>{}).finally(()=>{pending=false})}
    };
    const api=navigator as Navigator&{getBattery?:()=>Promise<BrowserBattery>};
    void api.getBattery?.().then(value=>{if(stopped)return;battery=value;updateBattery();battery.addEventListener("levelchange",updateBattery);battery.addEventListener("chargingchange",updateBattery)}).catch(()=>{});
    update();const timer=window.setInterval(update,30000),visible=()=>{if(!document.hidden)update()};window.addEventListener("focus",update);document.addEventListener("visibilitychange",visible);
    return()=>{stopped=true;clearInterval(timer);window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",visible);battery?.removeEventListener("levelchange",updateBattery);battery?.removeEventListener("chargingchange",updateBattery)};
  },[]);
  return <span className="readerStatus"><time aria-label={`当前时间 ${time}`}><Clock3 size={13}/>{time}</time><span aria-label={power?`电量 ${power.percent}%${power.charging?"，正在充电":""}`:"设备未提供电量"} title={power?undefined:"设备未提供电量"}><BatteryLevel percent={power?.percent} charging={power?.charging}/>{power?`${power.percent}%`:"—"}</span></span>;
}
