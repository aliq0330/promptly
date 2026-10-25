# 236 — Arama sonuç türleri ve Space içi süzgeçler: tek menü

**Durum:** uygulandı (yalnız istemci kodu, migration yok). **Gerçek Supabase'e / telefona karşı denenmedi.** İngilizce karşılık: yeni metin yok. Kural 233–235 ile aynı: 4+ seçenek → tek `SectionMenu`, ≤3 → çip/sekme.

- **Arama** (`search-view.tsx`): Tümü · Gönderiler · Kişiler · Topluluklar sekme satırı → ikonlu menü (kapsamlı aramada — Keşfet bölümü seçiliyken — zaten gösterilmezdi, aynı).
- **Space → Promptlar** sekmesi: kaynak süzgeci (Tümü · Paylaşılan · Taslak · Görsel) çipleri → menü.
- **Space → Görseller** sekmesi: grup süzgeci; grup + "Tümü" + "Grupsuz" seçeneği 4 ve üstündeyse menü, azsa çipler kalır. **Notlar** (3 çip) olduğu gibi.
- `CLAUDE.md`: Space sayfası, arama ve Meydan tasarım satırlarındaki eski "hap sekme" ifadeleri düzeltildi.

## Bilerek dokunulmayanlar
Workflow düzenleyicisi (4 alan sekmesi) ve Studio: bunlar liste/gezinme değil, form bölümleri; düzenlerken sık geçiş yapıldığı için menü fazladan dokunma ekler — ayrı bir tasarım kararı gerektirir (tuvalde çizilmeden değiştirilmedi). Modal içi sekmeler, detay sayfası sekmeleri, ≤3 seçenekli çipler/sekmeler, Ana Sayfa.

## Testler
`run-search-notifications` (sonuç türü menüsü yardımcıları `resultMenu`/`pickResultTab`) ve `run-feed-filters` 16 menüye uyarlandı; tüm UI paketleri geçti (17/17, 10/10, `run-spaces` 32/32). Space → Promptlar kaynak menüsü ve Görseller grup menüsü için ayrı otomatik senaryo yok (yalnız tsc/lint/build ve mevcut Space paketleri).
