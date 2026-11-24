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
  <li><b>Hesap açarsan:</b> kullanıcı adın, e-posta adresin, şifrenin ve kurtarma kodunun özetleri, hesabın açılış ve son giriş tarihleri, oturum belirtecinin özeti, bu metinleri kabul ettiğin tarih ve sürüm, dil seçimin, e-posta tercihin. Şifren sunucuya gönderilmeden önce tarayıcında özetlenir; şifrenin ve kurtarma kodunun kendisi saklanmaz.</li>
  <li><b>E-postanı doğrularken:</b> doğrulama kodunun özeti (kod 10 dakika geçerlidir) ve gönderim sınırları için e-posta adresinin ve IP adresinin özetleri. Bunlar kısa süre sonra silinir.</li>
  <li><b>Hesabınla oynarsan:</b> buluta yüklenen oyun kayıtların, skorların (düşürme, zafer, kazanç gibi), harekât istatistiklerin, oynama süren, öğretici ve skor tablosu tercihlerin ve okuduğun haberler.</li>
  <li><b>Geri bildirim gönderirsen:</b> mesajın ve türü (hata raporu ya da öneri), hesabının adı, e-posta adresin ve dil seçimin. Geri bildirim için e-postalı hesap gerekir. Bunlar ${OWNER.email} kutusuna e-posta olarak gelir ve orada saklanır. İncelenmesini istersen mesajın, türü ve inceleme sonucu (durumu ve kazandığın katkı puanı) hesabınla birlikte veritabanında da saklanır ve sonuç sana e-postayla bildirilir. Katkı puanından gelen rütbe rozetin Profil’inde ve skor tablosunda adının yanında görünür.</li>
  <li><b>Destekçi paketi alırsan:</b> hesabında destekçi seviyen (rozetin), toplam ödeme tutarın (iadeler düşülmüş) ve ödeme sayın; her ödeme için Polar’ın bize bildirdiği sipariş numarası, tutar (vergi öncesi), iade edilen tutar, para birimi, sipariş durumu, ödeme tarihi ve o andaki toplam oynama süren (iade kuralı için). Kart bilgilerin, fatura adın ve adresin, ödemede yazdığın e-posta adresi doğrudan Polar’a girilir; bize gelmez.</li>
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
  <li>Destekçi paketini hesabına teslim etmek (rozet ve fazladan kayıt yeri) ve iade isteklerini değerlendirmek (satın alma anındaki toplam oynama süren kaydedilir: ödemeden sonra 2,5 saat ve üstü oynandıysa iade yapılmaz).</li>
</ul>

<h2>E-posta adresin</h2>
<p>Yeni hesap açmak için e-posta adresi gereklidir; daha önce açılmış hesaplarda isteğe bağlıdır. Adresin, ona gönderdiğimiz 6 haneli kodla doğrulanmadan kaydedilmez. Bir adresle yalnız bir hesap kullanılabilir. Adresin başka oyunculara ve skor tablosunda görünmez. Profil’den ekleyebilir ve değiştirebilirsin. Adresini satmayız, başkalarının reklamı için paylaşmayız.</p>
<p>Yenilik ve duyuru e-postaları yalnız ayrı kutuyu işaretlediysen, hesabında seçili dilde gönderilir. Bu kutu hesap açmanın şartı değildir. İznini istediğin zaman Profil’den, e-postalardaki bağlantıyla ya da bize yazarak geri alabilirsin.</p>

<h2>Herkese görünenler</h2>
<p>Kullanıcı adın ve skorların, skor tablosunda bütün ziyaretçilere görünür. Bunu Profil’den kapatabilirsin; kapalıyken adın ve skorların tabloda görünmez. Kullanıcı adında gerçek adını ya da kişisel bilgilerini kullanmak zorunda değilsin. Destekçi paketi aldıysan rozetin profilinde ve skor tablosunda görünür; ödediğin tutar görünmez.</p>

