### 9.155 Google ile giriş (Supabase Auth OAuth)

**İstek:** Giriş ve kayıt sayfalarında "Google ile devam et".

**Çözüm:**
- `src/features/auth/google-sign-in-button.tsx` — `supabase.auth.signInWithOAuth({ provider: "google" })`; Google'a gidip `…/promptly/login/` adresine döner (`?next=` korunur). Giriş sayfası zaten oturumu olan ziyaretçiyi `next`'e (yoksa ana sayfaya) yönlendirdiği için ek yönlendirme kodu yok; oturumu `supabase-js` URL'den alır, `AuthProvider` dinler. Aynı buton hem giriş hem kayıt içindir: Supabase ilk kullanımda hesabı kendisi açar. Hesap seçici her seferinde açılır (`prompt: select_account`). Başlatma hatasında butonun altında `role="alert"` mesajı. Google'ın zorunlu 4 renkli "G" logosu (marka rengi — tek hex istisnası) satır içi SVG; yeni bağımlılık yok.
- Butonun yeri: `/login`, `/signup` ve giriş gerektiren eylemlerde açılan giriş diyaloğu (`AuthPromptProvider`). Giriş sayfası, Google'dan dönen `error` / `error_description` parametresini okuyup genel bir mesaj gösterir.
- `supabase/migrations/20260919810000_oauth_display_name.sql` — `handle_new_user`: görünen ad sırası kayıt formundaki ad → Google `full_name`/`name` → e-posta öneki (40 karaktere kırpılır, boş ad e-posta önekine düşer). Kullanıcı adı (username) önceki gibi e-posta önekinden türetilir ve Ayarlar'dan değiştirilebilir. Google fotoğrafı OTOMATİK alınmaz (avatar elle eklenir). Yalnızca `create or replace function`, yıkıcı ifade yok.
- Mevcut akışlara dokunulmadı: e-posta/kullanıcı adı + şifre girişi (`username-login`), şifre sıfırlama, hesap silme. Yalnız Google ile açılmış hesap Ayarlar'dan şifre belirleyebilir.
- TR+EN: `auth.continueWithGoogle`, `auth.googleRedirecting`, `auth.googleFailed`, `auth.orDivider`.

**Kullanıcı adımı (kod yapamaz): Google sağlayıcısı etkinleştirilmeden buton çalışmaz** (Supabase ham bir "provider is not enabled" JSON hatası döner). Kurulum `supabase/README.md` → "Google ile giriş kurulumu".

**Doğrulama:** `tsc`, `lint`, `npm test`, `build` temiz. `handle_new_user` yerelde 6 senaryoyla (form adı, Google adı, yalnız `name`, boş ad, metadata yok, 80 karakterlik ad) ve canlıda geri alınan bir transaction içinde gerçek `auth.users` eklemeleriyle (Google adı, form adı, metadata'sız; varsayılan koleksiyon oluşuyor, kalıcı satır kalmadı) sınandı. OAuth yönlendirmesi Google/Supabase'e karşı DENENMEDİ (sağlayıcı henüz etkin değil).
**Dağıtım:** migration eklemeli/yıkıcı değil, canlıya uygulandı (MCP, `oauth_display_name`, 2026-10-13).
