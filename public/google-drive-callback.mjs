const $ = id => document.getElementById(id);
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const decode = value => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), char => char.charCodeAt(0));
};

function showError(message) {
  $("title").textContent = "Google 授权未完成";
  $("description").textContent = "Papery 没有收到有效的授权结果。";
  $("spinner").hidden = true;
  $("status").className = "status error";
  $("status").textContent = message;
}

async function encryptReturn(state, request, accessToken, expiresIn) {
  const appPublicKey = await crypto.subtle.importKey("jwk", request.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "ECDH", public: appPublicKey }, pair.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(state) }, key, payload);
  return encode(encoder.encode(JSON.stringify({
    state,
    pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
    iv: encode(iv),
    data: encode(new Uint8Array(encrypted)),
  })));
}

try {
  const fragment = location.hash.slice(1);
  history.replaceState(null, "", location.pathname + location.search);
  const response = new URLSearchParams(fragment);
  const authError = response.get("error");
  if (authError) throw new Error(authError === "access_denied" ? "Google 权限未获批准。回到 Papery 后重新连接并允许访问。" : `Google 返回错误：${authError}`);

  const token = response.get("access_token");
  const state = response.get("state");
  const grantedScopes = response.get("scope")?.split(/\s+/) ?? [];
  const expiresIn = Number(response.get("expires_in"));
  if (!token || !state || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 7200) {
    throw new Error("返回内容缺少有效令牌或状态信息。请回到 Papery 重新发起连接。");
  }
  if (!grantedScopes.includes("https://www.googleapis.com/auth/drive.appdata")) {
    throw new Error("Google 未授予 Papery 所需的 Drive 应用数据权限。请回到 Papery 重新连接并允许访问。");
  }

  let request;
  try { request = JSON.parse(new TextDecoder().decode(decode(state))); }
  catch { throw new Error("授权状态无法读取，请回到 Papery 重新发起连接。"); }
  const publicKey = request?.publicKey;
  if (request?.version !== 1 || typeof request.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(request.nonce)
    || publicKey?.kty !== "EC" || publicKey?.crv !== "P-256"
    || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.x || "") || !/^[A-Za-z0-9_-]{43}$/.test(publicKey.y || "")) {
    throw new Error("授权状态无效或已损坏。请回到 Papery 重新发起连接。");
  }

  const code = await encryptReturn(state, request, token, expiresIn);
  $("code").value = code;
  $("fallback").hidden = false;
  $("status").textContent = "正在打开 Papery…若没有自动返回，可复制下方加密连接码。";
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      $("copy").textContent = "已复制";
    } catch {
      $("code").focus();
      $("code").select();
      $("status").textContent = "已选中连接码，请复制后返回 Papery。";
    }
  });

  window.setTimeout(() => {
    location.href = `papery://drive-auth#${code}`;
    window.setTimeout(() => {
      $("status").textContent = "若 Papery 没有打开，请使用上方的加密连接码完成连接。";
      $("spinner").hidden = true;
    }, 1800);
  }, 220);
} catch (error) {
  showError(error instanceof Error ? error.message : "连接失败，请回到 Papery 重试。");
}
