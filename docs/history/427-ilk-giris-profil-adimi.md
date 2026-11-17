# 427 — İlk giriş kurulumu: kullanıcı adı + profil resmi adımı

424'ün kurulumuna üçüncü adım eklendi: konu → kişi takibi → **"Profilini tamamla"** → "Özel akışın oluşturuluyor" → site (adım göstergesi "x / 3"). Gerekçe: kayıt formu yalnız görünen ad + e-posta + şifre alır; kullanıcı adını veritabanı üretir (`handle_new_user`), profil resmi hiç yoktur.

- **Adım** (`features/onboarding/first-run-profile.tsx`): kayıtta üretilen kullanıcı adı dolu gelir; yeni üye isterse değiştirir. Alan altında canlı durum (350 ms gecikmeli): "en az 3 karakter" / "yalnızca küçük harf, rakam, _ ve ." / "@ali alınmış. Şunları dene: ali_1, ali.tr" / "@ad müsait". Yazılan küçük harfe çevrilir, boşluk atılır, en çok 30. "Bitir" yalnız geçerli ve müsait adla açılır; adım zorunludur (atlama yok — ad zaten dolu gelir, yani çoğu üye tek dokunuşla geçer).
- **Resim:** "Fotoğraf yükle" (mevcut `uploadAvatar`: kareye kırpma + küçültme, kaynak tavanı `imageSourceProblem`) ya da altı hazır renkten biri (varsayılan ilk renk): renkli zemin + baş harf tarayıcıda çizilir (`lib/avatar-initial.ts`, `canvas`) ve fotoğraf gibi yüklenir — yani her yeni üyenin bir profil resmi olur. "Böyle görünürsün" önizlemesi seçimi anında yansıtır.
- **Kaydetme** ("Bitir"): ad değiştiyse `updateOwnUsername` (benzersizlik kuralı veritabanında; çakışma "Bu kullanıcı adı alınmış." ile adımda kalır), sonra `uploadAvatar` + `updateOwnAvatarUrl` (`profiles.avatar_url` yalnız); yükleme hatasında adımda kalır ve nedeni gösterir.
- **Canlı ad kontrolü** `isUsernameTaken` (`profiles` okuması, `limit 1`, kendi satırı hariç); kendi mevcut adı sorgulanmaz, sorgu hatası engellemez (kesin karar kayıtta).
- Kişi adımı mockup'a uydu: 3 takipten önce "Şimdilik geç", sonra "Devam" (eskiden "Bitir ve akışımı gör").
- Karar mantığı saf ve testli (`lib/first-run-setup.ts`: `normalizeUsername`, `usernameFormat/Status`, `usernameSuggestions`, `AVATAR_COLORS`; biçim kuralı `profiles.ts` `USERNAME_PATTERN` ile aynı olmalı, test dosya metninden karşılaştırır). Migration YOK.

Doğrulama: `first-run-setup.test.ts` (12 test) + `tests/messaging-ui/run-first-run.mjs` 15/15 (canlı kontrol, çakışma hatası, fotoğraf yükleme/kaldırma, renkli resim yükleme, PATCH gövdeleri, İngilizce + masaüstü). Gerçek Supabase'e / depolamaya karşı DENENMEDİ (Storage `avatars` yükleme yolu profil düzenlemedeki ile aynıdır).
TR + EN metinler eklendi (`firstRun.profile*`, `firstRun.username*`).

Bilinen sınır: kullanıcı adını değiştirmek eski profil bağlantılarını çözülmez yapar (profil adresi `?username=` tabanlı); yeni üyenin henüz paylaştığı bağlantı yok, ama ayarlardan sonra değiştirmede aynı kural geçerli.
