// Geri bildirim e-postası: oyuncudan warsimbox@gmail.com kutusuna. Yalnız geliştirici okur, bu yüzden hep Türkçe. Oyuncunun
// yazdığı metin HTML'e kaçırılarak girer. İnceleme istenen mesajda karar düğmeleri (katkı puanı, 2026-11-24): düğme
// warsimbox.com'da onay sayfası açar (reviewPage), puan orada "Onayla" ile verilir.

import type { Mail } from './codeMail';
import type { FeedbackAct, FeedbackKind, FeedbackStatus } from '../src/net/shared';

export interface Feedback {
  name: string;
  /** Hesabın e-postası (misafirde yok). */
  email: string | null;
  lang: string | null;
  message: string;
  /** Eski sürümlerin "Steam'de _ $ veririm" fiyatı. */
  price: number | null;
  kind: FeedbackKind | null;
  /** İnceleme istendiyse mesajın numarası ve karar bağlantıları. */
  id: number | null;
  links: { act: FeedbackAct; url: string }[] | null;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const KIND: Record<FeedbackKind, string> = { bug: 'Hata raporu', idea: 'Öneri' };
const ACT: Record<FeedbackAct, string> = { verify: 'Doğrulandı', accept: 'Kabul', done: 'Yapıldı', reject: 'Uygun değil', dup: 'Tekrar' };
const ACT_HINT: Record<FeedbackAct, string> = {
  verify: 'hata gerçekten var (+50)',
  accept: 'öneri yapılacak (+30)',
  done: 'düzeltildi ya da eklendi (+20; onaylanmamışsa onayı da verir)',
  reject: 'hata değil ya da öneri uygun değil (puan yok)',
  dup: 'aynısını başkası önce bildirdi (puan yok)',
};
export const STATUS_TR: Record<FeedbackStatus, string> = {
  review: 'İncelemede', verified: 'Doğrulandı', accepted: 'Kabul edildi', done: 'Yapıldı', rejected: 'Uygun değil', duplicate: 'Tekrar',
};
const BTN: Record<FeedbackAct, string> = { verify: '#4f8a6e', accept: '#4f8a6e', done: '#3f6f9a', reject: '#9a5a4f', dup: '#7d7a86' };

export function feedbackMail(f: Feedback): Mail {
  const price = f.price === null ? null : `${f.price} $`;
  const kind = f.kind ? KIND[f.kind] : 'Geri bildirim';
  const subject = f.message
    ? `${kind}${f.id !== null ? ' · İncelemede' : ''}: ${f.name}${price ? ` · Steam: ${price}` : ''}`
    : `Steam fiyatı: ${price} (${f.name})`;
  const from = f.email ? `${f.name} (${f.email})` : `${f.name} (misafir)`;
  const lang = f.lang === 'en' ? 'İngilizce' : f.lang === 'tr' ? 'Türkçe' : 'bilinmiyor';
  const rows: [string, string][] = [['Gönderen', from], ['Tür', kind], ['Dil', lang]];
  if (f.id !== null) rows.push(['İnceleme', `istendi (#${f.id})`]);
  if (price) rows.push(['Steam’de verir', price]);
  const links = f.links ?? [];
  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(f.message ? ['', f.message] : []),
    ...(links.length ? ['', 'Karar (bağlantı onay sayfası açar):', ...links.map((l) => `${ACT[l.act]}: ${l.url}`)] : []),
  ].join('\n');
  const buttons = links.length
    ? `<div style="margin:16px 0 0;padding-top:14px;border-top:1px solid #e5ded2;">
        <div style="color:#8b8797;font-size:13px;margin:0 0 8px;">Karar: düğme onay sayfası açar, puan orada verilir. Bu e-postayı kimseye iletme.</div>
        ${links.map((l) => `<a href="${esc(l.url)}" style="display:inline-block;margin:0 6px 8px 0;padding:9px 14px;border-radius:10px;background:${BTN[l.act]};color:#ffffff;font-weight:800;text-decoration:none;font-size:14px;">${ACT[l.act]}</a>`).join('')}
        <div style="color:#8b8797;font-size:12px;margin:4px 0 0;">${links.map((l) => `<b>${ACT[l.act]}</b>: ${ACT_HINT[l.act]}`).join('<br>')}</div>
      </div>`
    : '';
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
    <tr><td bgcolor="#86b3a2" style="background:#86b3a2;border-radius:16px 16px 0 0;padding:12px 20px;font-size:18px;font-weight:800;color:#ffffff;">WarSimBox ${esc(kind.toLocaleLowerCase('tr'))}</td></tr>
    <tr><td bgcolor="#fbf8f3" style="background:#fbf8f3;border-radius:0 0 16px 16px;padding:18px 20px;color:#45434f;font-size:15px;line-height:1.5;">
      ${rows.map(([k, v]) => `<div style="margin:0 0 4px;"><span style="color:#8b8797;">${k}:</span> <b>${esc(v)}</b></div>`).join('\n      ')}
      ${f.message ? `<div style="margin:14px 0 0;padding-top:14px;border-top:1px solid #e5ded2;white-space:pre-wrap;">${esc(f.message)}</div>` : ''}
      ${buttons}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}

