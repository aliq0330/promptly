# 408 — Skill: diğer içerik türlerinde olup Skill'de olmayan yüzeyler + detay düzeltmeleri

**Neden.** Skill detay sayfası ve tüm site Skill açısından denetlendi (403/407 sonrası): Prompt/İstek/Workflow/Ayar paketi'nin bulunduğu ama Skill'in olmadığı yerler ve
detay sayfasında mantıksız kalanlar listelendi; bu not hepsinin kapatılmış hâlidir. Canlıda önceden doğrulananlar: 19 Skill migration'ı uygulanmış, Edge `api` v15 / `mcp` v16 /
`skill-package` v3 deploy edilmiş, `promptly-mcp` 0.3.0 npm'de (kullanıcı deploy/yayın işlerini yaptığını bildirdi, 2026-11-16 Supabase MCP ile görüldü).

## Detay sayfası
- **SKILL.md üç kez gösteriliyordu** (Talimat · Paket dosyaları · sayfa sonu kod bloğu). Paketli Skill'de alttaki blok kalktı; yalnız paketsiz (kolay mod) Skill'de kalır.
- **Gezgindeki SKILL.md ile ZIP'tekinin farklı olması**: gezgin SKILL.md'yi çalışma kopyasından gösterir; paket okununca yayınlanan sürümdekinden farklıysa bilgi bandı +
  "Yayınlanan sürümü göster / Güncel taslağı göster" düğmesi çıkar (`data-skill-md-differs`). ZIP hâlâ yalnız ilk dosya açılınca iner.
- "SKILL.md'yi kopyala" `copyTextToClipboard` ile çalışır ve sonucu söyler (Kopyalandı / Kopyalanamadı); eski yorum satırı düzeltildi.

## Skill eklenen yüzeyler
- **Yorum eki** (migration `20261202100000`): `prompt_comments_attach_check` altı türü kabul eder; içerik seçici (yorum) Skill sekmesi + "Kaydettiklerim"; `CompactContentCard` Skill çizer.
  Denetim değişmez: `quote_target_ok` (yayında + herkese açık).
- **Bildirim merkezi**: `/skills/local` adresi `skill` türüdür (`notification-mirror`); Skill yorumuna zil panelinden satır içi yanıt (`postCommentOnSkill`), "Skill'ini beğendi" cümlesi,
  "Skill'i aç", sessize alma seçenekleri.
- **Ortak koleksiyonda "İçerik ekle"**: seçici Skill de sunar (`ContentPickerDialog kind="skill"`, `search_content p_kind='skill'`).
- **Arama çipi**: "Skill" tür çipi (filtre penceresi + öneriler; yalnız bayrak açıkken). Çip seçiliyse yalnız Skill aranır, yazar/etiket çipleri sunucuda uygulanır; medya/araç çipi Skill'i
  eler (sunucu kuralı). Çipsiz düz metin aramasında Skill grubu eskisi gibi çıkar.
- **Şikâyet önizlemesi**: `fetchReportPreview` Skill başlığı + yazarı gösterir.
- **Profil → Taslaklar**: Skill taslakları listelenir (`DraftKind` "skill", düzenle `/skills/create?edit=`, sil `deleteSkill`).
- **Topluluk** (migration `20261202110000`): `community_posts.skill_id` altıncı hedef (Space kalıbı); Skill yalnız BAŞVURU olabilir, bir toplulukta bir kez, yalnız yayında + herkese açık;
  "Mevcut içeriğe başvur" ve "Var olan içeriği paylaş" Skill sekmesi sunar; akışta `ApplicationCard`, başvuru sayfasında normal Skill detayı (`SkillDetailView skillId`);
  beğeni bildirimi Skill adını taşır. Gönderinin beğeni/yorum/kaydı gönderiye aittir, Skill sayaçlarına karışmaz.
- **Sana özel "İlgimi çekiyor / çekmiyor"** (migration `20261202120000`): `content_interest.skill_id` beşinci hedef, `set_content_interest` Skill'i kabul eder; `for_you_page` cevaplanan Skill'i
  bir daha göstermez, "çekiyor" etiketleri artı / "çekmiyor" etiketleri eksi sinyal, aynı yazardan ≥2 "çekmiyor" yazarı geriye düşürür (diğer türlerle aynı kural). `SkillCard` ⋮ menüsü
  `PostMenuExtras` satırlarını gösterir. Keşfet kişiselleşmez.
- **Telegram botu**: `/skill <id>`, `/ara skill sorgu`, satır içi mod `skill …`, kart (`sk:` callback). Skill dosyaları ASLA çalıştırılmaz; betik varsa kart söyler. Skill "gönderi türü" olmadığı için
  `SearchKind`'a girmez (kişisel düzenle/taslak onu bilmez). Bildirimler zaten tür bazlıdır, Skill bildirimleri değişiklik gerektirmedi.

## Testler
Birim 1198 (yeni: Skill adresi/yanıt, Telegram Skill, yorum eki türü); yerel PostgreSQL `skill-surfaces.sql` 18/18 (+ skills-save/social/discovery, content-interest, for-you, skills-for-you,
community-post-engagement/save, comment-media, communities, space-posts hepsi FAILED=0); ağ taklitli Playwright: run-skills-package 28/28, run-skills-social, run-comment-extras,
run-search-notifications, run-collab-collections, run-feed-filters, run-detail-pages, run-community-posts, run-notifications. **Gerçek Supabase/cihaz DENENMEDİ.**

## Sınırlar
- Skill topluluğa duyurulabilir ama "toplulukta oluştur" (native) yoktur: Skill'in `community_id`'si yok, topluluğa özgü Skill kavramı eklenmedi.
- Telegram'da Skill bildirimi ayrı bir tür değil (mevcut yorum/beğeni türleri); `Skill` komutu yalnız herkese açık okur.
- Arama çipi bayrak (`NEXT_PUBLIC_SKILLS_ENABLED`) kapalıyken sunulmaz.
- Gizlilik/Koşullar güncellenmedi (topluluk duyurusu ve Telegram Skill metni için hukuk kararı).
