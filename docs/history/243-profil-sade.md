# 243 — Profil: Sade düzen (A yönü)

**Durum:** uygulandı (yalnız istemci kodu, **migration yok**). Ağ taklitli Playwright'ta sınandı (`run-profile-collections` 13/13, `run-hscroll`, `run-quotes`, `run-spaces`, `run-stories`…); gerçek Supabase'e / oturuma / gerçek telefona karşı denenmedi. İngilizce karşılıklar eklendi (`translations.ts`: `profile.railAriaLabel`, `profile.moreSections`; başka yeni metin yok).

## İstek
Kullanıcı profil sayfasını "daha farklı, daha temiz, sade ama modern" istedi; üç yön çizildi (A Sade · B Kapak · C Yan panel), **A seçildi**. "Özellik eksiltme" kuralı geçerli: yalnızca yerleşim değişti.

## Ne değişti
- **Albüm bandı gitti** (203/233): renkli bant + büyük avatar + "Yaratıcı" üst yazısı yok. `ProfileHeader` (`profile-header.tsx`): solda halkalı avatar (88px) + ad + @kullanıcı (+ örnek hesap rozeti), sağda **satır içi eylemler** (telefonda adın altında tam genişlik; tek birincil hap: Takip et / Profili düzenle, sonra Mesaj · Paylaş · ⋮/Ayarlar — `profile-actions.tsx`, `MessageButton compact`); altında sola yaslı: özgeçmiş (140 karakter + "Devamı"), istatistik satırı, tek meta satırı (web sitesi · katılma tarihi · kullanım sayısı), ilgi alanı/rozet çipleri.
- **Tek şerit** (`ProfileRail`): öne çıkan hikâyeler + (ince çizgiyle) herkese açık koleksiyonlar tek `ScrollRow`'da; ikisi de yoksa şerit yer kaplamaz (`data-rail-group` + `has-[…]`). `StoryHighlightsRow` ve `CollectionRings` artık kendi kaydırma satırı çizmez, şeridin grubudur.
- **Bölümler:** ilk dört bölüm (Promptlar · İstekler · Workflow'lar · Hazır ayarlar) alt çizgili sekme (`role="tab"`, sayıyla); kalanı (Alıntılar · Spaces · Taslaklar/Kaydedilenler/Beğeniler [yalnız sahibi] · Koleksiyonlar [ziyaretçi] · Hakkında) sağdaki **"Daha fazla ▾"** menüsünde (`SectionMenu variant="tab" align="end"`; etkin bölüm menüdeyse düğme onun adını yazar). Altında bölüm başlığı + sayı, sağda Filtre ve Kart | Izgara (liste doluyken).
- **Yan sütun kalktı** (`profile-aside.tsx` silindi): web sitesi/katılma tarihi başlıktaki meta satırında, tüm bilgiler ve katkı haritası **Hakkında** sekmesinde.
- Kural değişikliği: CLAUDE.md'deki "4+ bölüm = menü" kuralına profil için istisna — profilde ilk dört bölüm sekme, fazlası "Daha fazla" menüsü.

## Testler
`run-profile-collections` 7/12/13 (sekmeler + Daha fazla, tek şerit, boş şerit, Hakkında, 390px tek satır); `run-hscroll` (kaydıran öğe artık `[data-profile-rail]`), `run-quotes` 6, `run-spaces` 28 ("Daha fazla" menüsü üzerinden). Seçiciler: `data-profile-tab`, `data-profile-tabs`, `data-profile-section-title`, `data-profile-rail`, `data-section-menu` ("Daha fazla" düğmesi).

## Bilinçli sınırlar
Başlıktaki avatar masaüstü/telefonda aynı boyut (88px); dar telefonda dört sekme yatay kaydırılır ("Daha fazla" sabit kalır); özgeçmiş hem başlıkta hem Hakkında sekmesinde yer alır. Gerçek cihazda (iOS Safari) denenmedi.
