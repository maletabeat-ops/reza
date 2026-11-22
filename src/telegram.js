// One shared Telegram bot for all Reza businesses.
// Clients open t.me/<bot>?start=<business-slug>; owners link notifications with ?start=pro_<code>.
import crypto from "node:crypto";
import { q, getBusiness, updateDoc } from "./db.js";
import { tx } from "./i18n.js";
import { buildSystem, applyDecision, toMessages, inHoursNow, uid } from "./logic.js";
import { decide } from "./ai.js";

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
export const sendText = (chatId, text) => (chatId && text ? tg("sendMessage", { chat_id: chatId, text }) : null);

export async function setupTelegram(publicUrl) {
  if (!TOKEN) return;
  const me = await tg("getMe", {});
  if (me?.ok) botUsername = me.result.username;
  if (publicUrl) {
    await tg("setWebhook", {
      url: `${publicUrl.replace(/\/$/, "")}/api/telegram`,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message"],
    });
    console.log(`[tg] webhook set for @${botUsername}`);
  }
}

export async function notifyOwner(row, texts) {
  if (!row?.tg_owner_chat) return;
  for (const t of texts) await sendText(row.tg_owner_chat, t);
}

export async function handleUpdate(update, publicUrl) {
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

export async function handleClientMessage(businessId, chatId, who, text) {
  const convoId = "tg" + chatId;
  // 1) store the message
  const { doc, row } = await updateDoc(businessId, (doc) => {
    let c = doc.convos.find((x) => x.id === convoId);
    if (!c) { c = { id: convoId, name: who, ch: "TG", status: "ai", human: false, read: true, ts: Date.now(), chatId, msgs: [] }; doc.convos.push(c); }
    c.msgs.push({ from: "client", text, ts: Date.now() });
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
  const system = buildSystem(doc, { locale, channel: "Telegram", existing });
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
      out = { reply: T.wait_owner, notify: [T.n_wait(c.name, text.slice(0, 120))] };
    } else {
      out = applyDecision(d, c, decision, { locale, source: "TG", chatId });
    }
    if (out.reply) c.msgs.push({ from: "bot", text: out.reply, ts: Date.now(), src: decision.sources || [] });
    if (decision.note) c.note = decision.note;
  });
  if (out.reply) await sendText(chatId, out.reply);
  await notifyOwner(row, out.notify);
}
