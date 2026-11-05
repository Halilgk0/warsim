// Doğrulama kodu e-postası: konu, düz metin ve HTML (TR/EN). Oyunun pastel renkleri. E-posta programları için tablo düzeni ve
// satır içi stil; dış yazı tipi yok. Simge yayındaki siteden gelir, engellense de metin okunur kalır.

export interface Mail {
  subject: string;
  text: string;
  html: string;
  /** Ek başlıklar (haber e-postasında çıkma bağlantısı). */
  headers?: string[];
}

const SITE = 'https://warsimbox.com';
const FONT = "Nunito,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function codeMail(code: string, en: boolean): Mail {
  const t = en
    ? {
      subject: `Your WarSimBox verification code: ${code}`,
      title: 'Verify your email',
      lead: 'Enter this code in the game to verify your email address.',
      valid: 'The code is valid for <b>10 minutes</b>.',
      validText: 'The code is valid for 10 minutes.',
      ignore: 'If you did not request it, you can ignore this email; your address will not be added to any account.',
      tag: 'Second World War air strategy game',
    }
    : {
      subject: `WarSimBox doğrulama kodun: ${code}`,
      title: 'E-postanı doğrula',
      lead: 'E-posta adresini doğrulamak için bu kodu oyuna gir.',
      valid: 'Kod <b>10 dakika</b> geçerli.',
      validText: 'Kod 10 dakika geçerli.',
      ignore: 'Bunu sen istemediysen bu e-postayı yok sayabilirsin; adresin hiçbir hesaba eklenmez.',
      tag: 'İkinci Dünya Savaşı hava harbi strateji oyunu',
    };
  return {
    subject: t.subject,
    text: `${t.title}\n\n${t.lead}\n\n${code}\n\n${t.validText} ${t.ignore}\n\nWarSimBox · ${SITE}`,
    html: `<!doctype html>
<html lang="${en ? 'en' : 'tr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#eef1ec;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.validText}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1ec" style="background:#eef1ec;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:${FONT};">
    <tr><td bgcolor="#86b3a2" style="background:#86b3a2;border-radius:18px 18px 0 0;padding:14px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:8px;line-height:0;"><img src="${SITE}/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;"></td>
        <td style="font-size:21px;font-weight:800;color:#ffffff;">WarSimBox</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="#fbf8f3" style="background:#fbf8f3;border-radius:0 0 18px 18px;padding:26px 24px 24px;color:#45434f;">
      <div style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 8px;">${t.title}</div>
      <div style="font-size:15px;line-height:1.5;color:#5d5a6b;margin:0 0 18px;">${t.lead}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#e3efe9" style="background:#e3efe9;border-radius:14px;padding:16px 8px;font-family:Consolas,Menlo,Monaco,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#3f6d5d;">${code}</td>
      </tr></table>
      <div style="font-size:14px;line-height:1.5;color:#5d5a6b;margin:16px 0 0;">${t.valid}</div>
      <div style="font-size:13px;line-height:1.5;color:#8b8797;margin:14px 0 0;padding-top:14px;border-top:1px solid #e5ded2;">${t.ignore}</div>
    </td></tr>
    <tr><td align="center" style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:#8b8797;">
      ${t.tag}<br><a href="${SITE}" style="color:#3f6d5d;font-weight:700;text-decoration:none;">warsimbox.com</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`,
  };
}
