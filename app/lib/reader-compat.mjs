// Foliate's EPUB metadata parser uses ES2024 grouping APIs. Older system
// WebViews still receive the same reader with these narrowly scoped fallbacks.
export function ensureReaderCompatibility(scope = globalThis) {
  const { Object: O, Map: M, Array: A, Promise: P } = scope;
  if (typeof O.groupBy !== 'function') O.defineProperty(O, 'groupBy', {
    configurable: true, writable: true,
    value(items, callback) {
      if (typeof callback !== 'function') throw new TypeError('Grouping callback must be a function');
      const result = O.create(null); let index = 0;
      for (const item of items) {
        const key = Reflect.ownKeys({ [callback(item, index++)]: 0 })[0];
        if (result[key]) result[key].push(item); else result[key] = [item];
      }
      return result;
    },
  });
  if (typeof M.groupBy !== 'function') O.defineProperty(M, 'groupBy', {
    configurable: true, writable: true,
    value(items, callback) {
      if (typeof callback !== 'function') throw new TypeError('Grouping callback must be a function');
      const result = new M(); let index = 0;
      for (const item of items) { const key = callback(item, index++), values = result.get(key); if (values) values.push(item); else result.set(key, [item]); }
      return result;
    },
  });
  for (const name of ['findLast', 'findLastIndex']) if (typeof A.prototype[name] !== 'function') O.defineProperty(A.prototype, name, {
    configurable: true, writable: true,
    value(callback, thisArg) {
      if (this == null || typeof callback !== 'function') throw new TypeError('Invalid reverse search');
      const object = O(this), length = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(object.length) || 0)));
      for (let index = length - 1; index >= 0; index--) if (callback.call(thisArg, object[index], index, object)) return name === 'findLast' ? object[index] : index;
      return name === 'findLast' ? undefined : -1;
    },
  });
  if (typeof A.prototype.at !== 'function') O.defineProperty(A.prototype, 'at', {
    configurable: true, writable: true,
    value(index) {
      if (this == null) throw new TypeError('Invalid array');
      const object = O(this), length = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(object.length) || 0))), relative = Math.trunc(Number(index)) || 0, position = relative < 0 ? length + relative : relative;
      return position < 0 || position >= length ? undefined : object[position];
    },
  });
  if (typeof P.withResolvers !== 'function') O.defineProperty(P, 'withResolvers', {
    configurable: true, writable: true,
    value() { let resolve, reject; const promise = new this((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; },
  });
}
ensureReaderCompatibility();
