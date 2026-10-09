/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfModule: Promise<any> | null = null;

// Use Function constructor to bypass bundler static analysis of dynamic import()
const dynamicImport = new Function(
  "url",
  "return import(url)"
) as (url: string) => Promise<any>;

export function pdfDocumentOptions(data: ArrayBuffer) {
  return { data, cMapUrl: "/vendor/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/standard_fonts/" };
}
export function loadPdfJs(): Promise<any> {
  if (!pdfModule) {
    pdfModule = dynamicImport("/vendor/pdf.mjs").then(module=>{module.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.min.mjs";return module}).catch(error=>{pdfModule=null;throw error});
  }
  return pdfModule;
}
