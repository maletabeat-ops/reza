/* =====================================================================
   Server mode: when the page is served by the Reza server, accounts and
   data live in the database, the AI runs on the server, and the catalogue
   shows real businesses. Opened as a standalone file, it stays a demo.
   ===================================================================== */
var SRV = {on:false, doc:null, me:null, ver:0, lastIds:new Set(), timer:null, masters:null, alerts:0};
const POLICY = {
 beauty:{ru:"Бесплатная отмена или перенос не позднее чем за 24 часа. При опоздании больше чем на 15 минут процедуру могут сократить. Оплата картой или наличными.",fr:"Annulation gratuite jusqu'à 24 h avant. Au-delà de 15 min de retard, la prestation peut être écourtée. Paiement par carte ou en espèces.",de:"Kostenlose Stornierung bis 24 Std. vorher. Bei mehr als 15 Min. Verspätung kann die Behandlung gekürzt werden. Zahlung bar oder mit Karte."},
 artisan:{ru:"Зона выезда: город и до 20 км. Мелкие бытовые работы не берём. Срочный выезд вечером и в выходные дороже на 50 %. При протечке посоветовать перекрыть воду до приезда мастера.",fr:"Zone d'intervention : la ville et 20 km autour. Pas de petits bricolages. Urgence soir et week-end : +50 %. En cas de fuite, conseiller de couper l'eau en attendant.",de:"Einsatzgebiet: Stadt und 20 km Umland. Keine Kleinarbeiten. Notdienst abends und am Wochenende: +50 %. Bei Wasserschaden: Hauptventil zudrehen empfehlen."},
 concierge:{ru:"Заезд с 15:00, выезд до 12:00. Код от сейфа с ключами приходит в день заезда. С животными нельзя, вечеринки запрещены. Поломки и протечки — срочная заявка для управляющего.",fr:"Check-in à partir de 16h, check-out avant 11h. Code de la boîte à clés envoyé le jour de l'arrivée. Animaux et fêtes interdits. Panne ou fuite : demande urgente pour le gestionnaire.",de:"Check-in ab 16 Uhr, Check-out bis 10 Uhr. Schlüsselbox-Code am Anreisetag. Keine Haustiere, keine Partys. Defekt oder Wasserschaden: dringender Auftrag an die Verwaltung."},
 property:{ru:"Аварии (протечка, запах газа, нет света, человек в лифте): сразу дать инструкции по безопасности, срочность высокая. Запах газа: выйти из квартиры и звонить 104 или 112. Вопросы по квитанциям передавать бухгалтерии.",fr:"Urgences (fuite, odeur de gaz, plus d'électricité, personne bloquée) : consignes de sécurité d'abord, urgence élevée. Odeur de gaz : quitter le logement et appeler le 0 800 47 33 33. Questions de loyer : transmettre à la comptabilité.",de:"Notfälle (Wasserschaden, Gasgeruch, Stromausfall, Person im Aufzug): zuerst Sicherheitshinweise, hohe Dringlichkeit. Gasgeruch: Wohnung verlassen, 112 anrufen. Fragen zur Miete an die Buchhaltung."}
};
function realDoc(sphere, locale, bizName, city, owner){
  const src = V[sphere].biz[locale];
  return {biz:{name:bizName, owner, kind:src.kind, city, address:city, policy:POLICY[sphere][locale], hours:JSON.parse(JSON.stringify(src.hours)), services:src.services.map(([name,price,duration]) => ({name,price,duration}))},
    channels:{whatsapp:false, instagram:false, telegram:true, google:false, stripe:false, email:true}, mode:"auto", paused:false, tone:"warm", notes:{},
    ob:{svc:false, test:false, hidden:false}, guard:{contacts:true, offtopic:true, pause:true, offhours:false, deposit:false},
    items:[], convos:[], alerts:[], activity:[], readAt:0};
}
async function api(path, opts={}){
  const r = await fetch(path, {credentials:"same-origin", headers:{"content-type":"application/json"}, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined});
  let j = null; try{ j = await r.json(); }catch(e){}
  if(!r.ok) throw Object.assign(new Error((j && j.error) || "http_"+r.status), {code:(j && j.error) || "http_"+r.status, status:r.status});
  return j;
}
function applyMe(j){
  if(!j || !j.user || !j.doc){ store.user = null; SRV.doc = null; SRV.me = null; return; }
  store.user = j.user; SRV.me = j.business; SRV.doc = j.doc; SRV.ver = j.ver; vk = j.business.sphere;
  SRV.lastIds = new Set(j.doc.items.map(i => i.id)); SRV.alerts = j.doc.alerts.length;
}
async function srvInit(){
  try{
    const r = await fetch("/api/health", {credentials:"same-origin"});
    if(!r.ok || !(r.headers.get("content-type")||"").includes("json")) return;
    SRV.on = true;
    applyMe(await api("/api/me"));
    setInterval(srvPoll, 12000);
  }catch(e){ SRV.on = false; }
}
function softRefresh(){
  const a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if(route==="inbox" && $("#inbox")) refreshInbox();
  else if(!typing && !ui.cmd && !ui.modal) render();
}
async function srvPoll(){
  if(!SRV.on || !store.user || document.hidden || SRV.timer) return;
  try{
    const j = await api("/api/state");
    if(j.ver !== SRV.ver){
      const before = SRV.alerts;
      SRV.doc = j.doc; SRV.ver = j.ver; SRV.lastIds = new Set(j.doc.items.map(i => i.id)); SRV.alerts = j.doc.alerts.length;
      if(SRV.me) SRV.me.tgLinked = j.tgLinked;
      if(SRV.alerts > before) toast(t("srv_new"), "bell");
      softRefresh();
    }
  }catch(e){ if(e.status === 401){ store.user = null; render(); } }
}
function srvSaveSoon(){
  clearTimeout(SRV.timer);
  SRV.timer = setTimeout(async () => {
    const doc = SRV.doc; if(!doc) { SRV.timer = null; return; }
    const ids = new Set(doc.items.map(i => i.id)), deleted = [...SRV.lastIds].filter(id => !ids.has(id));
    try{
      const j = await api("/api/state", {method:"PUT", body:{doc, deleted}});
      SRV.doc = j.doc; SRV.ver = j.ver; SRV.lastIds = new Set(j.doc.items.map(i => i.id)); SRV.alerts = j.doc.alerts.length;
    }catch(e){ toast(t("err_server"), "info"); }
    SRV.timer = null;
  }, 700);
}
const _S = S; S = function(){ return SRV.on && SRV.doc ? SRV.doc : _S(); };
const _save = save; save = function(){ _save(); if(SRV.on && SRV.doc && store.user) srvSaveSoon(); };
const _setV = setV; setV = function(k){ if(SRV.on){ toast(t("srv_sphere_fixed"), "info"); return; } _setV(k); };

