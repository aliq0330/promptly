### 9.75 /settings: e-posta ve kullanıcı adı değiştirme

- **Kullanıcı adı:** `updateOwnUsername` (`lib/supabase/profiles.ts`) `profiles.username`'i günceller; biçim `^[a-z0-9_.]{3,30}$`, benzersizlik/CHECK ihlalleri (23505/23514) çevrilmiş hata olur. Başarıda profil yenilenir. Eski kullanıcı adıyla profil linkleri (`?username=`) çözülmez; yeni ad girişte de geçerli (Bölüm 9.74). Migration yok (var olan "kendi profilini güncelle" RLS'i).
- **E-posta:** `supabase.auth.updateUser({ email }, { emailRedirectTo: /settings })`. Supabase onay bağlantısı gönderir (projenin "secure email change" ayarına göre iki adrese); e-posta bağlantıya tıklanınca değişir, o zamana kadar eski adres geçerli.
- TR+EN eklendi (`settings.username*`, `settings.*Email*`, iki yeni auth hata çevirisi). tsc/lint/build; canlıda denenmedi.
