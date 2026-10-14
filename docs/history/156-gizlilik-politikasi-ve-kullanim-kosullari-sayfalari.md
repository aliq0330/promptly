### 9.156 Gizlilik Politikası ve Kullanım Koşulları sayfaları

**Neden:** Google Cloud'da OAuth uygulamasını "Testing"den yayına almak için Branding sayfasında ana sayfa, gizlilik politikası ve kullanım koşulları adresleri gerekiyordu (Audience sayfası "Branding'i tamamla" diyordu). Google ile giriş (`docs/history/155-*`) herkese açılabilsin diye bu iki sayfa eklendi.

**Ne:**
- `/privacy` ve `/terms` — herkese açık (giriş gerekmez), statik, TR+EN. İçerik `src/features/legal/legal-content.ts`'te çift dilli veri olarak durur (uzun metin `translations.ts`'i şişirmesin diye; Bölüm 4.5'in "statik veri dosyası → iki dil" kuralı). Görünüm `legal-document-view.tsx`, sayfalar `app/(app)/privacy|terms/page.tsx`. Mevcut tasarım token'ları ve `PageContainer` kullanıldı; mobilde yatay taşma yok (Playwright ile TR `/privacy/` ve EN `/terms/` kontrol edildi).
- Metin uygulamanın GERÇEK veri işlemesini anlatır: toplanan bilgiler (hesap, Google ile girişte yalnız ad + e-posta, profil/içerik, mesajlar, dosyalar, tercihler), reklam/analitik/izleme çerezi YOK, kim neyi görür (özel içerik ve dosyaları yalnız sahibine), hizmet sağlayıcılar (Supabase — AB/İrlanda, Google giriş, GitHub Pages, Gemini ile görselden prompt çıkarma, Studio'da kullanıcının kendi API anahtarı sunucuya yazılmaz), saklama ve silme (Ayarlar → Hesabımı sil; başkalarının yanıtları korunur; yedeklerde sınırlı süre), haklar (KVKK/GDPR atfı), çocuklar (13 yaş), değişiklikler. Kullanım koşulları: hesap, içerik sahipliği ve kullanım izni, kabul edilebilir kullanım, moderasyon, yapay zekâ içeriği, sorumluluk sınırı, hesabı kapatma.
- İletişim e-postası tek yerde: `LEGAL_CONTACT_EMAIL` (`legal-content.ts`) — şimdilik `aliq0330@gmail.com` (kullanıcı onayıyla, sayfada herkese açık görünür).
- Giriş ve kayıt sayfalarında Google butonunun altında "Devam ederek Kullanım Koşulları ve Gizlilik Politikası metinlerini kabul etmiş olursun" (`legal-notice.tsx`, iki bağlantıyla). `sitemap.ts`'e iki rota eklendi.
- TR+EN: `auth.legalPrefix/And/Suffix`, `legal.termsTitle`, `legal.privacyTitle`, `legal.contactTitle`, `legal.contactBody` + iki belgenin tüm metni çift dilli.

**Google tarafı (kullanıcı adımı):** Google Auth Platform → Branding → App domain: ana sayfa `https://aliq0330.github.io/promptly/`, gizlilik `https://aliq0330.github.io/promptly/privacy/`, koşullar `https://aliq0330.github.io/promptly/terms/` → Save → Audience → Publish app. Authorized domains'te `supabase.co` ve `aliq0330.github.io` olmalı.

**Önemli not:** Bunlar hukuki tavsiye değildir; uygulamanın gerçek davranışını sade bir dille anlatan bir ilk taslaktır. Yasal gereklilikleri (KVKK aydınlatma metni, işletmeci bilgisi, uygulanacak hukuk/yetkili mahkeme gibi) bir hukukçuyla gözden geçirmek iyi olur; bu belgelerde bilinçli olarak uygulanacak hukuk belirtilmedi.

**Doğrulama:** `tsc`, `lint`, `npm test`, `build` temiz; iki sayfa statik olarak üretildi.
