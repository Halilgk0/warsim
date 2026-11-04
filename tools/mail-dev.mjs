// Yerelde e-posta denemesi: gerçek e-posta göndermeyen sahte SMTP sunucusu. Worker'ın gönderdiklerini http://localhost:2526
// adresinde gösterir (doğrulama kodları burada görünür). Kullanım: .dev.vars'a SMTP_HOST=127.0.0.1, SMTP_PORT=2525 ve
// herhangi bir MAIL_PASSWORD yaz, sonra: node tools/mail-dev.mjs ve npm run serve. POST /fail: sonraki bağlantı reddedilir.

import { createServer as tcp } from 'node:net';
import { createServer as http } from 'node:http';

const inbox = [];
let failNext = false;

function decode(raw) {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const to = /^To: <(.+)>$/m.exec(head)?.[1] ?? '?';
  const from = /^From: (.+)$/m.exec(head)?.[1] ?? '?';
  const sub = /^Subject: =\?UTF-8\?B\?(.+)\?=$/m.exec(head)?.[1] ?? '';
  const part = (type) => {
    const m = new RegExp(`Content-Type: text/${type};[^]*?\\r\\n\\r\\n([^-]+)`).exec(rest.join('\r\n\r\n'));
    return m ? Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString() : '';
  };
  const replyTo = /^Reply-To: <(.+)>$/m.exec(head)?.[1] ?? null;
  return { to, from, replyTo, subject: Buffer.from(sub, 'base64').toString(), text: part('plain'), html: part('html') };
}

tcp((s) => {
  if (failNext) {
    failNext = false;
    s.end('421 servis kapali\r\n');
    return;
  }
  let buf = '';
  let inData = false;
  let auth = false;
  s.write('220 mail-dev\r\n');
  s.on('data', (d) => {
    buf += d;
    for (;;) {
      if (inData) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) return;
        const m = decode(buf.slice(0, end));
        inbox.unshift({ ...m, at: new Date().toISOString() });
        console.log(`${m.to}: ${m.subject}`);
        buf = buf.slice(end + 5);
        inData = false;
        s.write('250 tamam\r\n');
        continue;
      }
      const nl = buf.indexOf('\r\n');
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      if (line.startsWith('EHLO')) s.write('250-mail-dev\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
      else if (line.startsWith('AUTH PLAIN ')) {
        auth = Buffer.from(line.slice(11), 'base64').toString().split('\0').length === 3;
        s.write(auth ? '235 tamam\r\n' : '535 hata\r\n');
      } else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) s.write(auth ? '250 tamam\r\n' : '530 once giris\r\n');
      else if (line === 'DATA') {
        inData = true;
        s.write('354 yaz\r\n');
      } else if (line === 'QUIT') s.end('221 gule gule\r\n');
      else s.write('500 bilinmiyor\r\n');
    }
  });
  s.on('error', () => {});
}).listen(2525, '127.0.0.1');

http((req, res) => {
  if (req.method === 'POST' && req.url === '/fail') {
    failNext = true;
    res.end('ok');
    return;
  }
  if (req.url === '/json') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(inbox));
    return;
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Yerel e-postalar</title>
<body style="font:16px system-ui;max-width:640px;margin:24px auto;padding:0 16px"><h1>Yerel e-postalar</h1><p>Gerçek e-posta gönderilmez.</p>
${inbox.map((m) => `<hr><p><b>${esc(m.subject)}</b><br>Kime: ${esc(m.to)}<br>Kimden: ${esc(m.from)}</p><iframe sandbox title="E-posta" style="width:100%;height:440px;border:1px solid #ccc" srcdoc="${esc(m.html).replace(/"/g, '&quot;')}"></iframe><pre style="white-space:pre-wrap">${esc(m.text)}</pre>`).join('') || '<p>Henüz e-posta yok.</p>'}`);
}).listen(2526, '127.0.0.1');

console.log('Sahte SMTP 127.0.0.1:2525, kutu http://localhost:2526');
