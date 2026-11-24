# 453 — Tek tip seçim sistemi

Durum: **uygulandı**. Tek değer seçimi (radyo / segment / hap / karo / kart / renk) sitede 11 farklı görünümle yazılmıştı (20 dosyada tarayıcının kendi
`<input type="radio">`'ı, 33 dosyada elle yazılmış `role="radio"` düğmesi, `Tabs` ve `aria-pressed` düğmeleriyle yapılan seçimler). Aynı soru ("Kim yazabilir?",
"Bildirim düzeyi", "Kim görsün?") ekrandan ekrana başka çiziliyordu. Kullanıcı bir mockup üzerinden altı grubu onayladı; bu belge uygulamayı ve kuralı yazar.

## Gruplar ve bileşenler

| Grup | Bileşen | Ne zaman |
|---|---|---|
| G1 Seçenek kartı | `components/ui/option-group.tsx` → `OptionGroup`, `OptionCheckbox` | Tek değer, her seçeneğin açıklaması var (2–5). Nokta ÇİZİLMİŞ (tarayıcı radyosu yok). `columns` 1/2/3, `leading` (küçük görsel), `after` (kartın içindeki ayrı denetim: select), `badge`, `reselect` (basılınca yeniden `onChange`). `OptionCheckbox` = aynı kart, KARE işaret: radyo listesinin yanındaki evet/hayır seçimi radyo gibi görünmez |
| G2 Seçim grubu | `components/ui/choice-group.tsx` → `ChoiceGroup` `variant="segmented"` / `"pill"` | Tek değer, kısa etiket. 2–3 seçenek segment, 4+ hap. **Hap satır kırar, kaymaz** (seçili seçenek ekran dışında kalmasın). `showHint` = seçilenin `hint`'i altta tek satır |
| G3 Karo | `ChoiceGroup variant="tile"` (+ `iconOnly`) | İkon seçimin parçası: Space türü, hikâye kitlesi, içerik türü, oda ikonu |
| G4 Çip | `components/ui/chip.tsx` | YALNIZ çoklu seçim / süzgeç. Tek değer için çip yazılmaz |
| G5 Menü satırı | `components/ui/menu-radio.tsx` → `MenuRadioGroup` | Menü / sayfa içi listede tek değer: seçili satır `primary-soft` + yarı kalın + sonda ✓. `size="lg"` bölüm menüsü; `below` seçili satırın altına içerik (kategorinin alt kategorileri) |
| G6 Renk | `components/ui/swatch-group.tsx` → `SwatchGroup` (`md` / `sm` / `auto`) + ekip için `TeamToneSwatches` (`teams/team-ui.tsx`) | Renk / ton. Seçili: 2 px boşluk + 2 px `primary` halka (+ düz renkte ✓) |

Hepsi aynı klavye modelini kullanır (`components/ui/radio-keys.ts`): oklar bir sonraki seçeneğe gider VE seçer, seçili olan grubun tek sekme durağıdır (roving tabindex).
Menü satırlarında (`section-menu`) bölüm menüsünün kendi klavye modeli `onKeyDown` ile verilir (odak gider, seçmez).

## Kural (kilitli)

- `role="radio"` ve `<input type="radio">` yalnız bu bileşenlerde yazılır. ESLint **hata** verir (`eslint.config.mjs` `RADIO_RULES`), `scripts/design-metrics.mjs` `rawRadio` sayacı `npm test`te hedef 0'dır.
- Bilinçli istisnalar (`RADIO_FILES` / `allow`): `star-rating.tsx` (yıldız puanı gerçekten radyodur) ve `taxonomy-picker.tsx` (kategori ağacının yaprağı: ağaç kollu satır).
- `Tabs` panel gezinmesidir; bir değer seçmez (7/30/90 gün, Açık/Kapalı süzgeci `ChoiceGroup` oldu).
- Eski `ChoiceCard` (`field.tsx`) silindi: yerine `OptionGroup`.

## Ne dönüştü

Ayarlar (Gizlilik, Aramalar, Tercihler, çevrimiçi durumu, API anahtarı, bağlama sihirbazı, Açık/Koyu), topluluk (oluştur, ayarlar, bildirim düzeyi, görünürlük seçici, kapak,
oda formu, sohbet ve sahip ayarları), içerik seçme listeleri (topluluğa paylaş, mevcut içeriği paylaş, sohbete ekle, yoruma ekle, hazır ayarla dene), ekip (renk ×3 tek
bileşen, üye çıkarma, gruba ekle, kanal/proje/davet formları), pano (yorum kapsamı, taşı/kopyala, çizim renkleri, bağlantı rengi), Space (tür, görünürlük, şablon, etkinlik
görünürlüğü, not/grup rengi, workflow içe aktarma), hikâye kitlesi, prompt formu (içerik türü, "Kim görsün?", kategori türü, değişken varsayılanı), şikâyet nedenleri,
Studio, koleksiyon formu, dışa aktarma, ilişki ekleme, moderatör şablon kapsamı, Keşfet/arama sıralama ve kategori süzgeci, bölüm menüsü.

2 seçenekli "kim yazabilir / kim görebilir / kimler katılır" soruları her yerde **segment + `showHint`** (aynı soru artık aynı görünüm); "bildirim düzeyi" her yerde segment + açıklama satırı.

## Bilerek bırakılanlar

- Pano araç çubuğundaki boyut / kalınlık / kalın düğmeleri (`board-draw`, `board-toolbar`): araç çubuğu açma-kapama düğmeleridir (`aria-pressed`), seçim formu değil.
- `Chip` ile yazılmış diğer tek seçimler (varsa) bu turda taranmadı; kural gereği tek değer için çip yazılmaz, yeni kodda `ChoiceGroup`.
- Çoklu seçim satırlarının `role="checkbox"`'ı (`save-to-collection-modal`, `invitee-picker`, `conversation-row`, `hub-parts`, `team-add-to-board`) değişmedi.

## Doğrulama

`npx tsc --noEmit`, `npm run lint` (hata 0), `npm test` (1542), `npm run build` temiz. İngilizce: yeni görünen metin yalnız `tm.tone.*` ve `groups.cover.swatchesAria` (ikisi de `{tr,en}`).
Ağ taklitli arayüz paketleri çalıştırıldı; etkilenen seçiciler (`getByLabel` → `getByRole("radio")`) güncellendi. Gerçek Supabase'e / gerçek cihaza karşı DENENMEDİ.
