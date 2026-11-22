// Instagram Direct through "Instagram API with Instagram Login" (Business Login, no Facebook Page needed).
// The owner presses "Connect Instagram", logs in on instagram.com, and Reza receives a token for that
// professional account. Webhooks bring Direct messages; replies go back through the Send API.
import crypto from "node:crypto";
import { q, getBusiness, updateDoc } from "./db.js";
import { handleClientMessage } from "./telegram.js";

const APP_ID = process.env.INSTAGRAM_APP_ID;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
// base URLs can be pointed at a local mock in tests
const GRAPH_BASE = process.env.IG_GRAPH_BASE || "https://graph.instagram.com";
const API_BASE = process.env.IG_API_BASE || "https://api.instagram.com";
const GRAPH = `${GRAPH_BASE}/v27.0`;
export const igConfigured = () => !!(APP_ID && APP_SECRET);
export const IG_SCOPES = "instagram_business_basic,instagram_business_manage_messages";
// the string the owner of the Meta app types into "Verify token" in the webhooks settings
export const igVerifyToken = () => process.env.INSTAGRAM_VERIFY_TOKEN || "";

// ---------- token encryption at rest (AES-256-GCM, key from SESSION_SECRET) ----------
const KEY = crypto.createHash("sha256").update(`${process.env.SESSION_SECRET || "dev"}|instagram`).digest();
const seal = (text) => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
};
const open = (box) => {
  const [iv, tag, enc] = String(box).split(".").map((x) => Buffer.from(x, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
};

export async function migrateInstagram() {
  await q(`create table if not exists ig_accounts (
    ig_id text primary key,
    business_id text not null references businesses(id) on delete cascade,
    username text,
    token text not null,
    expires_at timestamptz,
    updated_at timestamptz not null default now())`);
}

const first = (j) => (j && Array.isArray(j.data) ? j.data[0] : j) || {};

export function authorizeUrl(redirectUri, state) {
  const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: redirectUri, response_type: "code", scope: IG_SCOPES, state, enable_fb_login: "false" });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

// code → short-lived token → long-lived token (≈60 days) → account id → webhook subscription
export async function connectAccount(businessId, code, redirectUri) {
  const form = new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const r1 = await fetch(`${API_BASE}/oauth/access_token`, { method: "POST", body: form });
  const short = first(await r1.json());
  if (!short.access_token) throw new Error("code exchange failed");
  if (!String(short.permissions || IG_SCOPES).includes("instagram_business_manage_messages")) throw new Error("messages permission not granted");

  const r2 = await fetch(`${GRAPH_BASE}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: APP_SECRET, access_token: short.access_token })}`);
  const long = await r2.json();
  const token = long.access_token || short.access_token;
  const expires = new Date(Date.now() + (long.expires_in || 3600) * 1000);

  const me = first(await (await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`)).json());
  const igId = String(me.user_id || "");
  if (!igId) throw new Error("account id missing");

  const sub = await (await fetch(`${GRAPH}/${igId}/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages", access_token: token })}`, { method: "POST" })).json();
  if (!sub.success) console.warn("[ig] webhook subscription:", JSON.stringify(sub).slice(0, 200));

  await q(`insert into ig_accounts (ig_id, business_id, username, token, expires_at, updated_at) values ($1,$2,$3,$4,$5,now())
           on conflict (ig_id) do update set business_id = excluded.business_id, username = excluded.username, token = excluded.token, expires_at = excluded.expires_at, updated_at = now()`,
    [igId, businessId, me.username || null, seal(token), expires]);
  await updateDoc(businessId, (d) => { d.ig = { connected: true, username: me.username || "", ts: Date.now() }; d.channels = { ...(d.channels || {}), instagram: true }; });
  return { username: me.username };
}

export async function disconnectAccount(businessId) {
  await q(`delete from ig_accounts where business_id = $1`, [businessId]);
  await updateDoc(businessId, (d) => { d.ig = null; if (d.channels) d.channels.instagram = false; });
}

// Messages this server sent: Instagram echoes them back and they must not count as the owner typing.
const sentMids = new Set(), seenMids = new Set();
const remember = (set, id) => { if (!id) return; set.add(id); if (set.size > 2000) set.delete(set.values().next().value); };

export async function igSend(igId, recipient, text) {
  const acc = (await q(`select * from ig_accounts where ig_id = $1`, [String(igId)]))[0];
  if (!acc) return null;
  const body = { recipient: { id: String(recipient) }, message: { text: truncateBytes(text, 1000) } };
  try {
    const r = await fetch(`${GRAPH}/${acc.ig_id}/messages`, { method: "POST", headers: { authorization: `Bearer ${open(acc.token)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.message_id) remember(sentMids, j.message_id); else console.error("[ig] send:", JSON.stringify(j).slice(0, 300));
    return j;
  } catch (err) { console.error("[ig] send failed", err.message); return null; }
}
function truncateBytes(s, max) {
  let out = String(s); while (Buffer.byteLength(out, "utf8") > max) out = out.slice(0, -2) + "…";
  return out;
}

export function validSignature(rawBody, header) {
  if (!APP_SECRET || !header || !header.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  const got = header.slice(7);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

async function senderName(acc, igsid) {
  try { // not every account exposes this; fall back to a neutral label
    const j = await (await fetch(`${GRAPH}/${igsid}?${new URLSearchParams({ fields: "name,username", access_token: open(acc.token) })}`)).json();
    if (j.username) return j.name ? `${j.name} (@${j.username})` : `@${j.username}`;
  } catch {}
  return `Instagram ·${String(igsid).slice(-4)}`;
}

// One webhook delivery may hold several events; each sender is handled in order.
const queues = new Map();
export async function handleWebhook(payload) {
  if (payload?.object !== "instagram") return;
  for (const entry of payload.entry || []) {
    const igId = String(entry.id);
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      if (!m || typeof m.text !== "string" || m.is_deleted || m.is_unsupported) continue;
      if (m.mid && seenMids.has(m.mid)) continue; // Meta retries deliveries
      remember(seenMids, m.mid);
      const echo = !!m.is_echo;
      if (echo && sentMids.has(m.mid)) continue; // our own AI reply
      const client = String(echo ? ev.recipient?.id : ev.sender?.id);
      const key = igId + ":" + client;
      const job = (queues.get(key) || Promise.resolve()).then(() => handleEvent(igId, client, m.text, echo)).catch((e) => console.error("[ig] event failed", e));
      queues.set(key, job); job.finally(() => { if (queues.get(key) === job) queues.delete(key); });
    }
  }
}

async function handleEvent(igId, igsid, text, ownerWrote) {
  const acc = (await q(`select * from ig_accounts where ig_id = $1`, [igId]))[0];
  if (!acc) return;
  const convoId = "ig" + igsid;
  if (ownerWrote) { // the owner answered from the Instagram app: keep it and pause the AI here
    await updateDoc(acc.business_id, (d) => {
      let c = d.convos.find((x) => x.id === convoId);
      if (!c) { c = { id: convoId, name: `Instagram ·${igsid.slice(-4)}`, ch: "IG", status: "ai", human: false, read: true, ts: Date.now(), igsid, msgs: [] }; d.convos.push(c); }
      c.msgs.push({ from: "owner", text, ts: Date.now() });
      if (d.guard?.pause !== false && !c.human) { c.human = true; c.msgs.push({ from: "sys", text: "note_takeover", key: true, ts: Date.now() }); }
      c.ts = Date.now();
    });
    return;
  }
  const row = await getBusiness("id", acc.business_id);
  const known = row?.doc.convos.find((c) => c.id === convoId);
  const who = known?.name || (await senderName(acc, igsid));
  await handleClientMessage(acc.business_id, null, who, text.slice(0, 2000), {
    ch: "IG", convoId, igsid, send: (t) => igSend(igId, igsid, t),
  });
}

// Long-lived tokens last ~60 days; refresh the ones that expire within 20 days (called from the hourly cron).
export async function refreshTokens() {
  const rows = await q(`select * from ig_accounts where expires_at is null or expires_at < now() + interval '20 days'`);
  for (const acc of rows) {
    try {
      const j = await (await fetch(`${GRAPH_BASE}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: open(acc.token) })}`)).json();
      if (j.access_token) await q(`update ig_accounts set token = $2, expires_at = $3, updated_at = now() where ig_id = $1`, [acc.ig_id, seal(j.access_token), new Date(Date.now() + (j.expires_in || 5184000) * 1000)]);
    } catch (err) { console.error("[ig] refresh failed", acc.ig_id, err.message); }
  }
}

export async function igIdForBusiness(businessId) {
  return (await q(`select ig_id from ig_accounts where business_id = $1 limit 1`, [businessId]))[0]?.ig_id || null;
}
