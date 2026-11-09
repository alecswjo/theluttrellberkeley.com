// Shared-password sign-in. The session cookie is an HMAC-signed expiry; the signing key is derived
// from ADMIN_PASSWORD, so changing the password signs everyone out.

const enc = new TextEncoder();
const COOKIE = "luttrell_admin";
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function key(env) {
  return crypto.subtle.importKey("raw", enc.encode(`luttrell-session:${env.ADMIN_PASSWORD}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function sessionCookie(env) {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = await crypto.subtle.sign("HMAC", await key(env), enc.encode(payload));
  return `${COOKIE}=${payload}.${b64url(sig)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function isSignedIn(request, env) {
  const raw = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(env), fromB64url(sig), enc.encode(payload));
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export async function passwordMatches(given, env) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(given))),
    crypto.subtle.digest("SHA-256", enc.encode(env.ADMIN_PASSWORD)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Failed-attempt limit per IP. Uses the LIMITS KV binding when present (shared across Cloudflare
// locations); otherwise falls back to this isolate's memory, which still slows down guessing.
const memory = new Map();

export async function tooManyFails(ip, env) {
  const rec = env.LIMITS ? await env.LIMITS.get(`fail:${ip}`, "json") : memory.get(ip);
  return Boolean(rec && rec.reset > Date.now() && rec.count >= MAX_FAILS);
}

export async function recordFail(ip, env) {
  const now = Date.now();
  let rec = env.LIMITS ? await env.LIMITS.get(`fail:${ip}`, "json") : memory.get(ip);
  if (!rec || rec.reset < now) rec = { count: 0, reset: now + FAIL_WINDOW_MS };
  rec.count += 1;
  if (env.LIMITS) await env.LIMITS.put(`fail:${ip}`, JSON.stringify(rec), { expirationTtl: FAIL_WINDOW_MS / 1000 });
  else memory.set(ip, rec);
}

export async function clearFails(ip, env) {
  if (env.LIMITS) await env.LIMITS.delete(`fail:${ip}`);
  else memory.delete(ip);
}
