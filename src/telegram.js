// One shared Telegram bot for all Reza businesses.
// Clients open t.me/<bot>?start=<business-slug>; owners link notifications with ?start=pro_<code>.
import crypto from "node:crypto";
import { q, getBusiness, updateDoc } from "./db.js";
import { tx, fmtDay } from "./i18n.js";
import { buildSystem, applyDecision, toMessages, inHoursNow, uid, freeSlots } from "./logic.js";
import { decide, aiConfigured } from "./ai.js";

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");

// Without an AI key Reza still answers: services, prices, the next free times and the online booking link.
export function basicReply(doc, row, locale) {
  const cur = doc.biz.cur || "";
  const prices = (doc.biz.services || []).slice(0, 12).map((s) => `• ${s.name} — ${s.price} ${cur}`.trim()).join("\n");
  const free = freeSlots(doc, 7).slice(0, 3).map((x) => `${fmtDay(x.date, locale)} ${x.time}`).join(", ");
  const link = PUBLIC_URL && row.published !== false ? `${PUBLIC_URL}/m/${row.slug}` : "";
  return tx(locale).basic(doc.biz.name, prices, free, link);
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Telegram accepts only [A-Za-z0-9_-] in the webhook secret, so derive one from the server secrets.
export const WEBHOOK_SECRET = crypto.createHash("sha256").update(`${process.env.SESSION_SECRET || ""}|${TOKEN || ""}`).digest("hex").slice(0, 48);
let botUsername = process.env.TELEGRAM_BOT_USERNAME || null;
export const tgConfigured = () => !!TOKEN;
export const getBotUsername = () => botUsername;

export async function tg(method, body) {
  if (!TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.error(`[tg] ${method}: ${j.description}`);
    return j;
  } catch (err) {
    console.error(`[tg] ${method} failed`, err.message);
    return null;
  }
}
// bizConn: reply from the owner's own account (Telegram Business) instead of from the Reza bot
export const sendText = (chatId, text, bizConn = null) => (chatId && text ? tg("sendMessage", { chat_id: chatId, text, ...(bizConn ? { business_connection_id: bizConn } : {}) }) : null);

export async function setupTelegram(publicUrl) {
  if (!TOKEN) return;
  const me = await tg("getMe", {});
  if (me?.ok) botUsername = me.result.username;
  if (publicUrl) {
    await tg("setWebhook", {
      url: `${publicUrl.replace(/\/$/, "")}/api/telegram`,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "business_connection", "business_message"],
    });
    console.log(`[tg] webhook set for @${botUsername}`);
  }
}

export async function notifyOwner(row, texts) {
  if (!row?.tg_owner_chat) return;
  for (const t of texts) await sendText(row.tg_owner_chat, t);
}

export async function handleUpdate(update, publicUrl) {
  if (update.business_connection) return handleBizConnection(update.business_connection);
  if (update.business_message) return handleBizMessage(update.business_message);
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || typeof msg.text !== "string") return;
  const chatId = msg.chat.id, text = msg.text.trim();
  const who = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Telegram";

  // /start with a parameter: link an owner, or open a chat with a business
  if (text.startsWith("/start")) {
    const arg = text.split(/\s+/)[1] || "";
    if (arg.startsWith("pro_")) {
      const row = await getBusiness("code", arg.slice(4));
      if (row) {
        await q(`update businesses set tg_owner_chat = $2 where id = $1`, [row.id, chatId]);
        await sendText(chatId, tx(row.locale).owner_linked(row.doc.biz.name));
      }
      return;
    }
    const row = arg ? await getBusiness("slug", arg) : null;
    if (!row) { await sendText(chatId, tx("ru").no_biz(`${publicUrl || ""}/#find`)); return; }
    await q(`insert into tg_chats (chat_id, business_id, client_name, updated_at) values ($1,$2,$3,now())
             on conflict (chat_id) do update set business_id = excluded.business_id, client_name = excluded.client_name, updated_at = now()`, [chatId, row.id, who]);
    await sendText(chatId, tx(row.locale).hello(row.doc.biz.name));
    return;
  }

  // An owner writing into the notifications chat
  const owned = await getBusiness("owner", chatId);
  const link = (await q(`select * from tg_chats where chat_id = $1`, [chatId]))[0];
  if (owned && !link) { await sendText(chatId, tx(owned.locale).owner_only); return; }
  if (!link) { await sendText(chatId, tx("ru").no_biz(`${publicUrl || ""}/#find`)); return; }

  await handleClientMessage(link.business_id, chatId, who, text.slice(0, 2000));
}

// Telegram Business: the owner added the Reza bot in Settings → Telegram Business → Chatbots
async function handleBizConnection(bc) {
  const ownerChat = bc.user_chat_id || bc.user?.id;
  const row = (await getBusiness("owner", ownerChat)) || (await getBusiness("owner", bc.user?.id));
  if (!row) { await sendText(ownerChat, tx("ru").biz_need_link); return; }
  const canReply = bc.rights ? !!bc.rights.can_reply : bc.can_reply !== false;
  const enabled = !!bc.is_enabled;
  await q(`insert into tg_business (conn_id, business_id, owner_chat, enabled, updated_at) values ($1,$2,$3,$4,now())
           on conflict (conn_id) do update set business_id = excluded.business_id, owner_chat = excluded.owner_chat, enabled = excluded.enabled, updated_at = now()`,
    [bc.id, row.id, ownerChat, enabled && canReply]);
  await updateDoc(row.id, (d) => { d.tgBiz = { enabled, canReply, ts: Date.now() }; });
  const T = tx(row.locale);
  await sendText(ownerChat, !enabled ? T.biz_off : canReply ? T.biz_on(row.doc.biz.name) : T.biz_no_reply);
}

