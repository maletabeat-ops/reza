// Reza server: dashboard API, public catalogue API, Telegram webhook, reminders and the web app.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import crypto from "node:crypto";
import { initDb, q, getBusiness, updateDoc, fixRow } from "./db.js";
import { hashPassword, checkPassword, makeSession, readSession, newId } from "./auth.js";
import { mergeDoc } from "./merge.js";
import { buildSystem, applyDecision, freeSlots, slotFree, localNow, addDaysIso, TZ_DEFAULT, uid } from "./logic.js";
import { decide, importPrices, aiConfigured } from "./ai.js";
import { handleUpdate, setupTelegram, sendText, notifyOwner, getBotUsername, tgConfigured, WEBHOOK_SECRET } from "./telegram.js";
import { tx, fmtDay } from "./i18n.js";
import { igConfigured, igVerifyToken, authorizeUrl, connectAccount, disconnectAccount, igSend, validSignature, handleWebhook as handleIgWebhook, refreshTokens, igIdForBusiness, migrateInstagram } from "./instagram.js";

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const PROD = process.env.NODE_ENV === "production";
const app = new Hono();

// ---------- helpers ----------
const COOKIE = "reza_session";
async function currentUser(c) {
  const id = readSession(getCookie(c, COOKIE));
  if (!id) return null;
  return (await q(`select id, email, name from users where id = $1`, [id]))[0] || null;
}
function startSession(c, userId) {
  setCookie(c, COOKIE, makeSession(userId), { httpOnly: true, secure: PROD, sameSite: "Lax", path: "/", maxAge: 30 * 86400 });
}
const bad = (c, code, status = 400) => c.json({ error: code }, status);
const auth = async (c, next) => {
  const user = await currentUser(c);
  if (!user) return bad(c, "unauthorized", 401);
  const biz = await getBusiness("user", user.id);
  if (!biz) return bad(c, "no_business", 404);
  c.set("user", user); c.set("biz", biz);
  await next();
};
function meJson(user, row) {
  return {
    user, ver: row.ver,
    business: {
      slug: row.slug, sphere: row.sphere, locale: row.locale, published: row.published,
      tgLinked: !!row.tg_owner_chat, tgCode: row.tg_code, botUsername: getBotUsername(),
      aiReady: aiConfigured(), telegramReady: tgConfigured(), igReady: igConfigured(), publicUrl: PUBLIC_URL,
    },
    doc: row.doc,
  };
}
const slugify = (s) => (s.normalize("NFKD").toLowerCase()
  .replace(/[а-яё]/g, (ch) => ({ а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" })[ch] || "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)) || "studio";

// ---------- health ----------
app.get("/api/health", (c) => c.json({ ok: true, ai: aiConfigured(), telegram: tgConfigured() }));

// ---------- auth ----------
const SignupBody = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(6).max(200),
  sphere: z.enum(["beauty", "artisan", "concierge", "property"]),
  locale: z.enum(["ru", "fr", "de"]),
  doc: z.record(z.string(), z.any()),
});
app.post("/api/auth/signup", async (c) => {
  const body = SignupBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c, "invalid");
  const { name, email, password, sphere, locale, doc } = body.data;
  if ((await q(`select 1 from users where email = $1`, [email])).length) return bad(c, "email_taken", 409);
  if (!doc.biz || !Array.isArray(doc.biz.services)) return bad(c, "invalid");
  const userId = newId("u_");
  await q(`insert into users (id, email, name, pass) values ($1,$2,$3,$4)`, [userId, email, name, hashPassword(password)]);
  // time zone from the owner's device (validated), currency chosen in the form; sensible defaults otherwise
  const tzOk = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
  doc.biz.tz = typeof doc.biz.tz === "string" && tzOk(doc.biz.tz) ? doc.biz.tz : TZ_DEFAULT[locale];
  doc.biz.cur = ["₽", "€"].includes(doc.biz.cur) ? doc.biz.cur : (locale === "ru" ? "₽" : "€");
  doc.biz.mode = sphere === "beauty" ? "booking" : "request";
  Object.assign(doc, { items: [], convos: [], alerts: [], activity: [], readAt: 0 });
  let slug = slugify(doc.biz.name || name);
  if (await getBusiness("slug", slug)) slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
  await q(`insert into businesses (id, user_id, slug, sphere, locale, doc, tg_code) values ($1,$2,$3,$4,$5,($6::text)::jsonb,$7)`,
    [newId("b_"), userId, slug, sphere, locale, JSON.stringify(doc), crypto.randomBytes(8).toString("hex")]);
  startSession(c, userId);
  const row = await getBusiness("user", userId);
  return c.json(meJson({ id: userId, email, name }, row));
});
app.post("/api/auth/login", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  const u = (await q(`select * from users where email = $1`, [email]))[0];
  if (!u || !checkPassword(String(b.password || ""), u.pass)) return bad(c, "wrong_credentials", 401);
  startSession(c, u.id);
  const row = await getBusiness("user", u.id);
  return c.json(meJson({ id: u.id, email: u.email, name: u.name }, row));
});
app.post("/api/auth/logout", (c) => { deleteCookie(c, COOKIE, { path: "/" }); return c.json({ ok: true }); });

