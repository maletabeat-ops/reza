// Business logic shared by the Telegram bot, the public booking page and the dashboard:
// local time, free slots, the AI prompt, and applying the AI decision to a business document.
import crypto from "node:crypto";
import { tx, fmtDay } from "./i18n.js";

export const TZ_DEFAULT = { ru: "Europe/Moscow", fr: "Europe/Paris", de: "Europe/Berlin" };
const pad = (n) => String(n).padStart(2, "0");
export const uid = () => crypto.randomBytes(6).toString("base64url");
export const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Current date/time in the business time zone
export function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), hm: `${parts.hour}:${parts.minute}`, dow };
}
export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const dowOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

export function freeSlots(doc, days = 7) {
  const tz = doc.biz.tz || "Europe/Moscow", now = localNow(tz), res = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(now.date, i), h = doc.biz.hours[dowOf(date)];
    if (!h) continue;
    for (let m = toMin(h[0]); m + 60 <= toMin(h[1]); m += 60) {
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      if (i === 0 && m <= now.min + 60) continue;
      if (doc.items.some((b) => b.kind === "booking" && b.status !== "cancelled" && b.date === date && b.time === time)) continue;
      res.push({ date, time });
    }
  }
  return res;
}
export const slotFree = (doc, date, time) => freeSlots(doc, 14).some((s) => s.date === date && s.time === time);
export function inHoursNow(doc) {
  const now = localNow(doc.biz.tz || "Europe/Moscow"), h = doc.biz.hours[now.dow];
  return !!h && now.min >= toMin(h[0]) && now.min < toMin(h[1]);
}

// JSON schema for the AI decision (structured outputs)
export const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "action", "sources", "note", "booking", "request"],
  properties: {
    reply: { type: "string" },
    action: { type: "string", enum: ["none", "book", "cancel", "request", "handoff", "ignore"] },
    sources: { type: "array", items: { type: "string", enum: ["prices", "hours", "slots", "rules"] } },
    note: { type: "string" },
    booking: {
      anyOf: [{ type: "null" }, {
        type: "object", additionalProperties: false, required: ["name", "service", "date", "time"],
        properties: { name: { type: "string" }, service: { type: "string" }, date: { type: "string" }, time: { type: "string" } },
      }],
    },
    request: {
      anyOf: [{ type: "null" }, {
        type: "object", additionalProperties: false, required: ["name", "title", "address", "details", "urgency", "assignee", "value"],
        properties: {
          name: { type: "string" }, title: { type: "string" }, address: { type: "string" }, details: { type: "string" },
          urgency: { type: "string", enum: ["high", "normal", "low"] }, assignee: { type: "string" }, value: { type: "number" },
        },
      }],
    },
  },
};

const LANG = { ru: "Russian", fr: "French", de: "German" };
const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// System prompt describing the business. The same rules as the in-browser demo.
export function buildSystem(doc, { locale, channel = "Telegram", existing = null }) {
  const b = doc.biz, isBooking = b.mode === "booking", now = localNow(b.tz || "Europe/Moscow");
  const tone = { warm: "warm and friendly", pro: "polite and businesslike", short: "very short and to the point" }[doc.tone || "warm"];
  const hours = [1, 2, 3, 4, 5, 6, 0].map((d) => `${WD[d]}: ${b.hours[d] ? b.hours[d].join("–") : "closed"}`).join("; ");
  const services = b.services.map((s) => `- ${s.name}: ${s.price} ${b.cur || "€"}${s.duration ? `, ${s.duration} min` : ""}`).join("\n");
  let p = `You are the AI receptionist of "${b.name}" (${b.kind}) in ${b.city}. Owner/contact person: ${b.owner}. Address or area: ${b.address}.
You answer people who write to the business on ${channel}. Today is ${now.date} (${WD[now.dow]}), current local time ${now.hm}.

RULES
- Reply in the language the person writes in. Natural messenger style, ${tone}: 1–3 sentences, at most one emoji. In Russian address the person formally ("вы"), in French use "vous", in German "Sie".
- Only use the facts below. Never invent prices, services, availability or rules.
- ${doc.guard?.offtopic !== false ? `If the message is clearly personal and not about the business (friends, family, flirting, spam), do not answer: action "ignore", reply "".` : `If the message is personal, reply politely in one sentence that this is the business line of ${b.name}.`}
- If you cannot answer from the facts, or it is a complaint or a sensitive topic (health, money disputes, damages), say politely that ${b.owner} will answer personally very soon, and set action "handoff".
- The "note" field is one short sentence in ${LANG[locale] || "Russian"} for the owner's log. "sources" lists which facts you used.

SERVICES / PRICES
${services}

HOURS
${hours}

KNOWLEDGE AND RULES OF THE BUSINESS
${b.policy || "-"}
`;
  if (isBooking) {
    const byDay = {};
    freeSlots(doc, 7).forEach((s) => (byDay[s.date] ||= []).push(s.time));
    const slots = Object.entries(byDay).map(([d, ts]) => `- ${d} (${WD[dowOf(d)]}): ${ts.join(", ")}`).join("\n") || "- none this week";
    p += `
FREE SLOTS (only these can be booked)
${slots}

BOOKING
- To book you need a service from the list, a free slot from the list and the client's first name. Ask for what is missing, one question at a time. Propose at most 3 slots at once.
- Set action "book" (with "booking") only when service + slot + name are known and the client agreed. Confirm in the reply and say a reminder will come the day before.${doc.guard?.deposit ? "\n- After confirming a booking, say that a link to pay a 20% deposit will follow." : ""}
- To move a booking, set "book" with the new slot (the old one is released). To cancel, action "cancel".
${existing ? `THIS CLIENT ALREADY HAS: ${existing.service}, ${existing.date} ${existing.time}, name ${existing.client}.` : "This client has no booking yet."}
Set "request" to null.`;
  } else {
    p += `
REQUESTS
- Turn the conversation into a ready-to-handle request: what is needed, where (address), how urgent, the person's name, availability. At most 2 short questions per message.
- If it is urgent or dangerous (water, gas, electricity, someone stuck), give the safety instructions from the knowledge FIRST.
- Outside the area or not a job the business does: decline politely (action "none").
- As soon as you know what + where, set action "request" with "request" (title in ${LANG[locale] || "Russian"}, urgency high/normal/low, assignee from the team, value = estimated price or 0) and say what happens next. Send it again with completed data when new details arrive.
${existing ? `A REQUEST ALREADY EXISTS IN THIS CHAT: ${existing.title} (${existing.address}).` : ""}
Set "booking" to null.`;
  }
  return p;
}

