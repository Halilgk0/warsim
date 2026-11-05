// Haber e-postası: yalnız izin verenlere (news_opt = 1), hesabın dilinde. Yeni haber duyurulacaksa LATEST_NEWS_MAIL değişir;
// push'tan sonra zamanlı görev (index.ts scheduled) kendiliğinden gönderir. Her e-postada çıkma bağlantısı vardır.

import type { Mail } from './codeMail';

const SITE = 'https://warsimbox.com';
const FONT = "Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface NewsText {
  subject: string;
  title: string;
  lead: string;
  bullets: string[];
  button: string;
}

export interface NewsMail {
  /** Haberin kimliği (news.ts): kime gittiği bununla izlenir. */
  id: string;
  /** Duyuru zamanı. Bundan sonra izin veren eski haberi almaz; gönderim bir hafta sonra kendiliğinden durur. */
  at: number;
  image: string;
  tr: NewsText;
  en: NewsText;
}

export const LATEST_NEWS_MAIL: NewsMail = {
  id: 'pervaneliler',
  at: Date.UTC(2026, 10, 5, 23, 59),
  image: 'news/pervane.jpg',
  tr: {
    subject: 'WarSimBox: Pervaneli uçakların hepsi yenilendi',
    title: 'Pervaneli uçakların hepsi yenilendi',
    lead: 'Araştırma ağacındaki 40 pervaneli uçağın hepsi çizimlerden yeniden kuruldu: Hurricane’den B-29’a her uçağın kendi gövdesi, kanadı ve takımı var.',
    bullets: [
      'Stuka’nın ters martı kanadı, Corsair’in kırık kanadı, P-38’in çift kirişi, Sea Fury’nin beş palalı pervanesi.',
      'Kumanda yüzeyleri oynuyor, flaplar iniyor, takımlar gerçek yönüne katlanıyor.',
      'Bombardıman uçaklarında taretler artık gerçek yerinde.',
    ],
    button: 'Oyunu aç',
  },
  en: {
    subject: 'WarSimBox: All propeller aircraft renewed',
    title: 'All propeller aircraft renewed',
    lead: 'All 40 propeller aircraft in the research tree were rebuilt from drawings: from the Hurricane to the B-29, each has its own fuselage, wing and landing gear.',
    bullets: [
      'The Stuka’s inverted gull wing, the Corsair’s bent wing, the P-38’s twin booms, the Sea Fury’s five-blade propeller.',
      'Control surfaces move, flaps come down and the gear folds in its real direction.',
      'On bombers, turrets now sit in their real places.',
    ],
    button: 'Open the game',
  },
};

/** Çıkma bağlantısı: hesap ve imza. Şifre ya da oturum gerekmez, bağlantı yalnız o hesabın iznini kapatır. */
export const unsubUrl = (id: number, token: string, en: boolean): string =>
  `${SITE}/api/news/unsubscribe?u=${id}&t=${token}&l=${en ? 'en' : 'tr'}`;

