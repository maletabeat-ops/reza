// Merge the dashboard's copy of a business document into the server copy.
// The dashboard owns settings and the status of items/conversations; the server owns
// incoming messages and items created by clients (Telegram, public page).
const validTz = (tz) => { try { return typeof tz === "string" && !!new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return false; } };
const SETTINGS = ["biz", "channels", "mode", "paused", "tone", "guard", "notes", "ob"];
const str = (v, n) => String(v ?? "").trim().slice(0, n);
// The team of a salon: at most 15 masters, plain fields only.
export function cleanTeam(team) {
  if (!team || typeof team !== "object") return { kind: "solo", staff: [] };
  const staff = (Array.isArray(team.staff) ? team.staff : []).slice(0, 15).map((x) => ({
    id: str(x?.id, 24) || Math.random().toString(36).slice(2, 10), name: str(x?.name, 40), role: str(x?.role, 40),
    services: (Array.isArray(x?.services) ? x.services : []).slice(0, 60).map((v) => str(v, 80)).filter(Boolean),
    off: (Array.isArray(x?.off) ? x.off : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    active: x?.active !== false,
  })).filter((x) => x.name);
  return { kind: team.kind === "salon" ? "salon" : "solo", staff };
}

export function mergeDoc(server, client, deletedItems = []) {
  const out = structuredClone(server);
  for (const k of SETTINGS) if (client[k] !== undefined) out[k] = client[k];
  // keep server-only fields of the business that the client must not change
  // the owner may switch currency and time zone, but only to valid values; the mode follows the sphere
  out.biz.mode = server.biz.mode;
  out.biz.cur = ["₽", "€"].includes(client.biz?.cur) ? client.biz.cur : server.biz.cur;
  out.biz.tz = validTz(client.biz?.tz) ? client.biz.tz : server.biz.tz;
  if (client.team !== undefined) out.team = cleanTeam(client.team);

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
