# 296 — Çalıştırılabilir Workflow (otomatik zincir) + "Çalıştı mı?" oyu (Promptly Skoru'nun ilk dilimi)

**Durum:** uygulandı (repoda). Migration `20261101120000_prompt_works_votes.sql` canlıya UYGULANMADI (deploy hattı `main`'e birleşince uygular).
`npx tsc --noEmit`, `eslint` (yeni dosyalarda 0 hata), `npm test` **618/618** (yeni: `prompt-works` 4, `workflow-auto-run` 9), `npm run build` (sahte Supabase değişkenleriyle) temiz.
Yerel PostgreSQL 16'da `supabase/tests/prompt-works.sql` **23/23**. Ağ taklitli Playwright: yeni `run-prompt-works.mjs` **11/11**, `run-workflow-auto.mjs` **11/11**.
**Gerçek bir modele (Gemini/OpenAI) ve gerçek Supabase'e KARŞI DENENMEDİ**: sağlayıcı uçları `context.route` ile taklit edildi; gerçek yanıt biçimi/hata/oran sınırı davranışı, gerçek oy akışı, gerçek cihaz/iOS Safari denenmedi.
İngilizce karşılıkları eklendi (`translations-works.ts`, `translations-workflow-auto.ts`, güncellenen `workflow.run.intro`).

## Ürün kararı: "Workflow model çalıştırmaz" kuralı DEĞİŞTİ
CLAUDE.md Bölüm 1 "Workflow … model çalıştırmaz" diyordu. Kullanıcı kararıyla (2026-11-01) kural şuna döndü: **Promptly SUNUCUSUNDA model çalışmaz; isteyen kişi metin
adımlarını kendi API anahtarıyla TARAYICIDAN çalıştırabilir.** Anahtar sunucuya/Supabase'e gitmez (Bölüm 7 aynen geçerli: Studio ile aynı `key-store`/`providers`),
maliyet kişinin kendi hesabına yazılır. Elle "Adım adım" modu duruyor; otomatik çalıştırma onun ÜSTÜNDE ve AYNI durumu kullanır.

## 1) Çalıştırılabilir Workflow
- **Panel**: "Adım adım" modunun içinde, kapalı başlar ("Otomatik çalıştır"): sağlayıcı (Gemini/OpenAI) + model (anahtar varsa sağlayıcının kendi listesi, yoksa güvenli varsayılan) + API anahtarı
  (isteğe bağlı "bu cihazda hatırla"), plan notu ("N model çağrısı yapılacak" + zincirin nerede duracağı), Çalıştır/Devam et/Baştan çalıştır/Durdur, adım durum listesi.
- **Zincir kuralları** (saf `lib/workflow-auto-run.ts`, enjekte edilebilir bağımlılıklarla birim testli): yalnız **yayında + metin türünde Prompt adımı** çalışır ve en az bir çıktısı tanımlı olmalı. Adımın çıktısı
  o adımın İLK çıktı alanına yazılır (elle yapıştırılmış gibi), ona bağlı sonraki adım girdi olarak okur; modele giden metin = prompt + "Etiket:\ndeğer" girdi blokları. **Çalışamayan adımda
  (istek, görsel/ses/video, yayında olmayan, içeriksiz, çıktısız) zincir DURUR**; kişi o adımı elle yapıp çıktıyı yapıştırınca "Devam et" kaldığı yerden sürdürür (biten ve elle yapılan adımlar yeniden çağrılmaz).
  **Bağlı bir girdinin kaynağı boşsa model çağrılmaz** (eksik girdiyle para harcanmaz). İlk hatada durur; "Durdur" çalışan çağrıyı keser, o adımın sonucu yazılmaz, bitenler korunur.
- **Değişkenler**: değişkenli promptlar varsayılan değerleriyle çalışır; varsayılanı olmayan görünür değişken adımı model çağrılmadan "elle çalıştır" hatasıyla durdurur (adım başına değer girişi bu dilimde YOK).
- Hata sınıfları Studio ile ortak (`generate.err*`) + zincire özgü (prompt yüklenemedi, değişken, boş girdi). Anahtar yalnız sağlayıcı adresine ve başlıkta gider; test, Promptly/Supabase isteklerinin hiçbirinde bulunmadığını doğrular.

## 2) "Çalıştı mı?" oyu (Promptly Skoru'nun ilk dilimi)
- **Veri**: `prompt_works_votes` (kişi başına prompt başına tek oy, istemciye KAPALI) + `prompt_works_stats` (evet/hayır; SECURITY DEFINER tetikleyici, `reaction_stats` kalıbı; okuma = o promptu okuyabilen).
  RPC'ler: `set_prompt_works(prompt, works|null)` ve `prompt_works_state(prompt)` (sayılar + oyum + `can_vote`; ziyaretçiye de açık).
- **Kötüye kullanma önlemleri (sunucuda)**: oy veren o promptu GERÇEKTEN kopyalamış olmalı (`prompt_copy_events`: oturumlu, yazar sayılmaz), yazar kendi promptuna oy veremez, engelleme iki yönlü, askı/paylaşım engeli
  (`enforce_can_post`), saatte 30 oy (`enforce_rate_limit`), yalnız yayında + herkese açık + topluluğa ait olmayan prompt. Kodlar: `not_found`, `self_vote_not_allowed`, `copy_required`, `interaction_blocked`, `rate_limit`.
- **Arayüz**: prompt detayında "Prompt metni"nin altında `PromptWorksVote`. Oy verebilen: "Çalıştı / Çalışmadı" (aynı düğmeye tekrar basmak geri alır); kopyalamamış oturumlu: "önce kopyalayıp dene" ipucu; ziyaretçi/yazar: oy yoksa blok hiç çizilmez,
  oy varsa yalnız sayılar. Kopyalama kaydı yazılınca blok kendini yeniler (`PROMPT_COPIED_EVENT`). **Az oyla yüzde gösterilmez** (<5 oy); "Kanıtlanmış" rozeti ≥10 oy VE Wilson alt sınırı ≥ 0.7 ister (3/3 "%100" kanıt değildir).

## Test bulgusu (düzeltildi)
SQL testi gerçek bir hatayı yakaladı: oy almış bir prompt SİLİNİRKEN kaskad oy silme tetikleyicisi, silinmekte olan prompta sayaç satırı eklemeye çalışıp yabancı anahtar hatası veriyordu (prompt silme bozulurdu).
`_works_bump` azaltma yolunda artık yalnız günceller, satır eklemez; test 22 bunu korur.

## Sınırlar / açık
- **Skor sıralamaya GİRMEDİ**: Keşfet/Sana özel/arama hâlâ beğeni+kopyalama+tazelik kullanır; "Kanıtlanmış" sıralaması/süzgeci `feed_page`'e ayrı bir iş (eski çağıranları kırmadan, `221-*` kuralı).
  Oy veren hesabın yaşı/yeterliliği gibi ek sahtecilik kontrolleri yok (yalnız gerçek kopyalama + hız sınırı + tek oy).
- Zincir bu dilimde yalnız **metin → metin**, tek sağlayıcı seçimi, değişken değeri girişi yok; görsel/ses/video adımları elle. Zincir sonucunu tek tıkla "workflow sonucu" olarak paylaşma yok. Çok adımlı çağrı maliyeti yalnız
  "N model çağrısı" notuyla uyarılır (token/ücret tahmini yok). Sağlayıcı bildirimi/ücreti tamamen kişinin hesabındadır.
- Yaratıcı paneline (`/insights`) "çalıştı oranı" henüz eklenmedi; oylar o sayfada görünmez.
