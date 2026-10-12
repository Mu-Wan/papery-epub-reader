import { loadSetting, loadStoredCover, cacheBookCover } from "./local-library";
import { boundedCoverDataUrl } from "./cover-thumbnail";

let queue:Promise<unknown>=Promise.resolve();
const pending=new Map<string,Promise<string|null>>();
/** Legacy cover reads and image decodes share one queue, including file retrieval. */
export function loadDisplayCover(id:string){
  const existing=pending.get(id);if(existing)return existing;
  const task=queue.then(async()=>{
    let value=await loadSetting<string>(`cover:${id}`);
    if(!value){const stored=await loadStoredCover(id);value=stored?.coverDataUrl||null;
      if(!value&&stored?.format==="EPUB")value=(await(await import("./book-cover")).readEpubMetadata(stored.blob)).coverDataUrl;
    }
    if(!value)return null;
    const thumbnail=await boundedCoverDataUrl(value);
    // Do not send an oversized undecodable legacy image to the gallery decoder again.
    const safe=thumbnail.length<80_000?thumbnail:null;
    if(safe)await cacheBookCover(id,safe);
    return safe;
  }).catch(()=>null).finally(()=>pending.delete(id));
  pending.set(id,task);queue=task;return task;
}