export function newsMail(m: NewsMail, en: boolean, unsub: string): Mail {
  const t = en ? m.en : m.tr;
  const why = en
    ? 'You receive this email because you allowed news emails in your WarSimBox account.'
    : 'Bu e-postayı WarSimBox hesabında yenilik e-postalarına izin verdiğin için alıyorsun.';
  const leave = en ? 'Unsubscribe from news emails' : 'Haber e-postalarından çık';
  const tag = en ? 'Second World War air strategy game' : 'İkinci Dünya Savaşı hava harbi strateji oyunu';
  return {
    subject: t.subject,
    headers: [`List-Unsubscribe: <${unsub}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click'],
    text: `${t.title}\n\n${t.lead}\n\n${t.bullets.map((b) => `- ${b}`).join('\n')}\n\n${t.button}: ${SITE}\n\n${why}\n${leave}: ${unsub}\n\nWarSimBox · ${SITE}`,
    html: `<!doctype html>
<html lang="${en ? 'en' : 'tr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#eef1ec;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.lead}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1ec" style="background:#eef1ec;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;font-family:${FONT};">
    <tr><td bgcolor="#86b3a2" style="background:#86b3a2;border-radius:18px 18px 0 0;padding:14px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;line-height:0;"><img src="${SITE}/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;"></td>
        <td style="font-size:21px;font-weight:800;color:#ffffff;">WarSimBox</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="#fbf8f3" style="background:#fbf8f3;line-height:0;"><img src="${SITE}/${m.image}" width="520" alt="" style="display:block;width:100%;height:auto;border:0;"></td></tr>
    <tr><td bgcolor="#fbf8f3" style="background:#fbf8f3;border-radius:0 0 18px 18px;padding:22px 24px 24px;color:#45434f;">
      <div style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 8px;">${t.title}</div>
      <div style="font-size:15px;line-height:1.5;color:#5d5a6b;margin:0 0 12px;">${t.lead}</div>
      ${t.bullets.map((b) => `<div style="font-size:14px;line-height:1.5;color:#5d5a6b;margin:0 0 6px;padding-left:14px;text-indent:-14px;">•&nbsp;&nbsp;${b}</div>`).join('\n      ')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr>
        <td bgcolor="#3f6d5d" style="background:#3f6d5d;border-radius:12px;"><a href="${SITE}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">${t.button}</a></td>
      </tr></table>
      <div style="font-size:12px;line-height:1.5;color:#8b8797;margin:18px 0 0;padding-top:14px;border-top:1px solid #e5ded2;">${why}<br><a href="${unsub}" style="color:#3f6d5d;font-weight:700;">${leave}</a></div>
    </td></tr>
    <tr><td align="center" style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:#8b8797;">
      ${tag}<br><a href="${SITE}" style="color:#3f6d5d;font-weight:700;text-decoration:none;">warsimbox.com</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}

/** Çıkma sayfası. Bağlantıyı açmak tek başına çıkarmaz (e-posta tarayıcıları bağlantıları kendi açar): düğmeye basılır. */
export function unsubPage(en: boolean, state: 'ask' | 'done' | 'bad', action = ''): string {
  const t = {
    ask: en ? { title: 'Unsubscribe from news emails?', body: 'Your account and saves are not affected.' } : { title: 'Haber e-postalarından çıkılsın mı?', body: 'Hesabın ve kayıtların etkilenmez.' },
    done: en ? { title: 'You are unsubscribed', body: 'You will no longer receive news emails. You can turn them back on in your Profile.' } : { title: 'Çıktın', body: 'Artık haber e-postası almayacaksın. İstersen Profil’den yeniden açabilirsin.' },
    bad: en ? { title: 'This link is not valid', body: 'You can turn off news emails in your Profile.' } : { title: 'Bu bağlantı geçerli değil', body: 'Haber e-postalarını Profil’den kapatabilirsin.' },
  }[state];
  const button = state !== 'ask' ? '' : `<form method="post" action="${action}" style="margin:18px 0 0;"><button style="font:inherit;font-weight:800;color:#fff;background:#3f6d5d;border:0;border-radius:12px;padding:12px 22px;cursor:pointer;">${en ? 'Unsubscribe' : 'Çık'}</button></form>`;
  return `<!doctype html><html lang="${en ? 'en' : 'tr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>WarSimBox</title></head><body style="margin:0;background:#eef1ec;font-family:${FONT};color:#45434f;"><div style="max-width:480px;margin:40px auto;padding:0 16px;"><div style="background:#fbf8f3;border-radius:18px;padding:24px;"><div style="font-size:22px;font-weight:800;margin:0 0 8px;">${t.title}</div><div style="font-size:15px;line-height:1.5;color:#5d5a6b;">${t.body}</div>${button}</div><p style="text-align:center;font-size:13px;"><a href="${SITE}" style="color:#3f6d5d;font-weight:700;text-decoration:none;">warsimbox.com</a></p></div></body></html>`;
}
