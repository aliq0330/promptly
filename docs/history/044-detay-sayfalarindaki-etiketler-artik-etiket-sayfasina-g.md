### 9.44 Detay sayfalarındaki etiketler artık etiket sayfasına gidiyor

Kullanıcı bildirimi: `/prompts/local`, `/requests/local` ve `/generators/local`
sayfalarındaki etiket rozetleri düz `Badge` idi, tıklanınca hiçbir yere
gitmiyordu. Üçü de artık Keşfet'in "Popüler Etiketler"iyle aynı desende
`<Link href={tagHref(tag)}>` ile sarılı (`/tags/local?tag=<slug>`) ve hover'da
`bg-accent-surface` alıyor. Değişen dosyalar: `prompt-detail-view.tsx`,
`request-detail-view.tsx`, `generator-detail-view.tsx`. Kartlardaki (feed)
etiket rozetlerine dokunulmadı — onlar kartın stretched-link'inin altında,
tıklama kart detayına gidiyor. Doğrulama: `tsc`, `lint`, `build` (placeholder
Supabase env ile) temiz; tarayıcıda tıklama testi yapılmadı.
