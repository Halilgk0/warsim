// Gizlilik Politikası ve KVKK Aydınlatma Metni (TR/EN). Sayfaları ansiklopedinin çerçevesiyle sayfalar.ts üretir.
// Oyunun gerçekten yaptığını anlatır: toplanan veri ya da hizmet sağlayıcı değişirse metin de LEGAL_VERSION da değişir.

import { LEGAL_VERSION } from '../net/shared';
import { type LegalKind, legalUrl } from './liste';

/** Veri sorumlusu. */
const OWNER = { name: 'Halil (WarSimBox)', nameEn: 'Halil (WarSimBox)', email: 'warsimbox@gmail.com' };

const date = (lang: 'tr' | 'en') => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${LEGAL_VERSION}T00:00:00Z`));

export interface LegalText {
  title: string;
  desc: string;
  /** Sayfa gövdesi (HTML). */
  html: string;
}

const privacyTr: LegalText = {
  title: 'Gizlilik Politikası',
  desc: 'WarSimBox hangi verileri, neden işler ve bu veriler üzerindeki hakların nelerdir.',
  html: `
<p class="legal-date">Yürürlük tarihi: ${date('tr')}</p>
<p>Bu metin, WarSimBox oynarken hangi verilerinin işlendiğini, neden işlendiğini ve bu veriler üzerindeki haklarını anlatır. Oyunu hesap açmadan, misafir olarak da oynayabilirsin. Kişisel verilerin işlenmesine ilişkin yasal bilgilendirme <a href="${legalUrl('kvkk', false)}">KVKK Aydınlatma Metni</a>’ndedir.</p>

<h2>Sorumlu kişi</h2>
<p>Veri sorumlusu: ${OWNER.name}. İletişim: ${OWNER.email}.</p>

<h2>Hangi verileri işliyoruz</h2>
<ul>
  <li><b>Hesap açarsan:</b> kullanıcı adın, e-posta adresin, şifrenin ve kurtarma kodunun özetleri, hesabın açılış ve son giriş tarihleri, oturum belirtecinin özeti, bu metinleri kabul ettiğin tarih ve sürüm, e-posta tercihin. Şifren sunucuya gönderilmeden önce tarayıcında özetlenir; şifrenin ve kurtarma kodunun kendisi saklanmaz.</li>
  <li><b>E-postanı doğrularken:</b> doğrulama kodunun özeti (kod 10 dakika geçerlidir) ve gönderim sınırları için e-posta adresinin ve IP adresinin özetleri. Bunlar kısa süre sonra silinir.</li>
  <li><b>Hesabınla oynarsan:</b> buluta yüklenen oyun kayıtların, skorların (düşürme, zafer, kazanç gibi), harekât istatistiklerin, oynama süren ve öğretici tercihin.</li>
  <li><b>Geri bildirim gönderirsen:</b> yazdığın ad, ileti ve fiyat önerisi. Bunlar için hesap gerekmez; bilgiler Google Forms’a gider.</li>
  <li><b>Siteye giren herkes için:</b> sayfanın sunulabilmesi için IP adresin ve tarayıcı bilgilerin barındırma ve yazı tipi hizmetlerince (aşağıda) işlenir.</li>
</ul>
<p>Reklam ya da izleme çerezi ve analitik aracı kullanmıyoruz.</p>

<h2>Neden işliyoruz</h2>
<ul>
  <li>Hesabını açmak, giriş yapmanı sağlamak ve kayıtlarını başka cihazlarda sunmak.</li>
  <li>Skor tablosunu oluşturmak.</li>
  <li>E-posta adresinin sana ait olduğunu doğrulamak ve kod gönderiminin kötüye kullanılmasını önlemek.</li>
  <li>Hesabın sahibini doğrulamak; şifreni ve kurtarma kodunu kaybettiğinde yardımcı olmak.</li>
  <li>Hesabınla ilgili önemli konularda (güvenlik, hizmet değişikliği) sana ulaşmak.</li>
  <li>Hesap sayısı ve oynama süresi gibi toplu bilgilerle oyunu geliştirmek.</li>
</ul>