/* sign up / log in / log out */
const _renderAuth = renderAuth;
renderAuth = function(){
  _renderAuth();
  if(!SRV.on) return;
  $("[data-act='demoLogin']")?.remove(); $(".auth-box .divider")?.remove();
  if(ui.authMode === "signup"){
    const opts = VKEYS.map(k => `<option value="${k}" ${k===vk?"selected":""}>${esc(V[k].label[lang])}</option>`).join("");
    $("#auName")?.closest("label").insertAdjacentHTML("afterend", `<label class="field"><span>${t("f_biz")}</span><input class="input" id="auBiz" autocomplete="organization"></label>
      <label class="field"><span>${t("f_sphere")}</span><select class="select" id="auSphere">${opts}</select></label>
      <label class="field"><span>${t("f_city")}</span><input class="input" id="auCity" autocomplete="address-level2"></label>`);
  }
};
const _doAuth = doAuth;
doAuth = async function(){
  if(!SRV.on) return _doAuth();
  const su = ui.authMode === "signup", err = $("#auErr"), show = (m) => { err.textContent = m; err.hidden = false; };
  const email = $("#auEmail").value.trim(), password = $("#auPass").value;
  if(!/^\S+@\S+\.\S+$/.test(email)) return show(t("err_email"));
  if(password.length < 6) return show(t("err_pass"));
  const btn = $("#authForm button[type=submit]"); btn.disabled = true;
  try{
    let j;
    if(su){
      const name = $("#auName").value.trim(), biz = $("#auBiz").value.trim() || name, city = $("#auCity").value.trim(), sphere = $("#auSphere").value;
      if(!name) { btn.disabled = false; return show(t("err_name")); }
      j = await api("/api/auth/signup", {method:"POST", body:{name, email, password, sphere, locale:lang, doc: realDoc(sphere, lang, biz, city || "—", name)}});
    } else j = await api("/api/auth/login", {method:"POST", body:{email, password}});
    applyMe(j); toast(t("welcome")(store.user.name), "check"); go("dashboard");
  }catch(e){
    btn.disabled = false;
    show(e.code === "email_taken" ? t("err_taken") : e.code === "wrong_credentials" ? t("err_wrong") : t("err_server"));
  }
};
const _logout = ACT.logout;
ACT.logout = async function(el){ if(!SRV.on) return _logout(el); try{ await api("/api/auth/logout", {method:"POST"}); }catch(e){} store.user = null; SRV.doc = null; SRV.me = null; ui.authMode = "login"; go("login"); };
const _vert = ACT.vert; ACT.vert = function(el){ if(SRV.on){ toast(t("srv_sphere_fixed"), "info"); return; } _vert(el); };
document.addEventListener("submit", e => { if(e.target.id === "profForm" && SRV.on) api("/api/profile", {method:"PUT", body:{name:$("#pfName").value}}).catch(() => {}); });

