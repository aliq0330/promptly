# 230 — Studio: Çalıştır / API anahtarıyla üret seçenekleri + Yayınla

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright `run-preset-try` 10/10 (3c masaüstü akışı, 3d telefon). **Gerçek Supabase'e / gerçek AI çağrısına / gerçek telefona karşı denenmedi.** İngilizce karşılıklar eklendi (`studio.runTitle|optionRun|optionRunHint|optionApi|optionApiHint|runPanelHint|publishHint|publishPrompt|publishPromptFailed`; kullanılmayan `studio.modelCard` kaldırıldı).

## İstek
Studio'da prompt metin alanlarından sonra iki seçenek gelsin: (1) sitede zaten kullandığımız **Çalıştır** (promptu seçilen araçta aç / kopyala), (2) araç-model seçimi ve ayrı API anahtarı girişiyle **API anahtarıyla üret**; ayrıca bir **Yayınla** düğmesi promptu prompt oluşturma ekranına taşısın.

## Ne yapıldı (`features/studio/studio-view.tsx`)
- "SON PROMPT" kartından sonra **"Nasıl çalıştıralım?"** kartı: iki seçenek karosu (`role="radiogroup"`): **Çalıştır** · **API anahtarıyla üret**. Varsayılan API (eski akış aynen: tür, sağlayıcı/model/anahtar, hatırla, ek model karşılaştırma, adet, Üret).
- **Çalıştır** seçilince API alanları kapanır; prompt sayfasındaki aynı birleşik **Kopyala | Çalıştır** hapı (`CopyPromptButton` + `RunButton variant="segment"`, docs/history/229-*) son promptu (hazır ayar uygulanmış) verir. Çalıştır mevcut araç seçici penceresini açar (önerilen araçlar: kaynak promptun ya da hazır ayarın araçları; kullanım sayacı promptun id'siyle). Son prompt boşsa yalnız uyarı metni.
- **Yayınla** (kartın altı, iki seçenekte de): `stashHandoff({ contentType, promptText: son prompt, toolId })` + `/create?mode=prompt&fromGenerate=1` — "Sonucu paylaş"ın kullandığı mevcut aktarım; sonuç görseli yok, görsel oluşturma ekranında eklenir. Oturumsuzsa ortak giriş penceresi, son prompt boşsa düğme pasif, aktarım başarısızsa (depolama engelli) hata satırı.

## Bilinçli sınırlar
- Seçim (Çalıştır / API) kalıcı değil; sayfa her açıldığında API ile başlar.
- Yayınla, Studio'daki son promptu (hazır ayar cümleleri dahil düz metin olarak) gönderir; hazır ayar/kaynak bağlantısı oluşturma ekranına taşınmaz.
