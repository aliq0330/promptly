# 237 — Ana Sayfa: sade düzen (yalnız Ana Sayfa)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). **Gerçek Supabase'e / telefona karşı denenmedi.** İngilizce karşılık: yeni metin yok. Tuvaldeki "Ana Sayfa · sade" taslağının düzen kısmı; gönderi kartı (A/B/C/D yönleri) bu işe DAHİL DEĞİL, kartlar aynı kaldı.

- `SectionNav variant="tabs"` (yalnız Ana Sayfa kullanıyor): `Sana özel · Takip Ettiklerim` sekmeleri solda, **Filtre + Kart/Izgara simgeleri aynı satırın sağında** (`SectionTabs` `end` yuvası); ayrı kontrol satırı ve tür çip satırı kalktı. Sekmeler artık satırı paylaşmıyor (`spread` kaldırıldı), sola yaslı.
- Tür çipleri (Hepsi · Promptlar · İstekler · Workflow'lar · Hazır ayarlar), "Sana özel'i ayarla", "Yenile" ve Takip Ettiklerim süzgeçleri zaten Filtre penceresindeydi; telefonda ve masaüstünde artık çipler yalnız orada.
- Kaydırınca daralan sabit şerit (`FoldedBar`), hikâye şeridi, ilk kullanım banner'ı, "neden" notları, sağ sütun aynı.
- Test: `run-feed-filters` 6 tür çipini Filtre penceresinden seçiyor.
