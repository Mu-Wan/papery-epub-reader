import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadResumableBlob } from "../app/lib/drive-upload.ts";

const MiB = 1024 * 1024;

test("resumable Drive uploads continue from the exact byte reported by Google", async () => {
  const originalFetch = globalThis.fetch;
  const ranges = [];
  const replies = [
    new Response(null, { status: 308, headers: { Range: `bytes=0-${4 * MiB - 1}` } }),
    new Response(null, { status: 308, headers: { Range: `bytes=0-${12 * MiB - 1}` } }),
    new Response(null, { status: 201 }),
  ];
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init.headers);
    ranges.push(headers.get("Content-Range"));
    return replies.shift();
  };

  try {
    await uploadResumableBlob(
      "https://www.googleapis.com/upload/drive/v3/files/session",
      new Blob([new Uint8Array(17 * MiB)]),
      (url, init) => globalThis.fetch(url, init),
    );
    assert.deepEqual(ranges, [
      `bytes 0-${8 * MiB - 1}/${17 * MiB}`,
      `bytes ${4 * MiB}-${12 * MiB - 1}/${17 * MiB}`,
      `bytes ${12 * MiB}-${17 * MiB - 1}/${17 * MiB}`,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a dropped chunk response is reconciled with Drive before sending more data", async () => {
  const originalFetch = globalThis.fetch;
  const ranges = [];
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init.headers);
    ranges.push(headers.get("Content-Range"));
    call++;
    if (call === 1) throw new TypeError("connection reset");
    if (call === 2) return new Response(null, { status: 308, headers: { Range: "bytes=0-262143" } });
    return new Response(null, { status: 201 });
  };

  try {
    await uploadResumableBlob(
      "https://www.googleapis.com/upload/drive/v3/files/session",
      new Blob([new Uint8Array(512 * 1024)]),
      (url, init) => globalThis.fetch(url, init),
      () => true,
      256 * 1024,
    );
    assert.deepEqual(ranges, [
      "bytes 0-262143/524288",
      "bytes */524288",
      "bytes 262144-524287/524288",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive upload chunk sizes follow the required 256 KiB boundary", async () => {
  await assert.rejects(
    () => uploadResumableBlob("https://www.googleapis.com/upload/drive/v3/files/session", new Blob(["x"]), async () => new Response(null, { status: 201 }), () => true, 300_000),
    /256 KiB/,
  );
});

test("permission failures are reported instead of being mistaken for expired sessions", async () => {
  let calls = 0;
  await assert.rejects(
    () => uploadResumableBlob(
      "https://www.googleapis.com/upload/drive/v3/files/session",
      new Blob(["snapshot"]),
      async () => {
        calls++;
        return new Response(null, { status: 403 });
      },
    ),
    /Google Drive 上传失败（403）/,
  );
  assert.equal(calls, 1);
});
