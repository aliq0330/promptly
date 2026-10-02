# Promptly Chrome Extension (MVP)

Bağımsız Manifest V3 uzantısı; Promptly uygulamasından ayrıdır, ona dokunmaz.

## Yükleme
1. `chrome://extensions` → **Geliştirici modu**'nu aç
2. **Paketlenmemiş öğe yükle** → bu `promptly-extension` klasörünü seç

## Kullanım
1. Uzantı popup'ından Promptly hesabınla giriş yap (e-posta **veya** kullanıcı adı).
2. Herhangi bir sayfada metin seç → sağ tık → **✦ Promptly'ye Kaydet**.
3. Popup'ta başlığı/türü düzenle → **Kaydet**. Varsayılan **taslak**tır
   (kaynak sayfa bağlantısı açıklamaya yazılır); "Hemen yayınla" ile yayınlanır.

## Mimari
- `background.js` — sağ tık menüsü; seçimi `chrome.storage.local`'a (`pendingCapture`) yazar
- `config.js` — Supabase URL + **anon key** (public; güvenlik RLS ile). Service role key asla konmaz.
- `api.js` — fetch tabanlı GoTrue girişi (kullanıcı adı için `username-login` Edge Function),
  token yenileme, `prompts` tablosuna insert (RLS: yalnızca kendi `author_id`'n)
- `popup/` — giriş formu, yakalama/kaydetme formu

## Notlar
- Taslaklar Promptly'de `/create?edit=<id>` ile açılıp yayınlanır.
- Etiket/kategori ve çok dilli arayüz henüz yok (metinler Türkçe).