<h2>Kimlerle paylaşıyoruz</h2>
<ul>
  <li><b>Cloudflare, Inc. (ABD):</b> sitenin barındırılması, sunucu ve veritabanı. Hesap ve oyun verilerin burada saklanır.</li>
  <li><b>Google LLC (ABD):</b> e-postaların ${OWNER.email} hesabından gönderilmesi ve geri bildirimlerin bu kutuda saklanması (Gmail; e-posta adresin ve e-postanın içeriği), yazı tipleri (Google Fonts; IP adresin). Önceki sürümde gönderilen geri bildirimler Google Forms’ta durur.</li>
  <li><b>Polar (polar.sh):</b> destekçi paketinin satıcısı ve ödeme sayfası. Ödeme Polar’ın sayfasında yapılır; kart bilgilerin, fatura bilgilerin ve e-posta adresin doğrudan Polar’a girilir. Polar’a bizden yalnız oyundaki hesap numaran (adın ya da e-postan değil) ve vergi hesabı için IP adresin gider. Polar bu verileri satıcı olarak kendi gizlilik politikasına göre işler.</li>
</ul>
<p>Toplu gönderim için başka bir e-posta hizmeti kullanırsak adresin o hizmete de aktarılır ve hizmet bu listeye eklenir. Veritabanımız şu an Cloudflare’in Doğu Avrupa bölgesinde çalışıyor; bu konum kesin bir taahhüt değildir. Site Cloudflare’in dünya genelindeki ağı üzerinden sunulur. Yani verilerin Türkiye dışında işlenir. Yasal bir zorunluluk olduğunda veriler yetkili kurumlarla da paylaşılabilir.</p>

<h2>Tarayıcında saklananlar</h2>
<p>Oturumun, ayarların, dil seçimin ve kayıtlarının bir kopyası tarayıcında (localStorage ve IndexedDB) durur. Bunlar oyunun çalışması için gereklidir ve tarayıcı verilerini temizlediğinde silinir. Destekçi rozetin ve kayıt yeri sayın da hesabının bu kopyasında durur.</p>

<h2>Ne kadar saklıyoruz</h2>
<p>Hesap ve oyun verilerin, hesabın açık kaldığı sürece saklanır. Her hesapta 2 oyun kaydı yeri vardır; destekçi paketiyle 3 ya da 4 olur. 25 Kasım 2026’dan önce açılmış hesaplarda üçüncü kayıt silinmez: yüklenebilir ama üstüne yazılamaz, silinince bu yer kalkar. Yeni kayıt, seçilen yerdeki eski kaydın yerini alır. Kayıt sayın tutabileceğin sayıyı aşarsa (yer sayısı azaldığında ya da bir ödeme iade edildiğinde) oyunda uyarı gösterilir; kural değişikliğinin yayınlandığı ya da iadenin yapıldığı günden 7 gün sonra hâlâ fazlaysa en eski kayıtların silinir; bunun için oyuna girmen beklenmez. Destekçi paketi sipariş kayıtların hesabınla birlikte saklanır ve hesabınla birlikte silinir; Polar’ın tuttuğu satış kayıtları Polar’ın kurallarına tabidir. Hesabını Profil’den kendin silebilirsin (şifren sorulur). Şifreni kaybettiysen bize yaz; başvurunu en geç 30 gün içinde sonuçlandırırız. Yasal olarak saklanması gereken veriler bunun dışındadır. Hesabın, kayıtların, skorların ve oturumların veritabanından birlikte silinir. Silinen veriler veritabanı yedeklerinde en çok 30 gün daha kalabilir; bu sürenin sonunda kendiliğinden yok olur. Oturumlar 90 gün sonra kapanır ve silinir. Sunucunun teknik kayıtları en çok 7 gün tutulur; Cloudflare’in kendi ağ kayıtları kendi kurallarına tabidir. İncelenmesini istediğin geri bildirimler ve katkı puanın hesabınla birlikte saklanır ve hesabınla birlikte silinir. Geri bildirimlerin e-posta kopyaları kutumuzda durur, hesabını silmek onları silmez: silinmesini istiyorsan bize hesabının adını belirt.</p>

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
  <li><b>If you create an account:</b> your user name, email address, hashes of your password and recovery code, account creation and last login dates, a hash of your session token, the date and version of these texts you accepted, your language, and your email preference. Your password is hashed in your browser before it is sent; neither the password nor the recovery code itself is stored.</li>
  <li><b>While verifying your email:</b> a hash of the verification code (valid for 10 minutes) and, for sending limits, hashes of your email and IP addresses. These are deleted shortly afterwards.</li>
  <li><b>If you play with an account:</b> saves uploaded to the cloud, your scores (such as kills, wins and earnings), campaign statistics, play time, tutorial and leaderboard preferences and the news items you have read.</li>
  <li><b>If you send feedback:</b> your message and its type (bug report or suggestion), your account name, email address and language. Feedback needs an account with an email. These arrive as email in the ${OWNER.email} mailbox and are kept there. If you ask for a review, your message, its type and the outcome of the review (its status and the contribution points you earned) are also kept in the database with your account, and the outcome is sent to you by email. The rank badge from your contribution points appears in your Profile and next to your name on the leaderboard.</li>
  <li><b>If you buy a supporter pack:</b> on your account, your supporter level (your badge), your total paid (minus refunds) and your number of payments; for each payment, the order number, amount (before tax), refunded amount, currency, order status, payment date and your total play time at that moment (for the refund rule), as reported to us by Polar. Your card details, billing name and address and the email you enter at checkout go straight to Polar; they never reach us.</li>
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
  <li>To deliver the supporter pack to your account (badge and extra save slots) and to assess refund requests (your total play time at purchase is recorded: no refund is given if you have played 2.5 hours or more since paying).</li>
