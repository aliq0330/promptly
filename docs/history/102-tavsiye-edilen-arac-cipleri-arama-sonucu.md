### 9.102 Tavsiye edilen araç çipleri → arama sonucu

Detay sayfalarındaki "Tavsiye edilen araç/model" çipleri (`ToolLine` → `ToolChips linked`) artık `/discover?tool=<id>` bağlantısı; model çipi ilgili aracın aramasına gider (araç çipi araç + tüm modellerini eşler). Eski serbest metin araç `?q=` ile aranır. `SearchView` mount'ta `?tool=`'u (`findTool` ile doğrulayıp) araç çipine çevirir. Kartlardaki çipler bağlantı değil (kart stretched-link'i). `/search` yönlendirmesi tüm parametreleri zaten taşıyor (9.101). Migration yok; yeni metin yok.
