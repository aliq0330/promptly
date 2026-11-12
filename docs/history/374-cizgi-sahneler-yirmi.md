# 374 — Çizgi sahneler: 20'ye çıktı, sitede uygun yerlere yerleşti

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Birim `line-art` 8/8 (+ kayıt tutarlılığı), ağ taklitli `run-line-art` 14/14; gerçek cihazda/performans ölçümüyle DENENMEDİ.**

373'teki üç sahne (Meydan, Kayıp prompt, Paylaşma anı) kullanıcıya gösterilince "bunları yüksek kalitede 15–20 tane üret, gece-gündüz uyumlu, sitede uygun yerlere entegre et" istendi. 17 yeni sahne çizildi (toplam 20), her biri gündüz ve gece yan yana gözle incelendi.

## Sahneler ve yerleri
| Sahne (`kind`) | Hikâye | Yeri |
|---|---|---|
| `meydan` · `lost` · `share` | 373 | giriş paneli · `NotFoundBlock` + 404 · karşılama turu |
| `milestone` | Skor tahtası gerçek sayıya kadar sayar, kişi iki kolu kaldırıp zıplar, seyirciler alkışlar, konfeti | Yaratıcı paneli, dönemdeki kopyalama ≥ 100 ise (tahtadaki sayı gerçek `summary.copies`) |
| `studio` | Ressam tuvale manzara + kalp çizer | Studio'da üretim beklerken (görsel kutusu `loading` iken; metin kutusu eski iskelette kalır) |
| `offline` | Fişi prize götürür; takınca lamba ve wifi yanar | "Yüklenemedi" durumları: `PagedListState` hatası, Space listesi hatası |
| `loader` | 32 px'lik figür yerinde yürür, zemin kayar | `LoadMoreButton` yüklenirken (düğmenin içinde) |
| `inbox` | Postacı boş posta kutusuna bakar, bayrağı indirir, şapka kaldırır | Bildirimler boş (yalnız "Tümü" görünümü) |
| `chat` | İki kişi sokak lambasının altında konuşur: yazı, kalp, prompt kartı | Mesajlar boş |
| `saved` | Kartı sandığa bırakır, kapak kapanır, yer imi sallanır | Kaydedilenler boş |
| `search` | Çamaşır ipindeki boş kartlara büyüteçle bakar | Sonuç yok (Keşfet araması, arama sayfası, süzgeç eşleşmedi, liste süzgeçleri, Space araması, topluluk araması) |
| `community` | Kamp ateşi + ışık dizisi; yeni gelen selamlanır, herkes sevinir | Topluluklar boş + Keşfet boş |
| `spaces` | Pano notlar/resim/palet ile dolar, oklar bağlar | Space listesi boş |
| `requests` | Balonla uçan prompt kartı; uzak tepedeki figür el sallar | İstekler boş |
| `workflow` | Üç kişi kartı elden ele geçirir, adımlar numaralanır, kutuya girer | Workflow listesi boş |
| `preset` | Karıştırma panelinde beş sürgüyü elle ayarlar, düğmeye basar, paket çıkar | Ayar paketi listesi + profil ayar paketleri boş |
| `drafts` | Ayakta masada yazar, sayfa kopar ve yığına gider | Taslaklar boş + Promptlar listesi boş |
| `insights` | Fidanı sular; fidan büyürken grafiğin sütunları yükselir, kalp açar | Yaratıcı paneli boş |
| `team` | Biri iter, biri iple çeker, kartlarla dolu araba (üstünde kedi) | Ekipler boş |
| `collection` | Masadaki kartları üç etiketli kutuya ayırır | Koleksiyonlar boş + koleksiyon içi boş |

## Karar: EmptyState'e `scene` (kural değişikliği)
`EmptyState` "büyük illüstrasyon yok" diye tanımlıydı (373'te "karar gerekir" diye işaretlenmişti). Kullanıcı "uygun yerlere entegre et" deyince şu sınırla gevşetildi: `EmptyState scene="…"` simge karosunun YERİNE küçük sahne koyar (`max-w-sm`, `compact` için 16 rem); **yalnız ana yerlerin boş durumlarında** (listeler, gelen kutusu, kütüphane) kullanılır, panel içi "burada bir şey yok" satırları karoyla kalır. Gönderi kartlarına ve akışa sahne KONMAZ.

## Nasıl
- `components/line-art/kit.ts`: sahne iskeleti `defineScene` (katmanlar, gök/güneş/ay/yıldız, bulut, rüzgâr, gece yanan pencere/lamba ışığı, kaldırma), zemin (kaldırım/çim/zemin), ev, ağaç, çalı, lamba, bank, çit, masa, masa lambası, `Cat` (oturur, tıklayınca gerinir, geceleri uyur), konfeti, pırıltı, konuşma balonu ve küçük bir senaryo yardımcısı (`script`: `wait`/`act`/`until`/`walkTo`).
- `kinds.ts` (statik: en-boy oranı + etiket anahtarı; sayfalar çizim kodu yüklenmeden kutuyu boyar → kayma yok), `scenes.ts` (dinamik içe aktarma), `LineArtScene` kutuyu çizimin oranıyla açar (`value` = sahnenin çizdiği gerçek sayı).
- Her sahnede: ≥1 dokunma tepkisi (kişi/kedi/kutu/ateş/tabela), gece görünümü (ışıklar/ay/yıldız/uyuyan kedi), hareketi azalt = anlamlı tek kare (`dt === 0` yolu). Sahne içi görünür metin YOK (yalnız rakam: 404 levhası, milestone tahtası, workflow rozetleri) → çeviri gerekmez; her sahnenin `aria-label` açıklaması TR+EN.
- `registry.test.ts` `kinds.ts` ↔ `scenes.ts` ↔ sahne dosyası ↔ çeviri tutarlılığını metin olarak denetler; yeni sahne dört yeri birlikte ister.

## Doğrulama
Tüm 20 sahne için ayrı bir önizleme düzeneğinde (gündüz/gece yan yana, elle ilerletilen saat) 70 sn çalıştırma + hareketi azalt kipi: hata yok, NaN/Infinity yok. Uygulamada `run-line-art` 14 senaryo (on yerleşim, İngilizce, telefon + koyu, dokunma).

## Bilinçli sınırlar
- Mürekkep filtresi her karede tüm sahneye uygulanıyor; sayfada birden çok sahne olunca (ör. Mesajlar: iki boş durum) maliyet toplanır. Ekranda olmayan sahne çizilmez; zayıf telefonda ÖLÇÜLMEDİ (§8.13).
- `milestone` eşiği ≥100 kopyalama (dönem toplamı); bildirim eşikleriyle (10/50/100/500…) bire bir değil.
- `studio` sahnesi sağlayıcının gerçek durumunu bilmez: ressam döngüyle çizer, "hazır" demez (sonuç gelince kutu zaten görseli gösterir).
- Bildirim açılır paneli (zilin altındaki küçük panel) ve Odak'ın boş durumları sahne almadı.
- Gerçek iPhone/Safari'de dokunma ve performans denenmedi.