</ul>

<h2>Your email address</h2>
<p>An email address is required to create a new account and optional for accounts created earlier. It is not saved until verified with a 6-digit code we send to it. An address can be used for only one account. It is not shown to other players or on the leaderboard. You can add or change it in your Profile. We do not sell it or share it for other parties’ advertising.</p>
<p>News and announcement emails are sent only if you ticked the separate box, in the language selected on your account. That box is not a condition of having an account. You can withdraw at any time in your Profile, through the link in the emails or by writing to us.</p>

<h2>What is public</h2>
<p>Your user name and scores are visible to every visitor on the leaderboard. You can turn this off in your Profile; while it is off, your name and scores do not appear there. Your user name does not have to be your real name or contain personal details. If you bought a supporter pack, your badge is shown in your profile and on the leaderboard; the amount you paid is not.</p>

<h2>Who we share it with</h2>
<ul>
  <li><b>Cloudflare, Inc. (USA):</b> site hosting, server and database. Your account and game data are stored here.</li>
  <li><b>Google LLC (USA):</b> sending email from the ${OWNER.email} account and keeping feedback in that mailbox (Gmail; your email address and the email’s content), and fonts (Google Fonts; your IP address). Feedback sent with earlier versions remains in Google Forms.</li>
  <li><b>Polar (polar.sh):</b> seller of the supporter pack and its payment page. You pay on Polar’s page; your card details, billing details and email address go straight to Polar. From us, Polar receives only your in-game account number (not your name or email) and your IP address for tax purposes. Polar processes this data as the seller under its own privacy policy.</li>
</ul>
<p>If we use another email service for bulk sending, your address is also transferred to that service and it is added to this list. Our database currently runs in Cloudflare’s Eastern Europe region; this location is not a firm commitment. The site is served through Cloudflare’s global network. Your data is therefore processed outside Türkiye. Data may also be shared with competent authorities where the law requires it.</p>

<h2>What is kept in your browser</h2>
<p>Your session, settings, language and a copy of your saves are kept in your browser (localStorage and IndexedDB). The game needs them to work, and they are deleted when you clear your browser data. Your supporter badge and save slot count are also kept in this copy of your account.</p>

