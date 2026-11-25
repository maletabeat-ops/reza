// Public legal pages: privacy policy, terms and data deletion instructions (required by Meta for Instagram).
// Served at /privacy, /terms and /data-deletion, in English, French, Russian and German (?lang=xx).
const CONTACT = () => process.env.CONTACT_EMAIL || "";
const OPERATOR = () => process.env.LEGAL_NAME || "Reza";
const UPDATED = "2026-11-25";
const SIRET = () => process.env.LEGAL_SIRET || "";
const ADDRESS = () => process.env.LEGAL_ADDRESS || "";

const T = {
  en: {
    mentions: { title: "Legal notice", sections: [["Publisher", "{op}{siret}{addr}"], ["Publication director", "{opname}"], ["Hosting", "Render Services, Inc., San Francisco, USA (render.com). Database: Neon, Inc. (neon.tech), servers in Frankfurt, Germany."], ["Personal data", "See the privacy policy."]], siret: "Registration number (SIRET)", addr: "Address" },
    nav: { privacy: "Privacy policy", terms: "Terms of use", deletion: "Data deletion", mentions: "Legal notice" },
    updated: "Last updated",
    contact: (m) => (m ? `Contact: <a href="mailto:${m}">${m}</a>` : "Contact: through the support form in your Reza account (Profile)."),
    privacy: {
      title: "Privacy policy",
      intro: (op) => `Reza is an AI receptionist for small businesses (beauty professionals, tradespeople, concierge and rental services). It answers clients in the messaging channels a business connects, books appointments and notifies the business owner. This policy explains what data ${op} processes and why.`,
      sections: [
        ["Data we process", [
          "Business owner accounts: name, e-mail address, a salted hash of the password, business details entered in the dashboard (services, prices, hours, address, policies).",
          "Client messages: the text of messages clients send to a connected business through Telegram, Instagram Direct or the Reza booking page, the client's display name or username, and the replies sent by Reza or by the owner.",
          "Bookings and requests created from those conversations (name, service, date, time, details, phone number if the client gives one).",
          "Instagram: when an owner connects an Instagram professional account, we store its account ID, username and an access token (encrypted at rest). We only receive Direct messages of that account. We never receive or store the Instagram password.",
          "Technical logs needed to run and secure the service (kept for a short time).",
        ]],
        ["Why we process it", [
          "To provide the service the business owner subscribed to: answering clients, booking, reminders and notifications (performance of a contract).",
          "To keep the service secure and prevent abuse (legitimate interest).",
          "We do not sell personal data, do not use it for advertising and do not use client messages to train AI models.",
        ]],
        ["Service providers", [
          "Render (application hosting) and Neon (database, stored in Frankfurt, Germany).",
          "Anthropic (generates the AI replies; messages are sent to its API only to produce a reply).",
          "Telegram and Meta (Instagram), to receive and send messages in the channels the owner connected.",
          "Where a provider is outside the EU, transfers rely on the European Commission's standard contractual clauses.",
        ]],
        ["Retention", [
          "Data is kept while the business account exists. Each conversation keeps at most its last 200 messages.",
          "When an owner deletes the account, the business, its conversations, bookings and connected channel tokens are deleted immediately.",
          "Disconnecting Instagram deletes the stored Instagram token at once.",
        ]],
        ["Your rights", [
          "Under the GDPR you can ask for access, correction, deletion, portability or restriction of your data and object to its processing.",
          "Clients of a business can ask that business, or us, to delete their conversation.",
          "You can also complain to your data protection authority (in France: the CNIL, www.cnil.fr).",
        ]],
      ],
    },
    terms: {
      title: "Terms of use",
      sections: [
        ["The service", ["Reza provides an AI assistant that answers clients and manages bookings on behalf of a business. The business owner configures it and remains responsible for the information it gives (prices, hours, policies)."]],
        ["Owner responsibilities", ["Connect only accounts you own or are authorised to manage.", "Do not use Reza for spam, unlawful content or to message people who did not contact you.", "Check important answers: an AI can make mistakes. Reza hands a conversation to you whenever it is unsure, and stops in a chat as soon as you reply yourself."]],
        ["Availability", ["We do our best to keep Reza available but do not guarantee uninterrupted service. Third-party channels (Telegram, Instagram) have their own rules and limits."]],
        ["Ending", ["You can disconnect any channel or delete your account at any time from the dashboard. We may suspend accounts that break these terms."]],
      ],
    },
    deletion: {
      title: "How to delete your data",
      sections: [
        ["Business owners", ["Open Reza → Profile → “Delete account” and confirm with your password. Your business, conversations, bookings and channel connections are deleted immediately and permanently.", "To stop only Instagram: Reza → Integrations → Instagram → “Disconnect”. The stored token is deleted at once. You can also remove Reza in Instagram → Settings → Website permissions → Apps and websites."]],
        ["Clients who wrote to a business", ["Ask the business directly, or write to us (contact below) with the business name and your username. We delete the conversation within 30 days and confirm by reply."]],
      ],
    },
  },
  fr: {
    mentions: { title: "Mentions légales", sections: [["Éditeur", "{op}{siret}{addr}"], ["Directeur de la publication", "{opname}"], ["Hébergement", "Render Services, Inc., San Francisco, États-Unis (render.com). Base de données : Neon, Inc. (neon.tech), serveurs à Francfort, Allemagne."], ["Données personnelles", "Voir la politique de confidentialité."]], siret: "SIRET", addr: "Adresse" },
    nav: { privacy: "Confidentialité", terms: "Conditions d'utilisation", deletion: "Suppression des données", mentions: "Mentions légales" },
    updated: "Dernière mise à jour",
    contact: (m) => (m ? `Contact : <a href="mailto:${m}">${m}</a>` : "Contact : via le formulaire d'aide de votre espace Reza (Profil)."),
    privacy: {
      title: "Politique de confidentialité",
      intro: (op) => `Reza est une assistante IA pour les petites entreprises (beauté, artisans, conciergerie, location). Elle répond aux clients sur les canaux connectés par l'entreprise, prend les rendez-vous et prévient le professionnel. Cette politique explique quelles données ${op} traite et pourquoi.`,
      sections: [
        ["Données traitées", [
          "Comptes professionnels : nom, adresse e-mail, empreinte salée du mot de passe, informations saisies dans l'espace (prestations, prix, horaires, adresse, conditions).",
          "Messages des clients : le texte envoyé à l'entreprise via Telegram, Instagram Direct ou la page de réservation Reza, le nom affiché ou le pseudo du client, et les réponses envoyées par Reza ou par le professionnel.",
          "Rendez-vous et demandes issus de ces conversations (nom, prestation, date, heure, détails, téléphone si le client le donne).",
          "Instagram : quand un professionnel connecte un compte Instagram professionnel, nous conservons son identifiant, son nom d'utilisateur et un jeton d'accès (chiffré). Nous recevons uniquement les messages Direct de ce compte. Nous ne recevons ni ne conservons jamais le mot de passe Instagram.",
          "Journaux techniques nécessaires au fonctionnement et à la sécurité (conservés peu de temps).",
        ]],
        ["Finalités", [
          "Fournir le service souscrit par le professionnel : réponses aux clients, réservations, rappels et notifications (exécution du contrat).",
          "Assurer la sécurité et prévenir les abus (intérêt légitime).",
          "Nous ne vendons pas les données, ne les utilisons pas pour la publicité et n'utilisons pas les messages des clients pour entraîner des modèles d'IA.",
        ]],
        ["Prestataires", [
          "Render (hébergement de l'application) et Neon (base de données, stockée à Francfort, Allemagne).",
          "Anthropic (génère les réponses de l'IA ; les messages lui sont envoyés uniquement pour produire une réponse).",
          "Telegram et Meta (Instagram), pour recevoir et envoyer les messages sur les canaux connectés.",
          "Lorsqu'un prestataire est hors de l'UE, les transferts reposent sur les clauses contractuelles types de la Commission européenne.",
        ]],
        ["Durée de conservation", [
          "Les données sont conservées tant que le compte existe. Chaque conversation garde au plus ses 200 derniers messages.",
          "La suppression du compte efface immédiatement l'entreprise, ses conversations, rendez-vous et jetons des canaux connectés.",
          "La déconnexion d'Instagram supprime immédiatement le jeton Instagram.",
        ]],
        ["Vos droits", [
          "Conformément au RGPD, vous pouvez demander l'accès, la rectification, l'effacement, la portabilité ou la limitation de vos données et vous opposer à leur traitement.",
          "Les clients d'une entreprise peuvent demander à celle-ci, ou à nous, de supprimer leur conversation.",
          "Vous pouvez aussi saisir la CNIL (www.cnil.fr).",
        ]],
      ],
    },
    terms: {
      title: "Conditions d'utilisation",
      sections: [
        ["Le service", ["Reza fournit une assistante IA qui répond aux clients et gère les rendez-vous pour le compte d'une entreprise. Le professionnel la configure et reste responsable des informations données (prix, horaires, conditions)."]],
        ["Engagements du professionnel", ["Ne connectez que des comptes qui vous appartiennent ou que vous êtes autorisé à gérer.", "N'utilisez pas Reza pour du spam, des contenus illicites ou pour écrire à des personnes qui ne vous ont pas contacté.", "Vérifiez les réponses importantes : une IA peut se tromper. Reza vous passe la main en cas de doute et se met en pause dès que vous répondez vous-même."]],
        ["Disponibilité", ["Nous faisons notre possible pour que Reza reste disponible, sans garantir un service ininterrompu. Les canaux tiers (Telegram, Instagram) ont leurs propres règles et limites."]],
        ["Fin du service", ["Vous pouvez déconnecter un canal ou supprimer votre compte à tout moment depuis votre espace. Nous pouvons suspendre un compte qui enfreint ces conditions."]],
      ],
    },
    deletion: {
      title: "Supprimer vos données",
      sections: [
        ["Professionnels", ["Ouvrez Reza → Profil → « Supprimer le compte » et confirmez avec votre mot de passe. L'entreprise, les conversations, les rendez-vous et les connexions aux canaux sont supprimés immédiatement et définitivement.", "Pour arrêter seulement Instagram : Reza → Intégrations → Instagram → « Déconnecter ». Le jeton est supprimé aussitôt. Vous pouvez aussi retirer Reza dans Instagram → Paramètres → Autorisations des sites web → Applis et sites web."]],
        ["Clients ayant écrit à une entreprise", ["Demandez-le directement à l'entreprise, ou écrivez-nous (contact ci-dessous) avec le nom de l'entreprise et votre pseudo. Nous supprimons la conversation sous 30 jours et vous le confirmons."]],
      ],
    },
  },
  ru: {
    mentions: { title: "Правовая информация", sections: [["Владелец сайта", "{op}{siret}{addr}"], ["Ответственный за публикацию", "{opname}"], ["Хостинг", "Render Services, Inc., Сан-Франциско, США (render.com). База данных: Neon, Inc. (neon.tech), серверы во Франкфурте, Германия."], ["Персональные данные", "См. политику конфиденциальности."]], siret: "SIRET", addr: "Адрес" },
    nav: { privacy: "Конфиденциальность", terms: "Условия использования", deletion: "Удаление данных", mentions: "Правовая информация" },
    updated: "Обновлено",
    contact: (m) => (m ? `Связь: <a href="mailto:${m}">${m}</a>` : "Связь: через форму поддержки в кабинете Reza (Профиль)."),
    privacy: {
      title: "Политика конфиденциальности",
      intro: (op) => `Reza — ИИ-администратор для малого бизнеса (мастера красоты, ремонт, консьерж-услуги, аренда). Reza отвечает клиентам в каналах, которые подключил бизнес, записывает их и уведомляет владельца. Здесь описано, какие данные обрабатывает ${op} и зачем.`,
      sections: [
        ["Какие данные мы обрабатываем", [
          "Аккаунты владельцев: имя, e-mail, хеш пароля с солью, данные бизнеса из кабинета (услуги, цены, часы работы, адрес, правила).",
          "Сообщения клиентов: текст сообщений, которые клиенты пишут бизнесу в Telegram, Instagram Direct или на странице записи Reza, имя или ник клиента, а также ответы Reza и владельца.",
          "Записи и заявки из этих переписок (имя, услуга, дата, время, детали, телефон, если клиент его указал).",
          "Instagram: при подключении профессионального аккаунта мы храним его ID, имя пользователя и токен доступа (в зашифрованном виде). Мы получаем только сообщения Direct этого аккаунта. Пароль от Instagram мы никогда не получаем и не храним.",
          "Технические журналы, нужные для работы и защиты сервиса (хранятся недолго).",
        ]],
        ["Зачем", [
          "Чтобы оказывать услугу, на которую подписан владелец: ответы клиентам, запись, напоминания и уведомления (исполнение договора).",
          "Чтобы защищать сервис от злоупотреблений (законный интерес).",
          "Мы не продаём данные, не используем их для рекламы и не обучаем на сообщениях клиентов модели ИИ.",
        ]],
        ["Подрядчики", [
          "Render (хостинг приложения) и Neon (база данных во Франкфурте, Германия).",
          "Anthropic (генерирует ответы ИИ; сообщения передаются туда только чтобы составить ответ).",
          "Telegram и Meta (Instagram) — чтобы получать и отправлять сообщения в подключённых каналах.",
          "Если подрядчик находится вне ЕС, передача данных идёт по стандартным договорным условиям Еврокомиссии.",
        ]],
        ["Сроки хранения", [
          "Данные хранятся, пока существует аккаунт бизнеса. В каждой переписке хранятся не больше 200 последних сообщений.",
          "При удалении аккаунта бизнес, переписки, записи и токены каналов удаляются сразу.",
          "При отключении Instagram его токен удаляется сразу.",
        ]],
        ["Ваши права", [
          "По GDPR вы можете запросить доступ к своим данным, их исправление, удаление, перенос или ограничение обработки, а также возразить против обработки.",
          "Клиенты бизнеса могут попросить бизнес или нас удалить их переписку.",
          "Вы также можете обратиться в надзорный орган по защите данных (во Франции — CNIL, www.cnil.fr).",
        ]],
      ],
    },
    terms: {
      title: "Условия использования",
      sections: [
        ["Сервис", ["Reza — ИИ-помощник, который отвечает клиентам и ведёт запись от имени бизнеса. Владелец настраивает его и отвечает за информацию, которую он сообщает (цены, часы, правила)."]],
        ["Обязанности владельца", ["Подключайте только свои аккаунты или те, которыми вам разрешено управлять.", "Не используйте Reza для спама, незаконного контента и сообщений людям, которые вам не писали.", "Проверяйте важные ответы: ИИ может ошибаться. Reza передаёт вам чат, когда не уверена, и замолкает, как только вы отвечаете сами."]],
        ["Доступность", ["Мы стараемся, чтобы Reza работала без перебоев, но не гарантируем этого. У сторонних каналов (Telegram, Instagram) свои правила и ограничения."]],
        ["Прекращение", ["Вы можете отключить любой канал или удалить аккаунт в любой момент в кабинете. Мы можем заблокировать аккаунт, нарушающий эти условия."]],
      ],
    },
    deletion: {
      title: "Как удалить свои данные",
      sections: [
        ["Владельцы бизнеса", ["Откройте Reza → Профиль → «Удалить аккаунт» и подтвердите паролем. Бизнес, переписки, записи и подключения каналов удаляются сразу и навсегда.", "Чтобы отключить только Instagram: Reza → Интеграции → Instagram → «Отключить». Токен удаляется сразу. Также можно убрать Reza в Instagram → Настройки → Разрешения сайтов → Приложения и сайты."]],
        ["Клиенты, писавшие бизнесу", ["Попросите об этом сам бизнес или напишите нам (контакт ниже), указав название бизнеса и ваш ник. Мы удалим переписку в течение 30 дней и подтвердим ответом."]],
      ],
    },
  },
  de: {
    mentions: { title: "Impressum", sections: [["Anbieter", "{op}{siret}{addr}"], ["Verantwortlich für den Inhalt", "{opname}"], ["Hosting", "Render Services, Inc., San Francisco, USA (render.com). Datenbank: Neon, Inc. (neon.tech), Server in Frankfurt, Deutschland."], ["Personenbezogene Daten", "Siehe Datenschutzerklärung."]], siret: "SIRET", addr: "Adresse" },
    nav: { privacy: "Datenschutz", terms: "Nutzungsbedingungen", deletion: "Datenlöschung", mentions: "Impressum" },
    updated: "Zuletzt aktualisiert",
    contact: (m) => (m ? `Kontakt: <a href="mailto:${m}">${m}</a>` : "Kontakt: über das Support-Formular in Ihrem Reza-Konto (Profil)."),
    privacy: {
      title: "Datenschutzerklärung",
      intro: (op) => `Reza ist eine KI-Rezeption für kleine Unternehmen (Beauty, Handwerk, Concierge, Vermietung). Reza antwortet Kunden in den verbundenen Kanälen, bucht Termine und benachrichtigt den Inhaber. Hier steht, welche Daten ${op} verarbeitet und warum.`,
      sections: [
        ["Welche Daten", [
          "Inhaberkonten: Name, E-Mail, gesalzener Passwort-Hash, im Profibereich eingegebene Angaben (Leistungen, Preise, Öffnungszeiten, Adresse, Regeln).",
          "Kundennachrichten: der Text, den Kunden dem Unternehmen über Telegram, Instagram Direct oder die Reza-Buchungsseite schreiben, Anzeigename oder Benutzername sowie die Antworten von Reza oder dem Inhaber.",
          "Termine und Aufträge aus diesen Gesprächen (Name, Leistung, Datum, Uhrzeit, Details, Telefonnummer, falls angegeben).",
          "Instagram: Beim Verbinden eines professionellen Kontos speichern wir dessen ID, Benutzernamen und ein Zugriffstoken (verschlüsselt). Wir erhalten nur die Direct-Nachrichten dieses Kontos. Das Instagram-Passwort erhalten und speichern wir nie.",
          "Technische Protokolle für Betrieb und Sicherheit (kurz aufbewahrt).",
        ]],
        ["Zwecke", [
          "Erbringung des vom Inhaber abonnierten Dienstes: Kundenantworten, Buchungen, Erinnerungen, Benachrichtigungen (Vertragserfüllung).",
          "Sicherheit und Missbrauchsschutz (berechtigtes Interesse).",
          "Wir verkaufen keine Daten, nutzen sie nicht für Werbung und trainieren keine KI-Modelle mit Kundennachrichten.",
        ]],
        ["Dienstleister", [
          "Render (Hosting der Anwendung) und Neon (Datenbank in Frankfurt, Deutschland).",
          "Anthropic (erstellt die KI-Antworten; Nachrichten werden nur dafür an die API gesendet).",
          "Telegram und Meta (Instagram), um Nachrichten in den verbundenen Kanälen zu empfangen und zu senden.",
          "Bei Dienstleistern außerhalb der EU erfolgt die Übermittlung auf Grundlage der Standardvertragsklauseln der EU-Kommission.",
        ]],
        ["Speicherdauer", [
          "Daten bleiben gespeichert, solange das Konto besteht. Pro Gespräch werden höchstens die letzten 200 Nachrichten aufbewahrt.",
          "Beim Löschen des Kontos werden Unternehmen, Gespräche, Termine und Kanal-Tokens sofort gelöscht.",
          "Beim Trennen von Instagram wird das Token sofort gelöscht.",
        ]],
        ["Ihre Rechte", [
          "Nach der DSGVO können Sie Auskunft, Berichtigung, Löschung, Übertragbarkeit oder Einschränkung verlangen und der Verarbeitung widersprechen.",
          "Kunden eines Unternehmens können dieses oder uns bitten, ihr Gespräch zu löschen.",
          "Sie können sich auch bei einer Datenschutzaufsichtsbehörde beschweren.",
        ]],
      ],
    },
    terms: {
      title: "Nutzungsbedingungen",
      sections: [
        ["Der Dienst", ["Reza ist eine KI-Assistenz, die im Namen eines Unternehmens Kunden antwortet und Termine verwaltet. Der Inhaber richtet sie ein und bleibt für die Angaben verantwortlich (Preise, Zeiten, Regeln)."]],
        ["Pflichten des Inhabers", ["Verbinden Sie nur eigene oder von Ihnen verwaltete Konten.", "Nutzen Sie Reza nicht für Spam, rechtswidrige Inhalte oder Nachrichten an Personen, die Sie nicht kontaktiert haben.", "Prüfen Sie wichtige Antworten: Eine KI kann sich irren. Reza übergibt im Zweifel an Sie und pausiert, sobald Sie selbst antworten."]],
        ["Verfügbarkeit", ["Wir bemühen uns um einen stabilen Betrieb, garantieren ihn aber nicht. Drittkanäle (Telegram, Instagram) haben eigene Regeln und Grenzen."]],
        ["Beendigung", ["Sie können jederzeit Kanäle trennen oder Ihr Konto im Profibereich löschen. Konten, die gegen diese Bedingungen verstoßen, können wir sperren."]],
      ],
    },
    deletion: {
      title: "So löschen Sie Ihre Daten",
      sections: [
        ["Inhaber", ["Öffnen Sie Reza → Profil → „Konto löschen“ und bestätigen Sie mit Ihrem Passwort. Unternehmen, Gespräche, Termine und Kanalverbindungen werden sofort und endgültig gelöscht.", "Nur Instagram beenden: Reza → Integrationen → Instagram → „Trennen“. Das Token wird sofort gelöscht. Sie können Reza auch in Instagram → Einstellungen → Website-Berechtigungen → Apps und Websites entfernen."]],
        ["Kunden, die einem Unternehmen geschrieben haben", ["Wenden Sie sich an das Unternehmen oder an uns (Kontakt unten) mit dem Namen des Unternehmens und Ihrem Benutzernamen. Wir löschen das Gespräch innerhalb von 30 Tagen und bestätigen es."]],
      ],
    },
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const LEGAL_LANGS = Object.keys(T);

export function pickLang(query, acceptLanguage) {
  if (T[query]) return query;
  for (const part of String(acceptLanguage || "").split(",")) { const l = part.trim().slice(0, 2).toLowerCase(); if (T[l]) return l; }
  return "en";
}

export function legalPage(kind, lang) {
  const L = T[lang] || T.en, path = { privacy: "/privacy", terms: "/terms", deletion: "/data-deletion", mentions: "/mentions-legales" };
  let doc = L[kind];
  if (kind === "mentions") { // fill the operator details
    const fill = (x) => x.replace("{op}", OPERATOR()).replace("{opname}", OPERATOR()).replace("{siret}", SIRET() ? ` · ${L.mentions.siret} ${SIRET()}` : "").replace("{addr}", ADDRESS() ? ` · ${L.mentions.addr}: ${ADDRESS()}` : "");
    doc = { ...doc, sections: doc.sections.map(([h, t]) => [h, [fill(t)]]) };
  }
  const body = (kind === "privacy" ? `<p class="lead">${esc(doc.intro(OPERATOR()))}</p>` : "") +
    doc.sections.map(([h, items]) => `<h2>${esc(h)}</h2>${items.length > 1 ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(items[0])}</p>`}`).join("");
  const langs = LEGAL_LANGS.map((l) => `<a href="${path[kind]}?lang=${l}"${l === lang ? ' aria-current="true"' : ""}>${l.toUpperCase()}</a>`).join("");
  const nav = Object.entries(path).map(([k, p]) => `<a href="${p}?lang=${lang}"${k === kind ? ' aria-current="true"' : ""}>${esc(L.nav[k])}</a>`).join("");
  const contact = CONTACT() ? L.contact(esc(CONTACT())) : L.contact("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} · Reza</title><link rel="icon" href="/icon.svg">
<style>
:root{--ink:#151015;--muted:#6f676d;--pink:#F72585;--bg:#FFF9FC;--line:#f3dbe7}
@media (prefers-color-scheme:dark){:root{--ink:#f6eef2;--muted:#b5aab0;--bg:#151015;--line:#3a2c34}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 16px 64px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:28px}
.brand{font-weight:800;font-size:22px;color:var(--ink);text-decoration:none}.brand span{color:var(--pink)}
nav{display:flex;flex-wrap:wrap;gap:6px}nav a{color:var(--muted);text-decoration:none;font-size:14px;padding:4px 10px;border-radius:99px;border:1px solid var(--line)}
nav a[aria-current]{color:#fff;background:var(--pink);border-color:var(--pink)}
h1{font-size:32px;line-height:1.2;margin:0 0 6px}h2{font-size:19px;margin:30px 0 8px}.lead{font-size:17px}
.meta,footer{color:var(--muted);font-size:14px}ul{padding-left:20px}li{margin:6px 0}a{color:var(--pink)}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line)}
</style></head><body><main>
<header><a class="brand" href="/">R<span>e</span>za</a><nav>${langs}</nav></header>
<nav style="margin-bottom:22px">${nav}</nav>
<h1>${esc(doc.title)}</h1><p class="meta">${esc(L.updated)}: ${UPDATED} · ${esc(OPERATOR())}</p>
${body}
<footer>${contact}</footer>
</main></body></html>`;
}
