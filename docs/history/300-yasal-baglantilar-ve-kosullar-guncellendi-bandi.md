# 300 — Yasal bağlantılar + "Kullanım Koşulları güncellendi" bandı

**Durum:** uygulandı (repoda). Gerçek Supabase'e / gerçek cihaza karşı denenmedi; ağ taklitli Playwright ile sınandı.

## Neden

298'de Kullanım Koşulları'na yeniden kullanım/atıf ve API/MCP kuralları yazıldı, ama (1) `/terms` ve `/privacy`'ye siteden yalnız giriş/kayıt
ekranının altındaki cümle bağlanıyordu; oturum açmış biri sayfayı adresini bilmeden bulamazdı, (2) koşulların değiştiği mevcut kullanıcılara
hiçbir yerde gösterilmedi ("Değişiklikler" bölümü "kullanmaya devam = kabul" diyor, ama kimse görmedi).

## Ne

- **Bağlantılar** (iki dilde, mevcut `legal.termsTitle`/`legal.privacyTitle` anahtarları yeniden kullanıldı): geniş kenar çubuğunun alt köşesinde küçük
  iki bağlantı (`lg`+; ziyaretçi dahil; 72 px ray'da yer yok) · Ayarlar → yeni **"Yasal"** grubu (iki satır + bölüm menüsünde "Yasal") · hesap menüsünde
  (telefonda kenar çubuğu olmadığı için) "Yasal" grubu.
- **Güncelleme bandı** (`features/legal/terms-update-notice.tsx`, `AppShell`'de, `/focus` bu kabuğu kullanmadığı için orada yok): oturumlu kullanıcıya
  2,5 sn gecikmeyle küçük kapatılabilir kart — "Kullanım Koşulları güncellendi" + kısa özet + **"Koşulları oku"** / **"Tamam"**.
  - Karar saf fonksiyonda (`lib/legal-notice.ts` `shouldShowTermsNotice`, birim testli): bu sürüm bu tarayıcıda görülmediyse VE hesap koşulların
    yürürlüğe girmesinden (`TERMS_EFFECTIVE_AT`) ÖNCE açıldıysa gösterilir. Yürürlükten sonra kayıt olan, kayıt ekranında yeni metni zaten görmüştür →
    bant yok. Hesap tarihi bilinmiyorsa güvenli taraf: göster.
  - Sabitler `legal-content.ts`'te: `TERMS_VERSION = "2026-11-01"`, `TERMS_EFFECTIVE_AT = "2026-11-01T07:00:00Z"` (298'in yayına girdiği an civarı;
    06:51–07:00 arası açılan hesaplara bant bir kez fazladan çıkabilir, zararsız). **Koşullar önemli ölçüde değişince ikisi birlikte güncellenir** →
    bant herkese yeniden çıkar. Yazım düzeltmesi için artırılmaz.
  - "Koşulları oku", "Tamam" ve `/terms` sayfasını açmak sürümü "görüldü" sayar (`localStorage` `promptly-terms-notice`); bant `/terms`'te hiç çıkmaz.
  - `data-app-chrome` taşır: yazma ekranı açıkken (`display:none`) ve hikâye görüntüleyici açıkken (`visibility:hidden`) diğer uygulama çubukları gibi gizlenir.
    Telefonda alt menünün hemen üstünde, masaüstünde sağ altta; `z-40` (pencereler `z-50`, üstüne biner).
- İki belgenin tarihi ve metni değişmedi (yalnız 298'dekiler).

## Test

- `src/lib/legal-notice.test.ts` (5, `npm test`'te): görülmemiş → göster, görüldü/eski sürüm, yürürlükten sonra açılan hesap (sınır dahil), bilinmeyen/bozuk tarih, yeni sürüm.
- `tests/messaging-ui/run-legal-notice.mjs` (14, ağ taklitli): bant gecikmeyle çıkar (başlık/özet/iki eylem, tıklamadan önce hiçbir şey saklanmaz) · "Tamam" kapatır, sürümü yazar,
  yeniden yüklemede dönmez · "Koşulları oku" `/terms`'e götürür ve görüldü sayar (yeni bölüm sayfada) · `/terms`'i doğrudan açmak da okumak sayılır · yürürlükten sonra açılan hesap ve
  ziyaretçi görmez · İngilizce · telefonda alt menüyle ÇAKIŞMAZ, taşma yok · yazma ekranı/hikâye açıkken gizli, kapanınca geri · kenar çubuğu bağlantıları (hesaplı ve ziyaretçi) ·
  Ayarlar "Yasal" grubu + bölüm menüsü + tıklama · telefonda hesap menüsü "Yasal" grubu, tıklayınca menü kapanır · İngilizce etiketler.
- CI'ın hızlı arayüz kesitindeki altı paket (`run-safety`, `run-shared-cards`, `run-detail-pages`, `run-home-motion`, `run-feed-filters`, `run-search-notifications`) yerelde yeni derlemeyle geçti.
  Yeni paket CI'ın kesitine EKLENMEDİ: `ci.yml`'yi değiştirmek 9 dakikalık veritabanı işini tetikler; ihtiyaç olursa ayrı bir değişiklikte eklenir.
  Çalıştırma: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build && node tests/messaging-ui/run-legal-notice.mjs`.
- İngilizce karşılıklar eklendi (`legal.groupTitle/termsHint/privacyHint/notice*`).

## Bilinen sınırlar

- "Görüldü" bilgisi **cihaza özgüdür** (`localStorage`): başka cihaz/tarayıcıda bant bir kez daha çıkar; sunucuda KABUL KAYDI YOKTUR (kim hangi sürümü ne zaman kabul etti
  tutulmuyor). Hukuken "kabul kaydı" gerekiyorsa `profiles`'a sürüm + zaman sütunu ve yazan bir RPC gerekir (migration) — yapılmadı.
- Bant bilgilendirir, engellemez (kabul düğmesi zorunlu değil); "kullanmaya devam = kabul" varsayımı Koşullar'ın "Değişiklikler" bölümündedir ve hukuki danışmandan geçmedi.
- Bildirim (zil) ya da e-posta ile duyuru yok.
- Telefonda ayrıntı sayfasının sabitlenen eylem satırı (`data-detail-dock`) ile aynı bölgeyi paylaşabilir; bant kapatılabilir ve bir kez çıkar.