<h2>E-posta adresin</h2>
<p>Yeni hesap açmak için e-posta adresi gereklidir; daha önce açılmış hesaplarda isteğe bağlıdır. Adresin, ona gönderdiğimiz 6 haneli kodla doğrulanmadan kaydedilmez. Bir adresle yalnız bir hesap kullanılabilir. Adresin başka oyunculara ve skor tablosunda görünmez. Profil’den ekleyebilir ve değiştirebilirsin. Adresini satmayız, başkalarının reklamı için paylaşmayız.</p>
<p>Yenilik ve duyuru e-postaları yalnız ayrı kutuyu işaretlediysen gönderilir. Bu kutu hesap açmanın şartı değildir. İznini istediğin zaman Profil’den, e-postalardaki bağlantıyla ya da bize yazarak geri alabilirsin.</p>

<h2>Herkese görünenler</h2>
<p>Kullanıcı adın ve skorların, skor tablosunda bütün ziyaretçilere görünür. Kullanıcı adında gerçek adını ya da kişisel bilgilerini kullanmak zorunda değilsin.</p>

<h2>Kimlerle paylaşıyoruz</h2>
<ul>
  <li><b>Cloudflare, Inc. (ABD):</b> sitenin barındırılması, sunucu ve veritabanı. Hesap ve oyun verilerin burada saklanır.</li>
  <li><b>Google LLC (ABD):</b> e-postaların ${OWNER.email} hesabından gönderilmesi (Gmail; e-posta adresin ve e-postanın içeriği), yazı tipleri (Google Fonts; IP adresin) ve geri bildirim formu (Google Forms).</li>
</ul>
<p>Toplu gönderim için başka bir e-posta hizmeti kullanırsak adresin o hizmete de aktarılır ve hizmet bu listeye eklenir. Veritabanımız şu an Cloudflare’in Doğu Avrupa bölgesinde çalışıyor; bu konum kesin bir taahhüt değildir. Site Cloudflare’in dünya genelindeki ağı üzerinden sunulur. Yani verilerin Türkiye dışında işlenir. Yasal bir zorunluluk olduğunda veriler yetkili kurumlarla da paylaşılabilir.</p>

<h2>Tarayıcında saklananlar</h2>
<p>Oturumun, ayarların, dil seçimin ve kayıtlarının bir kopyası tarayıcında (localStorage ve IndexedDB) durur. Bunlar oyunun çalışması için gereklidir ve tarayıcı verilerini temizlediğinde silinir.</p>

<h2>Ne kadar saklıyoruz</h2>
<p>Hesap ve oyun verilerin, hesabın açık kaldığı sürece saklanır. Hesabını Profil’den kendin silebilirsin (şifren sorulur). Şifreni kaybettiysen bize yaz; başvurunu en geç 30 gün içinde sonuçlandırırız. Yasal olarak saklanması gereken veriler bunun dışındadır. Hesabın, kayıtların, skorların ve oturumların veritabanından birlikte silinir. Silinen veriler veritabanı yedeklerinde en çok 30 gün daha kalabilir; bu sürenin sonunda kendiliğinden yok olur. Oturumlar 90 gün sonra kapanır ve silinir. Sunucunun teknik kayıtları en çok 7 gün tutulur; Cloudflare’in kendi ağ kayıtları kendi kurallarına tabidir. Geri bildirimlerin hesaba bağlı değildir: silinmesini istiyorsan bize yazdığın adı belirt.</p>

<h2>Güvenlik</h2>
<p>Bağlantı HTTPS ile şifrelenir; şifre, kurtarma kodu ve oturum belirteçleri yalnız özet olarak saklanır. E-posta adresin sana yazabilmemiz için okunabilir biçimde saklanır. Hiçbir sistem tam güvenli değildir; başka yerde kullandığın bir şifreyi burada kullanma.</p>

<h2>18 yaşından küçüksen</h2>
<p>Hesabı anne, baba ya da vasinin bilgisi ve izniyle aç. Misafir olarak oynamak için hesap gerekmez.</p>

<h2>Değişiklikler</h2>
<p>Bu metin değişirse yürürlük tarihi güncellenir. Önemli değişiklikleri oyunda duyururuz.</p>
`,
};

const privacyEn: LegalText = {
  title: 'Privacy Policy',
  desc: 'What data WarSimBox processes, why, and your rights over it.',
  html: `
<p class="legal-date">Effective date: ${date('en')}. This is a translation; the Turkish text prevails.</p>
<p>This policy explains what data is processed when you play WarSimBox, why, and your rights over it. You can also play as a guest without an account. The statutory notice on personal data is in the <a href="${legalUrl('kvkk', true)}">KVKK Privacy Notice</a>.</p>

<h2>Who is responsible</h2>
<p>Data controller: ${OWNER.nameEn}. Contact: ${OWNER.email}.</p>

