/**
 * Bot metinleri — Türkçe ve İngilizce (CLAUDE.md §4.5). Bot sitenin React çeviri sisteminin dışında (Edge Function) çalıştığı için çiftler burada tutulur;
 * kullanıcı içeriği (başlık, prompt metni, yazar adı) ASLA çevrilmez. `{0}` `{1}` yer tutuculardır.
 */
import type { Lang } from "./types.ts";

type Pair = { tr: string; en: string };

const M = {
  welcome: {
    tr: "<b>Promptly</b> botuna hoş geldin! Topluluğun yapay zekâ promptlarını ara, oku ve doldur.\n\n/ara neon logo — prompt ara\n/populer — en çok kopyalananlar\n/prompt &lt;id&gt; — bir promptu göster\n/doldur — değişkenleri doldur\n\nHesabını bağlarsan kendi promptlarını görür, özel taslak ekler ve bildirim alırsın: /baglan\n\nHer sohbette <code>@{0} neon logo</code> yazarak da arayabilirsin. Tüm komutlar: /yardim",
    en: "Welcome to the <b>Promptly</b> bot! Search, read and fill the community's AI prompts.\n\n/search neon logo — search prompts\n/popular — most copied\n/prompt &lt;id&gt; — show a prompt\n/fill — fill the variables\n\nLink your account to see your own prompts, add private drafts and get notifications: /link\n\nYou can also search in any chat by typing <code>@{0} neon logo</code>. All commands: /help",
  },
  help: {
    tr: "<b>Herkese açık</b>\n/ara [istek|ayar|workflow] sorgu — ara (türü yazmazsan prompt)\n/populer [hafta|ay|yil|tumu] — popüler promptlar\n/prompt &lt;id&gt; — promptu göster\n/istek &lt;id&gt; · /hazirayar &lt;id&gt; · /workflow &lt;id&gt; — göster\n/doldur &lt;id&gt; ve altına <code>ad=değer</code> satırları — değişkenleri doldur\n\n<b>Hesabın</b> (özel sohbette)\n/baglan KOD — Promptly hesabını bağla (kodu Ayarlar → Geliştirici → Telegram'dan al)\n/ben — bağlı hesabın\n/benim [taslak|yayinda] — promptların\n/taslak Başlık + alt satırlara prompt metni — özel taslak ekle\n/duzenle &lt;prompt|istek|ayar|workflow&gt; &lt;id&gt; &lt;baslik|aciklama|metin|yon&gt; + alt satıra yeni değer — taslağı düzenle\n/bildirim — bildirim tercihleri\n/ayril — bağlantıyı kaldır\n\nYayınlama ve silme yalnızca sitede yapılır.",
    en: "<b>Public</b>\n/search [request|preset|workflow] query — search (prompts if you give no type)\n/popular [week|month|year|all] — popular prompts\n/prompt &lt;id&gt; — show a prompt\n/request &lt;id&gt; · /preset &lt;id&gt; · /workflow &lt;id&gt; — show one\n/fill &lt;id&gt; followed by <code>name=value</code> lines — fill the variables\n\n<b>Your account</b> (private chat)\n/link CODE — link your Promptly account (get the code in Settings → Developer → Telegram)\n/me — your linked account\n/mine [draft|published] — your prompts\n/draft Title + prompt text on the next lines — add a private draft\n/edit &lt;prompt|request|preset|workflow&gt; &lt;id&gt; &lt;title|description|text|direction&gt; + the new value on the next line — edit a draft\n/notify — notification settings\n/unlink — remove the link\n\nPublishing and deleting happen on the site only.",
  },
  searchEmpty: { tr: "Sonuç bulunamadı.", en: "No results." },
  searchTitle: { tr: "<b>{0}</b> için sonuçlar:", en: "Results for <b>{0}</b>:" },
  searchNewest: { tr: "<b>En yeni içerikler:</b>", en: "<b>Newest:</b>" },
  popularTitle: { tr: "<b>Popüler promptlar</b> ({0}):", en: "<b>Popular prompts</b> ({0}):" },
  openOnSite: { tr: "Promptly'de aç", en: "Open on Promptly" },
  fillButton: { tr: "Değişkenleri doldur", en: "Fill the variables" },
  fillTemplate: {
    tr: "Değişkenleri doldurmak için şunu kopyala, değerleri yaz ve gönder:\n\n<pre>{0}</pre>",
    en: "To fill the variables, copy this, add the values and send it:\n\n<pre>{0}</pre>",
  },
  fillNoVars: { tr: "Bu promptta doldurulacak değişken yok.", en: "This prompt has no variables to fill." },
  fillUsage: { tr: "Kullanım: /doldur &lt;id&gt; ve altına <code>ad=değer</code> satırları.", en: "Usage: /fill &lt;id&gt; followed by <code>name=value</code> lines." },
  fillMissing: { tr: "Boş kalan: {0}", en: "Still empty: {0}" },
  variables: { tr: "Değişkenler: {0}", en: "Variables: {0}" },
  byAuthor: { tr: "yazar", en: "by" },
  truncated: { tr: "…(devamı Promptly'de)", en: "…(rest on Promptly)" },
  stepsTitle: { tr: "Adımlar", en: "Steps" },
  steps: { tr: "{0} adım", en: "{0} steps" },
  requestStatus: { tr: "Durum: {0}", en: "Status: {0}" },
  direction: { tr: "Yaratıcı yön", en: "Creative direction" },
  selection: { tr: "Ayarlar", en: "Settings" },
  needId: { tr: "Bir kimlik ver: {0}", en: "Give an id: {0}" },
  notFound: { tr: "Bulunamadı (özel, silinmiş ya da topluluğa özel olabilir).", en: "Not found (it may be private, deleted or community-only)." },
  badId: { tr: "Bu geçerli bir kimlik değil.", en: "That is not a valid id." },
  badInput: { tr: "İsteğini anlayamadım: {0}", en: "I could not understand that: {0}" },
  tooFast: { tr: "Çok hızlı gidiyorsun. Birkaç saniye sonra tekrar dene.", en: "You are going too fast. Try again in a few seconds." },
  error: { tr: "Bir sorun oluştu. Biraz sonra tekrar dene.", en: "Something went wrong. Please try again shortly." },
  unknown: { tr: "Bu komutu tanımıyorum. /yardim yaz.", en: "I do not know that command. Send /help." },
  privateOnly: { tr: "Bu komut yalnızca benimle özel sohbette çalışır.", en: "This command only works in a private chat with me." },
  notLinked: { tr: "Önce Promptly hesabını bağla: Ayarlar → Geliştirici → Telegram'dan kod al, sonra /baglan KOD yaz.", en: "Link your Promptly account first: get a code in Settings → Developer → Telegram, then send /link CODE." },
  linkUsage: { tr: "Kullanım: /baglan KOD (kodu Ayarlar → Geliştirici → Telegram'dan al).", en: "Usage: /link CODE (get the code in Settings → Developer → Telegram)." },
  linkInvalid: { tr: "Bu kod geçersiz ya da süresi dolmuş. Sitede yeni bir kod oluştur.", en: "That code is invalid or has expired. Create a new one on the site." },
  linkConfirm: {
    tr: "Bu Telegram hesabını <b>@{0}</b> ({1}) Promptly hesabına bağlamak üzeresin.\nYetki: {2}\n\nBu senin hesabın değilse Vazgeç'e bas.",
    en: "You are about to link this Telegram account to the Promptly account <b>@{0}</b> ({1}).\nPermission: {2}\n\nIf this is not your account, press Cancel.",
  },
  scopeRead: { tr: "yalnız okuma", en: "read only" },
  scopeWrite: { tr: "okuma + özel taslak ekleme/düzenleme", en: "read + add/edit private drafts" },
  linkYes: { tr: "Bağla", en: "Link" },
  linkNo: { tr: "Vazgeç", en: "Cancel" },
  linkDone: { tr: "Bağlandı: <b>@{0}</b>. Yayınlama ve silme yalnızca sitede yapılır. /yardim", en: "Linked: <b>@{0}</b>. Publishing and deleting happen on the site only. /help" },
  linkCancelled: { tr: "Vazgeçildi. Hiçbir şey bağlanmadı.", en: "Cancelled. Nothing was linked." },
  linkLimit: { tr: "Bu hesapta en çok 3 Telegram bağlantısı olabilir. Önce Ayarlar'dan birini kaldır.", en: "An account can have at most 3 Telegram links. Remove one in Settings first." },
  linkTooMany: { tr: "Çok fazla yanlış deneme. Bir saat sonra tekrar dene.", en: "Too many wrong attempts. Try again in an hour." },
  unlinked: { tr: "Bağlantı kaldırıldı. Bot artık hesabına erişemez.", en: "Link removed. The bot can no longer reach your account." },
  notLinkedNothing: { tr: "Zaten bağlı bir hesap yok.", en: "There is no linked account." },
  me: { tr: "Bağlı hesap: <b>@{0}</b> ({1})\nYetki: {2}", en: "Linked account: <b>@{0}</b> ({1})\nPermission: {2}" },
  mineTitle: { tr: "<b>Promptların</b>:", en: "<b>Your prompts</b>:" },
  mineEmpty: { tr: "Henüz promptun yok.", en: "You have no prompts yet." },
  statusDraft: { tr: "taslak", en: "draft" },
  statusPublished: { tr: "yayında", en: "published" },
  editOnSite: { tr: "Sitede düzenle", en: "Edit on the site" },
  needWrite: { tr: "Bu bağlantının yazma izni yok. Ayarlar → Geliştirici → Telegram'dan yazma izinli yeni bir kod oluşturup yeniden bağla.", en: "This link has no write permission. Create a new code with write permission in Settings → Developer → Telegram and link again." },
  draftUsage: { tr: "Kullanım:\n<pre>/taslak Başlık\nPrompt metni (birden çok satır olabilir)</pre>", en: "Usage:\n<pre>/draft Title\nPrompt text (may span several lines)</pre>" },
  draftSaved: { tr: "Özel taslak kaydedildi. Yayınlamak için sitede aç:", en: "Private draft saved. Open it on the site to publish:" },
  draftDuplicate: { tr: "Aynı başlık ve metinle bir prompt zaten var.", en: "A prompt with the same title and text already exists." },
  draftRefused: { tr: "Taslak kaydedilemedi: {0}", en: "The draft could not be saved: {0}" },
  editUsage: {
    tr: "Kullanım:\n<pre>/duzenle prompt &lt;id&gt; baslik\nYeni başlık</pre>\nAlanlar: baslik, aciklama, metin (prompt), yon (istek).",
    en: "Usage:\n<pre>/edit prompt &lt;id&gt; title\nNew title</pre>\nFields: title, description, text (prompt), direction (request).",
  },
  editDone: { tr: "Güncellendi ({0}). Yayındaki içerik burada değişmez.", en: "Updated ({0}). Published content is never changed here." },
  editNotDraft: { tr: "Bu içerik yayında; yayındaki içerik burada düzenlenemez. Sitede düzenle.", en: "This is published; published content cannot be edited here. Edit it on the site." },
  editConflict: { tr: "İçerik az önce başka yerden değişti. Tekrar dene.", en: "The content just changed elsewhere. Try again." },
  editRefused: { tr: "Değişiklik reddedildi: {0}. Hiçbir şey yazılmadı.", en: "The change was refused: {0}. Nothing was written." },
  notifyStatus: {
    tr: "<b>Bildirimler</b>\nHaftalık özet: {0}\nEtkinlik (yorum, yanıt, alıntı…): {1}\n\nDüğmelerle aç/kapat. Bildirimlerde başkalarının yorum önizlemeleri Telegram'dan geçer.",
    en: "<b>Notifications</b>\nWeekly summary: {0}\nActivity (comments, replies, quotes…): {1}\n\nUse the buttons to switch them. Notifications include previews of other people's comments, which pass through Telegram.",
  },
  on: { tr: "açık", en: "on" },
  off: { tr: "kapalı", en: "off" },
  toggleWeekly: { tr: "Haftalık özet: {0}", en: "Weekly summary: {0}" },
  toggleActivity: { tr: "Etkinlik: {0}", en: "Activity: {0}" },
  notifyHeader: { tr: "🔔 <b>Promptly</b>", en: "🔔 <b>Promptly</b>" },
  weeklyTitle: { tr: "📊 <b>Haftalık özet</b> (son 7 gün)", en: "📊 <b>Weekly summary</b> (last 7 days)" },
  copies: { tr: "{0} kopyalama", en: "{0} copies" },
  reactions: { tr: "{0} tepki", en: "{0} reactions" },
  comments: { tr: "{0} yorum", en: "{0} comments" },
  saves: { tr: "{0} kaydetme", en: "{0} saves" },
  followers: { tr: "{0} yeni takipçi", en: "{0} new followers" },
  inlineHint: { tr: "Prompt ara…", en: "Search prompts…" },
  inlineUse: { tr: "Aranan: {0}", en: "Search: {0}" },
  open: { tr: "Aç", en: "Open" },
} as const satisfies Record<string, Pair>;

export type MessageKey = keyof typeof M;

/** Telegram'ın `language_code` değerinden dil: `tr…` → Türkçe, başka her şey İngilizce. */
export function langOf(code: string | undefined | null): Lang {
  return /^tr(\b|-|_)/i.test(code ?? "") ? "tr" : "en";
}

export function msg(lang: Lang, key: MessageKey, ...args: (string | number)[]): string {
  const text: string = M[key][lang];
  return text.replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)] ?? ""));
}