/* AI on the server (test chat and price import) */
async function srvAI(){
  const existing = chatItemId ? S().items.find(i => i.id===chatItemId) : null;
  try{ return await api("/api/ai/test", {method:"POST", body:{turns: turns.slice(-16), existing}}); }
  catch(e){ throw {code: e.code === "ai_not_configured" ? "srv_ai_off" : "upstream_error"}; }
}
const _doImport = doImport;
doImport = async function(){
  if(!SRV.on || aiMode === "on") return _doImport();
  const out = $("#impRes"), text = $("#impText").value.trim();
  if(!text){ out.innerHTML = `<p class="err">${esc(t("imp_none"))}</p>`; return; }
  out.innerHTML = `<div style="display:grid;gap:8px"><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div><span class="muted" style="font-size:13px">${t("imp_wait")}</span></div>`;
  try{
    const {services} = await api("/api/ai/import", {method:"POST", body:{text}});
    if(!services.length) throw 0;
    importResult = services;
    out.innerHTML = services.map(s => `<div class="r"><span>${esc(s.name)}</span><span class="num">${money(s.price)} · ${t("min")(s.duration)}</span></div>`).join("") + `<div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="impApply">${ic("check","sm")}${t("imp_apply")}</button></div>`;
    $("#impApply").onclick = () => { S().biz.services = importResult; save(); toast(t("imp_done"),"check"); render(); };
  }catch(e){ out.innerHTML = `<p class="err">${esc(e && e.code==="ai_not_configured" ? t("srv_ai_off") : t("imp_fail"))}</p>`; }
};

/* owner replies to real (Telegram) conversations and AI drafts */
const _ownerSend = ownerSend;
ownerSend = async function(c, text, fromDraft){
  if(!SRV.on || !String(c.id).startsWith("tg")) return _ownerSend(c, text);
  try{ const j = await api(`/api/convos/${encodeURIComponent(c.id)}/reply`, {method:"POST", body:{text, fromDraft:!!fromDraft}}); SRV.doc = j.doc; SRV.ver = j.ver; SRV.lastIds = new Set(j.doc.items.map(i => i.id)); }
  catch(e){ toast(t("err_server"), "info"); }
  refreshInbox();
};
ACT.srvDraftSend = function(){ const c = getConvo(ui.convo); if(c) ownerSend(c, $("#draftText").value.trim(), true); };
ACT.srvDraftSkip = function(){ const c = getConvo(ui.convo); if(c){ c.draft = null; save(); refreshInbox(); } };
ACT.copy = function(el){ const v = el.dataset.v; navigator.clipboard?.writeText(v).then(() => toast(t("copied"),"check")).catch(() => {}); };

