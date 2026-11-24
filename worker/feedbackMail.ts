// Geri bildirim e-postası: oyuncudan warsimbox@gmail.com kutusuna. Yalnız geliştirici okur, bu yüzden hep Türkçe. Oyuncunun
// yazdığı metin HTML'e kaçırılarak girer. İnceleme istenen mesajda karar düğmeleri (katkı puanı, 2026-11-24): düğme
// warsimbox.com'da onay sayfası açar (reviewPage), puan orada "Onayla" ile verilir. Onay sayfası mesajın şu anki durumunu ve yalnız
// geçerli düğmeleri gösterir, oyuncuya not yazılır (ör. reddetme nedeni). Tüm geri bildirimler sayfası (feedbackListPage) her
// e-postadan ve onay sayfasından açılır: neyi onayladığın, neyin yapıldığı orada görünür.

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
  /** Tüm geri bildirimler sayfası (imzalı). */
  list: string | null;
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
    ...(f.list ? ['', `Tüm geri bildirimler: ${f.list}`] : []),
  ].join('\n');
  const buttons = links.length
    ? `<div style="margin:16px 0 0;padding-top:14px;border-top:1px solid #e5ded2;">
        <div style="color:#8b8797;font-size:13px;margin:0 0 8px;">Karar: düğme onay sayfası açar, puan orada verilir. Bu e-postayı kimseye iletme.</div>
        ${links.map((l) => `<a href="${esc(l.url)}" style="display:inline-block;margin:0 6px 8px 0;padding:9px 14px;border-radius:10px;background:${BTN[l.act]};color:#ffffff;font-weight:800;text-decoration:none;font-size:14px;">${ACT[l.act]}</a>`).join('')}
        <div style="color:#8b8797;font-size:12px;margin:4px 0 0;">${links.map((l) => `<b>${ACT[l.act]}</b>: ${ACT_HINT[l.act]}`).join('<br>')}</div>
        ${f.list ? `<div style="margin:12px 0 0;"><a href="${esc(f.list)}" style="color:#3f6f9a;font-weight:800;">Tüm geri bildirimler ve durumları ›</a></div>` : ''}
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

type Link = { act: FeedbackAct; url: string };

export interface ReviewView {
  state: 'bad' | 'gone' | 'ask' | 'stale' | 'done';
  f?: { id: number; kind: FeedbackKind; status: FeedbackStatus; message: string; name: string | null; points: number; created: number; updated: number; note: string | null };
  act?: FeedbackAct;
  add?: number;
  total?: number;
  mailed?: boolean;
  /** Mesajın şu anki durumunda geçerli karar bağlantıları. */
  links?: Link[];
  /** Tüm geri bildirimler sayfası. */
  list?: string;
}

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  review: '#c49e58', verified: '#4f8a6e', accepted: '#4f8a6e', done: '#3f6f9a', rejected: '#9a5a4f', duplicate: '#7d7a86',
};
const dateTr = (t: number): string => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusChip = (st: FeedbackStatus): string => `<span class="chip" style="background:${STATUS_COLOR[st]}">${STATUS_TR[st]}</span>`;
const actButtons = (links: Link[]): string => links.map((l) => `<a class="btn b-${l.act}" href="${esc(l.url)}">${ACT[l.act]}</a>`).join('');

const STYLE = `body{margin:0;background:#1b2420;color:#e9efe9;font-family:Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5}
main{max-width:640px;margin:0 auto;padding:20px 16px}
h1{font-size:20px;margin:0 0 12px}
.meta{color:#b9c6bd;font-size:14px;margin:0 0 10px}
.msg{white-space:pre-wrap;background:#26322c;border-radius:12px;padding:12px 14px;margin:0 0 14px}
.note{background:#2b2a22;border-left:4px solid #c49e58;border-radius:8px;padding:8px 12px;margin:0 0 14px;font-size:14px;white-space:pre-wrap}
.chip{display:inline-block;color:#fff;font-weight:800;font-size:13px;border-radius:99px;padding:2px 10px}
.big{font-size:18px;margin:0 0 6px}
button,.btn{display:inline-block;font:inherit;font-weight:800;background:#4f8a6e;color:#fff;border:0;border-radius:12px;padding:10px 18px;min-height:44px;box-sizing:border-box;cursor:pointer;text-decoration:none;margin:0 6px 8px 0}
.b-done{background:#3f6f9a}.b-reject{background:#9a5a4f}.b-dup{background:#7d7a86}
textarea{width:100%;box-sizing:border-box;min-height:84px;font:inherit;font-size:15px;color:#e9efe9;background:#26322c;border:1.5px solid #3d4a43;border-radius:10px;padding:8px 10px;margin:4px 0 10px}
label{font-size:14px;color:#b9c6bd}
.ok{background:#26322c;border-left:4px solid #6fbf8f;border-radius:8px;padding:10px 12px;margin:0 0 14px}
.warn{background:#2b2622;border-left:4px solid #c49e58;border-radius:8px;padding:10px 12px;margin:0 0 14px}
.list a.all{color:#a6dcc0;font-weight:800}
.row{border-top:1px solid #33403a;padding:12px 0}
.row .msg{margin:6px 0 8px;font-size:14px;padding:8px 10px}
.muted{color:#93a39a;font-size:13px}`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · WarSimBox</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

/** Yöneticinin onay sayfası (e-postadaki karar düğmesi açar). Türkçe; arama motorlarına kapalı. */
export function reviewPage(v: ReviewView): string {
  const f = v.f;
  const listLink = v.list ? `<p class="list"><a class="all" href="${esc(v.list)}">‹ Tüm geri bildirimler</a></p>` : '';
  if (v.state === 'bad') return shell('Geri bildirim kararı', '<h1>Geri bildirim kararı</h1><p>Bağlantı geçersiz. E-postadaki düğmeyi yeniden dene.</p>');
  if (v.state === 'gone' || !f) return shell('Geri bildirim kararı', '<h1>Geri bildirim kararı</h1><p>Bu mesaj artık yok (oyuncu hesabını silmiş olabilir).</p>');
  const head = `${listLink}<h1>${KIND[f.kind]} #${f.id}</h1>
    <p class="big">Şu an: ${statusChip(f.status)} · bu mesajdan <b>${f.points}</b> puan</p>
    <div class="meta">${esc(f.name ?? 'silinmiş hesap')} · gönderildi ${dateTr(f.created)}${f.updated > f.created ? ` · son karar ${dateTr(f.updated)}` : ''}</div>
    <div class="msg">${esc(f.message)}</div>
    ${f.note ? `<div class="note"><b>Oyuncuya not:</b> ${esc(f.note)}</div>` : ''}`;
  const others = (v.links ?? []).filter((l) => l.act !== v.act);
  const more = (label: string, links: Link[]) => (links.length ? `<p class="meta">${label}</p>${actButtons(links)}` : '<p class="meta">Bu mesajda yapılacak başka karar yok.</p>');
  let body: string;
  if (v.state === 'ask') {
    const placeholder = v.act === 'reject' ? 'Neden uygun değil? (oyuncunun e-postasına ve Profil\'ine gider)' : v.act === 'dup' ? 'İstersen: hangi bildirimin tekrarı' : 'İstersen oyuncuya kısa bir not';
    body = `${head}<form method="post">
        <p>İşlem: <b>${ACT[v.act!]}</b>${v.add ? ` (+${v.add} puan)` : ' (puan yok)'}. Oyuncuya durum e-postası gider.</p>
        <label for="note">Oyuncuya not${v.act === 'reject' ? ' (önerilir)' : ' (isteğe bağlı)'}</label>
        <textarea id="note" name="note" maxlength="500" placeholder="${placeholder}"></textarea>
        <button type="submit">Onayla</button></form>
      ${more('Ya da başka bir karar:', others)}`;
  } else if (v.state === 'stale') {
    body = `${head}<div class="warn">"${ACT[v.act!]}" şu anki durumda yapılamaz: bu karar zaten verilmiş ya da artık geçerli değil. Puan verilmedi.</div>
      ${more('Bu durumda yapılabilecekler:', v.links ?? [])}`;
  } else {
    body = `${head}<div class="ok">İşlendi: ${statusChip(f.status)}${v.add ? ` +${v.add} puan` : ''}. Oyuncunun toplam katkı puanı: <b>${v.total ?? 0}</b>.
        ${v.mailed ? 'Oyuncuya e-posta gitti.' : 'Oyuncuya e-posta gönderilemedi.'}</div>
      ${more('Sonra yapılabilecek:', v.links ?? [])}`;
  }
  return shell('Geri bildirim kararı', body);
}

export interface ListRow {
  id: number; kind: FeedbackKind; status: FeedbackStatus; points: number; created: number; updated: number; note: string | null; message: string; name: string | null;
  links: Link[];
}

/** Tüm geri bildirimler: bekleyenler önce, sonra doğrulanan / kabul edilen (yapılmayı bekleyen), sonra kapananlar. */
export function feedbackListPage(rows: ListRow[]): string {
  const count = (pred: (r: ListRow) => boolean) => rows.filter(pred).length;
  const sum = `<p class="meta">İncelemede <b>${count((r) => r.status === 'review')}</b> · yapılmayı bekleyen <b>${count((r) => r.status === 'verified' || r.status === 'accepted')}</b> · kapanan <b>${count((r) => r.status === 'done' || r.status === 'rejected' || r.status === 'duplicate')}</b> (son 200 mesaj)</p>`;
  const items = rows.map((r) => `<div class="row">
      <div>${statusChip(r.status)} <b>${KIND[r.kind]} #${r.id}</b> · ${esc(r.name ?? 'silinmiş hesap')} · ${r.points} puan</div>
      <div class="muted">gönderildi ${dateTr(r.created)}${r.updated > r.created ? ` · son karar ${dateTr(r.updated)}` : ''}</div>
      <div class="msg">${esc(r.message)}</div>
      ${r.note ? `<div class="note"><b>Not:</b> ${esc(r.note)}</div>` : ''}
      ${r.links.length ? actButtons(r.links) : '<span class="muted">Kapandı: yapılacak karar yok.</span>'}
    </div>`).join('');
  return shell('Geri bildirimler', `<h1>Geri bildirimler</h1>${sum}${items || '<p>Henüz incelenmesi istenen mesaj yok.</p>'}`);
}
