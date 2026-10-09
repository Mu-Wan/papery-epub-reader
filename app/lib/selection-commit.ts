/** A delayed mouseup must never read the selection from a newer drag. */
export function createSelectionCommitGuard(later=(work:()=>void)=>setTimeout(work,0),cancel=(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)) {
  let pressed=false,epoch=0,timer:ReturnType<typeof setTimeout>|undefined;
  const reset=()=>{epoch++;if(timer!==undefined)cancel(timer);timer=undefined;};
  return {
    down(event:{button:number}){reset();pressed=event.button===0;},
    up(event:{button:number;buttons:number},commit:()=>void){
      if(event.button!==0||event.buttons!==0||!pressed)return;
      pressed=false;const token=epoch;
      timer=later(()=>{timer=undefined;if(!pressed&&epoch===token)commit();});
    },
    cancel(){reset();pressed=false;},
  };
}
