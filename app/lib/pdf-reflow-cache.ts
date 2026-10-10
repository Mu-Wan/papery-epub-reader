export const PDF_REFLOW_VERSION = 2;
export type PdfReflowCache = { version:number; fingerprint:string; bytes:number; pageCount:number; pages:string[] };
export function validPdfReflowCache(value:unknown,fingerprint:string,bytes:number,pageCount:number):value is PdfReflowCache {
  const cache=value as PdfReflowCache|null;
  return !!fingerprint&&bytes>0&&Number.isInteger(pageCount)&&pageCount>0&&!!cache&&cache.version===PDF_REFLOW_VERSION&&cache.fingerprint===fingerprint
    &&cache.bytes===bytes&&cache.pageCount===pageCount&&Array.isArray(cache.pages)
    &&cache.pages.length===pageCount&&cache.pages.every(page=>typeof page==="string");
}
