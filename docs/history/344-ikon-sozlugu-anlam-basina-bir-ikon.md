# 344 — İkon sözlüğü: anlam başına tek ikon (2026-11-06)

Kullanıcı: "aynı anlam aynı ikon, farklı anlam farklı ikon" (mesaj/yorum dahil sitenin tamamında). 1603 ikon kullanımı yanındaki
metin anahtarlarıyla çıkarıldı (`import` + `t("…")` bağlamı), işleve göre okundu ve çakışmalar çözüldü. Aşağıdaki sözlük kuraldır;
yeni bir yüzey önce buna bakar.

## Sözlük (anlam → ikon)
| Anlam | İkon | Not |
|---|---|---|
| Yorum | `MessageCircle` | yalnız yorum |
| Mesajlar / sohbet | `MessagesSquare` | üst menü, dock, Sohbetler, "Mesaj gönder", topluluk sohbeti, bildirim kategorisi |
| Yanıtla | `Reply` | yorum yanıtı işaretçisi, istek yanıtı, bildirim yanıtı, mesaj yanıtı (`CornerUp*` kalktı) |
| Gönder (eylem) | `Send` | başvuru/davet/paylaş/hikâye yanıtı |
| Yeniden dene / yenile / yeniden çalıştır | `RefreshCw` | `RotateCw`/`RotateCcw`'nin retry kullanımları buraya toplandı |
| Sıfırla / geri yükle / baştan başla | `RotateCcw` | |
| Filtre | `Filter` (yeni, Solar `filter`) | `SlidersHorizontal` artık yalnız **Ayar paketi** |
| Ayarlar / tercih | `Settings` | `Settings2` kalktı |
| Aç (Promptly içinde) | `ArrowUpRight` | `ExternalLink` yalnız Promptly'den ÇIKAN bağlantı (dış sağlayıcı, çevrimiçi etkinlik) |
| Hata / başarısız | `AlertCircle` | yükleme hatası boş durumları da |
| Uyarı / dikkat | `TriangleAlert` | `AlertTriangle` adı kalktı |
| Yapay zekâ / otomatik üret | `WandSparkles` (Solar `stars`) | `Wand2` kalktı; `Sparkles` artık yalnız **İstek** |
| Sana özel / öneri | `Sparkle` | |
| Yükselen | `TrendingUp` | yükselen etiketler |
| Topluluk | `Users` (üç kişi) | üyeler/kişiler `UsersRound` (iki kişi) — ICON_MAP'te Solar hedefleri bu yüzden çaprazdır |
| Herkese açık | `Globe` | `Globe2` kalktı; özel = `Lock`; web sitesi bağlantısı = `Link2` |
| Menü | `MoreVertical` | `Ellipsis` yalnız "Diğer"/kesikli çizgi |
| Video / ses / görsel | `Video` / `Music` / `ImageIcon` | `Film`, `Clapperboard` kalktı |
| Taslak | `FileText` | |
| Paylaş | `Share2` | `Share` kalktı |
| Prompt | `SquareTerminal` | `Terminal` kalktı |
| Sessize al / sesi aç | `BellOff` / `Bell` | `BellRing` kalktı |
| İçeriklerim | `Library` | `LayoutGrid` yalnız "Tümü" |
| Kategori/taksonomi araçları | `Tags` | `Shapes` yalnız **Space** |
| Düzenle / yaz-öner | `Pencil` / `PenLine` | `Edit3` kalktı |
| Metin hizalama | `AlignLeft/Center/Right` (bizim çizim, linear) | Space panosu nesne hizalaması `AlignStartVertical`… Solar `align-*` |

## Mekanizma
- Aynı Solar ikonuna giden iki bileşen adı kalmadı (`icons.test.ts` bunu denetler; `@custom` hariç): eş anlamlılar tek ada indirildi
  (`Edit3`→`Pencil`, `Image`→`ImageIcon`, `CheckCircle2`→`CircleCheck`, `AlertTriangle`→`TriangleAlert`, `Unlock`→`LockOpen`,
  `MoreHorizontal`→`Ellipsis`), kullanılmayan 19 ad haritadan çıktı (267 → 249 ikon).
- `CUSTOM` tablosu `{ linear: true, body }` ile çizgi ikon da alır (metin hizalama).

## Sınırlar / denenmedi
- Anlam kararları metin anahtarı + dosya bağlamından okundu; 1603 kullanımın her biri ekranda tek tek açılıp görülmedi.
- Bilerek aynı kaldı: `Copy` hem "kopyala" hem "çoğalt"; `Lock` hem özel hem "kilitle/kilitli nesne"; `Star` yıldızlı mesaj ve Space puanı; `Inbox` boş durum + istek kutusu; `Clock` birkaç zaman anlamı.
- Gerçek telefonda/koyu temada görünüm denenmedi.

## Düzeltme (aynı gün, gerçek telefon ekran görüntüsüyle)
- Mesajlar için seçilen `chat-square-2` çubuklu bir kare; telefonda istatistik grafiği gibi okundu (üst menü ve "Sohbeti aç"). `MessagesSquare` artık Solar `dialog-2` (üst üste iki balon, noktalı) — Yorum'un tek yuvarlak balonundan ayrılır. Ders: ikon seçimini 20–24 px'te ve gerçek bağlamda kontrol et, yalnız büyük önizlemede değil.
