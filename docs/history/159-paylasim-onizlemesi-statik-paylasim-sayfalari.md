# 9.159 — Paylaşılan linklerde önizleme (statik paylaşım sayfaları)

Durum: uygulandı (kod); canlıya deploy edilmedi — `main`'e birleşince Pages derlemesiyle yayınlanır. Migration yok.

## Sorun

Detay sayfaları `/prompts/local?id=…` gibi istemci tarafında oluşan rotalar; WhatsApp/X/Discord gibi tarayıcılar yalnızca site genelindeki kartı görür. Prompt platformunda büyüme paylaşımla olur.

## Neden Edge Function DEĞİL

İlk öneri "Edge Function `?id=` alıp OG meta'lı HTML döner" idi. Supabase dokümanına göre (Edge Functions → Limits) **özel alan adı olmadıkça `text/html` yanıtları `text/plain`'e çevrilir**; bu projede özel alan adı yok, yani tarayıcılar HTML görmez. Yaklaşım terk edildi.

## Yapılan: derleme zamanı statik paylaşım sayfaları

- `src/lib/share-catalog.ts` derleme sırasında anon anahtarla PostgREST'ten **herkese açık** içeriği okur (prompt, istek, workflow, hazır ayar, profil). `feed_page`'in görünürlük koşulları sorguda AÇIKÇA yazılıdır (yayımlanmış + public, taslak değil, silinmemiş); RLS bunun üstüne ayrıca işler. Sorgu oluşturucu saf ve testlidir — özel/taslak içeriğin meta'ya sızmaması bir testle kilitlidir.
- `src/app/share/[kind]/[id]/page.tsx`: `generateStaticParams` + `generateMetadata` ile her satır için `/share/<tür>/<anahtar>/` (profil için `username`) üretilir: kendi başlığı, açıklaması (200 karaktere kırpılır, HTML kaçışlı), canonical, `og:*`/`twitter:*`. Sayfa gövdesi ziyaretçiyi gerçek detay sayfasına yönlendirir (görünür "Promptly'de aç" bağlantısı yedekte).
- **Derleme asla düşmez:** katalog "best-effort"tür. Supabase 500 dönse de, ulaşılamasa da derleme başarılı olur (yer tutucu `/share/prompt/_/` üretilir, sitemap bozulmaz). (Env hiç yokken derleme düşmesi mevcut, bu değişiklikten önceki davranıştır — uygulamanın kendi Supabase env kontrolü.)
- **Yeni içerik:** derlemeden sonra yayınlanan içeriğin sayfası yoktur; GitHub Pages `404.html` verir. Yeni kök `not-found.tsx` (`NotFoundForwarder`) `/share/<tür>/<anahtar>` adreslerini gerçek detay sayfasına yönlendirir (önizleme olmadan ama link çalışır); diğer bilinmeyen yollar TR/EN "bulunamadı" gösterir.
- Sayfaların güncel kalması için `deploy.yml`'e `schedule` (her 6 saatte bir) eklendi; `concurrency`/secrets değişmedi.
- `sitemap.xml` artık her paylaşım sayfasını da listeler.

## Paylaşım noktaları (hepsi aynı yardımcıdan geçer)

`shareLinkForHref` (saf) detay href'ini paylaşım adresine çevirir; eşleşmeyen href değişmeden kalır.
- `shareOrCopyLink` (`share-button.tsx`): Paylaş penceresinin "Diğer uygulamalarla paylaş"ı (kart, detay, Odak görünümü) **ve** profil Paylaş düğmesi.
- `PostMenu` "Linki kopyala".
- **Bilerek DEĞİŞMEDİ:** mesajlardaki workflow/hazır ayar paylaşım satırları (`workflow-share-format.ts`, `preset-share-format.ts`) — mesaj kartı bu satırı `/workflows/local?id=` deseniyle ayrıştırıyor; URL değişirse kart bozulur. Kullanıcı Sonucu (result) paylaşımı da değişmez (paylaşım sayfası yok).

## Sınırlar (dürüstçe)

- **Görsel yok:** gönderi medyası PRIVATE bucket'ta (imzalı URL 10 dk), bu yüzden `og:image` her sayfada site kartıdır (`/og.png`); içeriğe özel başlık/açıklama gelir, görsel gelmez.
- **Gecikme:** yeni içeriğin önizlemesi bir sonraki derlemeye (en geç 6 saat) kadar yoktur; o arada link çalışır ama genel kartla görünür.
- Yayındaki gerçek sosyal ağ tarayıcılarıyla (WhatsApp/X/Facebook debugger) DENENMEDİ; çıktı HTML'i ve yönlendirmeler yerelde doğrulandı.

## Doğrulama

`npm test` (share-link 7, share-catalog 4 yeni test; toplam 205), `tsc`, `lint` (0 hata), `build`. Sahte Supabase REST sunucusuna karşı derleme: 6 sayfa üretildi, özel karakterli başlık kaçışlı, sitemap'te 6 girdi, gönderilen sorgularda gizlilik filtreleri var. Tarayıcıda (Playwright, GitHub Pages benzeri 404 davranışıyla): var olan paylaşım → detay; **sayfası olmayan yeni içerik → 404 → detay**; profil → profil; bilinmeyen yol → "Not found"; 9 ana sayfa duman testi hatasız.