// ---------- dashboard ----------
app.get("/api/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null });
  const row = await getBusiness("user", user.id);
  return c.json(row ? meJson(user, row) : { user });
});
app.get("/api/state", auth, async (c) => {
  const row = await getBusiness("id", c.get("biz").id);
  return c.json({ doc: row.doc, ver: row.ver, tgLinked: !!row.tg_owner_chat });
});
app.put("/api/state", auth, async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || !b.doc || typeof b.doc !== "object") return bad(c, "invalid");
  if (JSON.stringify(b.doc).length > 2_000_000) return bad(c, "too_large", 413);
  const { doc, ver } = await updateDoc(c.get("biz").id, (server) => {
    const merged = mergeDoc(server, b.doc, Array.isArray(b.deleted) ? b.deleted : []);
    Object.keys(server).forEach((k) => delete server[k]);
    Object.assign(server, merged);
  });
  return c.json({ doc, ver });
});
app.put("/api/profile", auth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 60), published = b.published;
  if (name) await q(`update users set name = $2 where id = $1`, [c.get("user").id, name]);
  if (typeof published === "boolean") await q(`update businesses set published = $2 where id = $1`, [c.get("biz").id, published]);
  return c.json({ ok: true });
});

// Delete the account and its business (asked twice in the interface)
app.delete("/api/account", auth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = (await q(`select * from users where id = $1`, [c.get("user").id]))[0];
  if (!u || !checkPassword(String(b.password || ""), u.pass)) return bad(c, "wrong_credentials", 401);
  await q(`delete from users where id = $1`, [u.id]); // businesses and Telegram links go with it (on delete cascade)
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Owner replies to a client (Telegram) from the dashboard
app.post("/api/convos/:id/reply", auth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const text = String(b.text || "").trim().slice(0, 2000);
  if (!text) return bad(c, "empty");
  const row = c.get("biz"), id = c.req.param("id");
  let chatId = null, bizConn = null, igsid = null, ch = "TG";
  const { doc, ver } = await updateDoc(row.id, (d) => {
    const conv = d.convos.find((x) => x.id === id);
    if (!conv) throw Object.assign(new Error("nf"), { status: 404 });
    chatId = conv.chatId; bizConn = conv.bizConn || null; igsid = conv.igsid || null; ch = conv.ch || "TG";
    const fromDraft = !!b.fromDraft && conv.draft;
    if (fromDraft) {
      const decision = { ...conv.draft, reply: text };
      const out = applyDecision(d, conv, decision, { locale: row.locale, source: "TG", chatId, bizConn });
      conv.msgs.push({ from: "bot", text: out.reply || text, ts: Date.now(), src: conv.draft.sources || [] });
      delete conv.draft;
      conv.status = "ai";
    } else {
      conv.msgs.push({ from: "owner", text, ts: Date.now() });
      if (d.guard?.pause !== false && !conv.human) { conv.human = true; conv.msgs.push({ from: "sys", text: "note_takeover", key: true, ts: Date.now() }); }
      conv.status = conv.human ? "waiting" : conv.status;
    }
    conv.read = true; conv.ts = Date.now();
    d.activity.push({ kind: "owner", name: conv.name, ts: Date.now() });
  }).catch((e) => ({ error: e }));
  if (!doc) return bad(c, "not_found", 404);
  if (ch === "IG" && igsid) { const igId = await igIdForBusiness(row.id); if (igId) await igSend(igId, igsid, text); }
  else if (chatId) await sendText(chatId, text, bizConn);
  return c.json({ doc, ver });
});

// AI in the dashboard: the test chat and the price import
app.post("/api/ai/test", auth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const msgs = (Array.isArray(b.turns) ? b.turns : []).slice(-16)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return bad(c, "invalid");
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const row = await getBusiness("id", c.get("biz").id);
  const doc = row.doc;
  const decision = await decide(buildSystem(doc, { locale: row.locale, channel: "Telegram", existing: b.existing && typeof b.existing === "object" ? b.existing : null }), msgs);
  if (decision.failed) return bad(c, aiConfigured() ? "ai_failed" : "ai_not_configured", 503);
  return c.json(decision);
});
app.post("/api/ai/import", auth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!String(b.text || "").trim()) return bad(c, "empty");
  const services = await importPrices(b.text, c.get("biz").doc.biz.kind);
  return services ? c.json({ services }) : bad(c, "ai_failed", 503);
});

