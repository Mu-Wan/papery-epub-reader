/** Android exposes only safe-area measurements and a volume paging switch. */
type AndroidReaderBridge = {
  getWindowInsets:()=>string;
  setVolumePagingEnabled:(enabled:boolean)=>void;
  getPerformanceProfile?:()=>string;
};
type ReaderWindow = Window & { PaperyReader?: AndroidReaderBridge };

export function installMobileInsets() {
  const runtime=window as ReaderWindow;
  const update=()=>{
    try {
      if(!runtime.PaperyReader)return;
      const insets=JSON.parse(runtime.PaperyReader!.getWindowInsets()) as Record<string,number>;
      for (const edge of ["top","right","bottom","left"]) {
        const value=insets[edge];
        if (Number.isFinite(value)&&value>=0) document.documentElement.style.setProperty(`--native-safe-${edge}`,`${value}px`);
      }
    } catch { /* Browser builds fall back to CSS env() values. */ }
  };
  const viewport=window.visualViewport;
  const updateHeight=()=>{
    const height=viewport?.height??window.innerHeight;
    if(Number.isFinite(height)&&height>0)document.documentElement.style.setProperty("--visible-height",`${height}px`);
    const top=viewport?.offsetTop??0;
    if(Number.isFinite(top)&&top>=0)document.documentElement.style.setProperty("--visible-top",`${top}px`);
  };
  update();
  updateHeight();
  window.addEventListener("papery-window-insets",update);
  viewport?.addEventListener("resize",updateHeight);
  viewport?.addEventListener("scroll",updateHeight);
  window.addEventListener("resize",updateHeight);
  return ()=>{window.removeEventListener("papery-window-insets",update);viewport?.removeEventListener("resize",updateHeight);viewport?.removeEventListener("scroll",updateHeight);window.removeEventListener("resize",updateHeight)};
}

export function isLowMemoryDevice() {
  try {
    const bridge=(window as ReaderWindow).PaperyReader;
    if(bridge?.getPerformanceProfile)return JSON.parse(bridge.getPerformanceProfile()).lowMemory===true;
  } catch { /* Fall back to browser capabilities. */ }
  const memory=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
  return memory!==undefined ? memory<=2 : navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=2;
}

export function installVolumePaging(enabled:boolean,onPage:(direction:"next"|"prev")=>void) {
  const runtime=window as ReaderWindow;
  const update=()=>runtime.PaperyReader?.setVolumePagingEnabled(enabled&&!document.hidden);
  const page=(event:Event)=>{
    if (!enabled||document.hidden||document.querySelector('[role="dialog"][aria-modal="true"]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return;
    const direction=(event as CustomEvent<{direction:string}>).detail?.direction;
    if (direction==="next"||direction==="prev") onPage(direction);
  };
  update();
  document.addEventListener("visibilitychange",update);
  window.addEventListener("papery-volume-page",page);
  return ()=>{
    runtime.PaperyReader?.setVolumePagingEnabled(false);
    document.removeEventListener("visibilitychange",update);
    window.removeEventListener("papery-volume-page",page);
  };
}