const fmtShort = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7);

// Apply an AI decision to the document. Returns the text to send and owner notifications.
export function applyDecision(doc, convo, res, { locale, source = "TG", chatId = null }) {
  const T = tx(locale), notify = [];
  let reply = String(res.reply || "").trim();
  const now = Date.now();
  const existing = doc.items.find((i) => i.convo === convo.id && i.status !== "cancelled");
  if (res.action === "ignore") return { reply: "", notify, ignored: true };
  if (res.action === "book" && res.booking) {
    const bk = res.booking, wanted = String(bk.service || "").toLowerCase();
    const svc = doc.biz.services.find((s) => s.name.toLowerCase() === wanted) || doc.biz.services.find((s) => wanted && s.name.toLowerCase().includes(wanted.slice(0, 6))) || doc.biz.services[0];
    const date = String(bk.date || ""), time = String(bk.time || "").padStart(5, "0");
    if (!(existing && existing.date === date && existing.time === time)) {
      if (slotFree(doc, date, time)) {
        if (existing) existing.status = "cancelled";
        const name = String(bk.name || convo.name).slice(0, 60);
        doc.items.push({ id: uid(), kind: "booking", client: name, service: svc.name, price: svc.price, date, time, source, status: "new", example: false, convo: convo.id, chatId, deposit: !!doc.guard?.deposit, createdAt: now });
        doc.alerts.push({ id: uid(), type: "book", name, x: `${fmtShort(date)} ${time}`, ts: now });
        doc.activity.push({ kind: "book", name, x: `${svc.name}, ${fmtShort(date)} ${time}`, ts: now });
        notify.push(T.n_book(name, svc.name, fmtDay(date, locale), time));
      } else {
        const alt = freeSlots(doc, 7).slice(0, 3).map((s) => `${fmtDay(s.date, locale)} ${s.time}`).join(", ");
        reply = T.taken(alt);
      }
    }
  } else if (res.action === "cancel" && existing) {
    existing.status = "cancelled";
    notify.push(T.n_cancel(existing.client));
  } else if (res.action === "request" && res.request) {
    const r = res.request, urgency = ["high", "normal", "low"].includes(r.urgency) ? r.urgency : "normal";
    const data = { client: String(r.name || convo.name).slice(0, 60), title: String(r.title || "—").slice(0, 90), address: String(r.address || "—").slice(0, 120), details: String(r.details || "").slice(0, 300), urgency, assignee: String(r.assignee || "").slice(0, 40), value: Math.max(0, Math.round(+r.value || 0)) };
    if (existing) Object.assign(existing, data, { status: "new" });
    else {
      doc.items.push({ id: uid(), kind: "request", date: localNow(doc.biz.tz).date, source, status: "new", stage: "new", example: false, convo: convo.id, chatId, createdAt: now, ...data });
      doc.alerts.push({ id: uid(), type: "req", name: data.client, x: data.title, ts: now });
      doc.activity.push({ kind: "req", name: data.client, x: data.title, ts: now });
      notify.push(T.n_req(data.client, data.title, T.urg[urgency]));
    }
  } else if (res.action === "handoff") {
    convo.status = "waiting"; convo.read = false;
    doc.alerts.push({ id: uid(), type: "handoff", name: convo.name, ts: now, convo: convo.id });
    doc.activity.push({ kind: "handoff", name: convo.name, ts: now });
    const last = [...convo.msgs].reverse().find((m) => m.from === "client");
    notify.push(T.n_wait(convo.name, (last?.text || "").slice(0, 120)));
  } else {
    doc.activity.push({ kind: "reply", name: convo.name, ts: now });
  }
  return { reply, notify };
}

// Messages for the model: client = user, business side (AI or owner) = assistant; merged so roles alternate.
export function toMessages(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.from === "sys") continue;
    const role = m.from === "client" ? "user" : "assistant";
    const text = String(m.text || "").trim(); if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + text;
    else out.push({ role, content: text });
  }
  const recent = out.slice(-20);
  while (recent.length && recent[0].role !== "user") recent.shift();
  while (recent.length && recent[recent.length - 1].role !== "user") recent.pop();
  return recent;
}
