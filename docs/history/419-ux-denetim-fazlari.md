# 419 — UX denetimi: 7 fazlı düzeltme

Tarih: 2026-11-17. Kaynak: Topluluk / Space / Ekip / içerik türleri / Skill / erişilebilirlik için kod okuma denetimi (kod değişmeden önce
çıkarılan bulgu listesi: P1-1…P3-10) ve fazlı çözüm planı. Yalnız istemci; migration YOK. Ağ taklitli Playwright ile denendi, gerçek Supabase/cihaza karşı DENENMEDİ.

## Yapılanlar

| Faz | Bulgu | Değişiklik |
|---|---|---|
| 1 | P1-1 | Topluluklarım boş durumundaki "Keşfet" düğmesi `homeHref("discover")`'a gider (eskiden kendi sayfasına dönüyordu). |
| 1 | P2-10 | `/skills` listesi hatada sonsuz iskelette kalmıyor (artık Keşfet'e yönleniyor; bkz. Faz 6). |
| 1 | P2-13 | Başlıklar: `usePageTitle` Topluluk/Space/Ekip detayında; `ROUTE_TITLES`'a `/spaces`, `/skills/local`, `/communities/all`… |
| 1 | P3 | `/skills` Keşfet'i yakar; ekip iskeleti kenar boşluğu `HUB_PAGE_CLASS`; `tabpanel` etiketi; `AppShell` ölü `aside` kalktı; `HUB_PAGE_CLASS` `PAGE_WIDTH_CLASS`/`PAGE_GUTTER_CLASS`'tan türer. |
| 2 | P1-2 | `Modal`: açılışta odak pencereye girer (çocuk `autoFocus` verdiyse dokunmaz), Tab pencerenin içinde döner (`lib/modal-focus.ts`, birim testli), kapanınca odak açan öğeye döner. **Bilinçli sapma:** arka plana `inert` konmadı (`aria-modal="true"` + Tab tuzağı yeterli; `inert` toast/hikâye katmanlarını etkileyebilir). |
| 2 | P2-12 | `Tabs`: ← → Home End + roving tabindex. Menüler ortak `components/ui/menu-keys.ts` ile ↑ ↓ Home End, açılışta odak, Escape'te odak düğmeye döner: `DropdownMenu` (artık `components/ui/dropdown-menu.tsx`), `SectionMenu`, ekip bandı menüsü, `SpaceMenu`. |
| 3 | P1-3 | Tek terim "alıntıla": topluluk akışında "Var olan içeriği alıntıla", Oluştur menüsünde "Var olan içeriği alıntıla"; "başvur" yalnız katılım isteği anlamında kaldı. İngilizce üyelik metinleri "join requests" (içerik türü "Requests" ile karışmasın). |
| 3 | P2-4/5 | "Gönderi oluştur" etiketli birincil düğme; "yeni içerik" adımında Skill/Space için ipucu + "alıntıla" kısayolu. |
| 3 | P3-1 | `LayoutGrid` ("Tüm topluluklar"), `Quote` ("Var olan içeriği alıntıla") — Compass/Megaphone anlam çakışması bitti. |
| 4 | P2-3 | Topluluk bandına ⋮ menü: bağlantıyı kopyala · bildirim tercihleri (üye) · şikâyet. |
| 4 | P2-1/2 | Bant eylemleri `xl`'de en çok 18 rem; yan sütun "Hakkında" kartı bandın açıklama ve üye sayısını tekrar etmez. |
| 4 | P2-6 | Kart özetinde aksiyonlanabilir sayılar (okunmamış, bekleyen istek) öne; alt satır sarılıp taşmaz. |
| 4 | P1-4 | `HubBand` `tone`: Topluluk mavi, Space turuncu, Ekip nötr; ekip kicker'ı "Ekip" (büyük harf değil). |
| 5 | P2-14 | «Sen» sekmesi kısayol sayfalarında (Spaces, Ekipler, Studio, Kaydedilenler, Takip, Panel) yanar. |
| 5 | P2-16 | Yan sütun Etkinlikler ve Üyeler sekmesinde de; Hakkında/Yönet daha geniş okuma sütunu. |
| 6 | P2-8/9/17 | Skill'in TEK liste yüzeyi Keşfet → Skill'ler. Kontroller arama + Filtre penceresi (3 chip satırı kalktı). Ana Sayfa'daki "Skill" çipi kalktı (eksen kuralı). Bayrak kapalıyken Skill kartı akışa sızmaz. `/skills` → `/discover?section=skills`. |
| 7 | P2-11 | `/prompts`, `/requests`, `/workflows`, `/presets` Keşfet bölümlerine yönlenir (`RedirectTo`, `lib/list-routes.ts`); iç bağlantılar güncellendi; eski liste görünümleri silindi. |
| 7 | P1-5 | `CLAUDE.md` §9 → `docs/durum-ve-acik-isler.md` (çabuk eskiyen durum notları); bayat satırlar güncellendi. |

## Bilinçli ertelenenler (yeni iş)

- **P2-15** Ekip alanında Space→alan regex yeniden yazımı (`lib/team-area-terms.ts`): ayrı ekip çeviri anahtarlarına geçiş büyük bir metin işi; mevcut hâl çalışıyor.
- **P2-18** Ekip URL durumu (10+ parametre) ve 5 seviye derinlik: tipli adres yardımcısı gerektirir; ayrı tasarım.
- **P2-16** Tablet için bantta daha büyük kapak / özet satırı: ekran görüntüsüyle gözden geçirilmeli (bu oturumda görsel doğrulama yapılmadı).
- Elle yazılmış `role="tab"` kullanan 10 dosya (`section-nav`, `reaction-sheet`, `statistics-modal`, …) ortak `Tabs`'a ya da `nextRovingIndex`'e bağlanmalı.
- Doğrulanamayanlar (ekran görüntüsü alınmadı): 1280 px'te topluluk bandı başlık genişliği; ekip ⋮ menüsünün sekmelerin altında kalıp kalmadığı.

## Test

Birim: `modal-focus.test.ts` (tabTarget, nextRovingIndex). Ağ taklitli: `run-communities` 68/68, `run-spaces` 34/34, `run-skills-social` (Skill süzgeçleri Filtre penceresinde; Ana Sayfa'da Skill çipi yok), `run-community-posts`, `run-team-hub`. `run-nav-layout` ve `run-team-hub` 42. senaryosu değişiklikten ÖNCE de aralıklı düşüyordu (ana dalda doğrulandı).
