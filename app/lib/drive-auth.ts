export const DRIVE_AUTH_CALLBACK = "https://mu-wan.github.io/papery-epub-reader/google-drive-callback.html";
export const DRIVE_AUTH_ORIGIN = "https://mu-wan.github.io";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const decode = (value: string) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), char => char.charCodeAt(0));
};

type PendingLogin = { state: string; key: CryptoKey; expires: number };
let pending: PendingLogin | null = null;
let generation = 0;

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            include_granted_scopes?: boolean;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let googleScript: Promise<void> | null = null;
export function loadGoogleIdentityServices() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = null;
      reject(new Error("无法加载 Google 授权服务，请检查网络后重试。"));
    };
    document.head.appendChild(script);
  });
  return googleScript;
}

export function cancelDriveLogin() {
  generation++;
  pending = null;
}

/** Prepare a direct Google authorization URL before the user presses the button. */
export async function startDriveLogin(clientId: string) {
  const id = clientId.trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error("请填写有效的 Google Web 应用客户端 ID");
  const currentGeneration = ++generation;
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const nonce = encode(crypto.getRandomValues(new Uint8Array(32)));
  const state = encode(encoder.encode(JSON.stringify({ version: 1, nonce, publicKey })));
  if (currentGeneration !== generation) throw new Error("Google 客户端 ID 已更改，请稍候再连接");
  pending = { state, key: pair.privateKey, expires: Date.now() + 10 * 60_000 };

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: id,
    redirect_uri: DRIVE_AUTH_CALLBACK,
    response_type: "token",
    scope: DRIVE_SCOPE,
    state,
    prompt: "select_account",
    include_granted_scopes: "true",
  }).toString();
  return url.toString();
}

export async function finishDriveLogin(input: string) {
  const session = pending;
  if (!session || session.expires < Date.now()) {
    pending = null;
    throw new Error("授权已过期或不属于本次连接，请重新点击“使用 Google 连接”");
  }

  let raw = input.trim();
  if (raw.startsWith("papery://")) {
    const url = new URL(raw);
    if (url.hostname !== "drive-auth") throw new Error("无效的授权返回地址");
    raw = url.hash.slice(1);
  }
  if (!raw || raw.length > 16_000) throw new Error("授权结果无效");

  let envelope: { state?: string; pub?: JsonWebKey; iv?: string; data?: string };
  try {
    envelope = JSON.parse(new TextDecoder().decode(decode(raw)));
  } catch {
    throw new Error("连接码格式不正确，请从 Google 授权返回页重新复制");
  }
  if (envelope.state !== session.state || !envelope.pub || !envelope.iv || !envelope.data) {
    throw new Error("授权结果不属于本次连接，请重新连接");
  }

  try {
    const publicKey = await crypto.subtle.importKey("jwk", envelope.pub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const key = await crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, session.key, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv), additionalData: encoder.encode(session.state) }, key, decode(envelope.data));
    const result = JSON.parse(new TextDecoder().decode(plain)) as { access_token?: string; expires_in?: number };
    const expiresIn = Number(result.expires_in);
    if (typeof result.access_token !== "string" || !result.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Google 返回了无效的授权结果");
    }
    if (pending !== session) throw new Error("授权已取消，请重新连接");
    pending = null;
    return { access_token: result.access_token, expires_in: Math.min(expiresIn, 3600) };
  } catch (error) {
    if (error instanceof Error && (error.message.includes("授权") || error.message.includes("Google 返回"))) throw error;
    throw new Error("连接码校验失败，请从本次 Google 授权返回页重新复制");
  }
}
