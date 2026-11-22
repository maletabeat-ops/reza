// Builds public/index.html from web/app.html (the app is written as a body fragment).
import fs from "node:fs";
const body = fs.readFileSync(new URL("../web/app.html", import.meta.url), "utf8");
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Reza — ИИ-администратор для мастеров и малого бизнеса. Отвечает клиентам 24/7 и записывает их.">
<meta name="theme-color" content="#151015">
<link rel="manifest" href="/manifest.webmanifest">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/index.html", import.meta.url), html);
console.log("public/index.html built");
