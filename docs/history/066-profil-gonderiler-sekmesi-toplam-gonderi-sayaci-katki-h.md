### 9.66 Profil "Gönderiler" sekmesi, toplam gönderi sayacı, katkı haritası

- Profilde Prompt/İstek/Generator/Workflow sekmeleri tek **"Gönderiler"** sekmesine toplandı; altında dört türlü segmentli alt sekme (sayılarla). Kaydedilenler/Beğeniler/Hakkında aynı kaldı.
- Başlıktaki "Prompt oluştur" butonu kaldırıldı. İstatistik artık **toplam gönderi** (yayınlanmış prompt + istek + generator + workflow; taslaklar sayılmaz) ve altında "N Prompt · N Prompt İsteği · N Generator · N Workflow" dökümü.
- Oluştur ekranına (`CreateChoice`) **Workflow oluştur** kartı (4 kart) eklendi; GitHub tarzı **katkı haritası** profil başlığının altında (her profilde, sahibinin gönderileri) (`profile/contribution-map.tsx`, `lib/supabase/contributions.ts`): son 6 ay, hafta sütunlu günlük noktalar, Az–Çok legend, bugün halkalı; profil sahibinin yayınlanmış gönderileri. Renkler `primary` opaklık kademeleri.
- Migration yok. TR/EN eklendi (`profile.*`, `create.workflow*`, `contrib.*`). tsc/lint/build temiz; tarayıcıda denenmedi.
