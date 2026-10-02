# Promptly Chrome Extension (MVP)

Bağımsız Manifest V3 uzantısı; Promptly uygulamasından ayrıdır, ona dokunmaz.

## Yükleme
1. `chrome://extensions` → **Geliştirici modu**'nu aç
2. **Paketlenmemiş öğe yükle** → bu `promptly-extension` klasörünü seç

## Kullanım
- Herhangi bir sayfada metin seç → sağ tık → **✦ Promptly'ye Kaydet**.
- **Giriş yapılmışsa** metin hemen Promptly'de **taslak** olarak kaydedilir (rozet: ✓).
- **Giriş yapılmamışsa** metin yalnızca bu cihazda (uzantıda) bekler (rozet: bekleyen sayısı).
  Popup'tan giriş yapınca bekleyenler otomatik olarak taslaklara kaydedilir.
- Uzantıdan **yayınlama yoktur**. Kaydedilen taslağı popup'taki bağlantıyla sitede açıp
  başlık/kategori/etiketi düzenleyerek yayınlarsın.

## Mimari
- `background.js` — sağ tık menüsü. Her yakalama önce `queue`'ya yazılır, sonra oturum varsa
  sırayla `prompts` tablosuna `status: "draft"` olarak gönderilir. Tüm yazmalar tek bir sıradan geçer
  (çift kayıt/kayıp yok). Kuyruktan çıkarma, kayıt başarılı olduktan sonra yapılır.
- `queue.js` — `chrome.storage.local` kuyruğu, kayıt geçmişi (son 10), son hata
- `api.js` — fetch tabanlı GoTrue girişi (kullanıcı adı için `username-login` Edge Function),
  token yenileme, taslak insert (RLS: yalnızca kendi `author_id`'n)
- `config.js` — Supabase URL + **anon key** (public; güvenlik RLS ile). Service role key asla konmaz.
- `i18n.js` — TR/EN metinleri (sağ üstteki TR/EN düğmesi; varsayılan tarayıcı dili)
- `popup/` — giriş, bekleyenler (kaldır/tekrar dene), taslaklara kaydedilenler

## Notlar
- Taslaklar `content_type: text`, kaynak sayfa bağlantısı açıklamaya yazılır; başlık metnin ilk satırından türetilir.
- Gönderim başarısız olursa (ağ/RLS) öğe kuyrukta kalır, popup'ta hata ve "Tekrar dene" görünür.
