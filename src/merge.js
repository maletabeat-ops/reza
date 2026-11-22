// Merge the dashboard's copy of a business document into the server copy.
// The dashboard owns settings and the status of items/conversations; the server owns
// incoming messages and items created by clients (Telegram, public page).
const SETTINGS = ["biz", "channels", "mode", "paused", "tone", "guard", "notes", "ob"];

export function mergeDoc(server, client, deletedItems = []) {
  const out = structuredClone(server);
  for (const k of SETTINGS) if (client[k] !== undefined) out[k] = client[k];
  // keep server-only fields of the business that the client must not change
  out.biz.tz = server.biz.tz; out.biz.mode = server.biz.mode; out.biz.cur = server.biz.cur;

  const gone = new Set(deletedItems);
  const byId = new Map(out.items.filter((i) => !gone.has(i.id)).map((i) => [i.id, i]));
  for (const ci of client.items || []) byId.set(ci.id, { ...(byId.get(ci.id) || {}), ...ci });
  out.items = [...byId.values()].slice(-2000);

  for (const cc of client.convos || []) {
    const sc = out.convos.find((c) => c.id === cc.id);
    if (!sc) continue; // conversations are created on the server only
    sc.human = !!cc.human; sc.read = !!cc.read;
    if (cc.status) sc.status = cc.status;
    if (cc.draft === null) delete sc.draft;
  }
  const seen = new Set(out.alerts.map((a) => a.id));
  for (const a of client.alerts || []) if (!seen.has(a.id)) out.alerts.push(a);
  out.alerts = out.alerts.slice(-300);
  const key = (a) => `${a.ts}|${a.kind}|${a.name}`;
  const seenA = new Set(out.activity.map(key));
  for (const a of client.activity || []) if (!seenA.has(key(a))) out.activity.push(a);
  out.activity = out.activity.sort((a, b) => a.ts - b.ts).slice(-300);
  out.readAt = Math.max(server.readAt || 0, client.readAt || 0);
  return out;
}