/* Telegram card on the integrations page */
const _pageInt = pageIntegrations;
pageIntegrations = function(){
  const html = _pageInt(); if(!SRV.on || !SRV.me) return html;
  const m = SRV.me, base = m.publicUrl || location.origin, bot = m.botUsername;
  const clientLink = bot ? `https://t.me/${bot}?start=${m.slug}` : "", ownerLink = bot ? `https://t.me/${bot}?start=pro_${m.tgCode}` : "", pageLink = `${base}/m/${m.slug}`;
  const row = (title, sub, val, extra="") => `<div class="row-set"><div style="min-width:0"><b>${title}</b><small>${sub}</small>${val?`<div class="mono" style="font-size:12px;margin-top:4px;overflow-wrap:anywhere">${esc(val)}</div>`:""}</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${extra}</div></div>`;
  const card = `<section class="card card-pad"><div class="card-h"><h3>${ic("send")} ${t("tg_t")}</h3>${m.telegramReady?`<span class="pill ok"><span class="d"></span>${t("connected")}</span>`:""}</div>
    ${m.telegramReady ? "" : `<p class="err" style="margin-bottom:8px">${t("tg_not_ready")}</p>`}
    ${row(t("tg_client"), t("tg_client_p"), clientLink, clientLink?`<button class="btn btn-sm" data-act="copy" data-v="${esc(clientLink)}">${t("copy")}</button>`:"")}
    ${row(t("tg_owner"), m.tgLinked ? t("tg_linked") : t("tg_owner_p"), "", m.tgLinked ? `<span class="pill ok">${ic("check","sm")}${t("tg_linked")}</span>` : ownerLink ? `<a class="btn btn-primary btn-sm" href="${esc(ownerLink)}" target="_blank" rel="noopener">${t("tg_owner_btn")}</a>` : "")}
    ${row(t("tg_page"), "", pageLink, `<button class="btn btn-sm" data-act="copy" data-v="${esc(pageLink)}">${t("copy")}</button><a class="btn btn-sm" href="#m-${esc(m.slug)}">${ic("ext","sm")}</a>`)}
  </section>`;
  return html.replace('<div class="int-grid">', card + '<div class="int-grid">');
};

