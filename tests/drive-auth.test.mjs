import { test } from "node:test";
import assert from "node:assert/strict";
import { startDriveLogin, finishDriveLogin, cancelDriveLogin, DRIVE_AUTH_CALLBACK } from "../app/lib/drive-auth.ts";

const encode = bytes => Buffer.from(bytes).toString("base64url");
const decode = value => Buffer.from(value, "base64url");

async function encryptedReturn(state, stateOverride) {
  const request = JSON.parse(decode(state).toString());
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const publicKey = await crypto.subtle.importKey("jwk", request.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const key = await crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, pair.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ access_token: "test-token", expires_in: 3600 }));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(state) }, key, plaintext);
  return encode(JSON.stringify({
    state: stateOverride ?? state,
    pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
  }));
}

test("Native authorization opens Google directly and accepts only its encrypted one-time return", async () => {
  const url = new URL(await startDriveLogin("test.apps.googleusercontent.com"));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "token");
  assert.equal(url.searchParams.get("redirect_uri"), DRIVE_AUTH_CALLBACK);
  assert.equal(url.searchParams.has("client_secret"), false);

  const state = url.searchParams.get("state");
  const request = JSON.parse(decode(state).toString());
  assert.equal(request.version, 1);
  assert.match(request.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(request.publicKey.crv, "P-256");

  await assert.rejects(() => finishDriveLogin("bad"), /连接码格式/);
  await assert.rejects(async () => finishDriveLogin(await encryptedReturn(state, "wrong-state")), /本次连接/);
  const result = await finishDriveLogin(`papery://drive-auth#${await encryptedReturn(state)}`);
  assert.deepEqual(result, { access_token: "test-token", expires_in: 3600 });
  await assert.rejects(() => finishDriveLogin("already-used"), /过期/);
});

test("Cancelled or superseded authorization cannot connect", async () => {
  const oldUrl = new URL(await startDriveLogin("test.apps.googleusercontent.com"));
  const oldState = oldUrl.searchParams.get("state");
  await startDriveLogin("test.apps.googleusercontent.com");
  await assert.rejects(async () => finishDriveLogin(await encryptedReturn(oldState)), /本次连接/);
  cancelDriveLogin();
  await assert.rejects(async () => finishDriveLogin(await encryptedReturn(oldState)), /过期/);
  await assert.rejects(() => startDriveLogin("not-a-client"), /客户端 ID/);
});