// ---------- public catalogue and booking ----------
const publicMaster = (row) => {
  const d = row.doc, now = localNow(d.biz.tz || "Europe/Moscow"), until = addDaysIso(now.date, 8);
  return {
    slug: row.slug, sphere: row.sphere, locale: row.locale,
    name: d.biz.name, city: d.biz.city, address: d.biz.address, cur: d.biz.cur,
    services: d.biz.services, hours: d.biz.hours, today: now.date,
    free: row.sphere === "beauty" ? freeSlots(d, 8) : [],
    busyCount: d.items.filter((i) => i.date >= now.date && i.date <= until).length,
    bot: getBotUsername(),
  };
};
app.get("/api/public/masters", async (c) => {
  const rows = await q(`select * from businesses where published = true and sphere in ('beauty','artisan') order by updated_at desc limit 200`);
  return c.json({ masters: rows.map(fixRow).map(publicMaster) });
});
app.get("/api/public/masters/:slug", async (c) => {
  const row = await getBusiness("slug", c.req.param("slug"));
  if (!row || !row.published) return bad(c, "not_found", 404);
  return c.json({ master: publicMaster(row) });
});
const BookBody = z.object({
  name: z.string().trim().min(1).max(60), phone: z.string().trim().min(6).max(30),
  svc: z.number().int().min(0), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  addr: z.string().max(200).optional(), prob: z.string().max(1000).optional(),
});
app.post("/api/public/masters/:slug/book", async (c) => {
  const body = BookBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c, "invalid");
  const row = await getBusiness("slug", c.req.param("slug"));
  if (!row || !row.published) return bad(c, "not_found", 404);
  const b = body.data, T = tx(row.locale);
  let note = null, itemId = null;
  const res = await updateDoc(row.id, (d) => {
    const svc = d.biz.services[b.svc]; if (!svc) throw Object.assign(new Error("svc"), { code: "invalid" });
    const now = Date.now();
    if (row.sphere === "beauty") {
      if (!b.date || !b.time || !slotFree(d, b.date, b.time)) throw Object.assign(new Error("slot"), { code: "slot_taken" });
      itemId = uid();
      d.items.push({ id: itemId, kind: "booking", client: b.name, phone: b.phone, service: svc.name, price: svc.price, date: b.date, time: b.time, source: "RZ", status: "new", example: false, createdAt: now });
      d.alerts.push({ id: uid(), type: "book", name: b.name, x: `${b.date.slice(8)}.${b.date.slice(5, 7)} ${b.time}`, ts: now });
      d.activity.push({ kind: "book", name: b.name, x: svc.name, ts: now });
      note = T.n_book(`${b.name} (${b.phone}, ${T.web})`, svc.name, fmtDay(b.date, row.locale), b.time);
    } else {
      if (!b.addr || !b.prob) throw Object.assign(new Error("addr"), { code: "invalid" });
      itemId = uid();
      const urgency = /теч|прорв|газ|fuite|gaz|leck|wasser|gas|urgent|срочно|dringend/i.test(b.prob) ? "high" : "normal";
      d.items.push({ id: itemId, kind: "request", client: b.name, phone: b.phone, title: svc.name, address: b.addr, details: b.prob + (b.date && b.time ? ` · ${b.date} ${b.time}` : ""), urgency, assignee: d.biz.owner, value: svc.price, stage: "new", date: localNow(d.biz.tz).date, source: "RZ", status: "new", example: false, createdAt: now });
      d.alerts.push({ id: uid(), type: "req", name: b.name, x: svc.name, ts: now });
      d.activity.push({ kind: "req", name: b.name, x: svc.name, ts: now });
      note = T.n_req(`${b.name} (${b.phone}, ${T.web})`, `${svc.name}: ${b.prob.slice(0, 120)}`, T.urg[urgency]);
    }
  }).catch((e) => ({ error: e.code || "invalid" }));
  if (res.error) return bad(c, res.error, res.error === "slot_taken" ? 409 : 400);
  await notifyOwner(row, [note]);
  return c.json({ ok: true, id: itemId });
});

