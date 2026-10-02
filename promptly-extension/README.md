# Promptly Chrome Extension (MVP)

Bağımsız Manifest V3 uzantısı; Promptly uygulamasından ayrıdır, ona dokunmaz.

## Yükleme
1. `chrome://extensions` → **Geliştirici modu**'nu aç
2. **Paketlenmemiş öğe yükle** → bu `promptly-extension` klasörünü seç

## Kullanım
Herhangi bir sayfada metin seç → sağ tık → **✦ Promptly'ye Kaydet**.
Seçili metin popup'ta açılır (popup açılamazsa uzantı simgesinde "1" rozeti çıkar).

## Mimari
- `background.js` — service worker: sağ tık menüsü, seçimi `chrome.storage.local`'a (`pendingCapture`) yazar
- `popup/` — yakalanan metni gösterir, kopyala/temizle; "Kaydet" henüz devre dışı

## Sonraki aşama
Supabase Auth (`chrome.identity` veya Promptly oturumu) ve `prompts` tablosuna kaydetme.
Uzantıya anon key koymak güvenlidir (RLS sınırı); service role key asla konmaz.
