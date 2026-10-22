# 214 — Spaces Albüm düzeni, "Sabitle" ve keşif (+ alt menü opaklığı, topluluk kapağı)

**Durum:**
- İstemci kodu ve `20260921140000_space_discovery.sql` repoda.
- Migration yerel PostgreSQL'de sınandı: `supabase/tests/space-discovery.sql` 14/14, `spaces.sql` 59/59 (temiz veritabanı, tüm migration'lar baştan).
- Migration **canlıya UYGULANMADI**. Önce migration, sonra istemci. Migration yoksa yalnız profilin "Spaces" sekmesi ve prompt detayındaki "Bu prompt şu Space'lerde" bloğu sessizce boş kalır; başka bir sayfa etkilenmez.
- Arayüz ağ taklitli Playwright'ta sınandı: `run-spaces` 28/28 (4 yeni senaryo), `run-detail-pages` 45/45, `run-profile-collections` 6/6, `run-stories` 24/24, `run-focus-feed` 25/25; `npm test` temiz.
- Gerçek Supabase'e, gerçek oturuma, cihaza ya da iOS Safari'ye karşı **denenmedi**.

Kullanıcının isteği: Spaces'i incele, Albüm tasarımı öner; favorinin beğeniden farkını, Keşfet'te görünürlüğü ve paylaşımı tartış. Kullanıcı maketleri gördü ve önerilen sırayı onayladı: (1) tasarım, (2) Favori → Sabitle, (3) profil sekmesi + prompt detayında Space'ler. Beğeni, takip, Keşfet bölümü ve akışta Space gönderisi bilerek YAPILMADI (önce görünürlük, sonra etkileşim).

## 1. Space sayfası (`space-page.tsx`)