/* real catalogue */
const _masters = masters;
masters = function(){
  if(!SRV.on) return _masters();
  return (SRV.masters || []).map(x => ({id:"m-"+x.slug, slug:x.slug, v:x.sphere, real:true, own: !!(SRV.me && SRV.me.slug===x.slug), name:x.name, area:x.city, address:x.address, city:x.city,
    rating:null, reviews:0, years:null, services:x.services, hours:x.hours, free:x.free||[], bot:x.bot, cur:x.cur}));
};
const _mSlots = mSlots;
mSlots = function(m, days=7){
  if(!m.real) return _mSlots(m, days);
  const last = iso(addDays(new Date(), days-1));
  return m.free.filter(s => s.date <= last && !(store.cbook||[]).some(b => b.mid===m.id && b.date===s.date && b.time===s.time));
};
async function loadMasters(){ try{ SRV.masters = (await api("/api/public/masters")).masters; }catch(e){ SRV.masters = []; } }
const _renderFind = renderFind;
renderFind = function(){ if(SRV.on && !SRV.masters){ SRV.masters = []; loadMasters().then(() => { if((location.hash||"").slice(1)==="find") _renderFind(); }); } _renderFind(); };
const _renderMasterPage = renderMasterPage;
renderMasterPage = function(id){
  if(SRV.on && !SRV.masters){ SRV.masters = []; loadMasters().then(() => _renderMasterPage(id)); $("#root").innerHTML = ""; return; }
  _renderMasterPage(id);
};
const _doBook = doBook;
doBook = async function(){
  const m = masters().find(x => x.id===ui.mp.id); if(!m || !m.real) return _doBook();
  const mp = ui.mp, isB = m.v==="beauty", svc = m.services[mp.svc];
  const name = $("#cName").value.trim(), phone = $("#cPhone").value.trim(), addr = $("#cAddr")?.value.trim() || "", prob = $("#cProb")?.value.trim() || "";
  let err = "";
  if(isB && (!mp.day || !mp.time)) err = t("c_err_slot"); else if(!isB && (!addr || !prob)) err = t("c_err_addr");
  else if(!name) err = t("c_err_name"); else if(phone.replace(/\D/g,"").length < 6) err = t("c_err_phone");
  const e = $("#cErr"); if(err){ e.textContent = err; e.hidden = false; return; }
  try{
    await api(`/api/public/masters/${encodeURIComponent(m.slug)}/book`, {method:"POST", body:{name, phone, svc:mp.svc, date: mp.time ? mp.day : null, time: mp.time || null, addr, prob}});
    (store.cbook ||= []).push({id:uid(), mid:m.id, mname:m.name, v:m.v, service:svc.name, price:svc.price, date: mp.time ? mp.day : null, time: mp.time, ts:Date.now()}); save();
    mp.done = {date: mp.time ? mp.day : null, time: mp.time};
    await loadMasters(); _renderMasterPage(m.id);
    $("#bookCard")?.scrollIntoView({behavior:"smooth", block:"start"});
    toast(isB ? t("c_ok_b") : t("c_ok_r"), "check");
  }catch(x){
    if(x.code === "slot_taken"){ await loadMasters(); mp.time = null; _renderMasterPage(m.id); const e2 = $("#cErr"); if(e2){ e2.textContent = t("c_err_taken"); e2.hidden = false; } }
    else { e.textContent = t("err_server"); e.hidden = false; }
  }
};

/* real numbers on the dashboard */
const _dash = dashNumbers;
dashNumbers = function(){
  if(!SRV.on || !SRV.doc) return _dash();
  const d = S(), today = iso(new Date()), month = today.slice(0,7);
  const days = Array.from({length:14}, (_,i) => iso(addDays(new Date(), i-13)));
  const daily = days.map(day => d.convos.reduce((a,c) => a + c.msgs.filter(m => m.from==="client" && iso(new Date(m.ts))===day).length, 0));
  const items = d.items.filter(i => i.status !== "cancelled");
  const revenue = items.filter(i => String(i.date||"").slice(0,7)===month).reduce((a,i) => a + (i.price||i.value||0), 0);
  const total = d.convos.length;
  const auto = total ? Math.round(100 * (1 - d.convos.filter(c => c.status==="waiting" || c.human).length / total)) : 0;
  const k = (x) => d.activity.filter(a => x.includes(a.kind)).length, sum = Math.max(1, k(["book","req","reply","handoff"]));
  const pct = (n) => Math.round(n*100/sum);
  return {daily, todayCount: daily[13], handled: total, revenue, auto,
    newCount: isBooking() ? items.filter(i => i.date >= today).length : items.filter(i => i.stage==="new").length,
    active: d.convos.filter(c => c.status !== "done").length,
    cats: [[t("cat1"), pct(k(["book","req"]))], [t("cat2"), pct(k(["reply"]))], [t("cat4"), pct(k(["handoff"]))]]};
};
function srvDraftHTML(c){
  return `<div class="draft"><b><span class="orb"></span>${t("draft_t")}</b><textarea id="draftText" aria-label="draft">${esc(c.draft.reply||"")}</textarea><div class="acts"><button class="btn btn-primary btn-sm" data-act="srvDraftSend">${ic("send","sm")}${t("draft_send")}</button><button class="btn btn-sm" data-act="srvDraftSkip">${t("draft_skip")}</button></div></div>`;
}
