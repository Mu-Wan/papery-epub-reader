export class ResourceCache {
  constructor(maxBytes?: number, maxEntries?: number);
  bytes: number;
  entries: Map<string, unknown>;
  get<T extends string | Blob>(key: string, load: () => T | Promise<T>): Promise<T>;
  clear(): void;
}
export function openEpubArchive(source: string, sourceBlob?: Blob): Promise<{
  entries: unknown[];
  getSize: (name: string) => number;
  loadText: (name: string) => Promise<string> | null;
  loadBlob: (name: string, type?: string) => Promise<Blob> | null;
}>;
export function createEpubBook(source: string, sourceBlob?: Blob): Promise<unknown>;
export function fingerprintBuffer(buffer: ArrayBuffer): Promise<string>;
export function releaseReaderResources(source: string): void;
