// Cache immutable extracted data, never EPUB instances, documents or blob URLs.
// Each reading session still owns its own Foliate Loader and resource refcounts.
export class ResourceCache {
  constructor(maxBytes = 6 * 1024 * 1024, maxEntries = 256) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.entries = new Map();
    this.bytes = 0;
  }
  get(key, load) {
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.entries.set(key, previous);
      return previous.promise;
    }
    const entry = { bytes: 0, promise: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    entry.promise.then(value => {
      if (this.entries.get(key) !== entry) return;
      entry.bytes = typeof value === 'string' ? value.length * 2 : value?.size || 0;
      this.bytes += entry.bytes;
      this.trim();
    }, () => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    this.trim();
    return entry.promise;
  }
  trim() {
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const [key, entry] = this.entries.entries().next().value;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}

const archives = new Map();
const fingerprints = new WeakMap();

export function openEpubArchive(source, sourceBlob) {
  const previous = archives.get(source);
  if (previous && previous.blob === sourceBlob) {
    archives.delete(source); archives.set(source, previous);
    return previous.promise;
  }
  const entry = { blob: sourceBlob, cache: new ResourceCache(), promise: null };
  entry.promise = (async () => {
    const file = sourceBlob || await fetch(source).then(response => {
      if (!response.ok) throw new Error('读取文件失败');
      return response.blob();
    });
    const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } = await import('foliate-js/vendor/zip.js');
    configure({ useWebWorkers: false });
    const reader = new ZipReader(new BlobReader(file));
    const entries = await reader.getEntries();
    const map = new Map(entries.map(item => [item.filename, item]));
    return {
      entries,
      getSize: name => map.get(name)?.uncompressedSize || 0,
      loadText: name => map.has(name)
        ? entry.cache.get(`text:${name}`, () => map.get(name).getData(new TextWriter())) : null,
      loadBlob: (name, type) => map.has(name)
        ? entry.cache.get(`blob:${type || ''}:${name}`, () => map.get(name).getData(new BlobWriter(type))) : null,
    };
  })();
  archives.set(source, entry);
  entry.promise.catch(() => { if (archives.get(source) === entry) archives.delete(source); });
  // At most two directory indexes and 12 MiB of extracted data are retained.
  while (archives.size > 2) {
    const key = archives.keys().next().value;
    archives.get(key).cache.clear(); archives.delete(key);
  }
  return entry.promise;
}

export async function createEpubBook(source, sourceBlob) {
  const [loader, { EPUB }] = await Promise.all([
    openEpubArchive(source, sourceBlob), import('foliate-js/epub.js'),
  ]);
  // The raw ZIP loader is reusable; the book and transformed resources are not.
  return new EPUB(loader).init();
}

export function fingerprintBuffer(buffer) {
  const previous = fingerprints.get(buffer);
  if (previous) return previous;
  const promise = crypto.subtle.digest('SHA-256', buffer).then(hash =>
    Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''));
  fingerprints.set(buffer, promise);
  promise.catch(() => fingerprints.delete(buffer));
  return promise;
}

export function releaseReaderResources(source) {
  archives.get(source)?.cache.clear(); archives.delete(source);
}