- **Bant kapaktan renk alır:** `DetailBand backdrop` = kapak / seçilen görsel / ilk kolaj görseli (`StorageImg`, signed URL). Önceden bant düz `bg-primary-soft` idi.
- **Palet şeridi:** başlığın altında ilk (rengi olan) paletin adı ve renkleri (`PaletteStrip copyable`); dokununca HEX kopyalanır. Telefonda kapağın altından tam genişlikte başlar.
- **Üye ↔ vitrin:** üye bugünkü çalışma alanını görür (Genel bakış ile açılır). Üye olmayan (herkese açık / bağlantılı Space'i gezen) VİTRİN görür: Görseller ile açılır, Genel bakış ve Üyeler yok, notu yoksa Notlar da yok; birincil düğme "Panoyu gez" (göz simgesi).
- **Eylem satırı:** solda tek büyük düğme (Panoyu aç / gez), kayıt durumu; sağda yuvarlak Paylaş. Sahip için pencere açılır; herkese açık Space'te herkes için adres (telefonda sistem paylaşım sayfası, yoksa panoya kopyalanır).
- **Panoda eylem satırı yok:** yer panoya kalır (pano kendi araç çubuğunu ve kayıt göstergesini taşır). Paylaş ve Sabitle ⋮ menüsünde de var.

## 2. Kart ve ana sayfa (`space-card.tsx`, `spaces-home.tsx`)

- **Albüm kartı:** `CardBandBackdrop` ile kapaktan renk alan bant: kolaj, tür + görünürlük, büyük ad (kartın tamamını kaplayan bağlantı, `after:inset-0`), sahip satırı + ⋮, ilk paletin ince çizgisi. Altında sayılar ve Sabitle düğmesi. Kart yığın bağlamı kurmaz (⋮ sonraki kartın üstüne açılır).
- **Palet çizgisi:** `fetchLeadPalettes(ids)` — `space_palettes` RLS'ten geçen ek tek sorgu; `list_spaces`'in dönüş tipi değişmedi (değişseydi `drop` gerekirdi).
- **Ana sayfa:** görünür başlık yok (yalnız ekran okuyucuya `h1`), üstte arama + "+" (telefonda yalnız simge), "Son açılanlar" rafı (kare kapaklar), bölümler `SectionNav` balonlarında (Tümü · Benim · Paylaşılan · Sabitli · Herkese açık · Arşiv; bekleyen davet varsa sayaçlı "Davetler" + tek satırlık davet kartı). Sıralama ve ızgara/liste balonların altında. Ziyaretçi balon görmez (yalnız herkese açık).

## 3. Favori → "Sabitle"

- Veri aynı (`space_user_state.favorite`, `set_space_favorite`, süzgeç `favorites`); yalnız ad ve simge değişti: Favori/yıldız → Sabitle/raptiye, süzgeç "Sabitli".
- Gerekçe: favori kişisel ve görünmez bir işarettir (sayaç, bildirim, sıralama sinyali yok); sitedeki Beğeni ise herkese açık bir toplumsal sinyal. Yıldız ve "favori" adı Beğeni ile karışıyordu. İkisi birleştirilmedi: kendi özel Space'ini "beğenmek" anlamsız, kişisel işareti herkese açık sayaca çevirmek de yanlış olurdu.
- Space'e Beğeni / Takip **eklenmedi**: herkese açık Space'ler henüz bulunamıyordu; önce görünürlük (bölüm 4), ilgi görülürse sonra etkileşim.

## 4. Keşif (`list_public_spaces`, `public-spaces.tsx`)

**Migration** `20260921140000_space_discovery.sql` — yalnızca ekleyici, tek fonksiyon:
- `list_public_spaces(p_owner uuid, p_prompt uuid, p_limit, p_offset)`; `list_spaces` ile AYNI satır biçimi (istemci aynı eşlemeyi kullanır).
- SECURITY INVOKER: `spaces`/`space_items` RLS'i (`can_read_space`, engel iki yönlü) çağıranın gözüyle uygulanır. Fonksiyon yalnız "herkese açık + arşivlenmemiş" süzer.
- Özel, bağlantılı ve arşivli Space, ÜYESİ olunsa bile listeye girmez (vitrin). Süzgeçsiz çağrı boş döner (genel liste `list_spaces('public')`).
- `anon` + `authenticated` EXECUTE; `public` kaldırıldı.

**Arayüz:**
- **Profil "Spaces" sekmesi:** kişinin herkese açık Space'leri, Albüm kartlarıyla; hiç yoksa sekme yok. Sahibine de aynı vitrin gösterilir (kendi özel Space'leri `/spaces`'te).
- **Prompt detayı "Bu prompt şu Space'lerde":** "Hakkında" sütununda, prompt'u (prompt kartı ya da görseli olarak) içeren herkese açık Space'ler (en çok 6; kapak, ad, sahip, sayılar, palet çizgisi). Hiç yoksa blok çizilmez.
- Hata sessizce boş liste olur: vitrin ek bilgidir, sayfanın geri kalanını bozmaz.

**Bilerek yapılmayanlar:** Keşfet'te Spaces bölümü, aramada Spaces sekmesi, akışta Space gönderisi/şeridi, topluluğa Space başvurusu, `/share/space/…` önizleme sayfası, mesajla paylaşım.

## 5. Aynı daldaki önceki düzeltmeler (aynı oturum)

- **Alt menü ve detay eylem satırı artık saydamlaşmıyor:** aşağı kaydırınca `[data-app-nav]` ve `[data-detail-dock]` %50 opaklığa inmiyor, yerinde olduğu gibi kalıyor (`globals.css`); üst menü eskisi gibi kayıp gidiyor (208'in saydamlık kararı geri alındı). `run-detail-pages` 4c buna göre güncellendi.
- **Topluluk kapağı:** topluluk bandının üstündeki ayrı kapak şeridi (`DetailBand before`) kaldırıldı; kapak fotoğrafı artık yalnız bandın bulanık, yarı saydam arka planı (`backdrop`).

## 6. Testler

| Katman | Kapsam | Sonuç |
|---|---|---|
| Yerel PostgreSQL `space-discovery.sql` | prompt'a göre: yazar / özel Space üyesi / sahip yalnız herkese açık + arşivsizi görür; engellenen hiçbir şey görmez; ziyaretçi çağırır, kişisel alanlar boş; sahibe göre; süzgeçsiz boş; kesişim; özele çekilince düşer; INVOKER + yetkiler | 14/14 |
| `spaces.sql` (değişmedi) | — | 59/59 |
| Playwright `run-spaces` 25–28 | ziyaretçi vitrini (Görseller açılır, Genel bakış/Notlar yok, "Panoyu gez", bant paleti HEX kopyalar, Paylaş adresi verir); sahip: bant paleti, ⋮ → Sabitle, kartta palet çizgisi + Sabitli, "Sabitli" süzgeci; prompt detayı yalnız herkese açık + arşivsiz Space'i listeler ve açar; profil sekmesi yalnız herkese açık olanlar, yoksa sekme yok | 28/28 (1–24 yeni düzene göre güncellendi) |

## 7. Uygulama adımları

1. Migration'ı canlıya uygula (`20260921140000_space_discovery.sql`, tek işlem) ve `supabase_migrations.schema_migrations`'a dosya sürümüyle kayıt düş.
2. İstemciyi yayınla.
