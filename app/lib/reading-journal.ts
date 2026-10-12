type Saved={progress:number;currentLocation?:string;updatedAt:number;progressUpdatedAt?:number};
/** Metadata changes have their own freshness and cannot invalidate a newer reading journal. */
export function recoverReadingProgress(record:Saved,raw:string|null):{progress:number;currentLocation?:string}{
 const saved={progress:record.progress,currentLocation:record.currentLocation};if(!raw)return saved;
 try{const journal=JSON.parse(raw) as {p?:number;l?:string;t?:number;pending?:boolean};
  if(typeof journal.l!=="string"||!journal.l||journal.l.length>8192||!Number.isFinite(journal.p)||journal.p!<0||journal.p!>100||!Number.isFinite(journal.t)||journal.t!<=0)return saved;
  const stamp=record.progressUpdatedAt??record.updatedAt;
  return journal.pending===true||journal.t!>=stamp||!record.currentLocation?{progress:journal.p!,currentLocation:journal.l}:saved;
 }catch{return saved;}
}
