// Geri bildirim e-postası: oyuncudan warsimbox@gmail.com kutusuna. Yalnız geliştirici okur, bu yüzden hep Türkçe. Oyuncunun
// yazdığı metin HTML'e kaçırılarak girer.

import type { Mail } from './codeMail';

export interface Feedback {
  name: string;
  /** Hesabın e-postası (misafirde yok). */
  email: string | null;
  lang: string | null;
  message: string;
  price: number | null;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function feedbackMail(f: Feedback): Mail {
  const price = f.price === null ? null : `${f.price} $`;
  const subject = f.message
    ? `Geri bildirim: ${f.name}${price ? ` · Steam: ${price}` : ''}`
    : `Steam fiyatı: ${price} (${f.name})`;
  const from = f.email ? `${f.name} (${f.email})` : `${f.name} (misafir)`;
  const lang = f.lang === 'en' ? 'İngilizce' : f.lang === 'tr' ? 'Türkçe' : 'bilinmiyor';
  const rows: [string, string][] = [['Gönderen', from], ['Dil', lang]];
  if (price) rows.push(['Steam’de verir', price]);
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), ...(f.message ? ['', f.message] : [])].join('\n');
  return {
    subject,
    text,
    html: `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1ec" style="background:#eef1ec;">
<tr><td align="center" style="padding:20px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td bgcolor="#86b3a2" style="background:#86b3a2;border-radius:16px 16px 0 0;padding:12px 20px;font-size:18px;font-weight:800;color:#ffffff;">WarSimBox geri bildirim</td></tr>
    <tr><td bgcolor="#fbf8f3" style="background:#fbf8f3;border-radius:0 0 16px 16px;padding:18px 20px;color:#45434f;font-size:15px;line-height:1.5;">
      ${rows.map(([k, v]) => `<div style="margin:0 0 4px;"><span style="color:#8b8797;">${k}:</span> <b>${esc(v)}</b></div>`).join('\n      ')}
      ${f.message ? `<div style="margin:14px 0 0;padding-top:14px;border-top:1px solid #e5ded2;white-space:pre-wrap;">${esc(f.message)}</div>` : ''}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}