<h2>How long we keep it</h2>
<p>Account and game data are kept for as long as your account exists. Each account has 2 game save slots, or 3 or 4 with the supporter pack; a new save replaces the old one in the slot you choose. Accounts created before 25 November 2026 keep a third save: it can be loaded but not overwritten, and the slot goes away once it is deleted. If you have more saves than you can keep (when the number of slots goes down or a payment is refunded), the game shows a notice; if you still have too many 7 days after the rule change was published or the refund was made, your oldest saves are deleted, whether or not you have logged in. Your supporter pack order records are kept with your account and deleted with it; the sales records kept by Polar follow Polar’s own rules. You can delete your account yourself in your Profile (your password is required). If you have lost your password, write to us and we conclude your request within 30 days at the latest. Data the law requires us to keep is excepted. Your account, saves, scores and sessions are deleted from the database together. Deleted data may remain in database backups for up to 30 more days, after which it disappears automatically. Sessions end and are deleted after 90 days. The server’s technical logs are kept for up to 7 days; Cloudflare’s own network logs follow its own rules. Feedback you asked to have reviewed and your contribution points are kept with your account and deleted with it. Email copies of your feedback stay in our mailbox and deleting your account does not delete them: to have them deleted, tell us your account name.</p>

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
    <tr><td>Oyun kayıtları, skorlar, harekât istatistikleri, oynama süresi, tercihler, okunan haberler</td><td>Oyun hizmetinin sunulması, skor tablosu, oyunun toplu bilgilerle geliştirilmesi</td><td>Sözleşmenin ifası (m. 5/2-c); meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>Metinlerin kabul tarihi ve sürümü, e-posta izni kaydı</td><td>Kabulün ve iznin kanıtlanması</td><td>Bir hakkın tesisi, kullanılması veya korunması (m. 5/2-e)</td></tr>
    <tr><td>Doğrulama kodu özeti, e-posta ve IP adresi özetleri</td><td>E-posta adresinin doğrulanması, kod gönderiminin kötüye kullanılmasının önlenmesi</td><td>Sözleşmenin kurulması (m. 5/2-c); meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>IP adresi ve tarayıcı bilgileri</td><td>Sitenin sunulması ve güvenliği</td><td>Meşru menfaat (m. 5/2-f)</td></tr>
    <tr><td>Geri bildirimde yazılan ileti ve türü, hesabın adı, e-posta adresi ve dil seçimi; incelenmesi istenirse inceleme sonucu ve katkı puanı</td><td>Görüşlerin değerlendirilmesi; incelenmesi istenen geri bildirimin sonucunun bildirilmesi ve katkı puanının verilmesi</td><td>Meşru menfaat (m. 5/2-f); inceleme istenirse sözleşmenin kurulması veya ifası (m. 5/2-c)</td></tr>
    <tr><td>E-posta adresi ve dil seçimi (yalnız izin verdiysen)</td><td>Yenilik ve duyuru e-postaları</td><td>Açık rıza (m. 5/1)</td></tr>
    <tr><td>Destekçi seviyesi, toplam ödeme tutarı, ödeme sayısı; her ödeme için sipariş numarası, tutar, iade tutarı, para birimi, durum, tarih ve o andaki toplam oynama süresi</td><td>Destekçi paketinin hesaba teslimi (rozet, kayıt yeri), iade isteklerinin değerlendirilmesi</td><td>Sözleşmenin kurulması ve ifası (m. 5/2-c); bir hakkın tesisi, kullanılması veya korunması (m. 5/2-e)</td></tr>
  </tbody>
</table></div>

<h2>Toplama yöntemi</h2>
<p>Veriler, hesap ve geri bildirim formlarını doldurman ve oyunu oynaman sırasında elektronik ortamda, otomatik yollarla toplanır.</p>

<h2>Aktarım</h2>
<p>Veriler, hizmetin sunulması amacıyla barındırma ve veritabanı hizmeti veren Cloudflare, Inc. ile e-posta (Gmail) ve yazı tipi hizmeti veren Google LLC’ye aktarılır; önceki sürümde gönderilen geri bildirimler Google Forms’ta durur. Toplu gönderim için başka bir e-posta hizmeti kullanılırsa adres o hizmete de aktarılır ve hizmet Gizlilik Politikası’nda belirtilir. Bu şirketler ABD merkezlidir. Veritabanı şu an Cloudflare’in Doğu Avrupa bölgesinde çalışır (kesin bir taahhüt değildir) ve site Cloudflare’in dünya genelindeki ağı üzerinden sunulur; yani veriler yurt dışında işlenir. Destekçi paketi alan kullanıcının hesap numarası ve IP adresi, satıcı ve ödeme hizmeti olarak Polar’a (ABD merkezli) aktarılır. Kart ve fatura bilgileri doğrudan Polar’a girilir, veri sorumlusuna ulaşmaz. Veriler yasal zorunluluk hâlinde yetkili kamu kurumlarıyla da paylaşılabilir.</p>

