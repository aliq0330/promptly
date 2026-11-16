# 401 — Skill detay sayfası prompt sayfasıyla hizalandı

**Durum:** uygulandı (yalnız istemci; migration YOK; ağ taklitli testle sınandı, gerçek cihaz DENENMEDİ). Kullanıcı Skill detayını normal prompt detayıyla aynı görünüme getirmeyi, indirme bağlantılarına ayrı bir düğme vermeyi ve ⋮ menüsünün normal prompttaki gibi olmasını istedi.

- **Bölünmüş "İndir ▾" düğmesi** (`skill-download-button.tsx`): sol parça asıl eylem (paket varsa ZIP, yoksa SKILL.md), ok parçası diğer biçimleri açar (SKILL.md indir, kopyala, özet JSON, `promptly.skills`). Bandın altındaki birincil eylem yerinde kalır.
- **⋮ menüsü** (`skill-menu.tsx`) `PostMenu` ile aynı satırlar ve görünüm: bağlantıyı kopyala, İlişki haritasını aç, sahibe Düzenle / Sil, başkasına Şikâyet et. Artık oturumsuz ziyaretçiye de çizilir. "Space'e ekle" Skill için yoktur.
- **Eylem satırı** promptla aynı: Beğeni · Yorum · Kaydet ve İstatistik · Paylaş. Düzenle/Sil, ikinci ⋮ ve sürüm yazısı satırdan kalktı.
- **"Hakkında" kartı** `DetailMetaCard`: uyumlu araçlar, kategori ve ETİKET çipleri (etiketler detayda ilk kez görünür), altında ilişki haritası satırı; sürüm/lisans/güncellenme "Skill bilgisi" kartında kaldı.
- Testler: ağ taklitli `run-skills-social` 34/34 (yeni senaryo 29, 5b güncellendi), `run-skills-package` 25/25.
