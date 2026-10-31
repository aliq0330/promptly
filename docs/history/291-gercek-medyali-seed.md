# 291 — Gerçek medyalı seed: her demo kullanıcıya 5 görsel + 5 video + 5 ses promptu

**Durum:** uygulandı (2026-10-31). Medya #385 ile `main`'e girip Pages'te yayınlandıktan sonra (425 adresin hepsi 200 döndü) 255 prompt canlı
veritabanına Supabase MCP ile **4 parça hâlinde, her biri kendi işleminde** yazıldı (tek 1,2 MB'lık dosya yerine `COMPACT_DIR` ile üretilen sıkıştırılmış biçim:
açıklama şablonları ve beğeniler SQL tarafında açılır). Doğrulama: 255 satırın başlık/prompt metni/açıklama/kategori/yazar/araç/tarih alanlarının 17'şerli
grup md5'leri üretici çıktısıyla (`VERIFY_HASH=1`) 15/15 eşleşti; kullanıcı başına 5+5+5 = 15; beğeni toplamı (1518) ve kaydetme toplamı (374) sayaçlarla tutarlı;
255 kapak, 170 çıktı. Tarayıcıda oynatma BU OTURUMDA denenmedi (ortam `*.supabase.co`'ya erişemez, site medya verisini oradan okur).

## Ne
17 canlı demo kullanıcının (ali, ayse, mehmet, zeynep, can, elif, burak, selin, emre, deniz, ceren, kaan, melis, onur, ipek, baran, ece) her birine
5 görsel + 5 video + 5 ses promptu = **255 prompt**. Önceki seed'lerin (128/129) SENTEZ medyasının aksine her medya internetten alınmış **gerçek açık içeriktir**:

| Tür | Kaynak | Lisans | Prompt metni nereden |
|---|---|---|---|
| Görsel (85) | DiffusionDB — `poloclub/diffusiondb` | CC0 1.0 | O görseli üreten GERÇEK Stable Diffusion promptu (adım/CFG/tohum açıklamada) |
| Video (85) | OpenVid-1M — `nkp37/OpenVid-1M` (Pixabay/Pexels stok klipleri) | CC BY 4.0 (klipler Pixabay/Pexels lisanslı) | Klibin veri setindeki altyazısı (otomatik üretilmiş İngilizce) |
| Ses (85) | Song Describer Dataset — Zenodo 10072001 (Jamendo parçaları) | açıklamalar CC BY-SA 4.0; parçalar CC BY / CC BY-SA | Parçayı dinleyen bir insanın yazdığı açıklama |

Her açıklamada kaynak, lisans ve dosya kimliği yazılıdır. **Video ve ses yapay zekâ ÜRETİMİ değildir** (açıklamada da yazar); promptlar bu medyayı betimler,
Suno/Udio/Kling gibi bir modele verilince benzer bir sonuç aranır. Görseller ise gerçekten yapay zekâ çıktısıdır ve promptları orijinaldir.

## Dosyalar
- `public/seed-media/` — `i-NNN.jpg` (görsel, ≤1024 px), `v-NNN.mp4` + `.jpg` (video ≤3 sn, 512², h264 + kare), `a-NNN.mp3` + `.jpg` (ses: 0:25–0:55 kesit, 96 kbps,
  başı/sonu yumuşatılmış; kapak = parçanın gerçek spektrogramı). ≈ 60 MB. Siteyle birlikte `https://aliq0330.github.io/promptly/seed-media/…` altında yayınlanır.
- `supabase/seed/media-seed-cases.json` (ham veri: prompt, kaynak, ölçü, ortalama renk + 24 px önizleme), `media-seed-content.mjs` (Türkçe başlık + tema),
  `build-media-seed.mjs` (üretici) → `media-seed.sql` (≈ 1,2 MB, tek transaction, "zaten uygulanmış" ve demo-kullanıcı korumalı, yalnız EKLER).

## Kararlar
- **Kullanıcı eşleştirme tema tercihiyle** (siberpunk/şehir → ali, uzay → baran, yemek → melis, mimari → burak…; ses türü de aynı mantıkla), kalanı en yakın boştakiyle dolar.
- **Medya `prompt_results` + `prompt_media` kapağı** olarak yazılır (129/`viral-media.sql` ile aynı yol; `PromptPlayableOutput` bunu oynatır); medya adresleri Pages üzerindedir
  (korumalı bucket değil — `resolveMediaUrl` harici adresi olduğu gibi döndürür). Görsel promptlarda çıktı = `prompt_media` (mevcut görsel promptlarla aynı).
- Beğeniler (2–10, altı tepkiden) ve birkaç kaydetme gerçek tetikleyicilerle üretilir; üretilen bildirimler son 10 güne yayılır (viral-fill ile aynı yöntem).
- **Elenenler:** DiffusionDB'de NSFW skoru ≥ 0,05 olanlar; gerçek kişi/ünlü, telifli karakter ve yaşayan sanatçı adı geçen promptlar elle ayıklandı; OpenVid'de lisansı belirsiz
  (YouTube kaynaklı) klipler hiç alınmadı, yalnız Pixabay/Pexels; videolarda yakın plan insan olan klipler değiştirildi; ses parçalarında yalnız CC BY / CC BY-SA (NC/ND yok),
  rap/açık sözlü açıklamalar çıkarıldı. Şarkı sözleri dinlenip denetlenmedi — **sözlü parçalarda uygunsuz söz olmadığı doğrulanmadı** (yalnız açıklamalara bakıldı).

## Uygulama (yapıldı) ve yeniden uygulama
`supabase/seed/media-seed.sql` tek dosyadır (tam açıklama + 24 px önizleme dahil) ama ≈ 1,2 MB'dır; canlıya MCP ile yazılan sürüm sıkıştırılmış biçimdir
(`COMPACT_DIR=… CHUNK_SIZE=64 node supabase/seed/build-media-seed.mjs` → 4 parça; **önizleme (`placeholder`) yazılmaz**, yalnız ortalama renk — önizleme
moderatörün "Görsel renklerini doldur" aracıyla tamamlanabilir). Tekrar çalıştırmak ilk satırda birincil anahtar hatasıyla durur, hiçbir şey değişmez.
`COMPACT_PICK="v:0,a:0" COMPACT_ROLLBACK=1` ile birkaç promptluk geri alınan deneme üretilebilir.

## Uygulama sırasında düzeltilenler
- Ses türü tahmini (açıklamadaki anahtar sözcük) ilk sürümde bazı parçaları yanlış etiketledi (reggae → "Piyano / klasik" gibi): regex sırası düzeltildi (ses henüz
  yazılmadan). Kalan iki yanlış (`Without You`, `Behind the line` → "Elektronik") canlıda `UPDATE` ile, üreticide `AUDIO_LABEL_FIX` ile düzeltildi.
- Kullanıcı eşleştirmesi tür tahminine bağlı olduğundan tahmin kuralını değiştirmek ses promptlarının sahiplerini de değiştirir; değiştirirsen seed'i yeniden üret.

## Sınırlar
- Videolar kısa (2,7 sn; OpenVid'in Pixabay/Pexels klipleri bu uzunlukta) ve 512×512 kare; ses 30 sn kesit. Tam uzunlukta değil.
- Tüm klip altyazıları ve ses açıklamaları İngilizce (kullanıcı içeriği gibi çevrilmedi); başlıklar ve açıklamalar Türkçe (`translations.ts`'e anahtar eklenmedi: veri, arayüz metni değil).
- Gerçek tarayıcıda oynatma BU OTURUMDA denenmedi (site henüz yayında değil); dosyalar `ffprobe`/`ffmpeg` ile doğrulandı.
- Kaynak dosyalar yeniden üretilebilir: DiffusionDB `images/part-0000NN.zip`, OpenVid `OpenVid_partN.zip` ve Zenodo `audio.zip` HTTP aralık istekleriyle tek tek çekildi (tam arşiv indirilmedi).