<h2>Saklama ve silme</h2>
<p>Hesap ve oyun verileri hesap açık kaldığı sürece saklanır. Hesap başına 2 oyun kaydı yeri tutulur (destekçi paketiyle 3 ya da 4; 25 Kasım 2026’dan önce açılmış hesaplarda üçüncü kayıt silinmeden kalır). Kayıt sayısı tutulabilecek sayıyı aşarsa kural değişikliğinin ya da iadenin tarihinden 7 gün sonra en eski kayıtlar silinir. Destekçi paketi sipariş kayıtları hesapla birlikte silinir. Hesap Profil’den silinebilir; yazılı silme başvurusu en geç 30 gün içinde sonuçlandırılır. Silinen veriler veritabanı yedeklerinde en çok 30 gün daha kalabilir, sunucunun teknik kayıtları en çok 7 gün tutulur. Ayrıntılar <a href="${legalUrl('privacy', false)}">Gizlilik Politikası</a>’ndadır.</p>

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
    <tr><td>Saves, scores, campaign statistics, play time, preferences, news items read</td><td>Providing the game, the leaderboard, improving the game with aggregate figures</td><td>Performance of a contract (5/2-c); legitimate interest (5/2-f)</td></tr>
    <tr><td>Date and version of accepted texts, email permission record</td><td>Proving acceptance and permission</td><td>Establishing, exercising or protecting a right (5/2-e)</td></tr>
    <tr><td>Verification code hash, email and IP address hashes</td><td>Verifying the email address, preventing abuse of code sending</td><td>Formation of a contract (5/2-c); legitimate interest (5/2-f)</td></tr>
    <tr><td>IP address and browser details</td><td>Serving and securing the site</td><td>Legitimate interest (5/2-f)</td></tr>
    <tr><td>Feedback message and its type, account name, email address and language; if a review is requested, its outcome and contribution points</td><td>Reviewing feedback; reporting the outcome of a requested review and awarding contribution points</td><td>Legitimate interest (5/2-f); where a review is requested, establishing or performing a contract (5/2-c)</td></tr>
    <tr><td>Email address and language (only if you gave permission)</td><td>News and announcement emails</td><td>Explicit consent (5/1)</td></tr>
    <tr><td>Supporter level, total paid, number of payments; for each payment the order number, amount, refunded amount, currency, status, date and total play time at that moment</td><td>Delivering the supporter pack to the account (badge, save slots), assessing refund requests</td><td>Formation and performance of a contract (5/2-c); establishing, exercising or protecting a right (5/2-e)</td></tr>
  </tbody>
</table></div>

<h2>How data is collected</h2>
<p>Data is collected electronically and automatically when you fill in the account and feedback forms and play the game.</p>

<h2>Transfers</h2>
<p>To provide the service, data is transferred to Cloudflare, Inc. (hosting and database) and Google LLC (email through Gmail and fonts); feedback sent with earlier versions remains in Google Forms. If another email service is used for bulk sending, the address is also transferred to that service, which is named in the Privacy Policy. These companies are based in the USA. The database currently runs in Cloudflare’s Eastern Europe region (not a firm commitment) and the site is served through Cloudflare’s global network, so data is processed abroad. The account number and IP address of a user who buys a supporter pack are transferred to Polar (based in the USA) as the seller and payment service. Card and billing details are entered directly with Polar and never reach the data controller. Data may also be shared with competent public authorities where the law requires it.</p>

<h2>Retention and deletion</h2>
<p>Account and game data are kept for as long as the account exists. Each account has 2 game save slots (3 or 4 with the supporter pack; accounts created before 25 November 2026 keep a third save). If there are more saves than can be kept, the oldest are deleted 7 days after the rule change or the refund. Supporter pack order records are deleted with the account. The account can be deleted in the Profile; written deletion requests are concluded within 30 days at the latest. Deleted data may remain in database backups for up to 30 more days, and the server’s technical logs are kept for up to 7 days. See the <a href="${legalUrl('privacy', true)}">Privacy Policy</a> for details.</p>

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

