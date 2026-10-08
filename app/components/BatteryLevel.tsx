import { batteryFillWidth } from "../lib/device-power";
export function BatteryLevel({ percent, charging }: { percent?: number; charging?: boolean }) {
  return <svg className="paperyIcon batteryLevel" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="7" width="17" height="10" rx="1.5"/><path d="M21 10v4"/>
    {percent !== undefined ? <rect x="4" y="9" width={batteryFillWidth(percent)} height="6" rx=".5" fill="currentColor" stroke="none" opacity={charging ? .32 : .8}/> : <path d="M9 10a2 2 0 0 1 3-1c2 1-1 2-1 3m0 2h.01"/>}
    {charging && <path d="m12 5-4 7h5l-3 7" strokeWidth="1.8"/>}
  </svg>;
}