export interface ReviewView {
  state: 'bad' | 'gone' | 'ask' | 'stale' | 'done';
  f?: { id: number; kind: FeedbackKind; status: FeedbackStatus; message: string; name: string | null; points: number };
  act?: FeedbackAct;
  add?: number;
  total?: number;
  mailed?: boolean;
}

/** Yöneticinin onay sayfası (e-postadaki karar düğmesi açar). Türkçe; arama motorlarına kapalı. */
export function reviewPage(v: ReviewView): string {
  const f = v.f;
  let body: string;
  if (v.state === 'bad') body = '<p>Bağlantı geçersiz. E-postadaki düğmeyi yeniden dene.</p>';
  else if (v.state === 'gone') body = '<p>Bu mesaj artık yok (oyuncu hesabını silmiş olabilir).</p>';
  else {
    const head = `<div class="meta"><b>${KIND[f!.kind]} #${f!.id}</b> · ${esc(f!.name ?? 'silinmiş hesap')} · şu an: <b>${STATUS_TR[f!.status]}</b> · bu mesajdan ${f!.points} puan</div>
      <div class="msg">${esc(f!.message)}</div>`;
    if (v.state === 'ask') {
      body = `${head}<form method="post"><p>İşlem: <b>${ACT[v.act!]}</b>${v.add ? ` (+${v.add} puan)` : ' (puan yok)'}. Oyuncuya durum e-postası gider.</p>
        <button type="submit">Onayla</button></form>`;
    } else if (v.state === 'stale') {
      body = `${head}<p>"${ACT[v.act!]}" bu durumda yapılamaz (zaten karar verilmiş olabilir). Başka bir düğme dene.</p>`;
    } else {
      body = `${head}<p class="ok">İşlendi: <b>${STATUS_TR[f!.status]}</b>${v.add ? ` (+${v.add} puan)` : ''}. Oyuncunun toplam katkı puanı: <b>${v.total ?? 0}</b>.
        ${v.mailed ? 'Oyuncuya e-posta gitti.' : 'Oyuncuya e-posta gönderilemedi.'}</p>`;
    }
  }
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Geri bildirim kararı · WarSimBox</title>
<style>
body{margin:0;background:#1b2420;color:#e9efe9;font-family:Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5}
main{max-width:560px;margin:0 auto;padding:20px 16px}
h1{font-size:20px;margin:0 0 12px}
.meta{color:#b9c6bd;font-size:14px;margin:0 0 10px}
.msg{white-space:pre-wrap;background:#26322c;border-radius:12px;padding:12px 14px;margin:0 0 14px}
button{font:inherit;font-weight:800;background:#4f8a6e;color:#fff;border:0;border-radius:12px;padding:12px 22px;min-height:44px;cursor:pointer}
.ok{background:#26322c;border-left:4px solid #6fbf8f;border-radius:8px;padding:10px 12px}
</style></head>
<body><main><h1>Geri bildirim kararı</h1>${body}</main></body></html>`;
}