// Hesap silme (2026-11-19): Google Play'in istediği herkese açık sayfa (adımlar, silinen ve kalan veriler, ek saklama süresi).
// Kabul edilen metin değildir: değişince LEGAL_VERSION değişmez. Gizlilik Politikası'ndaki silme bilgisiyle uyuşmalı.
const deletionTr: LegalText = {
  title: 'Hesap silme',
  desc: 'WarSimBox hesabını ve verilerini nasıl silersin; neler silinir, neler kalır.',
  html: `
<p>Bu sayfa, WarSimBox hesabını (web sitesi warsimbox.com ve Android uygulaması aynı hesabı kullanır) ve verilerini nasıl sileceğini anlatır. Oyunun geliştiricisi ve veri sorumlusu: ${OWNER.name}.</p>

<h2>Oyunun içinden silmek</h2>
<ol>
  <li>Oyunu aç ve hesabınla giriş yap.</li>
  <li>Ana menünün üstündeki adına dokun. Oyunun içindeysen: Menü → Profil ve skorlar.</li>
  <li>Profil penceresinin altındaki <b>Hesabımı sil</b>’e dokun.</li>
  <li>Şifreni yaz ve <b>Hesabımı kalıcı olarak sil</b>’e dokun.</li>
</ol>
<p>Hesabın hemen silinir; bu işlem internet bağlantısı ister ve geri alınamaz.</p>

<h2>Şifreni unuttuysan ya da oyuna giremiyorsan</h2>
<p>${OWNER.email} adresine yaz: hesabının kullanıcı adını belirt, mümkünse hesaba kayıtlı e-posta adresinden yaz. Hesabın sana ait olduğunu doğrulamak için birkaç soru sorabiliriz. Başvurun en geç 30 gün içinde ücretsiz sonuçlandırılır.</p>

<h2>Neler silinir</h2>
<ul>
  <li>Hesabın: kullanıcı adın, e-posta adresin, şifrenin ve kurtarma kodunun özetleri, tercihlerin, metinleri kabul ve e-posta izni kayıtların.</li>
  <li>Buluttaki oyun kayıtların.</li>
  <li>Skorların, harekât istatistiklerin ve oynama süren; skor tablosundan da çıkarsın.</li>
  <li>Bütün oturumların (her cihazda oturum kapanır) ve e-posta doğrulama kodların.</li>
  <li>Destekçi seviyen, toplam ödeme tutarın, ödeme sayın ve sipariş kayıtların; rozetin ve fazladan kayıt yerlerin de gider. Hesap silindikten sonra geri getirilemez.</li>
  <li>İncelenmesini istediğin geri bildirimler, katkı puanın ve rütben.</li>
  <li>Silmeyi yaptığın cihazda: oturumun, kayıtlarının kopyaları, profilinin kopyası ve henüz gönderilmemiş skorların.</li>
</ul>

<h2>Neler kalır ve ne kadar</h2>
<ul>
  <li>Silinen veriler veritabanı yedeklerinde en çok 30 gün daha kalabilir; bu sürenin sonunda kendiliğinden yok olur.</li>
  <li>Sunucunun teknik kayıtları en çok 7 gün tutulur.</li>
  <li>Destekçi paketi aldıysan satışın kaydı satıcı olan Polar’da, Polar’ın yasal saklama kurallarına göre kalır.</li>
  <li>Geri bildirimlerinin e-posta kopyaları kutumuzda kalır; silinmesini istiyorsan hesabının adını belirterek bize yaz.</li>
  <li>Başka cihazlarda hesabınla giriş yaptıysan o cihazdaki kopyalar (ayarlar, kayıt kopyaları), tarayıcının site verileri temizlenince ya da uygulama kaldırılınca silinir.</li>
  <li>Yasal olarak saklanması gereken veriler bunun dışındadır.</li>
</ul>

<h2>Hesabı silmeden bazı verileri silmek</h2>
<ul>
  <li>Oyun kayıtlarını ana menüdeki Kayıtlar sekmesinden tek tek silebilirsin.</li>
  <li>Skor tablosunda görünmemeyi ve yenilik e-postalarını Profil’den kapatabilirsin.</li>
  <li>Başka bir verinin silinmesi için ${OWNER.email} adresine yaz.</li>
</ul>

<h2>Misafir olarak oynadıysan</h2>
<p>Hesapsız oyunda sunucumuzda senin adına veri tutulmaz. Cihazındaki oyun verileri (ayarlar, tercihler) tarayıcının site verileri temizlenince ya da uygulama kaldırılınca silinir.</p>

<p>Ayrıntılar <a href="${legalUrl('privacy', false)}">Gizlilik Politikası</a>’nda ve <a href="${legalUrl('kvkk', false)}">KVKK Aydınlatma Metni</a>’ndedir.</p>
`,
};

