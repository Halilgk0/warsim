// Geri bildirim durum e-postası (katkı puanı, 2026-11-24): oyuncunun "incelensin" dediği mesaja karar verilince, hesabın
// dilinde. Hizmet bildirimi: oyuncunun kendi isteğinin sonucu, yenilik izninden bağımsız gider. Görünüm teşekkür e-postasıyla
// aynı çelik renkler.

import type { Mail } from './codeMail';
import { CONTRIB_RANK_NAMES, contribRank, type FeedbackKind, type FeedbackStatus } from '../src/net/shared';

const SITE = 'https://warsimbox.com';
const FONT = "Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const escHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface StatusNote {
  name: string;
  lang: string | null;
  kind: FeedbackKind;
  status: FeedbackStatus;
  /** Bu kararla eklenen puan. */
  add: number;
  /** Hesabın yeni toplam katkı puanı. */
  total: number;
  message: string;
  /** Yöneticinin notu (ör. reddetme nedeni); yoksa gösterilmez. */
  note?: string | null;
}

function lines(n: StatusNote, en: boolean): { subject: string; title: string; lead: string } {
  const bug = n.kind === 'bug';
  const pts = n.add ? (en ? ` You earned <b>+${n.add}</b> contribution points.` : ` <b>+${n.add}</b> katkı puanı kazandın.`) : '';
  const ptsSub = n.add ? ` (+${n.add})` : '';
  switch (n.status) {
    case 'verified':
      return en
        ? { subject: `WarSimBox: Your bug report is verified${ptsSub}`, title: 'Your bug report is verified!', lead: `We checked it and the bug is real; we will fix it.${pts}` }
        : { subject: `WarSimBox: Hata raporun doğrulandı${ptsSub}`, title: 'Hata raporun doğrulandı!', lead: `İnceledik, hata gerçekten var; düzelteceğiz.${pts}` };
    case 'accepted':
      return en
        ? { subject: `WarSimBox: Your suggestion is accepted${ptsSub}`, title: 'Your suggestion is accepted!', lead: `We liked it and plan to add it to the game.${pts}` }
        : { subject: `WarSimBox: Önerin kabul edildi${ptsSub}`, title: 'Önerin kabul edildi!', lead: `Beğendik, oyuna eklemeyi planlıyoruz.${pts}` };
    case 'done':
      return en
        ? { subject: `WarSimBox: ${bug ? 'The bug you reported is fixed' : 'Your suggestion is in the game'}${ptsSub}`, title: bug ? 'The bug you reported is fixed!' : 'Your suggestion is in the game!', lead: `${bug ? 'The fix is live in the game.' : 'It is live in the game now.'}${pts}` }
        : { subject: `WarSimBox: ${bug ? 'Bildirdiğin hata düzeltildi' : 'Önerin oyunda'}${ptsSub}`, title: bug ? 'Bildirdiğin hata düzeltildi!' : 'Önerin oyuna eklendi!', lead: `${bug ? 'Düzeltme oyunda yayında.' : 'Artık oyunda.'}${pts}` };
    case 'duplicate':
      return en
        ? { subject: 'WarSimBox: Your feedback was reviewed', title: 'Thanks for your feedback!', lead: 'We reviewed your message: another player had reported the same thing before, so no points were given this time.' }
        : { subject: 'WarSimBox: Geri bildirimin incelendi', title: 'Geri bildirimin için teşekkürler!', lead: 'Mesajını inceledik: aynı konuyu başka bir oyuncu daha önce bildirmişti, bu yüzden bu kez puan verilmedi.' };
    default:
      return en
        ? { subject: 'WarSimBox: Your feedback was reviewed', title: 'Thanks for your feedback!', lead: bug ? 'We reviewed your report but could not confirm it as a bug, so no points were given this time.' : 'We reviewed your suggestion; it does not fit the game’s plans right now, so no points were given this time.' }
        : { subject: 'WarSimBox: Geri bildirimin incelendi', title: 'Geri bildirimin için teşekkürler!', lead: bug ? 'Raporunu inceledik ama bir hata olarak doğrulayamadık, bu yüzden bu kez puan verilmedi.' : 'Önerini inceledik; şu an oyunun planlarına uymuyor, bu yüzden bu kez puan verilmedi.' };
  }
}

