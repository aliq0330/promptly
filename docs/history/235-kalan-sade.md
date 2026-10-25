# 235 — Kalan sekme satırları: Space sayfası, Kütüphanem, Moderasyon, yönetim/taslak/sıralama menüleri

**Durum:** uygulandı (yalnız istemci kodu, migration yok). **Gerçek Supabase'e / gerçek telefona karşı denenmedi.** İngilizce karşılık: yeni metin yok (mevcut anahtarlar). 233–234'ün kalıbı: 4+ bölüm → tek `SectionMenu`, ≤3 → sekme.

## Ne değişti
- **Space sayfası** (`space-page.tsx`): yedi hap sekme yerine tek bölüm menüsü (`ListControlRow` yalnız menüyle; ikon + sayı: görsel/prompt/not/palet). Üye olmayan vitrin kuralı (`visibleTabs`) aynı; pano sekmesi tam ekranı aynı.
- **Kütüphanem** (`/my-content`): `SadeTitle` + `Promptlar ▾` tür menüsü (sayılı; çizgiden sonra Taslaklar) + arama simgesi (alanı açar) + Filtre (görünürlük + sıralama) + Kart/Izgara + "+" (türün oluşturma sayfası). Alttaki "Yeni oluştur" düğmesi "+" ile birleşti; eyebrow/açıklama (`sr-only`) kalktı.
- **Moderasyon** (`/moderation`): Şikâyetler · İstatistik · Kullanıcılar · Haftalık temalar menüsü; şikâyet durumu süzgeci (açık/incelendi/reddedildi/hepsi) Filtre penceresinde (durum üst bileşende tutulur). Kullanıcı ayrıntısındaki 9 sekme de menü (sayılı).
- **Topluluk Yönetim bölümleri** (`manage-tab`, 5 bölüm), **profil/Kütüphanem Taslaklar paneli** (Tümü + 4 tür, sayılı) ve **Tüm topluluklar sıralaması** (4 sıra) → `SectionMenu`.

## Bilerek sekmede kalanlar (≤3 bölüm / modal / detay)
Arama sonuç sekmeleri, Ana Sayfa'nın iki sekmesi, Üyeler (3) · Etkinlikler (2) · Davet-başvurular (3) · istatistik dönemi (3) · topluluk moderasyon durumu (2), hazır ayar kapsamı (2), modal içi sekmeler (istatistik, paylaş, ek ayarlar), detay sayfası sekmeleri, ilişki haritası görünümü (2).

## Testler
Menüye taşınan seçiciler: `run-spaces` (Space sayfası bölüm menüsü yardımcıları), `run-communities` (Yönetim bölümleri ikinci menü: `manageMenu`/`pickManage`), `run-groups` 24, `run-community-home` (sıralama menüsü). Yeni: `run-profile-collections` 10 (Kütüphanem) ve 11 (Moderasyon; `is_moderator` RPC taklidi). Kullanıcı ayrıntısı (moderatör) ve Taslaklar paneli menüleri yalnız `tsc`/lint/build ile doğrulandı, otomatik arayüz testi yok. `run-communities` 33b aralıklı (kapak imzalı adres), bu değişiklikten bağımsız.
