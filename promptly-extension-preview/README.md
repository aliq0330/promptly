# Promptly uzantısı — önizleme (v0.5.0-preview)

Yeni uzantı tasarımının **çalışan önizlemesi**. Mevcut `promptly-extension/` klasörüne dokunmaz.
Örnek veriyle çalışır, **ağa hiç bağlanmaz**; gerçek Promptly hesabıyla konuşmaz.

## Yükleme
1. Chrome'da `chrome://extensions` → sağ üstten **Geliştirici modu**'nu aç
2. **Paketlenmemiş öğe yükle** → bu klasörü seç (`promptly-extension-preview`)
3. Araç çubuğundaki yapboz simgesinden Promptly'yi sabitle

## Dene
| Ne | Nasıl |
|---|---|
| Popup | Simgeye tıkla → "Promptly ile bağlan" (sahte giriş) → kütüphane / taslaklar / bekleyen |
| **Yakalama kartı** | Herhangi bir sayfada metin seç → sağ tık → **Promptly'ye kaydet** (ya da `Alt+Shift+S`) |
| **Görsel yakalama** | Bir görsele sağ tık → **Prompt'a görsel olarak ekle** |
| **Prompt paleti** | Bir metin kutusuna tıkla → `Alt+Shift+P` → ara, değişkenleri doldur, **Enter** ile ekle |
| **Yan panel** | Popup'taki "Yan paneli aç" → Şimdi sekmesi: "Çalıştı mı?" oyu, sonucu paylaş |
| Çevrimdışı kuyruk | Popup'ta alttaki "çevrimdışı simüle et"i işaretle, bir şey yakala → Bekleyen; işareti kaldırınca taslağa geçer |
| Deneme sayfası | `chrome-extension://<uzantı kimliği>/demo/demo.html` (kimlik `chrome://extensions`'da yazar) |

Kısayollar çakışırsa `chrome://extensions/shortcuts` adresinden değiştirilir.

## Önizlemede GERÇEK olmayanlar
- Giriş sahte (gerçek sürümde: `chrome.identity.launchWebAuthFlow` + sitenin OAuth sunucusu, sınırlı `pmt_` anahtarı).
- Kütüphane örnek veri (gerçek sürümde: açık API — arama, kaydedilenler, popüler).
- "Taslak olarak kaydet" yalnız `chrome.storage.local`'a yazar; hiçbir şey Promptly'ye gitmez, görsel yüklenmez.
- "Çalıştı mı?" oyu ve "Sonuç olarak gönder" yalnız bu cihazda tutulur.

## İzinler
`contextMenus`, `storage`, `activeTab`, `scripting`, `sidePanel`. Kalıcı site erişimi (`host_permissions`, `<all_urls>`) **yok**:
yakalama kartı ve palet, yalnız sen sağ tık / kısayol kullandığın anda o sekmeye enjekte edilir.
