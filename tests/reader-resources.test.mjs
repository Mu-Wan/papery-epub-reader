import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceCache, openEpubArchive, fingerprintBuffer, releaseReaderResources } from '../app/lib/reader-resources.mjs';
import { configure, ZipWriter, BlobWriter, TextReader } from '@zip.js/zip.js';
configure({ useWebWorkers: false });
test('EPUB ZIP resolves percent-encoded Unicode and reserved image filenames without changing case', async()=>{
  const writer=new ZipWriter(new BlobWriter());
  await writer.add('images/图 #1.JPG',new TextReader('image-bytes'));
  const archive=await openEpubArchive('encoded-illustration',await writer.close());
  assert.equal(await (await archive.loadBlob('images/%E5%9B%BE%20%231.JPG')).text(),'image-bytes');
  assert.equal(archive.loadBlob('images/图 #1.jpg'),null);
  releaseReaderResources('encoded-illustration');
});

async function fixture(text) {
  const writer = new ZipWriter(new BlobWriter('application/epub+zip'));
  await writer.add('chapter.xhtml', new TextReader(text));
  return writer.close();
}

test('Resource loads are deduplicated and cache eviction never invalidates returned data', async () => {
  const cache = new ResourceCache(8, 2);
  let loads = 0, finish;
  const load = () => { loads++; return new Promise(resolve => { finish = resolve; }); };
  const first = cache.get('a', load), second = cache.get('a', load);
  assert.equal(first, second);
  await Promise.resolve(); finish('abcd');
  assert.equal(await first, 'abcd'); assert.equal(loads, 1);
  const next = await cache.get('b', () => 'efgh');
  assert.equal(next, 'efgh'); assert.equal(await first, 'abcd');
  assert.ok(cache.bytes <= 8);
  cache.clear(); assert.equal(cache.bytes, 0);
  assert.equal(await first, 'abcd');
});

test('Failed extraction can be retried and an oversized resource is returned without retention', async () => {
  const cache = new ResourceCache(8);
  await assert.rejects(cache.get('a', () => { throw new Error('retry'); }), /retry/);
  assert.equal(await cache.get('a', () => 'ok'), 'ok');
  const big = new Blob(['123456789']);
  assert.equal(await cache.get('big', () => big), big);
  assert.equal(cache.entries.size, 0);
});

test('EPUB ZIP data remains byte-identical, uses real uncompressed sizes and isolates replaced sources', async () => {
  const text = '<html><body>原文定位。search marker。</body></html>';
  const blob = await fixture(text);
  const archive = await openEpubArchive('fixture-a', blob);
  assert.equal(await archive.loadText('chapter.xhtml'), text);
  assert.equal(await (await archive.loadBlob('chapter.xhtml', 'application/xhtml+xml')).text(), text);
  assert.equal(archive.getSize('chapter.xhtml'), new TextEncoder().encode(text).length);
  assert.equal(archive.loadText('missing.xhtml'), null);
  assert.equal(await openEpubArchive('fixture-a', blob), archive);
  const replacement = await openEpubArchive('fixture-a', await fixture('replaced'));
  assert.notEqual(replacement, archive);
  assert.equal(await replacement.loadText('chapter.xhtml'), 'replaced');
  assert.equal(await archive.loadText('chapter.xhtml'), text);
  releaseReaderResources('fixture-a');
  assert.equal(await archive.loadText('chapter.xhtml'), text);
});

test('PDF fingerprint memoization preserves SHA-256 integrity and distinguishes different buffers', async () => {
  const first = new TextEncoder().encode('abc').buffer;
  const one = fingerprintBuffer(first), two = fingerprintBuffer(first);
  assert.equal(one, two);
  assert.equal(await one, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(await fingerprintBuffer(new TextEncoder().encode('abd').buffer), await one);
});