export function feedbackStatusMail(n: StatusNote): Mail {
  const en = n.lang === 'en';
  const t = lines(n, en);
  const rank = contribRank(n.total);
  const rankName = rank ? CONTRIB_RANK_NAMES[rank - 1][en ? 1 : 0] : '';
  const totalText = en
    ? `Your contribution points: ${n.total}${rank ? ` · Rank: ${rankName}` : ''}`
    : `Toplam katkı puanın: ${n.total}${rank ? ` · Rütbe: ${rankName}` : ''}`;
  const quoteText = n.message.length > 300 ? `${n.message.slice(0, 300)}…` : n.message;
  const why = en
    ? 'You receive this email because you asked for your feedback to be reviewed. Your contribution points and rank are in your Profile.'
    : 'Bu e-postayı geri bildiriminin incelenmesini istediğin için alıyorsun. Katkı puanın ve rütben Profil’inde.';
  const hello = en ? `Hello ${escHtml(n.name)},` : `Merhaba ${escHtml(n.name)},`;
  const button = en ? 'Open the game' : 'Oyunu aç';
  const plain = t.lead.replace(/<[^>]+>/g, '');
  const noteHead = en ? 'Note from the developer' : 'Geliştiricinin notu';
  return {
    subject: t.subject,
    text: `${en ? `Hello ${n.name},` : `Merhaba ${n.name},`}\n\n${t.title}\n${plain}${n.note ? `\n\n${noteHead}: ${n.note}` : ''}\n\n${totalText}\n\n"${quoteText}"\n\n${button}: ${SITE}\n\n${why}\n\nWarSimBox · ${SITE}`,
    html: `<!doctype html>
<html lang="${en ? 'en' : 'tr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escHtml(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0e1411;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escHtml(plain)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0e1411" style="background:#0e1411;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:${FONT};">
    <tr><td bgcolor="#30503f" style="background:#30503f;background-image:linear-gradient(90deg,#30503f,#1b211e 72%,#141816);border-radius:18px 7px 0 0;padding:14px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;line-height:0;"><img src="${SITE}/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;"></td>
        <td style="font-size:21px;font-weight:800;color:#ffffff;">WarSimBox</td>
      </tr></table>
    </td></tr>
    <tr><td height="3" bgcolor="#c49e58" style="background:#c49e58;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td bgcolor="#171e1b" style="background:#171e1b;border-radius:0 0 18px 7px;padding:22px 24px 24px;color:#f0f4f1;">
      <div style="font-size:15px;color:#bccac2;margin:0 0 6px;">${hello}</div>
      <div style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 8px;">${t.title}</div>
      <div style="font-size:15px;line-height:1.5;color:#d3ddd7;margin:0 0 14px;">${t.lead}</div>
      ${n.note ? `<div style="font-size:14px;line-height:1.5;color:#f0e6cf;background:#2b2a22;border-left:3px solid #c49e58;border-radius:6px;padding:10px 12px;margin:0 0 14px;white-space:pre-wrap;"><b>${noteHead}:</b> ${escHtml(n.note)}</div>` : ''}
      <div style="font-size:15px;font-weight:800;color:#e8c77e;margin:0 0 14px;">${escHtml(totalText)}</div>
      <div style="font-size:14px;line-height:1.5;color:#bccac2;white-space:pre-wrap;background:#202a25;border-left:3px solid #5d6a64;border-radius:6px;padding:10px 12px;">${escHtml(quoteText)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr>
        <td bgcolor="#467a62" style="background:#467a62;border-radius:12px;"><a href="${SITE}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">${button}</a></td>
      </tr></table>
      <div style="font-size:12px;line-height:1.5;color:#93a39a;margin:18px 0 0;padding-top:14px;border-top:1px solid #39453f;">${why}</div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}
