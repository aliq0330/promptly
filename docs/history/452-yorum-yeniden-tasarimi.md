# 451 — Yorumlar: kancalı yanıtlar, ⋮ menüsü, düzenleme geçmişi, yorum takibi, telefonda alttan kart

Detay sayfalarının yorum bölümü baştan tasarlandı (tuvaldeki "Yorumlar Responsive" mockup'ı; masaüstü / tablet / telefon + çalışan telefon prototipi) ve birebir koda alındı.
**Yeni bağımlılık YOK**; iki yeni tablo (`comment_versions`, `comment_subscriptions`), beş yeni RPC, bir bildirim yolu (mevcut `comment` türü). Yalnız EKLER (expand).

## Arayüz (`features/prompts/`)
- **Yanıtlar kancalıdır** (`comment-node.tsx`): üst yorumun avatarından arka plana yakın, **2 px** (`border-soft`) bir çizgi iner; her yanıtın kendi **kısa kavisli kancası**
  ve ucunda küçük nokta vardır; kardeş yanıtlar arasında çizgi kesintisizdir (dikey çizgi tek parça, kanca ondan dallanır). Yanıt kutuları ayrı panel DEĞİLDİR; yorumların
  arkasında beyaz panel yoktur, sayfa zemini görünür. Girinti iki seviyeye kadar (`MAX_INDENT_DEPTH = 2`), daha derin yanıtlar düz akar ve "@kime" ipucu çıkar.
  Daraltma oku avatarın altındadır (sm+), "N yanıtı göster / Yanıtları gizle" metin düğmesi de kalır (telefonda tek yol).
- **Telefonda kart tam genişliktir**: avatar kartın İÇİNDE, kenar boşluğu 12 px; girinti küçük (kanca 12 px). `sm+`'da avatar solda ayrı sütundur.
- **Yazı boyutu** `text-body` (yorum metni), ad `text-small font-semibold`; kutu `rounded-lg border-border-soft`, dolgusuz.
- **Sabitlenmiş yorum** vurgulu kutu DEĞİL: yalnız raptiye + "Sabitlendi" yazısı (`PinnedLabel`), listenin başında durur. `data-comment-pinned` korundu.
- **⋮ menüsü** (`comment-menu.tsx`, `PopoverMenu`): Bağlantıyı kopyala · Sabitle/Sabitlemeyi kaldır (içerik sahibi, ana yorum) · Düzenle (kendi) · Düzenleme geçmişi
  (düzenlenmişse HERKESE) · Bu başlığı takip et (ana yorum) · Bildirimlerini sessize al (başkası; `mute-store`, kişi için `actor` anahtarı) · Şikâyet Et · Sil (kendi, iki adımlı onay çubuğu).
  Odak'ın yorum sayfası (`layout="sheet"`) menü vermez, eski satır içi işlemler orada kalır (`tree.menu` yoksa eski düğmeler çizilir).
- **Bağlantıyı kopyala** = `commentLink(href, id)` → `…&hl=comment:<id>` (bildirimlerdeki biçim).
- **Düzenleme geçmişi** (`comment-history-dialog.tsx`): şimdiki sürüm üstte, altında kayıtlı önceki sürümler; "düzenlendi" etiketi de açar. Kaydı olmayan eski düzenleme için açıklama.
- **Yazma**: yeni yorum kutusu sayfada kalır (telefonda klavyeyle birlikte, mevcut klavye kuralları). **Yanıt ve düzenleme masaüstü/tablette satır içi**, **telefonda alttan açılan kart**
  (`comment-compose-sheet.tsx`, ortak `Modal`; yanıtlananın özeti üstte, Vazgeç/Gönder sabit, yukarı sürükleyince %90) — tam ekran sayfa açılmaz.
- **Takip et** düğmesi yorum başlığında (`comment-section.tsx`, oturumlu + takip edilebilir hedef): içeriğin tüm yorumlarını takip eder; ana yorumun ⋮ menüsünde "Bu başlığı takip et" o başlığı.
  Takip edilebilen: prompt, istek, workflow, ayar paketi, skill, Space genel yorumları (`lib/comment-follow.ts` `commentFollowTarget`); sonuç, topluluk gönderisi, alıntı ve Space etkinlik
  yorumlarında düğme çizilmez (onların bildirimi üyelik/kendi akışına bağlı).
- **Ayarlar → Bildirimler → "Takip ettiğin yorumlar"** (`settings/comment-follow-settings.tsx`): liste + "Takibi bırak".

## Veritabanı (`20261214100000_comment_history_and_follow.sql`, test: `supabase/tests/comment-history-follow.sql`)
- `comment_versions`: gövde değişince (`AFTER UPDATE OF body`, silme hariç) ESKİ gövde yazılır; en çok 30; okuma = yorumu okuyabilen herkes (politika `prompt_comments` RLS'ine yaslanır),
  istemci yazamaz/silemez; `comment_history(p_comment_id)` INVOKER RPC. **Önceki sürümler yalnız bu migration'dan sonraki düzenlemeler için tutulur.**
- `comment_subscriptions`: `scope` content|thread, hedef sütunları FK'li (`prompt_id`/`request_id`/`workflow_id`/`preset_id`/`skill_id`/`space_id`, silinince CASCADE); yazma yalnız
  `set_comment_subscription` (INVOKER; politika `quote_target_ok` ile "okuyabildiğin herkese açık içerik" şartı); kullanıcı başına ≤ 200 (elle); `my_comment_subscriptions` listesi.
- **Otomatik abonelik**: yorumu yazan ve yanıt alan kişi o başlığa (`thread`, `auto=true`) abone olur (içeriğe zaten abone ise eklenmez, 200 sınırı aşılmışsa sessizce atlanır).
- **Bildirim**: `comment_follow_on_insert` yeni yoruma abonelere TEK `insert … select` ile (≤ 500) `comment` türünde yazar; **okunmamış dönem başına tek bildirim** (`notify_seq` + `dedupe_key
  csub:<abonelik>:<seq>`); yazan, yanıtlanan kişi ve içerik sahibi dışarıda (onların bildirimi zaten var); engel iki yönlü; hedef artık herkese açık değilse yazılmaz. Tür tercihi,
  sessize alma, rahatsız etme saatleri ve Telegram `notifications` BEFORE INSERT tetikleyicisinden geçer (ayrıca bir şey yazılmadı). Cümle `notification-message.ts`'e eklendi
  ("Takip ettiğin başlığa yorum yaptı" → `notifMsg.followedThread`).
- `scripts/smoke-test.mjs` CHECKS: `comment_history` (ziyaretçiye açık), `set_comment_subscription` + `my_comment_subscriptions` (ziyaretçiye KAPALI).

## Testler
`src/lib/comment-follow.test.ts` (birim), `supabase/tests/comment-history-follow.sql` (22 madde), `tests/messaging-ui/run-comment-redesign.mjs` (16 senaryo: menü içerikleri, düzenleme +
geçmiş, silme onayı, takip, bağlantı kopyala, sessize alma, kanca stili, masaüstü satır içi / telefon kartı, tam genişlik, İngilizce, ziyaretçi). `run-comment-order.mjs` ve
`run-comment-extras.mjs` eylemleri menüden yapacak biçimde güncellendi; ağ taklidine (`mock-communities.mjs`) yorum PATCH/DELETE, geçmiş ve abonelik uçları eklendi.

## Kapsam dışı / bilinen sınırlar
- Gerçek Supabase'e karşı denenmedi; migration'ı CI uygular (`deploy.yml`), canlı doğrulama birleştirmeden sonra yapılır.
- Eski düzenlemelerin önceki sürümü yoktur (geçmiş migration'dan sonra başlar).
- Yanıtın yanıtı iki seviyeden sonra girinti kazanmaz (bilerek; "@kime" ipucu).