const deletionEn: LegalText = {
  title: 'Account deletion',
  desc: 'How to delete your WarSimBox account and data, and what is deleted or kept.',
  html: `
<p>This page explains how to delete your WarSimBox account (the website warsimbox.com and the Android app use the same account) and its data. Developer and data controller: ${OWNER.nameEn}.</p>

<h2>Delete it in the game</h2>
<ol>
  <li>Open the game and log in to your account.</li>
  <li>Tap your name at the top of the main menu. During a game: Menu → Profile and scores.</li>
  <li>Tap <b>Delete my account</b> at the bottom of the Profile window.</li>
  <li>Enter your password and tap <b>Delete my account permanently</b>.</li>
</ol>
<p>Your account is deleted at once; this needs an internet connection and cannot be undone.</p>

<h2>If you forgot your password or cannot get into the game</h2>
<p>Write to ${OWNER.email}: give your account’s user name and, if you can, write from the email address registered to the account. We may ask a few questions to confirm that the account is yours. Your request is concluded free of charge within 30 days at the latest.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your account: user name, email address, password and recovery code hashes, preferences, and the records of your acceptance of the texts and your email permission.</li>
  <li>Your saves in the cloud.</li>
  <li>Your scores, campaign statistics and play time; you are also removed from the leaderboard.</li>
  <li>All your sessions (you are logged out on every device) and email verification codes.</li>
  <li>Your supporter level, total paid, number of payments and order records; your badge and extra save slots go too. They cannot be restored after the account is deleted.</li>
  <li>Feedback you asked to have reviewed, your contribution points and your rank.</li>
  <li>On the device you delete from: your session, the copies of your saves, the copy of your profile and any scores not yet sent.</li>
</ul>

<h2>What is kept, and for how long</h2>
<ul>
  <li>Deleted data may remain in database backups for up to 30 more days, after which it disappears automatically.</li>
  <li>The server’s technical logs are kept for up to 7 days.</li>
  <li>If you bought a supporter pack, the record of the sale stays with Polar, the seller, under Polar’s legal retention rules.</li>
  <li>Email copies of your feedback stay in our mailbox; to have them deleted, write to us and tell us your account name.</li>
  <li>If you logged in on other devices, the copies there (settings, save copies) are deleted when that browser’s site data is cleared or the app is uninstalled.</li>
  <li>Data the law requires us to keep is excepted.</li>
</ul>

<h2>Deleting some data without deleting the account</h2>
<ul>
  <li>You can delete game saves one by one in the Saves tab of the main menu.</li>
  <li>You can hide yourself from the leaderboard and turn off news emails in your Profile.</li>
  <li>To have any other data deleted, write to ${OWNER.email}.</li>
</ul>

<h2>If you played as a guest</h2>
<p>We keep no data about you on our server for guest games. The game data on your device (settings, preferences) is deleted when the browser’s site data is cleared or the app is uninstalled.</p>

<p>See the <a href="${legalUrl('privacy', true)}">Privacy Policy</a> and the <a href="${legalUrl('kvkk', true)}">KVKK Privacy Notice</a> for details.</p>
`,
};

