# 310 — Gizlilik Politikası: GIPHY veri akışı ve çerezler/tarayıcı depolaması

**Durum:** uygulandı (repoda). `tsc` temiz, `npm test` yeşil (yeni `legal-content.test.ts`). **Hukuki danışmandan GEÇMEDİ** — metin ürün sahibinin onayına bağlıdır.

## Çerez sorusunun cevabı (koddan doğrulandı)
- Kodda `document.cookie` / çerez kütüphanesi YOK; Supabase istemcisi varsayılan ayarla oturumu `localStorage`'da tutar (`lib/supabase/client.ts`). Analitik/reklam/takip aracı YOK (Google Analytics, Sentry, Hotjar, PostHog… için `src` ve `package.json` tarandı).
- Yani **Promptly kendi çerezini kullanmaz; tarayıcının yerel depolamasını kullanır**: oturum, tema/palet/dil, görünüm tercihleri, kapatılan ipuçları, son emojiler, tercih edilen AI aracı, "Koşullar güncellendi" görüldü bilgisi ve (yalnız açık izinle) Studio API anahtarı (`lib/ai-generate/key-store.ts`).
- **Doğrulanamayan:** üçüncü taraflar (Google ile giriş, GIPHY, GitHub Pages) kendi alan adlarında çerez/benzeri teknoloji kullanıyor mu — politika bunu "kullanabilir; Promptly'nin denetiminde değildir" diye yazar, kesin iddia etmez.

## Politikada değişenler (`features/legal/legal-content.ts`, TR + EN)
- **Hizmet sağlayıcılar → GIPHY maddesi:** GIF seçici açılınca ve GIF'li yorum/mesaj görüntülenince tarayıcı doğrudan `api.giphy.com` / `media.giphy.com`'a bağlanır; GIPHY IP, tarayıcı bilgisi ve (seçicide) arama kelimesini alabilir; Promptly arama kelimesini kaydetmez, GIF'i kopyalamaz (yalnız GIPHY kimliği); bu, GIF'i gönderen kadar GÖRENLER için de geçerlidir.
- **Yeni bölüm "Çerezler ve tarayıcı depolaması":** yukarıdaki bilgiler + "site verilerini temizle" ile silme + üçüncü taraf notu.
- **Mesajlar maddesi** GIF'i ve "yalnız kimlik saklanır" notunu içerir.
- Eski cümle ("reklam veya davranış takibi için üçüncü taraf çerezleri ya da analitik araçları kullanmıyoruz") GIPHY geldiği için daha dar ve doğru bir cümleyle değiştirildi.
- `PRIVACY_UPDATED` tarihi zaten bugünün tarihi (1 Kasım 2026) olduğundan değişmedi. **`TERMS_VERSION` artırılmadı**: "Koşullar güncellendi" bandı Kullanım Koşulları içindir; gizlilik değişikliğinin kullanıcıya ayrıca duyurulup duyurulmayacağı ürün kararıdır.

## Yapılmayanlar
- Kullanım Koşulları'na GIPHY içeriğinin telif/kullanım şartı eklenmedi.
- Çerez onay bandı eklenmedi (Promptly çerez kullanmıyor; üçüncü taraf çerezleri için hukuki gereklilik değerlendirmesi yapılmadı — hukuki danışman).
