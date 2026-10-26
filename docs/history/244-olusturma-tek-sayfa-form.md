# 244 — Oluşturma ekranları: tek sayfa form (A yönü)

**Durum:** uygulandı (yalnız istemci kodu, **migration yok**). Ağ taklitli Playwright'ta sınandı (`run-create-destination` 16/16, `run-community-posts` 36/36 + tüm diğer arayüz paketleri); gerçek Supabase'e / oturuma / iOS Safari'ye karşı denenmedi. İngilizce karşılıklar eklendi (`translations.ts`: `compose.required`, `compose.titleHint`, `compose.promptText`, `compose.sectionDetails`, `compose.sectionDirection`, `compose.sectionParameters`).

## İstek
216'daki yazma ekranı (avatar + tür hapı + araç satırı + "Paylaşmadan önce" penceresi) kullanıcıya anlaşılmaz geldi: "eski haline form şekline getirsek, sade". Her tür için üç yön × üç cihaz çizildi (A tek sayfa form · B adım adım · C bölümlü kartlar); **A seçildi**, dört türde (Prompt, İstek, Workflow, Hazır ayar) uygulandı.

## Ne değişti
- **Aynı iskelet dört formda** (`content/compose-form.tsx`): `ComposeSection` (küçük BÜYÜK HARF başlıklı bölüm), `FormField` (etiket + "Zorunlu"/"opsiyonel" + ipucu/hata), `FormDisclosure` (tek satırda seçili değer, dokununca altında kendi seçicisi açılır), `ComposeAudienceLine` (yalnız topluluğa yazarken "Ali · Açık Topluluk"). Bölümler: **Temel bilgiler** (Ne üretiyorsun? · Başlık [· Açıklama]) → **Prompt** / **Yön ve referans** / **Adımlar** / **Parametreler** → **İsteğe bağlı ayrıntılar** (Araç, Kategori, Etiketler, [DNA, Referans]) → **Kim görsün?**.
- **Üst çubuk**: ✕ · başlık (+ Taslaklar) · durum · "Taslak" · "Paylaş" (`ComposeShell`). Eksik zorunlu alan varken Paylaş SOLUK ama basılabilir: ilk basışta hatalar alanların altında (`data-field-error`) ve "Kim görsün?" bölümünde listelenir, ilk eksiğe odaklanılır, hiçbir şey gönderilmez. (`aria-disabled` bilerek yok: düğme basılabilir.)
- **"Paylaşmadan önce" penceresi kalktı**: `PublishSheet` → `PublishPanel` (`content/publish-panel.tsx`, satır içi, `ref.publish()`): kart önizlemesi (yalnız `lg` altında — yanda canlı önizleme yok), Kim görsün? (Herkese açık / Sadece ben / Bir topluluk, radyo satırları), "Topluluklarda da alıntıla", "ne olacak" cümlesi, bildirimler, Taslak + Paylaş. Topluluk bağlamı/duyuru/engel mantığı değişmedi.
- **Alt sayfalar kalktı**: kategori/araç/etiket/DNA/referans artık `FormDisclosure` satırları; tür seçimi satır içi radyolar (`ContentTypePicker`); "Görselden yardım" (İstek) bir satır; Prompt metni eski `PromptTextEditor` (Şablon/Önizleme + "Değişken ekle" + "Görselden yardım") ve "Hazır Ayarlar" satırı geri geldi. `ComposeToolbar`, `ComposeSheet`, `ComposeBody`, `PublishDetailsSection`, `PromptTextEditor` `compose` varyantı, `MultiImagePicker` `strip`, `ExtraSettingsSection` `compact/open` ve ilgili çeviri anahtarları silindi.

## Testler
`run-create-destination` (1–16 yeniden yazıldı: panel seçicileri `[data-publish-panel]`, eksik-deneme akışı, 390px'te araç satırı yok/alt çubuk yok/taşma yok, Prompt formu satırları, Workflow/Hazır ayar formları), `run-community-posts` 13–13c. Yeni seçiciler: `data-compose-draft`, `data-publish-panel`, `data-form-row`, `data-compose-type`, `data-field-error`.

## Bilinçli sınırlar
Üst çubuktaki "Taslak" topluluk bağlamında gizli (içerik topluluğa özgü, taslak olamaz); telefonda tür seçenekleri sığmazsa iki satıra sarar; Hazır ayar editöründeki "Alanlar" kartı kendi başlığını korur (bölüm başlığı + kart başlığı birlikte). Gerçek cihazda (iPhone Safari klavyesi) denenmedi.
