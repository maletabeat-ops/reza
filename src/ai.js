// Claude API calls: the receptionist decision and the price-list import.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DECISION_SCHEMA } from "./logic.js";

const MODEL = process.env.REZA_MODEL || "claude-opus-5-5";
const EFFORT = process.env.REZA_EFFORT || "low"; // chat replies: low effort keeps answers fast and cheap
let client = null;
const getClient = () => (client ||= new Anthropic()); // reads ANTHROPIC_API_KEY from the environment
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const Decision = z.object({
  reply: z.string(),
  action: z.enum(["none", "book", "cancel", "request", "handoff", "ignore"]),
  sources: z.array(z.string()).default([]),
  note: z.string().default(""),
  booking: z.object({ name: z.string(), service: z.string(), date: z.string(), time: z.string() }).nullable().default(null),
  request: z.object({
    name: z.string(), title: z.string(), address: z.string(), details: z.string(),
    urgency: z.enum(["high", "normal", "low"]), assignee: z.string(), value: z.number(),
  }).nullable().default(null),
});

async function structured(system, messages, schema, maxTokens = 8000) {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
  });
  if (res.stop_reason === "refusal") return { refused: true };
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { json: JSON.parse(text) };
}

// Returns a validated decision, or a safe hand-off to the owner when anything goes wrong.
export async function decide(system, messages) {
  if (process.env.REZA_FAKE_AI === "1") return fakeDecision(messages); // tests only
  const safe = { reply: "", action: "handoff", sources: [], note: "AI unavailable", booking: null, request: null, failed: true };
  if (!aiConfigured() || !messages.length) return safe;
  try {
    const out = await structured(system, messages, DECISION_SCHEMA);
    if (out.refused) return safe;
    const parsed = Decision.safeParse(out.json);
    return parsed.success ? parsed.data : safe;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error("[ai] rate limited");
    else if (err instanceof Anthropic.APIError) console.error(`[ai] API error ${err.status}: ${err.message}`);
    else console.error("[ai]", err);
    return safe;
  }
}

const IMPORT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["services"],
  properties: {
    services: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "price", "duration"],
        properties: { name: { type: "string" }, price: { type: "number" }, duration: { type: "number" } },
      },
    },
  },
};

export async function importPrices(text, kind) {
  if (!aiConfigured()) return null;
  try {
    const out = await structured(
      "You extract services from a small business price list. Keep names in their original language, cleaned up. Prices are numbers without currency. If a duration in minutes is missing, estimate a typical one.",
      [{ role: "user", content: `Business: ${kind}\n\nPrice list:\n${String(text).slice(0, 6000)}` }],
      IMPORT_SCHEMA, 6000,
    );
    if (out.refused) return null;
    return (out.json.services || []).slice(0, 40).map((s) => ({ name: String(s.name).slice(0, 80), price: Math.max(0, Math.round(+s.price || 0)), duration: Math.max(0, Math.round(+s.duration || 30)) }));
  } catch (err) {
    console.error("[ai] import failed", err instanceof Anthropic.APIError ? err.status : err);
    return null;
  }
}

// Deterministic stand-in used by the automated tests (REZA_FAKE_AI=1). Never used in production.
function fakeDecision(messages) {
  const last = messages[messages.length - 1]?.content || "";
  const base = { sources: ["prices"], note: "test", booking: null, request: null };
  const m = last.match(/BOOK (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (.+)/);
  if (m) return { ...base, reply: "Booked", action: "book", booking: { name: m[3], service: "", date: m[1], time: m[2] } };
  if (/NOAI/.test(last)) return { reply: "", action: "handoff", sources: [], note: "", booking: null, request: null, failed: true };
  if (/complain|жалоб/i.test(last)) return { ...base, reply: "The owner will answer", action: "handoff" };
  return { ...base, reply: "Hello from test AI", action: "none" };
}