<h2>What we process</h2>
<ul>
  <li><b>If you create an account:</b> your user name, email address, hashes of your password and recovery code, account creation and last login dates, a hash of your session token, the date and version of these texts you accepted, and your email preference. Your password is hashed in your browser before it is sent; neither the password nor the recovery code itself is stored.</li>
  <li><b>While verifying your email:</b> a hash of the verification code (valid for 10 minutes) and, for sending limits, hashes of your email and IP addresses. These are deleted shortly afterwards.</li>
  <li><b>If you play with an account:</b> saves uploaded to the cloud, your scores (such as kills, wins and earnings), campaign statistics, play time and tutorial preference.</li>
  <li><b>If you send feedback:</b> the name, message and price suggestion you enter. No account is needed; this goes to Google Forms.</li>
  <li><b>For every visitor:</b> to serve the page, your IP address and browser details are processed by the hosting and font services listed below.</li>
</ul>
<p>We use no advertising or tracking cookies and no analytics tools.</p>

<h2>Why we process it</h2>
<ul>
  <li>To create your account, log you in and make your saves available on other devices.</li>
  <li>To build the leaderboard.</li>
  <li>To verify that an email address is yours and prevent abuse of code sending.</li>
  <li>To verify who owns an account and help if you lose your password and recovery code.</li>
  <li>To contact you about important account matters (security, service changes).</li>
  <li>To improve the game with aggregate figures such as account numbers and play time.</li>
</ul>

<h2>Your email address</h2>
<p>An email address is required to create a new account and optional for accounts created earlier. It is not saved until verified with a 6-digit code we send to it. An address can be used for only one account. It is not shown to other players or on the leaderboard. You can add or change it in your Profile. We do not sell it or share it for other parties’ advertising.</p>
<p>News and announcement emails are sent only if you ticked the separate box. That box is not a condition of having an account. You can withdraw at any time in your Profile, through the link in the emails or by writing to us.</p>

<h2>What is public</h2>
<p>Your user name and scores are visible to every visitor on the leaderboard. Your user name does not have to be your real name or contain personal details.</p>

<h2>Who we share it with</h2>
<ul>
  <li><b>Cloudflare, Inc. (USA):</b> site hosting, server and database. Your account and game data are stored here.</li>
  <li><b>Google LLC (USA):</b> sending email from the ${OWNER.email} account (Gmail; your email address and the email’s content), fonts (Google Fonts; your IP address) and the feedback form (Google Forms).</li>
</ul>
<p>If we use another email service for bulk sending, your address is also transferred to that service and it is added to this list. Our database currently runs in Cloudflare’s Eastern Europe region; this location is not a firm commitment. The site is served through Cloudflare’s global network. Your data is therefore processed outside Türkiye. Data may also be shared with competent authorities where the law requires it.</p>

<h2>What is kept in your browser</h2>
<p>Your session, settings, language and a copy of your saves are kept in your browser (localStorage and IndexedDB). The game needs them to work, and they are deleted when you clear your browser data.</p>

<h2>How long we keep it</h2>
<p>Account and game data are kept for as long as your account exists. You can delete your account yourself in your Profile (your password is required). If you have lost your password, write to us and we conclude your request within 30 days at the latest. Data the law requires us to keep is excepted. Your account, saves, scores and sessions are deleted from the database together. Deleted data may remain in database backups for up to 30 more days, after which it disappears automatically. Sessions end and are deleted after 90 days. The server’s technical logs are kept for up to 7 days; Cloudflare’s own network logs follow its own rules. Feedback is not linked to accounts: to have yours deleted, tell us the name you wrote.</p>

<h2>Security</h2>
<p>Connections are encrypted with HTTPS; passwords, recovery codes and session tokens are stored only as hashes. Your email address is stored in readable form so that we can write to you. No system is fully secure, so do not reuse a password from elsewhere.</p>

<h2>If you are under 18</h2>
<p>Create an account only with the knowledge and permission of a parent or guardian. Playing as a guest needs no account.</p>

<h2>Changes</h2>
<p>If this policy changes, the effective date is updated. We announce important changes in the game.</p>
`,
};

const kvkkTr: LegalText = {
  title: 'KVKK Aydınlatma Metni',
  desc: 'WarSimBox hesapları için 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni.',
  html: `
<p class="legal-date">Yürürlük tarihi: ${date('tr')}</p>
<p>Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun (KVKK) 10. maddesi uyarınca hazırlanmıştır. Ayrıntılar <a href="${legalUrl('privacy', false)}">Gizlilik Politikası</a>’ndadır.</p>

