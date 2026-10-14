# 9.161 — Etiket takibi + Ana sayfada "Etiketlerim"

Durum: uygulandı. Migration `20260919860000_tag_follows.sql` **canlıda uygulandı** (kayıt dosya sürümüyle düşüldü); arayüz kodu `main`'e birleşince yayınlanır (migration önce, kod sonra sırası korundu).

## Ne

Kullanıcı kişiyi değil konuyu takip edebilir: etiket sayfasında **Takip Et**, Ana sayfada yeni **Etiketlerim** sekmesi (takip ettiği etiketlerden herhangi biriyle etiketli herkese açık prompt, istek, workflow ve hazır ayar), etiket dizininde (`/tags`) **Takip ettiğin etiketler** bölümü.

## Veritabanı

- `tag_follows (user_id, tag_slug)`: RLS yalnızca sahibi okur / ekler (`with check auth.uid() = user_id`) / siler; kullanıcı başına en fazla **100** etiket (`enforce_tag_follow_limit`, hata metni `tag_follow_limit`); profil ya da etiket silinirse takip cascade ile gider.
- `feed_page`: **aynı 11 argümanlı imzayla** `create or replace` (drop yok; 10 argümanlı sarmalayıcı, grant'lar ve diğer kapsamlar değişmedi). Yeni kapsam `p_scope = 'tags'`; oturum yoksa `auth.uid()` null olduğundan boş döner. Kapsam, kolun kendi etiket tablosuyla (`prompt_tags`, `prompt_request_tags`, `workflow_tags`, `preset_tags`) eşleştirir. Önceki sürüme göre fark yalnızca 11 satırdır (diff ile doğrulandı): parametre, `followed_tags` CTE'si ve dört koldaki birer koşul.

## Arayüz

- `lib/supabase/tag-follows.ts`: `fetchFollowedTags`, `followTag` (çift takip hata değil, limit → `TagFollowLimitError`), `unfollowTag`.
- `features/tags/followed-tags-store.ts` (`useFollowedTags`): kullanıcı başına bir kez yüklenen, tüm bileşenlerin paylaştığı depo; `toggle` iyimser ve hatada geri alır (limit / başarısız ayrımıyla). Etiket sayfası, Ana sayfa ve `/tags` aynı durumu görür.
- `TagFollowButton`: kişi takibinin `FollowButtonView`'ünü yeniden kullanır (misafir ortak giriş istemini görür); limit/hata durumunda mesaj gösterir.
- Ana sayfa (`FeedTabs`): 4. sekme `home.tabTags`. Misafir → giriş istemi (istek atılmaz); oturumlu ve hiç etiketi yok → "Henüz etiket takip etmiyorsun" + "Etiketlere göz at"; etiketi var ama içerik yok → "Takip ettiğin etiketlerde henüz içerik yok". `feed.ts` `FeedScope` = `"all" | "following" | "tags"`.
- Metinler TR+EN (`translations.ts`), yeni anahtar: `home.tabTags`, `feed.emptyTags*`, `feed.goToTags`, `tag.followLimit/followFailed/followedHeading`; `common.follow/unfollow` yeniden kullanıldı.

## Etki alanı taraması

Etiket sayfası ✔, Ana sayfa sekmeleri ✔, etiket dizini ✔. `feed_page`'in diğer tüketicileri (Keşfet, Ana sayfa "En yeni/Popüler/Takip") `tags` kapsamını geçmez; davranışları değişmedi (canlıda sınandı). Karttaki etiket rozetlerinde takip düğmesi yok (bilinçli: kalabalık). Arama (`search_content`) etiket takibinden etkilenmez.

## Doğrulama

Yerel PostgreSQL 16: bütün migration'lar baştan oynatıldı; `tags` kapsamı (yalnız takip edilen etiketler; taslak/özel/etiketsiz/takip edilmeyen dışarıda), başkası adına ekleme/silme reddi, misafir boş, 10 argümanlı sarmalayıcı, `oldest` + `p_open_only` + `p_kinds` birlikte, limit 100'de tetikleme, etiket silinince cascade. Canlıda: yapı/RLS/trigger/kayıt, `feed_page` Ana sayfa çağrısı 50, açık istek 30 (gerileme yok), misafir `tags` = 0. Tarayıcı (Playwright, durumlu sahte Supabase, 10 senaryo): misafir giriş istemi, takip/bırakma yükleri, limit mesajı, hata geri alma, Ana sayfa sekmesi üç durumda, `/tags` bölümü, 360px'te yatay taşma yok. Gerçek Supabase'e karşı gerçek oturumla uçtan uca DENENMEDİ.
