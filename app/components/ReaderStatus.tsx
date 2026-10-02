"use client";
import { useEffect, useState } from "react";
import { Battery, BatteryCharging, Clock3 } from "./PaperyIcons";

type Power = { percent: number; charging: boolean };
type BrowserBattery = EventTarget & { level:number;charging:boolean };
export function ReaderStatus() {
  const [time,setTime]=useState(""),[power,setPower]=useState<Power|null>(null);
  useEffect(()=>{
    let stopped=false, battery:BrowserBattery|undefined;
    const updateBattery=()=>{if(battery&&!stopped)setPower({percent:Math.round(battery.level*100),charging:battery.charging})};
    const update=()=>{
      setTime(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false}));
      if("__TAURI_INTERNALS__" in window)void import("@tauri-apps/api/core").then(({invoke})=>invoke<Power|null>("device_power_status")).then(value=>{if(value&&!stopped)setPower(value)}).catch(()=>{});
    };
    const api=navigator as Navigator&{getBattery?:()=>Promise<BrowserBattery>};
    void api.getBattery?.().then(value=>{if(stopped)return;battery=value;updateBattery();battery.addEventListener("levelchange",updateBattery);battery.addEventListener("chargingchange",updateBattery)}).catch(()=>{});
    update();const timer=window.setInterval(update,30000);
    return()=>{stopped=true;clearInterval(timer);battery?.removeEventListener("levelchange",updateBattery);battery?.removeEventListener("chargingchange",updateBattery)};
  },[]);
  const PowerIcon=power?.charging?BatteryCharging:Battery;
  return <span className="readerStatus"><time aria-label={`当前时间 ${time}`}><Clock3 size={13}/>{time}</time><span aria-label={power?`电量 ${power.percent}%${power.charging?"，正在充电":""}`:"设备未提供电量"} title={power?undefined:"设备未提供电量"}><PowerIcon size={16}/>{power?`${power.percent}%`:"—"}</span></span>;
}