// A message in one of the owner's own chats (from a client, or written by the owner)
async function handleBizMessage(m) {
  if (typeof m.text !== "string" || !m.chat || m.chat.type !== "private") return;
  const link = (await q(`select * from tg_business where conn_id = $1`, [m.business_connection_id]))[0];
  if (!link || !link.enabled) return;
  const chatId = m.chat.id, text = m.text.trim().slice(0, 2000);
  const who = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ") || "Telegram";
  if (String(m.from?.id) === String(link.owner_chat)) {
    // the owner answered personally: keep the message and pause the AI in this chat
    await updateDoc(link.business_id, (d) => {
      const id = "tg" + chatId;
      let c = d.convos.find((x) => x.id === id);
      if (!c) { c = { id, name: who, ch: "TG", status: "ai", human: false, read: true, ts: Date.now(), chatId, msgs: [] }; d.convos.push(c); }
      c.bizConn = link.conn_id;
      c.msgs.push({ from: "owner", text, ts: Date.now() });
      if (d.guard?.pause !== false && !c.human) { c.human = true; c.msgs.push({ from: "sys", text: "note_takeover", key: true, ts: Date.now() }); }
      c.read = true; c.ts = Date.now();
    });
    return;
  }
  await handleClientMessage(link.business_id, chatId, who, text, { bizConn: link.conn_id });
}

export async function handleClientMessage(businessId, chatId, who, text, opts = {}) {
  const ch = opts.ch || "TG", convoId = opts.convoId || "tg" + chatId;
  const send = opts.send || ((t) => sendText(chatId, t, opts.bizConn || null));
  // 1) store the message
  const { doc, row } = await updateDoc(businessId, (doc) => {
    let c = doc.convos.find((x) => x.id === convoId);
    if (!c) { c = { id: convoId, name: who, ch, status: "ai", human: false, read: true, ts: Date.now(), chatId, msgs: [] }; doc.convos.push(c); }
    c.msgs.push({ from: "client", text, ts: Date.now() });
    if (ch === "TG") c.bizConn = opts.bizConn || null;
    if (opts.igsid) { c.igsid = opts.igsid; c.lastClientTs = Date.now(); }
    c.ts = Date.now();
    if (c.msgs.length > 200) c.msgs = c.msgs.slice(-200);
  });
  const locale = row.locale, T = tx(locale), convo = doc.convos.find((x) => x.id === convoId);

  // 2) the owner is handling it, the AI is paused, or it is working hours and the owner answers then
  const ownerTurn = doc.paused || convo.human || (doc.guard?.offhours && inHoursNow(doc));
  if (ownerTurn) {
    await updateDoc(businessId, (d) => {
      const c = d.convos.find((x) => x.id === convoId); c.read = false; if (c.status !== "personal") c.status = "waiting";
      d.alerts.push({ id: uid(), type: "handoff", name: c.name, ts: Date.now(), convo: c.id });
    });
    await notifyOwner(row, [T.n_wait(convo.name, text.slice(0, 120))]);
    return;
  }

  // 3) ask the AI
  const existing = doc.items.find((i) => i.convo === convoId && i.status !== "cancelled") || null;
  const system = buildSystem(doc, { locale, channel: ch === "IG" ? "Instagram Direct" : "Telegram", existing });
  const decision = await decide(system, toMessages(convo.msgs));

  if (doc.mode === "suggest" && !decision.failed && decision.action !== "ignore") {
    await updateDoc(businessId, (d) => {
      const c = d.convos.find((x) => x.id === convoId);
      c.draft = { ...decision, ts: Date.now() }; c.read = false; c.status = "waiting";
    });
    await notifyOwner(row, [T.n_draft(convo.name)]);
    return;
  }

  let out = { reply: "", notify: [] };
  await updateDoc(businessId, (d) => {
    const c = d.convos.find((x) => x.id === convoId);
    if (decision.failed) {
      c.status = "waiting"; c.read = false;
      d.alerts.push({ id: uid(), type: "handoff", name: c.name, ts: Date.now(), convo: c.id });
      let reply = T.wait_owner;
      if (!aiConfigured()) { // basic mode: full info once a day per chat, then a short acknowledgement
        const fresh = !c.basicTs || Date.now() - c.basicTs > 20 * 3600e3;
        const ack = !fresh && (!c.ackTs || Date.now() - c.ackTs > 20 * 3600e3);
        reply = fresh ? basicReply(d, row, locale) : ack ? T.basic_more : "";
        if (fresh) { c.basicTs = Date.now(); c.ackTs = 0; } else if (ack) c.ackTs = Date.now();
      }
      out = { reply, notify: [T.n_wait(c.name, text.slice(0, 120))] };
    } else {
      out = applyDecision(d, c, decision, { locale, source: ch, chatId, bizConn: opts.bizConn || null });
    }
    if (out.reply) c.msgs.push({ from: "bot", text: out.reply, ts: Date.now(), src: decision.sources || [] });
    if (decision.note) c.note = decision.note;
  });
  if (out.reply) await send(out.reply);
  await notifyOwner(row, out.notify);
}
