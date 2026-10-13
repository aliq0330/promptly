### 9.74 Kullanıcı adıyla giriş + şifre sıfırlama yönlendirme sigortası

- Giriş alanı "E-posta veya kullanıcı adı". `@` içeriyorsa eski yol (`signInWithPassword`); içermiyorsa yeni Edge Function `supabase/functions/username-login`: kullanıcı adını SUNUCUDA e-postaya çevirir (service role + `auth.admin.getUserById`), girişi orada yapar, tarayıcıya yalnızca token döner (e-posta sızmaz). Hata her durumda aynı ("Giriş bilgileri hatalı."), bilinmeyen kullanıcıda sahte giriş denemesiyle süre farkı azaltılır, IP başına dakikada 10 deneme (isolate başına bellek içi, best-effort). Migration yok.
- **Deploy gerekli:** `supabase functions deploy username-login --no-verify-jwt` (CI yapmaz). Deploy edilmezse `@`'siz girişler "Giriş bilgileri hatalı" verir; e-postayla giriş etkilenmez.
- `AuthProvider`: `PASSWORD_RECOVERY` olayı `/reset-password` dışında bir sayfada yakalanırsa `/reset-password`'a yönlendirir (Site URL/redirect hatalı olsa bile form açılır). Asıl düzeltme hâlâ Supabase URL Configuration (Site URL = `https://aliq0330.github.io/promptly`).
- TR+EN eklendi (`auth.emailOrUsername`, `auth.invalidCredentials`, `auth.tooManyAttempts`). tsc/lint/build; canlıda denenmedi.
