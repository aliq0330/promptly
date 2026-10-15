### 9.167 Detay sayfaları: mobilde yazar satırında Takip, her türde sunucudan görselli "Benzer"

**Sorun:** Prompt detayında mobilde alttaki yazar kartı kaldırılmış, Takip butonu üstteki yazar satırına taşınmış ve "Benzer" bloğu sunucudan seçilen görselli kartlara dönmüştü (9.153); İstek, Workflow ve Hazır Ayar detayı eski düzendeydi. Workflow ve Hazır Ayar benzerleri ayrıca istemcideki son-içerik önbelleğinden seçiliyordu (doğrudan bağlantıyla açılınca boş kalıyordu) ve metin satırıydı.

**Çözüm:**
- İstek, Workflow ve Hazır Ayar detayı: `CreatorSummary` yalnız masaüstünde (`hidden lg:block`) yan sütunda; mobil/tabletde `DetailByline`'ın `trailing` alanında `FollowButton` (`lg:hidden`, kendi gönderisinde yok) — Prompt detayıyla aynı.
- `supabase/migrations/20260919910000_related_workflows_presets.sql` — `public.related_workflows` / `public.related_presets`: `related_requests` ile aynı kalıp (SECURITY INVOKER, yalnız görünebilir içerik, kaynak hariç, ortak etiket → alt kategori/kategori → aynı yazar → `like_count`; yalnız "aynı yazar" benzerlik sayılmaz). Workflow'da kategori eşleşmesi için `content_types` kesişimi aranır.
- `fetchRelatedWorkflows` / `fetchRelatedPresets` + `RelatedWorkflows` / `RelatedPresets` (`useRelated` + `RelatedCards`): yüklenirken iskelet, boş ya da hata → blok gizlenir. Eski istemci tarafı `similar` hesabı ve `AsideLinkRow` kullanımı kaldırıldı.
- TR+EN: yeni görünen metin yok (`workflow.similar` / `preset.similar` yeniden kullanıldı).

**Dağıtım:** migration eklemeli (yalnız yeni fonksiyon, `drop` yok) — canlıya MCP ile uygulandı (`related_workflows_presets`, 2026-10-15; MCP ayrı zaman damgası yazar). Canlıda en çok beğenilen workflow ve hazır ayarla denendi: kaynak sonuçta yok, hazır ayar için 4, workflow için 1 sonuç.
**Doğrulama:** `tsc`, `lint`, `npm test` (229) temiz; `build` yer tutucu Supabase env değerleriyle geçti. Tarayıcıda/telefonda görsel olarak denenmedi.
