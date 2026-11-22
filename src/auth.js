// Password hashing (scrypt) and signed session cookies (HMAC-SHA256).
import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || (() => {
  console.warn("[auth] SESSION_SECRET is not set: sessions reset on every restart (set it in production)");
  return crypto.randomBytes(32).toString("hex");
})();

export function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pass, salt, 64);
  return `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function checkPassword(pass, stored) {
  const [, salt, key] = String(stored).split(":");
  if (!salt || !key) return false;
  const got = crypto.scryptSync(pass, Buffer.from(salt, "base64url"), 64);
  const want = Buffer.from(key, "base64url");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

export function makeSession(userId, days = 30) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + days * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const want = sign(payload);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return e > Date.now() ? u : null;
  } catch {
    return null;
  }
}

export const newId = (prefix = "") => prefix + crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
