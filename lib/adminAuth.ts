/**
 * 後台登入的核心：HMAC 簽章 session token。
 * 特意只用 Web Crypto（globalThis.crypto.subtle）+ TextEncoder + btoa/atob，
 * 不用任何 Node-only API（Buffer / node:crypto），
 * 這樣同一份程式碼可同時跑在 Edge middleware 與 Node route handler。
 *
 * cookie 值 = base64url(payload).base64url(HMAC-SHA256(payload, SECRET))
 * payload = { sub:"admin", iat, exp }；不含密碼、也不含 secret。
 */

export const ADMIN_COOKIE = "gt_admin";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

// ── base64url / hex 編解碼（binary-safe，Edge 可用）──
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}

function base64UrlToStr(b64u: string): string {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// ── 常數時間比對（長度相等時逐字元 XOR；不提早 return）──
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSign(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return bytesToHex(new Uint8Array(buf));
}

/** 簽發一個 7 天有效的 session token。 */
export async function createSessionToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: "admin", iat: now, exp: now + TTL_SECONDS };
  const payloadB64 = strToBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * 驗證 token：重算 HMAC 常數時間比對 + 檢查 exp。
 * 任何解析/驗證失敗都回 false（fail-closed）。
 */
export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    if (!token || !secret) return false;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = await hmacSign(payloadB64, secret);
    if (!constantTimeEqual(sig, expected)) return false;
    const payload = JSON.parse(base64UrlToStr(payloadB64)) as { sub?: string; exp?: number };
    if (payload.sub !== "admin") return false;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 比對登入密碼：兩邊先 SHA-256 成固定長度 digest 再常數時間比對
 * （避免因輸入長度不同而洩漏資訊）。expected 未設回 false。
 */
export async function verifyPassword(input: string, expected: string | undefined): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256Hex(input), sha256Hex(expected)]);
  return constantTimeEqual(a, b);
}
