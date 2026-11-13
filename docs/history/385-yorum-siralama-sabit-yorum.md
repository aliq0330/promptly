# 385 — Yorum sıralaması, sabit yorum, "yeni yorum" hapı

Gönderi sayfalarındaki yorumlar (Prompt · İstek · Workflow · Ayar paketi · Space · alıntı · başvuru gönderisi · sonuç) ve Odak'ın yorum sayfası aynı `useCommentThread` mantığını kullanır; bu bölüm onu genişletir. Kullanıcı üç mockup yönünden (A sade sıralama çipleri · B kartlı + sabit yorum · D telefon alt sayfa) önerilen birleşimi seçti; C'nin (özet + süzgeç sekmeleri) kapsamı yapılmadı.

## Eskiden
Üst düzey yorumlar HEP eskiden yeniye gelirdi, sıralama seçeneği yoktu; liste kısa açıldığında yalnız en eski 3 yorum görünür, yeni yazılan yorum en altta kalırdı.

## Şimdi
- **Sıralama** (`lib/comment-sort.ts`, `CommentSort` = `newest` | `liked` | `oldest`): VARSAYILAN **en yeni üstte**. Sıra sunucuda uygulanır (`fetchCommentThreadPage(scope, offset, limit, sort)`: `order pinned_at desc nulls last, [like_count desc,] created_at, id`), istemci sayfaları birleştirince aynı karşılaştırıcıyla (`compareTopLevel`) dizer — ikisi aynı kuralı izler. **Yanıtlar her sıralamada eskiden yeniye** okunur (konuşma öyle anlaşılır). Kontrol: **tablet ve masaüstünde satır içi çipler** (En yeni · En beğenilen · En eski; açılır kutu/pencere YOK), **yalnız telefonda** (`< sm`) tek hap + alt sayfa (mevcut `SectionMenu`; yeni bir menü yazılmadı); ikisi CSS ile değişir. Yalnız 2+ üst düzey yorum ya da sonraki sayfa varken görünür. Sıra değişince liste baştan yüklenir.
- **Sabit yorum:** içerik sahibi (prompt/istek/workflow/ayar paketi yazarı) TEK bir üst düzey yorumu sabitler; sabit yorum her sıralamada başta, "Sabitlenmiş yorum" etiketiyle ve vurgulu zeminde. Yazma yalnız `set_comment_pinned` RPC'si (SECURITY DEFINER; içerik sahibi dışına `pin_not_allowed`, yanıt `pin_top_level_only`, silinmiş yorum `comment_deleted`); `pinned_at`'i istemci doğrudan yazamaz (BEFORE INSERT/UPDATE bekçisi `prompt_comments_pin_guard`, işlem-yerel `promptly.comment_pin`); hedef başına tek sabit RPC'yle ve kısmi benzersiz dizinlerle (4 hedef) garanti; yorum silinince (soft-delete dahil) sabit kendiliğinden kalkar. Kapsam dışı: topluluk gönderisi, Space, alıntı, kullanıcı sonucu (sahiplik kuralı ayrı).
- **"Yazar" rozeti:** içerik sahibinin kendi yorumunda (`contentOwnerId`; `EngageComments ownerId` yalnız içeriğin kendi yorumlarında geçilir, başvuru/alıntı gönderisinde geçilmez).
- **"N yeni yorum · göster" hapı:** başkalarının yüklü listeden SONRA yazdığı yorumlar (`countNewComments`, `head` sayımı) 45 sn'de bir yoklanır — sekme görünürken, Realtime YOK (pin yorumlarındaki yoklama kalıbı); tıklayınca liste yeniden yüklenir. Kendi yorumun saymaz (iyimser eklenir).

## Teknik notlar
- Migration `20261124100000_comment_pin.sql` (yalnız ekleyici: sütun, 4 kısmi dizin, tetikleyici, RPC). Uygulanıp uygulanmadığına `schema_migrations`'tan bak.
- `server-errors.ts`: `pinned_at` `OPTIONAL_COLUMNS`'a girdi (migration gecikirse yorumlar yine açılır); eksik isteğe bağlı sütun artık `order` parametresinden de düşer (`pinned_at.desc.nullslast`). Yeni hata kodları (`pin_not_allowed`, `pin_top_level_only`) `INLINE_ONLY`.
- Odak yorum sayfası da en yeni üstte açılır ve sabit yorum/Yazar rozetini gösterir; sabitleme düğmesi orada YOK (`contentOwnerId` verilmez).
- Çeviriler `translations-comment-order.ts` (TR+EN; `node scripts/build-i18n.mjs`).

## Doğrulama
`tsc`, `eslint` (0 hata), `npm test` (yeni `comment-sort.test.ts`), yerel PostgreSQL `supabase/tests/comment-pin.sql` 10/10, ağ taklitli `run-comment-order.mjs` 9/9. Varsayılan sıra değiştiği için `run-detail-pages` 3, `run-comment-reactions`, `run-report-modal` 9, `run-works-badges` 5 "ilk görünen yorum artık en yeni" olacak şekilde güncellendi; `run-comment-extras`, `run-space-comments`, `run-community-posts`, `run-focus-feed`, `run-notifications`, `run-quotes`, `run-pagination` değişmeden geçti.

## Yapılmadı / sınırlar
- **"Önerilen" sıralama** (tepki + tazelik + yazar yanıtı) yapılmadı: sunucuda ayrı bir puan ve imleç ister; mockup'ta vardı.
- **Telefonda alta sabit yazma çubuğu** ve "Çalıştı / Çalışmadı" hızlı çipleri yapılmadı (alt menü/klavye kuralları ve `set_prompt_works` yüzeyiyle birlikte ayrı iş).
- C yönü: özet kartı, yorumlardaki sonuç görselleri şeridi, süzgeç sekmeleri, yorum içinde arama yapılmadı.
- Sıra "En beğenilen"de sayfalama offset'lidir; yeni tepki gelince sayfalar arasında bir yorum yer değiştirebilir (akış keyset'i kadar sağlam değil).
- Gerçek Supabase/cihaz DENENMEDİ; gerçek tarayıcıda yalnız ağ taklitli Chromium. Sabit yorum için bildirim yazılmadı.
