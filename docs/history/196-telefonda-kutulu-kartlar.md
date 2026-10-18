# 196 — Telefonda da kutulu gönderi kartları (Faz 6 eki geri alındı)

**Durum:** uygulandı (yalnız istemci kodu, veritabanı yok). Ağ taklitli Playwright'ta sınandı; gerçek telefonda denenmedi.

## Neden
`190-*` → "Faz 6 eki — telefonda tek görünüm": tutarsızlığı gidermek için telefonda bütün gönderi listeleri kenardan kenara, çizgiyle ayrılmış düz satır yapılmıştı (tablet/masaüstü kutulu kalmıştı). Kullanıcı telefondaki eski görünümü istedi — "daha önce de böyleydi, tablet ve masaüstünde zaten öyle": her ekranda kutulu kart.

## Yapılan
- `ContentCard` (`features/content/content-card.tsx`): kart yüzeyi tek — yuvarlak köşe + ince kenarlık + hafif gölge + hover. `SurfaceContext` (`card` | `responsive`) kaldırıldı.
- `ContentGrid`: telefonda tek sütun kutulu kartlar (sayfanın 12px kenar boşluğunu korur — artık `-mx-3` ile iptal edilmez), `sm`+ CSS sütunları; `CONTENT_GRID_ITEM_CLASS` = `break-inside-avoid pb-3 sm:pb-4` (kutular arası 12px telefonda, 16px `sm`+).
- İskelet (`PromptCardSkeleton`/`PromptCardSkeletonGrid`): aynı kutulu yüzey; `responsive` bayrağı kalktı.
- Topluluk akışı bağlam satırı (`FEED_ITEM_CONTEXT_CLASS`): her ekranda kutunun ÜSTÜNDE (önceden telefonda satırın içindeydi).
- Kartın iç yerleşimi (`ContentCardPost`) değişmedi: tablet/masaüstünde olduğu gibi.

## Sınama
`tsc`, `lint`, `npm test`, `next build`; `run-community-home`, `run-communities`, `run-community-posts`, `run-detail-pages`, `run-groups`, `run-chat`, `run`, `run-profile-collections`, `run-shared-cards` (aşağıdaki sonuçlar raporda). Çeviri: yeni metin yok.

## Ek — kartın iç yerleşimi (kullanıcının örnek görseli, her ekranda)
Kullanıcı kutulu yüzeyin yanında örnek görseldeki iç düzeni de istedi ("hem telefona hem diğer ekranlara"):
- `ContentCardPost` (`features/content/content-card.tsx`) yeniden düzenlendi: kimlik bloğu (avatar · kalın ad · altında "@kullanıcı · zaman" · ⋮) → TAM GENİŞLİKTE içerik türü satırı → başlık/gövde → ince ayırıcı çizgi → eylem satırı. Eski düzende gövde avatar sütununa girintiliydi, ad ve "@kullanıcı · zaman · tür hapı" tek satırdı, eylem satırı girintiliydi.
- `ContentTypePill`: hap yerine renkli simge karosu (24px, `primary-soft`) + etiket (`Metin Prompt`). Durum/Başvuru/Sabit rozetleri aynı satırda yanında.
- Eylem sırası: Beğeni · Yorum · Kaydet · İstatistik solda, Paylaş tek başına sağda (`PromptCardFooter`, `RequestCard` [Beğeni · Yorum · Yanıtlar · İstatistik · Paylaş], `ApplicationCard`).
- Kart başlığı biraz büyüdü (1.1875rem, kalın); iskelet yeni yapıyı yansıtır.
- Sınama: `run-community-home` 38, `run-communities` 65, `run-community-posts` 36, `run-detail-pages` 44, `run-groups` 36, `run-chat` 38, `run` 24, `run-profile-collections` 4, `run-shared-cards` 11 — hepsi geçti; `tsc`/`lint` temiz; 390px ve 1280px ekran görüntüsüyle örnek görsele karşı bakıldı. Çeviri: yeni metin yok. Gerçek telefonda denenmedi.
