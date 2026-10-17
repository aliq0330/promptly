# 190 — Meydan yeniden tasarımı, Faz 1 (tema + kabuk + Ana Sayfa)

**Durum:** istemci kodu repoda; `20260920140000_meydan_palette.sql` repoda, **canlıya UYGULANMADI**. Ağ taklitli Playwright ekran görüntüleriyle (açık/koyu, 1440/390) bakıldı; gerçek Supabase'e, oturuma ve cihaza karşı denenmedi.

## Karar

Kullanıcı, mevcut ekranların ekran görüntüleri ve üç tasarım yönü (A · Galeri, B · Atölye, C · Meydan; tuval: claude.ai artifact "Promptly Yeniden Tasarım") arasından **C · Meydan**'ı seçti: parlak, sosyal akış, topluluk öncelikli. Faz 1 temeli ve Ana Sayfa'yı kapsar; Keşfet, Profil ve Topluluk sayfaları sonraki fazlarda bu temele göre yeniden düzenlenecek.

## Yapılanlar

**Tema (`globals.css`, `layout.tsx`, `theme-provider.tsx`)**
- Yeni palet `meydan`: beyaza yakın zemin, kobalt birincil (`#2f5bea`, koyu modda `#7d9bff`), sıcak turuncu ikincil (`#c2531f` / `#ff9a6b`; topluluk halkaları, küçük vurgular). İki modda da tam token seti; metin/zemin çiftleri AA ≥ 4.5:1 (birincil metin `primary-soft` üstünde ≈ 4.9:1).
- **Varsayılan palet artık `meydan`** (`DEFAULT_PALETTE`, `:root:not([data-palette])`). Diğer beş palet seçilebilir kalır; daha önce palet seçmiş hesaplar kendi seçimlerini korur.
- Yazı tipleri: gövde **DM Sans**, başlıklar/wordmark **Bricolage Grotesque**, prompt metni JetBrains Mono (değişmedi). Newsreader (serif) kaldırıldı; `--font-serif` artık display yüzünün takma adı, böylece mevcut `font-serif` kullanımları kırılmadı. `text-display/h1/h2` display yüzünde, 700 ağırlık, daha sıkı harf aralığı.
- Köşe yarıçapı: `md` 12px, `lg` 16px (kartlar), `xl` 22px. `Button` artık hap biçimli (`rounded-full`, `font-semibold`).

**Kabuk**
- Yan menü: 44px öğeler, 15px etiket, etkin öğe = yumuşak birincil hap (`bg-primary-soft text-primary`, kenar çubuğu yok), "Oluştur" tam genişlik hap. Wordmark display yüzünde.

**Ana Sayfa (`app/(app)/page.tsx`)**
- Tek sosyal sütun (≤640px) + `xl`'de 320px sağ sütun (`HomeRail`): haftalık tema, **Gündemde** (`trending_tags`, yalnız gerçek veri), **Takip etmeyi dene** (en çok takipçili profiller, kendin hariç, `FollowButton`). Boş/başarısız blok gizlenir. `xl` altında haftalık tema sütunun içine iner.
- Oturumlu kullanıcıda karşılama kartı yerine **paylaşım satırı** (avatar + "Bugün ne ürettin?" alanı → `/create?mode=prompt` + Prompt paylaş / İstek aç).
- **Topluluk halkaları** (`CommunityRings`): `list_my_communities('member')`; okunmamış etkinliği olan topluluk turuncu halkalı, son öğe "Topluluk bul" → `/communities/all`. Yalnız üyeye; hata olursa şerit gizlenir.
- Akış `layout="stream"`: tek sütun kartlar (`FeedGrid`), tam genişlik eşit alt çizgili sekmeler, altında tür çipleri + kompakt Filtre (`ListToolbar stream`); akışta Kart/Odak seçimi yok (her zaman kart).

**Kartlar**
- `PromptCard` artık prompt metnini ortak mono blokta gösterir (`PromptPreviewBox`, 3 satır, "Kopyala" → `record_prompt_copy`). Önceki "prompt metni kartta yok" kararı Meydan ile değişti. Bu, prompt kartı kullanılan her listeyi etkiler.

**Veritabanı**
- `20260920140000_meydan_palette.sql`: `profiles_theme_palette_check` kısıtına `'meydan'` eklenir (yalnız kısıt genişletme; satırlara dokunmaz, `mono` migration'ıyla aynı kalıp). **Uygulanana kadar**: başka paletten Meydan'a dönen oturumlu kullanıcının tercihi hesaba yazılamaz (yerelde/tarayıcıda yine uygulanır). Palet hiç seçmemiş hesaplar etkilenmez (varsayılan zaten Meydan).

## Çeviri
Yeni metinlerin hepsi `translations.ts`'te TR+EN: `home.composerPlaceholder`, `home.rings*`, `home.rail*`, `settings.palette.meydan`.

## Denenmedi / açık
- Migration canlıya uygulanmadı.
- Gerçek Supabase/oturum/cihaz; `list_my_communities` ve `trending_tags` canlı yanıtları (taklitle bakıldı).
- Faz 2+: Keşfet (arama + tür kutuları + önerilen topluluklar), Profil (ortalanmış başlık, koleksiyon halkaları, kare ızgara), Topluluk (banner, hap sekmeler, sağ sütun), mobil Ana Sayfa'da kompakt halkalar.
