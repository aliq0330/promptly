# 446 — Detay sayfası "Hakkında" bloğu: tek bağlam kartı

**Sorun:** Araç, kategori/alt kategori ve etiketler aynı mavi hapla çiziliyordu (hangisi kategori, hangisi etiket belli değildi); araç büyük simgeli satır, harita bağlantısı çıplak metindi; sol kenarlar hizasızdı.

**Karar (mockup D, kullanıcı seçti):** `DetailMetaCard` tek kart, bölmeli (`DetailMetaBlock` = küçük `SectionLabel` + içerik, bloklar arası ince çizgi):
- **Araç** — simge + ad (etiket: Tavsiye/Tercih edilen araç/model)
- **Kategori** — yol: `Ana › Alt` (`TaxonomyLinks`, düz bağlantı + `ChevronRight`)
- **Etiketler** — düz mavi `#metin` (`DetailTags`)
- **İlişki haritası** — kartın alt şeridi (`RelationMapRow`: `bg-surface-soft`, ikon + metin + chevron)

Prompt, İstek, Workflow, Hazır ayar ve Skill detayı aynı bileşeni kullandığı için hepsi birlikte değişti. Skill kategorisi de aynı bloktan çizilir.

**Yeni çeviri anahtarı yok** (`taxonomy.categoryLabel`, `forms.tags` yeniden kullanıldı). Bağlantı sayısı/renkli noktalar mockup'ta vardı ama veri çekmek gerektirdiği için eklenmedi.