<h2>Veri sorumlusu</h2>
<p>${OWNER.name}. İletişim: ${OWNER.email}.</p>

<h2>İşlenen veriler ve amaçlar</h2>
<div class="legal-scroll"><table>
  <thead><tr><th>Veri</th><th>Amaç</th><th>Hukuki sebep (KVKK m. 5)</th></tr></thead>
  <tbody>
    <tr><td>Kullanıcı adı, e-posta adresi, şifre ve kurtarma kodu özetleri, hesap tarihleri, oturum özeti</td><td>Hesabın açılması ve yönetimi, hesap sahibinin doğrulanması, hesapla ilgili önemli bildirimler</td><td>Sözleşmenin kurulması ve ifası (m. 5/2-c); meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>Oyun kayıtları, skorlar, harekât istatistikleri, oynama süresi, tercihler</td><td>Oyun hizmetinin sunulması, skor tablosu, oyunun toplu bilgilerle geliştirilmesi</td><td>Sözleşmenin ifası (m. 5/2-c); meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>Metinlerin kabul tarihi ve sürümü, e-posta izni kaydı</td><td>Kabulün ve iznin kanıtlanması</td><td>Bir hakkın tesisi, kullanılması veya korunması (m. 5/2-e)</td></tr>
    <tr><td>Doğrulama kodu özeti, e-posta ve IP adresi özetleri</td><td>E-posta adresinin doğrulanması, kod gönderiminin kötüye kullanılmasının önlenmesi</td><td>Sözleşmenin kurulması (m. 5/2-c); meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>IP adresi ve tarayıcı bilgileri</td><td>Sitenin sunulması ve güvenliği</td><td>Meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>Geri bildirimde yazılan ad ve ileti</td><td>Görüşlerin değerlendirilmesi</td><td>Meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>E-posta adresi (yalnız izin verdiysen)</td><td>Yenilik ve duyuru e-postaları</td><td>Açık rıza (m. 5/1)</td></tr>
  </tbody>
</table></div>

<h2>Toplama yöntemi</h2>
<p>Veriler, hesap ve geri bildirim formlarını doldurman ve oyunu oynaman sırasında elektronik ortamda, otomatik yollarla toplanır.</p>

<h2>Aktarım</h2>
<p>Veriler, hizmetin sunulması amacıyla barındırma ve veritabanı hizmeti veren Cloudflare, Inc. ile e-posta (Gmail), yazı tipi ve form hizmeti veren Google LLC’ye aktarılır. Toplu gönderim için başka bir e-posta hizmeti kullanılırsa adres o hizmete de aktarılır ve hizmet Gizlilik Politikası’nda belirtilir. Bu şirketler ABD merkezlidir. Veritabanı şu an Cloudflare’in Doğu Avrupa bölgesinde çalışır (kesin bir taahhüt değildir) ve site Cloudflare’in dünya genelindeki ağı üzerinden sunulur; yani veriler yurt dışında işlenir. Veriler yasal zorunluluk hâlinde yetkili kamu kurumlarıyla da paylaşılabilir.</p>

<h2>Saklama ve silme</h2>
<p>Hesap ve oyun verileri hesap açık kaldığı sürece saklanır. Hesap Profil’den silinebilir; yazılı silme başvurusu en geç 30 gün içinde sonuçlandırılır. Silinen veriler veritabanı yedeklerinde en çok 30 gün daha kalabilir, sunucunun teknik kayıtları en çok 7 gün tutulur. Ayrıntılar <a href="${legalUrl('privacy', false)}">Gizlilik Politikası</a>’ndadır.</p>

<h2>KVKK m. 11 kapsamındaki hakların</h2>
<ul>
  <li>Kişisel verilerinin işlenip işlenmediğini öğrenme, işlenmişse bilgi isteme,</li>
  <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
  <li>Aktarıldığı üçüncü kişileri bilme,</li>
  <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme,</li>
  <li>Kanuni şartlar çerçevesinde silinmesini veya yok edilmesini isteme,</li>
  <li>Düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme,</li>
  <li>Otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuç çıkmasına itiraz etme,</li>
  <li>Kanuna aykırı işleme nedeniyle zarara uğrarsan zararın giderilmesini talep etme.</li>
</ul>

