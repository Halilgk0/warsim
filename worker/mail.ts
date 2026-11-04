// E-posta gönderme: MAIL_FROM hesabından Gmail SMTP ile (port 465, TLS). Şifre Google'ın uygulama şifresidir ve yalnız
// Cloudflare sırrı olarak durur (MAIL_PASSWORD). Geliştirmede SMTP_HOST verilirse TLS'siz ona bağlanır (tools/mail-dev.mjs).

import { connect } from 'cloudflare:sockets';
import type { Mail } from './codeMail';

export interface MailEnv {
  MAIL_FROM?: string;
  MAIL_PASSWORD?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
}

const TIMEOUT_MS = 12000;
const enc = new TextEncoder();

function b64(s: string): string {
  let out = '';
  for (const c of enc.encode(s)) out += String.fromCharCode(c);
  return btoa(out);
}

export const mailReady = (env: MailEnv): boolean => !!env.MAIL_FROM && !!env.MAIL_PASSWORD;

/**
 * Alıcı ve replyTo validEmail'den geçmiş olmalı (satır sonu taşıyamaz). Başarısızsa hata fırlatır; iletide adres ve şifre olmaz.
 * replyTo: e-postadaki Yanıtla düğmesi bu adrese yazar (geri bildirimde oyuncu).
 */
export async function sendMail(env: MailEnv, to: string, mail: Mail, replyTo: string | null = null): Promise<void> {
  const from = env.MAIL_FROM!;
  const socket = connect(
    { hostname: env.SMTP_HOST ?? 'smtp.gmail.com', port: Number(env.SMTP_PORT ?? 465) },
    { secureTransport: env.SMTP_HOST ? 'off' : 'on', allowHalfOpen: false },
  );
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const dec = new TextDecoder();
  let buf = '';

  /** Sunucunun yanıtı: çok satırlıysa son satıra ("250 ...") kadar okunur; beklenen kod değilse hata. */
  const reply = async (step: string, want: string): Promise<void> => {
    for (;;) {
      const nl = buf.indexOf('\r\n');
      if (nl < 0) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`smtp ${step}: bağlantı kapandı`);
        buf += dec.decode(value, { stream: true });
        continue;
      }
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      if (line[3] === '-') continue;
      if (!line.startsWith(want)) throw new Error(`smtp ${step}: ${line.slice(0, 9)}`);
      return;
    }
  };
  const send = (line: string) => writer.write(enc.encode(`${line}\r\n`));
  const step = async (name: string, line: string, want: string): Promise<void> => {
    await send(line);
    await reply(name, want);
  };

  // İki sürüm: HTML gösteremeyen program düz metni okur
  const boundary = `wsb-${crypto.randomUUID()}`;
  const part = (type: string, content: string) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    b64(content).replace(/.{1,76}/g, '$&\r\n'),
  ].join('\r\n');
  const message = [
    `From: WarSimBox <${from}>`,
    `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@warsimbox.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', mail.text),
    part('text/html', mail.html),
    `--${boundary}--`,
    '.',
  ].join('\r\n');

  const dialog = async (): Promise<void> => {
    await reply('hello', '220');
    await step('ehlo', 'EHLO warsimbox.com', '250');
    await step('auth', `AUTH PLAIN ${b64(`\0${from}\0${env.MAIL_PASSWORD!.replace(/\s/g, '')}`)}`, '235');
    await step('from', `MAIL FROM:<${from}>`, '250');
    await step('rcpt', `RCPT TO:<${to}>`, '250');
    await step('data', 'DATA', '354');
    await step('body', message, '250');
    await send('QUIT');
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      dialog(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('smtp: zaman aşımı')), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}