// ---------- Telegram ----------
const chatQueues = new Map();
app.post("/api/telegram", async (c) => {
  if (tgConfigured() && c.req.header("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) return c.text("forbidden", 403);
  const update = await c.req.json().catch(() => null);
  if (update) {
    // answer Telegram at once, but handle each chat's messages strictly in order
    const key = update.message?.chat?.id ?? update.business_message?.chat?.id ?? update.business_connection?.user_chat_id ?? "x";
    const prev = chatQueues.get(key) || Promise.resolve();
    const next = prev.then(() => handleUpdate(update, PUBLIC_URL)).catch((e) => console.error("[tg] update failed", e));
    chatQueues.set(key, next);
    next.finally(() => { if (chatQueues.get(key) === next) chatQueues.delete(key); });
  }
  return c.json({ ok: true });
});

// ---------- Instagram ----------
const IG_REDIRECT = () => `${PUBLIC_URL}/api/instagram/callback`;
app.get("/api/instagram/connect", auth, (c) => {
  if (!igConfigured() || !PUBLIC_URL) return c.redirect("/?ig=unavailable#integrations");
  return c.redirect(authorizeUrl(IG_REDIRECT(), makeSession(c.get("biz").id, 0.02))); // signed state, valid ~30 min
});
app.get("/api/instagram/callback", async (c) => {
  const bizId = readSession(c.req.query("state"));
  if (!bizId || c.req.query("error")) return c.redirect("/?ig=denied#integrations");
  try { await connectAccount(bizId, c.req.query("code"), IG_REDIRECT()); return c.redirect("/?ig=ok#integrations"); }
  catch (err) { console.error("[ig] connect failed:", err.message); return c.redirect("/?ig=error#integrations"); }
});
app.post("/api/instagram/disconnect", auth, async (c) => { await disconnectAccount(c.get("biz").id); return c.json({ ok: true }); });
app.get("/api/instagram/webhook", (c) => {
  const ok = c.req.query("hub.mode") === "subscribe" && igVerifyToken() && c.req.query("hub.verify_token") === igVerifyToken();
  return ok ? c.text(c.req.query("hub.challenge") || "") : c.text("forbidden", 403);
});
app.post("/api/instagram/webhook", async (c) => {
  const raw = await c.req.text();
  if (!validSignature(raw, c.req.header("x-hub-signature-256"))) return c.text("forbidden", 403);
  let payload = null; try { payload = JSON.parse(raw); } catch {}
  if (payload) handleIgWebhook(payload).catch((e) => console.error("[ig] webhook", e));
  return c.text("EVENT_RECEIVED");
});

// ---------- reminders (call every hour from a scheduler) ----------
app.all("/api/cron/reminders", async (c) => {
  const key = process.env.CRON_SECRET;
  if (!key || (c.req.query("key") !== key && c.req.header("authorization") !== `Bearer ${key}`)) return c.text("forbidden", 403);
  const rows = await q(`select id, locale from businesses where sphere = 'beauty'`);
  let sent = 0;
  for (const r of rows) {
    const todo = [];
    await updateDoc(r.id, (d) => {
      const now = localNow(d.biz.tz || "Europe/Moscow"), tomorrow = addDaysIso(now.date, 1);
      if (now.min < 10 * 60) return; // send reminders from 10:00 local time
      for (const it of d.items) {
        if (it.kind !== "booking" || it.date !== tomorrow || it.reminded || it.status === "cancelled") continue;
        const text = tx(r.locale).remind(it.client, it.service, d.biz.name, it.time, d.biz.address);
        const conv = it.convo ? d.convos.find((c) => c.id === it.convo) : null;
        if (it.chatId) { it.reminded = true; todo.push(["TG", it.chatId, text, it.bizConn || null]); }
        else if (conv && conv.ch === "IG" && conv.igsid && Date.now() - (conv.lastClientTs || 0) < 23 * 3600e3) { it.reminded = true; todo.push(["IG", conv.igsid, text, r.id]); }
      }
    });
    for (const [kind, to, text, extra] of todo) {
      if (kind === "TG") await sendText(to, text, extra);
      else { const igId = await igIdForBusiness(extra); if (igId) await igSend(igId, to, text); }
      sent++;
    }
  }
  if (igConfigured()) await refreshTokens().catch((e) => console.error("[ig] refresh", e));
  return c.json({ ok: true, sent });
});

// ---------- web app ----------
app.get("/m/:slug", (c) => c.redirect(`/#m-${encodeURIComponent(c.req.param("slug"))}`));
app.get("/find", (c) => c.redirect("/#find"));
app.use("/*", serveStatic({ root: "./public" }));
app.get("*", serveStatic({ path: "./public/index.html" }));

app.onError((err, c) => { console.error("[http]", err); return c.json({ error: "server_error" }, 500); });

// ---------- start ----------
export { app };
if (process.env.REZA_NO_LISTEN !== "1") {
  await initDb();
  await migrateInstagram();
  const port = Number(process.env.PORT || 3000);
  serve({ fetch: app.fetch, port }, () => console.log(`Reza is running on http://localhost:${port}`));
  setupTelegram(PUBLIC_URL).catch((e) => console.error("[tg] setup failed", e));
}
