# 423 — İkon kalınlığı: Phosphor Regular → Bold

Kullanıcı kararı: tüm site ikonları tek kalınlıkta **Phosphor Bold** olur (377-*'deki "tek kalınlık, tek ton" kuralı korunur, yalnız ağırlık değişti).

- `scripts/build-icons.mjs`: ikon gövdesi `<ad>-bold`tan alınır (`ph:<ad>-bold`); Play/Pause `fill` varyantı Fill kalır. Spinner çizgisi 1.75 → 2.25.
- `src/components/icons/*` yeniden üretildi (elle düzenlenmez).
- `components/ui/motion-icons.tsx`: elle çizilmiş şekiller (yer imi, kâğıt uçak, pusula, topluluk, raptiye) Bold gövdelerle değişti; çizgi parçaları `PH_STROKE` 16 → 24 (256 ızgarasında), varsayılan `strokeWidth` 1.5 → 2.25 (24'lük ızgarada Bold karşılığı). Pusula halkası/iğnesi ve topluluk ön/arka kişileri animasyon grupları için ayrı path'lere bölündü.
- `icons.test.ts` atıf kalıbı `ph:heart-bold`a güncellendi.
- Canlı veritabanına/migration'a dokunulmadı; İngilizce/Türkçe metin eklenmedi (görsel değişiklik).
