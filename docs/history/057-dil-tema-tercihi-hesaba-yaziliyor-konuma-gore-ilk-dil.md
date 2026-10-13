### 9.57 Dil/tema tercihi hesaba yazılıyor + konuma göre ilk dil

- Migration `20260919440000_profile_preferences.sql` (canlı projeye MCP ile uygulandı): `profiles.language` / `theme_mode` / `theme_palette` (null = hiç seçilmedi). Mevcut "kendi profilini güncelle" RLS'i yeterli.
- `features/auth/preferences-sync.tsx` (`PreferencesSync`, `layout.tsx`'te `AuthProvider` içinde): girişte kayıtlı değerleri uygular (null olanı yazmaz), sonrasında her değişikliği `profiles`'a yazar. `lib/supabase/profiles.ts`: `fetchOwnPreferences`/`updateOwnPreferences`.
- localStorage tamamen kalkmadı: ilk boyamada flaş olmaması ve giriş yapmamış ziyaretçi için önbellek; girişte hesap değeri her zaman kazanır.
- İlk açılış dili (kayıtlı tercih yokken): saat dilimi Europe/Istanbul → Türkçe, aksi hâlde İngilizce (`languageInitScript`). IP tabanlı gerçek ülke tespiti değil; yurt dışındaki Türkçe kullanıcı İngilizce görür, kendi seçimiyle değiştirir.
- Doğrulama: tsc, lint, build temiz; canlıda iki cihazla uçtan uca denenmedi.

**Güncelleme (9.57):** Sitenin varsayılan paleti artık **Kum (sand)**. `themeInitScript` ve `ThemeProvider` her zaman `data-palette` özniteliğini yazıyor (kayıtlı seçim yoksa `DEFAULT_PALETTE`); `globals.css`'te varsayılan `:root` tokenları Kum bloğuna taşındı, Lavanta artık açık `data-palette="lavender"` ile seçiliyor. Tarayıcıda yeni ziyaretçi için açık/koyu iki modda Kum token'ları doğrulandı.
