// End-to-end API test: starts the server with a throwaway database and the test AI stub.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";

const PORT = 3999, BASE = `http://localhost:${PORT}`, DB = "/tmp/reza-test-db";
let proc, cookie = "", slug = "";

const call = async (path, { method = "GET", body, headers = {} } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie, ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const set = r.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const tgUpdate = (chatId, text) => call("/api/telegram", { method: "POST", body: { update_id: Date.now(), message: { message_id: 1, date: 0, chat: { id: chatId, type: "private" }, from: { id: chatId, first_name: "Anna" }, text } } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const doc = {
  biz: { name: "Studio Test", owner: "Test", kind: "nail technician", city: "Moscow", address: "Tverskaya 1", policy: "No refunds.",
    hours: { 0: ["09:00", "21:00"], 1: ["09:00", "21:00"], 2: ["09:00", "21:00"], 3: ["09:00", "21:00"], 4: ["09:00", "21:00"], 5: ["09:00", "21:00"], 6: ["09:00", "21:00"] },
    services: [{ name: "Manicure", price: 2500, duration: 90 }, { name: "Pedicure", price: 3200, duration: 90 }] },
  channels: { telegram: true }, mode: "auto", paused: false, tone: "warm", notes: {}, ob: {}, guard: { offtopic: true, pause: true },
};

before(async () => {
  fs.rmSync(DB, { recursive: true, force: true });
  if (process.env.TEST_DATABASE_URL) { // start from empty tables on a real Postgres
    const { default: postgres } = await import("postgres");
    const sql = postgres(process.env.TEST_DATABASE_URL, { onnotice: () => {} });
    await sql.unsafe("drop table if exists tg_chats, businesses, users cascade"); await sql.end();
  }
  proc = spawn("node", ["src/server.js"], { env: { ...process.env, PORT: String(PORT), PGLITE_DIR: DB, REZA_FAKE_AI: "1", CRON_SECRET: "k", DATABASE_URL: process.env.TEST_DATABASE_URL || "", PGSSL: "disable", TELEGRAM_BOT_TOKEN: "" }, stdio: "inherit" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await wait(250); }
  throw new Error("server did not start");
});
after(() => proc?.kill());

test("health", async () => {
  const r = await call("/api/health");
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
});

test("sign up, session and duplicate e-mail", async () => {
  const r = await call("/api/auth/signup", { method: "POST", body: { name: "Anna", email: "anna@test.dev", password: "secret1", sphere: "beauty", locale: "ru", doc } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  slug = r.json.business.slug;
  assert.match(slug, /^studio-test/);
  assert.equal(typeof r.json.doc, "object", "document is stored as JSON, not as a string");
  assert.equal(r.json.doc.biz.cur, "₽");
  const me = await call("/api/me");
  assert.equal(me.json.user.email, "anna@test.dev");
  const dup = await call("/api/auth/signup", { method: "POST", body: { name: "X", email: "anna@test.dev", password: "secret1", sphere: "beauty", locale: "ru", doc } });
  assert.equal(dup.status, 409);
});

test("wrong password is rejected, right one logs in", async () => {
  const saved = cookie; cookie = "";
  assert.equal((await call("/api/auth/login", { method: "POST", body: { email: "anna@test.dev", password: "nope" } })).status, 401);
  assert.equal((await call("/api/auth/login", { method: "POST", body: { email: "anna@test.dev", password: "secret1" } })).status, 200);
  assert.ok(cookie && cookie !== saved);
});

test("dashboard saves settings and keeps server-only fields", async () => {
  const st = await call("/api/state");
  const d = st.json.doc; d.biz.name = "Studio Renamed"; d.biz.cur = "$";
  const put = await call("/api/state", { method: "PUT", body: { doc: d, deleted: [] } });
  assert.equal(put.status, 200);
  assert.equal(put.json.doc.biz.name, "Studio Renamed");
  assert.equal(put.json.doc.biz.cur, "₽", "invalid currency is ignored");
});

let slot;
test("public catalogue lists the business and books a free slot once", async () => {
  const list = await call("/api/public/masters");
  assert.equal(list.status, 200);
  const m = list.json.masters.find((x) => x.slug === slug);
  assert.ok(m, "business is listed"); assert.ok(m.free.length > 0);
  slot = m.free[0];
  const body = { name: "Client", phone: "+7 900 000 00 00", svc: 0, date: slot.date, time: slot.time };
  assert.equal((await call(`/api/public/masters/${slug}/book`, { method: "POST", body })).status, 200);
  assert.equal((await call(`/api/public/masters/${slug}/book`, { method: "POST", body })).status, 409, "same slot twice");
  const st = await call("/api/state");
  assert.equal(st.json.doc.items.filter((i) => i.source === "RZ").length, 1);
});

test("Telegram: client starts a chat, the AI books, the owner replies", async () => {
  await tgUpdate(555, `/start ${slug}`);
  const m = (await call("/api/public/masters")).json.masters.find((x) => x.slug === slug);
  const s = m.free[1];
  await tgUpdate(555, `BOOK ${s.date} ${s.time} Anna`);
  let st;
  for (let i = 0; i < 20; i++) { await wait(150); st = await call("/api/state"); if (st.json.doc.items.some((x) => x.source === "TG")) break; }
  const conv = st.json.doc.convos.find((c) => c.id === "tg555");
  assert.ok(conv, "conversation created");
  assert.ok(st.json.doc.items.some((x) => x.source === "TG" && x.date === s.date && x.time === s.time), "booking created by the AI");
  assert.ok(conv.msgs.some((x) => x.from === "bot"), "AI reply stored");
  const rep = await call("/api/convos/tg555/reply", { method: "POST", body: { text: "See you!" } });
  assert.equal(rep.status, 200);
  const c2 = rep.json.doc.convos.find((c) => c.id === "tg555");
  assert.equal(c2.human, true, "owner reply pauses the AI in this chat");
});

test("Telegram: while the owner handles the chat, the AI stays silent", async () => {
  await tgUpdate(555, "are you there?");
  await wait(400);
  const st = await call("/api/state");
  const conv = st.json.doc.convos.find((c) => c.id === "tg555");
  assert.equal(conv.msgs[conv.msgs.length - 1].from, "client");
  assert.equal(conv.status, "waiting");
});

test("deleting an item from the dashboard removes it on the server", async () => {
  const st = await call("/api/state");
  const d = st.json.doc, gone = d.items[0].id;
  d.items = d.items.filter((i) => i.id !== gone);
  const put = await call("/api/state", { method: "PUT", body: { doc: d, deleted: [gone] } });
  assert.ok(!put.json.doc.items.some((i) => i.id === gone));
});

test("currency can be switched to a valid value only", async () => {
  const st = await call("/api/state");
  const d = st.json.doc; d.biz.cur = "€";
  assert.equal((await call("/api/state", { method: "PUT", body: { doc: d } })).json.doc.biz.cur, "€");
  d.biz.cur = "$";
  assert.equal((await call("/api/state", { method: "PUT", body: { doc: d } })).json.doc.biz.cur, "€");
});

test("reminders endpoint is protected", async () => {
  assert.equal((await call("/api/cron/reminders")).status, 403);
  const ok = await call("/api/cron/reminders?key=k");
  assert.equal(ok.status, 200); assert.equal(ok.json.ok, true);
});

test("account deletion needs the password and removes the business", async () => {
  assert.equal((await call("/api/account", { method: "DELETE", body: { password: "wrong" } })).status, 401);
  assert.equal((await call("/api/account", { method: "DELETE", body: { password: "secret1" } })).status, 200);
  const list = await call("/api/public/masters");
  assert.ok(!list.json.masters.some((m) => m.slug === slug));
});

test("the web app is served", async () => {
  const r = await fetch(BASE + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<title>Reza<\/title>/);
  const red = await fetch(BASE + `/m/anything`, { redirect: "manual" });
  assert.equal(red.status, 302);
});
