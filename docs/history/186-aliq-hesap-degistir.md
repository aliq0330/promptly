### 9.186 Site sahibi için hızlı hesap değiştirme (yalnız `aliq`)

- **Ne:** `aliq` (moderatör) için avatar menüsünde "Hesap değiştir" satırı; seçici pencerede (`switch-account-modal.tsx`) demo hesaplardan biri seçilince anında o hesaba geçilir. Demo hesaba geçilmişken menüde "aliq hesabına dön" görünür.
- **Güvenlik (`supabase/functions/switch-account`):** JWT doğrulaması AÇIK; çağıranın profili sunucuda okunur — kullanıcı adı `aliq` VE `role = 'moderator'` değilse 403. Hedef yalnızca seed'in demo hesap kimlikleridir (`5eed0000-0000-4000-8000-0000000000NN`); gerçek kullanıcı hesaplarına geçilemez. Oturum, `generateLink(magiclink)` özetinin sunucuda `verifyOtp` ile doğrulanmasıyla üretilir; e-posta tarayıcıya dönmez. Menüdeki gizleme yalnız arayüzdür.
- **Geri dönüş:** geçişten önce sahibin oturumu bu tarayıcının `localStorage`'ında (`promptly-switch-origin`) saklanır; çıkış yapınca silinir. Saklanan oturum süresi dolmuşsa "aliq'a dön" giriş sayfasına yönlendirir.
- **Çeviri:** `accountSwitch.*` anahtarları TR + EN eklendi.
- **Dağıtım:** Edge Function CI ile deploy edilmez → `supabase functions deploy switch-account` (JWT doğrulaması AÇIK). Migration yok. Gerçek Supabase'e karşı DENENMEDİ (sandbox erişemez; `tsc`/lint/build de bu oturumda koşmadı — `node_modules` yok).