<h2>Başvuru</h2>
<p>Haklarını kullanmak için, kullanıcı adını belirterek ${OWNER.email} adresine yazabilirsin. Başvurun en geç 30 gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu’nun belirlediği ücret alınabilir.</p>
`,
};

const kvkkEn: LegalText = {
  title: 'KVKK Privacy Notice',
  desc: 'Notice for WarSimBox accounts under Turkish Personal Data Protection Law No. 6698 (KVKK).',
  html: `
<p class="legal-date">Effective date: ${date('en')}. This is a translation; the Turkish text prevails.</p>
<p>This notice is given under Article 10 of Turkish Personal Data Protection Law No. 6698 (KVKK). See the <a href="${legalUrl('privacy', true)}">Privacy Policy</a> for details.</p>

<h2>Data controller</h2>
<p>${OWNER.nameEn}. Contact: ${OWNER.email}.</p>

<h2>Data processed and purposes</h2>
<div class="legal-scroll"><table>
  <thead><tr><th>Data</th><th>Purpose</th><th>Legal basis (KVKK Art. 5)</th></tr></thead>
  <tbody>
    <tr><td>User name, email address, password and recovery code hashes, account dates, session hash</td><td>Creating and managing the account, verifying its owner, important account notices</td><td>Formation and performance of a contract (5/2-c); legitimate interest (5/2-f)</td></tr>
    <tr><td>Saves, scores, campaign statistics, play time, preferences</td><td>Providing the game, the leaderboard, improving the game with aggregate figures</td><td>Performance of a contract (5/2-c); legitimate interest (5/2-f)</td></tr>
    <tr><td>Date and version of accepted texts, email permission record</td><td>Proving acceptance and permission</td><td>Establishing, exercising or protecting a right (5/2-e)</td></tr>
    <tr><td>Verification code hash, email and IP address hashes</td><td>Verifying the email address, preventing abuse of code sending</td><td>Formation of a contract (5/2-c); legitimate interest (5/2-f)</td></tr>
    <tr><td>IP address and browser details</td><td>Serving and securing the site</td><td>Legitimate interest (5/2-f)</td></tr>
    <tr><td>Name and message entered as feedback</td><td>Reviewing feedback</td><td>Legitimate interest (5/2-f)</td></tr>
    <tr><td>Email address (only if you gave permission)</td><td>News and announcement emails</td><td>Explicit consent (5/1)</td></tr>
  </tbody>
</table></div>

<h2>How data is collected</h2>
<p>Data is collected electronically and automatically when you fill in the account and feedback forms and play the game.</p>

<h2>Transfers</h2>
<p>To provide the service, data is transferred to Cloudflare, Inc. (hosting and database) and Google LLC (email through Gmail, fonts and forms). If another email service is used for bulk sending, the address is also transferred to that service, which is named in the Privacy Policy. These companies are based in the USA. The database currently runs in Cloudflare’s Eastern Europe region (not a firm commitment) and the site is served through Cloudflare’s global network, so data is processed abroad. Data may also be shared with competent public authorities where the law requires it.</p>

<h2>Retention and deletion</h2>
<p>Account and game data are kept for as long as the account exists. The account can be deleted in the Profile; written deletion requests are concluded within 30 days at the latest. Deleted data may remain in database backups for up to 30 more days, and the server’s technical logs are kept for up to 7 days. See the <a href="${legalUrl('privacy', true)}">Privacy Policy</a> for details.</p>

<h2>Your rights under KVKK Art. 11</h2>
<ul>
  <li>To learn whether your personal data is processed and, if so, to request information,</li>
  <li>To learn the purpose of processing and whether data is used accordingly,</li>
  <li>To know the third parties it is transferred to,</li>
  <li>To have incomplete or incorrect data corrected,</li>
  <li>To request deletion or destruction under the conditions of the law,</li>
  <li>To have corrections and deletions notified to those third parties,</li>
  <li>To object to an adverse result arising from analysis by automated systems alone,</li>
  <li>To claim compensation for damage caused by unlawful processing.</li>
</ul>

<h2>Applications</h2>
<p>To exercise your rights, write to ${OWNER.email} and state your user name. Your request is concluded free of charge within 30 days at the latest; if it involves a separate cost, the fee set by the Personal Data Protection Board may apply.</p>
`,
};

export const LEGAL_TEXT: Record<LegalKind, { tr: LegalText; en: LegalText }> = {
  privacy: { tr: privacyTr, en: privacyEn },
  kvkk: { tr: kvkkTr, en: kvkkEn },
};
