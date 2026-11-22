// Server-side texts: Telegram messages to clients and owners, in the business language.
export const TX = {
  ru: {
    hello: (biz) => `Здравствуйте! 👋 Это ИИ-администратор «${biz}». Напишите, что вас интересует: цены, свободное время, запись.`,
    no_biz: (url) => `Здравствуйте! Это Reza. Чтобы написать мастеру, откройте его страницу в каталоге: ${url}`,
    owner_linked: (biz) => `Готово ✅ Сюда будут приходить уведомления «${biz}»: новые записи, заявки и вопросы, которые ИИ передал вам.`,
    owner_only: "Это чат уведомлений Reza. Отвечайте клиентам в кабинете Reza.",
    wait_owner: "Спасибо! Мастер ответит вам лично в ближайшее время 🙏",
    n_book: (n, s, d, t) => `🗓 Новая запись: ${n} — «${s}», ${d} в ${t}`,
    n_req: (n, x, u) => `🛠 Новая заявка (${u}): ${n} — «${x}»`,
    n_wait: (n, x) => `✋ ${n} ждёт вашего ответа: «${x}»`,
    n_draft: (n) => `✍️ ИИ подготовил черновик ответа для ${n}. Отправьте его из кабинета.`,
    n_cancel: (n) => `❌ ${n} отменил(а) запись`,
    remind: (n, s, biz, t, a) => `Здравствуйте, ${n}! 😊 Напоминаем: завтра в ${t} у вас «${s}» в «${biz}», ${a}.\nЕсли планы изменились, просто напишите сюда.`,
    urg: { high: "срочно", normal: "обычная", low: "не срочно" },
    taken: (alt) => `Ой, это время только что заняли 🙈 Свободно: ${alt}. Какое удобнее?`,
    error: "Извините, сейчас не могу ответить. Мастер свяжется с вами лично.",
    web: "сайт",
  },
  fr: {
    hello: (biz) => `Bonjour ! 👋 Ici l'assistante IA de « ${biz} ». Écrivez-moi : prix, disponibilités, réservation.`,
    no_biz: (url) => `Bonjour ! Ici Reza. Pour écrire à un pro, ouvrez sa page dans le catalogue : ${url}`,
    owner_linked: (biz) => `C'est fait ✅ Vous recevrez ici les notifications de « ${biz} » : rendez-vous, demandes et questions transmises par l'IA.`,
    owner_only: "Ce chat sert aux notifications Reza. Répondez aux clients depuis votre espace Reza.",
    wait_owner: "Merci ! Le pro vous répond personnellement très vite 🙏",
    n_book: (n, s, d, t) => `🗓 Nouveau rendez-vous : ${n} — « ${s} », ${d} à ${t}`,
    n_req: (n, x, u) => `🛠 Nouvelle demande (${u}) : ${n} — « ${x} »`,
    n_wait: (n, x) => `✋ ${n} attend votre réponse : « ${x} »`,
    n_draft: (n) => `✍️ L'IA a préparé un brouillon pour ${n}. Envoyez-le depuis votre espace.`,
    n_cancel: (n) => `❌ ${n} a annulé son rendez-vous`,
    remind: (n, s, biz, t, a) => `Bonjour ${n} ! 😊 Petit rappel : demain à ${t}, « ${s} » chez ${biz}, ${a}.\nSi vos plans changent, écrivez-nous ici.`,
    urg: { high: "urgent", normal: "normal", low: "pas urgent" },
    taken: (alt) => `Oups, ce créneau vient d'être pris 🙈 Il me reste : ${alt}. Lequel vous irait ?`,
    error: "Désolé, je ne peux pas répondre pour l'instant. Le pro vous recontacte personnellement.",
    web: "site",
  },
  de: {
    hello: (biz) => `Hallo! 👋 Hier ist die KI-Assistenz von „${biz}“. Schreiben Sie mir: Preise, freie Termine, Buchung.`,
    no_biz: (url) => `Hallo! Hier ist Reza. Um einem Profi zu schreiben, öffnen Sie seine Seite im Katalog: ${url}`,
    owner_linked: (biz) => `Erledigt ✅ Hier erhalten Sie die Benachrichtigungen von „${biz}“: Termine, Aufträge und Fragen, die die KI an Sie übergibt.`,
    owner_only: "Dieser Chat ist für Reza-Benachrichtigungen. Antworten Sie Kunden in Ihrem Reza-Profibereich.",
    wait_owner: "Danke! Der Profi antwortet Ihnen in Kürze persönlich 🙏",
    n_book: (n, s, d, t) => `🗓 Neuer Termin: ${n} — „${s}“, ${d} um ${t}`,
    n_req: (n, x, u) => `🛠 Neuer Auftrag (${u}): ${n} — „${x}“`,
    n_wait: (n, x) => `✋ ${n} wartet auf Ihre Antwort: „${x}“`,
    n_draft: (n) => `✍️ Die KI hat einen Entwurf für ${n} vorbereitet. Senden Sie ihn aus Ihrem Profibereich.`,
    n_cancel: (n) => `❌ ${n} hat den Termin abgesagt`,
    remind: (n, s, biz, t, a) => `Hallo ${n}! 😊 Kleine Erinnerung: morgen um ${t} „${s}“ bei ${biz}, ${a}.\nWenn sich etwas ändert, schreiben Sie einfach hier.`,
    urg: { high: "dringend", normal: "normal", low: "nicht dringend" },
    taken: (alt) => `Oh, dieser Termin ist gerade weg 🙈 Frei sind noch: ${alt}. Was passt Ihnen?`,
    error: "Entschuldigung, ich kann gerade nicht antworten. Der Profi meldet sich persönlich.",
    web: "Website",
  },
};
export const tx = (locale) => TX[locale] || TX.ru;
const LOC = { ru: "ru-RU", fr: "fr-FR", de: "de-DE" };
export const fmtDay = (iso, locale) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(LOC[locale] || "ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};
