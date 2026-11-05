// Teşekkür e-postası: hesabın toplam oynama süresi 6 saati geçince, hesabın dilinde bir kez. İçinde o anki toplam süre ve sosyal
// medya bağlantıları. Görünüm haber e-postasıyla aynı çelik renkler. Yalnız yenilik e-postasına izin verenlere (index.ts
// sendNextThanksMail); herkese oyunun içinde ayrıca teşekkür penceresi açılır (src/ui/thanks.ts).

import type { Mail } from './codeMail';

const SITE = 'https://warsimbox.com';
const FONT = "Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Teşekkürün eşiği (sn): 6 saat. src/ui/thanks.ts ile aynı. */
export const THANKS_PLAY_SEC = 6 * 3600;

/** src/ui/social.ts ile aynı adresler. */
const SOCIAL = [
  { name: 'Instagram', url: 'https://www.instagram.com/warsimbox/' },
  { name: 'YouTube', url: 'https://www.youtube.com/@Warsimbox' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@warsimbox0' },
];

/** "8 saat 18 dakika" / "8 hours 18 minutes". */
export function playTimeText(sec: number, en: boolean): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (en) return `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${m} ${m === 1 ? 'minute' : 'minutes'}` : ''}`;
  return `${h} saat${m ? ` ${m} dakika` : ''}`;
}

const escHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** unsub: çıkma bağlantısı (yoksa gösterilmez). */
export function thanksMail(name: string, playSec: number, en: boolean, unsub: string | null): Mail {
  const time = playTimeText(playSec, en);
  const who = escHtml(name);
  const t = en
    ? {
      subject: 'WarSimBox: Thank you for playing',
      title: `Thank you, ${who}!`,
      lead: `You have played WarSimBox for <b style="color:#ffffff;">${time}</b> so far. Thank you so much for spending this much time with our game.`,
      leadText: `You have played WarSimBox for ${time} so far. Thank you so much for spending this much time with our game.`,
      social: 'Please don’t forget to support us on social media too:',
      friends: 'And please recommend the game to your friends: that way it grows faster and bigger.',
      button: 'Open the game',
      why: 'You receive this email because your WarSimBox account has passed 6 hours of play.',
      leave: 'Unsubscribe from these emails',
      tag: 'Second World War air strategy game',
    }
    : {
      subject: 'WarSimBox: Oynadığınız için teşekkürler',
      title: `Teşekkürler, ${who}!`,
      lead: `WarSimBox’ı bugüne kadar toplam <b style="color:#ffffff;">${time}</b> oynadınız. Oyunumuzu bu kadar süre oynadığınız için çok teşekkür ederiz.`,
      leadText: `WarSimBox’ı bugüne kadar toplam ${time} oynadınız. Oyunumuzu bu kadar süre oynadığınız için çok teşekkür ederiz.`,
      social: 'Bizi sosyal medyadan da desteklemeyi unutmayın:',
      friends: 'Lütfen oyunu arkadaşlarınıza da önerin; bu sayede oyun daha hızlı ve daha büyük gelişir.',
      button: 'Oyunu aç',
      why: 'Bu e-postayı WarSimBox hesabınız toplam 6 saat oynamayı geçtiği için alıyorsunuz.',
      leave: 'Bu e-postalardan çık',
      tag: 'İkinci Dünya Savaşı hava harbi strateji oyunu',
    };
  const links = SOCIAL.map((s) => `<td style="padding:0 8px 8px 0;"><a href="${s.url}" style="display:inline-block;padding:9px 14px;border-radius:10px;background:#2c3733;border:1px solid #5d6a64;color:#e8ede9;font-size:14px;font-weight:800;text-decoration:none;">${s.name}</a></td>`).join('');
  return {
    subject: t.subject,
    headers: unsub ? [`List-Unsubscribe: <${unsub}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'] : [],
    text: `${t.title.replace(/&[^;]+;/g, '')}\n\n${t.leadText}\n\n${t.social}\n${SOCIAL.map((s) => `- ${s.name}: ${s.url}`).join('\n')}\n\n${t.friends}\n\n${t.button}: ${SITE}\n\n${t.why}${unsub ? `\n${t.leave}: ${unsub}` : ''}\n\nWarSimBox · ${SITE}`,
    html: `<!doctype html>
<html lang="${en ? 'en' : 'tr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#0e1411;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.leadText}</div>
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
    <tr><td bgcolor="#171e1b" style="background:#171e1b;line-height:0;"><img src="${SITE}/yukleme.jpg" width="520" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>
    <tr><td bgcolor="#171e1b" style="background:#171e1b;border-radius:0 0 18px 7px;padding:22px 24px 24px;color:#f0f4f1;">
      <div style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 8px;">${t.title}</div>
      <div style="font-size:15px;line-height:1.5;color:#d3ddd7;margin:0 0 16px;">${t.lead}</div>
      <div style="font-size:14px;line-height:1.5;color:#bccac2;margin:0 0 10px;">${t.social}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>${links}</tr></table>
      <div style="font-size:14px;line-height:1.5;color:#bccac2;margin:0 0 4px;">${t.friends}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr>
        <td bgcolor="#467a62" style="background:#467a62;border-radius:12px;"><a href="${SITE}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">${t.button}</a></td>
      </tr></table>
      <div style="font-size:12px;line-height:1.5;color:#93a39a;margin:18px 0 0;padding-top:14px;border-top:1px solid #39453f;">${t.why}${unsub ? `<br><a href="${unsub}" style="color:#a6dcc0;font-weight:700;">${t.leave}</a>` : ''}</div>
    </td></tr>
    <tr><td align="center" style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:#93a39a;">
      ${t.tag}<br><a href="${SITE}" style="color:#a6dcc0;font-weight:700;text-decoration:none;">warsimbox.com</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}