// Destekçi paketi koşulları (2026-11-21, avukat onaylı): satıcı Polar; ne alındığı, teslim, iade (7 gün ve ödemeden sonra
// 2,5 saatten az oynama), hesap silinince ne olduğu. Polar'daki ürün açıklaması ve oyundaki paket penceresi buraya bağlanır.
const supportTr: LegalText = {
  title: 'Destekçi Paketi Koşulları',
  desc: 'WarSimBox destekçi paketi: ne alırsın, kim satar, nasıl teslim edilir ve iade.',
  html: `
<p class="legal-date">Yürürlük tarihi: ${date('tr')}</p>

<h2>Teşekkürler</h2>
<p>Destekçi paketi WarSimBox’ın gelişmesine katkı olur. Katkın için teşekkür ederiz; aldığın paketle hesabına sana özel bir rozet ve fazladan kayıt yeri eklenir.</p>

<h2>Ne alıyorsun</h2>
<p>WarSimBox hesabına bağlı dijital içerik: bir profil rozeti ve toplam ödemene göre fazladan kayıt yeri (toplam 5 $ ve üstünde 1, 15 $ ve üstünde 2). Rozet ve kayıt yeri yalnız bu hesapta geçerlidir, başka hesaba aktarılamaz, paraya çevrilemez.</p>

<h2>Fiyat</h2>
<p>Tutarı sen seçersin (1–50 $). Ülkene göre vergi eklenebilir; son tutar ödeme sayfasında görünür.</p>

<h2>Satıcı ve ödeme</h2>
<p>Satıcı Polar’dır (polar.sh, “merchant of record”). Ödeme Polar’ın sayfasında yapılır; Polar’ın alıcı koşulları geçerlidir. Kart bilgilerin bize gelmez.</p>

<h2>Teslim</h2>
<p>İçerik ödemeden hemen sonra hesabına kendiliğinden eklenir. Birkaç dakika içinde gelmezse ${OWNER.email} adresine yaz.</p>

<h2>İade</h2>
<p>Ödemeden sonraki 7 gün içinde, sipariş numarasıyla ${OWNER.email} adresine yazarak iade isteyebilirsin. Ödemeden sonra toplam 2,5 saat ya da daha fazla oynadıysan iade kabul edilmez: paketin sağladığı kayıt yerleri o süre içinde kullanılmış sayılır. Oynama süresi hesabının harekâtlarda geçen gerçek süresidir ve satın alma anından itibaren sunucumuzda ölçülür. İade edilen ya da bankadan itiraz edilen ödemenin rozeti ve kayıt yeri geri alınır. Kayıt sayın yer sayını aşarsa 7 gün içinde fazlasını silmen istenir; silmezsen en eski kayıtların silinir.</p>

<h2>Hesabın silinirse</h2>
<p>Rozet ve fazladan kayıt yerleri hesapla birlikte silinir ve geri getirilemez.</p>

<h2>Oyun değişirse</h2>
<p>Oyun geliştikçe rozetlerin görünüşü değişebilir. Oyun kapanırsa içerik de kullanılamaz hâle gelir.</p>

<h2>İletişim</h2>
<p>${OWNER.email}. Kişisel verilerin için <a href="${legalUrl('privacy', false)}">Gizlilik Politikası</a>’na bak.</p>
`,
};

const supportEn: LegalText = {
  title: 'Supporter Pack Terms',
  desc: 'The WarSimBox supporter pack: what you get, who sells it, delivery and refunds.',
  html: `
<p class="legal-date">Effective date: ${date('en')}. This is a translation; the Turkish text prevails.</p>

<h2>Thank you</h2>
<p>The supporter pack helps WarSimBox grow. Thank you for your contribution; the pack adds a special badge and extra save slots to your account.</p>

<h2>What you get</h2>
<p>Digital content tied to your WarSimBox account: a profile badge and, depending on your total payments, extra save slots (1 from a $5 total, 2 from a $15 total). The badge and slots are valid only on this account; they cannot be transferred to another account or exchanged for money.</p>

<h2>Price</h2>
<p>You choose the amount ($1–$50). Tax may be added depending on your country; the final amount is shown on the payment page.</p>

<h2>Seller and payment</h2>
<p>The seller is Polar (polar.sh, the “merchant of record”). You pay on Polar’s page and Polar’s buyer terms apply. Your card details never reach us.</p>

<h2>Delivery</h2>
<p>The content is added to your account automatically right after payment. If it has not arrived within a few minutes, write to ${OWNER.email}.</p>

<h2>Refunds</h2>
<p>You can request a refund within 7 days of payment by writing to ${OWNER.email} with your order number. No refund is given if you have played 2.5 hours or more in total since paying: the save slots the pack provides count as used by then. Play time is the real time your account spends in campaigns and is measured on our server from the moment of purchase. If a payment is refunded or disputed through your bank, its badge and save slots are removed. If you then have more saves than slots, you are asked to delete the extra ones within 7 days; otherwise your oldest saves are deleted.</p>

<h2>If your account is deleted</h2>
<p>The badge and extra save slots are deleted with the account and cannot be restored.</p>

<h2>If the game changes</h2>
<p>As the game develops, the look of the badges may change. If the game shuts down, the content can no longer be used.</p>

<h2>Contact</h2>
<p>${OWNER.email}. For your personal data, see the <a href="${legalUrl('privacy', true)}">Privacy Policy</a>.</p>
`,
};

export const LEGAL_TEXT: Record<LegalKind, { tr: LegalText; en: LegalText }> = {
  privacy: { tr: privacyTr, en: privacyEn },
  kvkk: { tr: kvkkTr, en: kvkkEn },
  deletion: { tr: deletionTr, en: deletionEn },
  support: { tr: supportTr, en: supportEn },
};
