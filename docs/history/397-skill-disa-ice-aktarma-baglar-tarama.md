# 397 — Skill: dışa/içe aktarma, Skill bağları, oyda araç etiketi, betik risk taraması

**Durum:** uygulandı (kodlandı; yerel PostgreSQL + ağ taklitli testle sınandı; gerçek Supabase/cihaz DENENMEDİ). Migration'lar `20261201120000_import_skills.sql`, `20261201130000_skill_links_and_works_tools.sql` (ikisi de yalnız ekleyici, yıkıcı ifade yok).

## `promptly.skills` dışa/içe aktarma
- Biçim `lib/exchange/content-format.ts`'te `skill` türüdür (zarf `promptly.skills`, `schemaVersion`): yalnız başlık, özet, talimat, uzmanlık alanı, uyumlu araç, lisans. Paket dosyaları/betikler, sürüm, durum, görünürlük, yazar, sayaç dosyaya YAZILMAZ ve içe aktarırken ALINMAZ.
- İçe aktarma YALNIZ `import_skills(p_items, p_dry_run)` RPC'sidir (INVOKER: RLS, askı ve hız sınırı [Skill saatte 20] atlanmaz; önce doğrula sonra tek işlemde yaz; sonuç hep çağıranın ÖZEL TASLAĞI; aynı başlık + talimat `duplicate`; dosya ≤ 20 Skill; slug başlıktan türer, çakışırsa `-2`…). Ziyaretçiye kapalı.
- Arayüz: İçeriklerim → Skill'ler sekmesinde İçe aktar / Dışa aktar (ortak `ExportContentModal`/`ImportContentModal`). Kişisel API (`/me`) Skill'i kapsamaz (`MeContentKind` Skill'i dışlar).

## Skill ↔ Skill bağları
`skill_links` ayrı tablodur (`skill_relations` değişmedi: onun hedef türü yorum eki kümesini paylaşır). Yalnız sahibi bağlar; hedef yayında + herkese açık (`quote_target_ok`); kendine bağlanamaz; en çok 10; hedef gizlenirse kartı RLS'le düşer, silinirse bağ CASCADE gider. Düzenleyicide "Birlikte kullanılan Skill'ler", detayda aynı adlı bölüm.

## "Çalıştı mı?" oyuna araç etiketi (kullanım değerlendirmesi)
`skill_works_votes.tool` (oy tablosu istemciye kapalı kalır) + `set_skill_works_tool` (yalnız KENDİ oyun) + `skill_works_by_tool` (ziyaretçiye açık toplam). Oy sonrası "Hangi araçta denedin?" seçimi ve araç başına "N çalıştı · M çalışmadı" satırı. Sürüm etiketi YOK: oy zaten Skill'in en son kullandığın sürümüne ait değil, Skill'e aittir.

## Betik risk taraması
`scanScriptRisks` (`package-validate.ts`, saf): 7 kalıp (indirip kabuğa verme, ağ çağrısı, yıkıcı silme, dinamik çalıştırma, yetki yükseltme, kimlik bilgisi dosyaları, gizlenmiş içerik). Sonuç `manifest.files[].risks`'e yazılır; detayda dosya satırında rozet + "kesin değildir; temiz çıkması güvenli demek değildir" notu. Yayını ENGELLEMEZ, hiçbir şey sunucuda çalıştırılmaz. Edge `skill-package` kopyası `sync-function-shared.mjs` ile eşlendi; yeni sürümde etkin olması için Edge deploy gerekir (eski sürümlerin manifest'inde `risks` yoktur).

## Kararlar / bilinçli kapsam dışı
- **Hikâyede Skill bağlantısı yok:** hikâye içerik bağlantısı modeli (`stories.linked_type` CHECK, `create_story`, taslaklar, görüntüleyicinin "Space'e ekle" eylemi) dört içerik türüne özgüdür; Skill için ayrı bir tasarım ister ve güvenlik açısından hassas bir yüzeydir. Skill hikâyeyle değil mesajla/alıntıyla paylaşılır.
- **Kapak görseli yok:** Skill kartı tür simgesi + özetle çizilir; kapak görseli yeni bucket yolu, politika, yetim süpürücü ve karta/detaya yerleşim ister.
- **`skill_categories` tablosu yok** ve slug sabit kalır (396'daki kararlar).
