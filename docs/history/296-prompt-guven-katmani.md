# 296 — Promptlara güven katmanı: "Çalıştı mı?", kullanım hakkı, Studio karşılaştırma

**Durum:** uygulandı (repoda). İki migration (`20261102100000_prompt_outcomes.sql`, `20261102110000_prompt_license.sql`) canlıya UYGULANMADI
(deploy hattı `main`'e birleşince uygular; bkz. Bölüm 2). `npx tsc --noEmit`, `npm run lint` (0 hata), `npm test` (617/617), `npm run build`
(sahte Supabase değişkenleriyle) temiz. Yerel PostgreSQL 16'da `supabase/tests/prompt-outcomes.sql` **17/17**; mevcut `creator-insights`,
`creator-insights-v2`, `safety-hardening`, `communities`, `community-privacy`, `import-prompts` testleri yeniden geçti (anon beyaz listesi dahil).
Ağ taklitli Playwright: `run-outcomes.mjs` **15/15**, `run-studio-compare.mjs` **8/8**. Gerçek Supabase'e, gerçek bir Gemini/OpenAI anahtarına ve
fiziksel cihaza KARŞI DENENMEDİ. İngilizce karşılıkları eklendi (`translations.ts`: `outcome.*`, `license.*`, `studio.*`, `insights.outcomes.*`, `error.*`).

Fikir: bir promptun gerçekten işe yarayıp yaramadığını, hangi araçta ve hangi hakla kullanılabildiğini göstermek.

## 1 · "Çalıştı mı?" (prompt detayı)
- Kopyalayan kişi, prompt bloğunun altında **Çalıştı / Kısmen / Olmadı** der, sonra hangi araçta (önerilen araçlar + son kullanılan + "Diğer" + isteğe
  bağlı sürüm). Detayda topluluk sonucu: yüzde çubuğu + araç/sürüm başına döküm. Kartlara hiçbir şey eklenmedi.
- Veri: `prompt_outcomes` (kişi + prompt + ARAÇ başına tek cevap — bir araçta çalışıp diğerinde çalışmayabilir). Yalnız sahibi kendi satırını okur;
  yazma yalnız `set_prompt_outcome` (SECURITY DEFINER): oturum, askı, yayında+herkese açık+topluluğa ait değil, **kendi promptuna cevap yok**
  (`self_outcome_not_allowed`), engel (`interaction_blocked`), **önce kopyalamış olmak** (`outcome_requires_copy`; `prompt_copy_events`), saatte ≤100
  (`_rate_limit`). `p_outcome` null = geri al. Okuma: `prompt_outcome_stats` (araç+sürüm başına sayı; ziyaretçiye açık, okunamayan prompt için boş),
  `has_copied_prompt`, yazar için `creator_insights_prompt_outcomes` (toplu sayı; Yaratıcı paneli prompt ayrıntısında "Çalıştı mı? cevapları" kartı).
- **Kararlar:** (1) Kopyalama şartı VAR (kullanıcıya önerilen yön; kararı kullanıcıya bırakmıştım, "hepsini yap" dedi). (2) Sayaç sütunu EKLENMEDİ:
  sayılar okunurken tek promptun satırlarından toplanır (`unique (prompt_id, user_id, tool)` dizini), bu yüzden `protect_counter_columns` gerekmedi.
  Çok yüksek cevap sayısında ölçüm gerekebilir (ölçülmedi). (3) **3 cevaptan azında yüzde gösterilmez** (`MIN_OUTCOME_VOTES`): toplu yüklenen 3012 promptta
  "Henüz yeterli deneme yok" yazar; hiç cevabı olmayan promptta ziyaretçi bölümü hiç görmez. (4) Kopyalayınca kart sayfa yenilenmeden belirir:
  `recordPromptCopy` bitince `promptly:prompt-copied` penceresi olayı yayınlar (`PROMPT_COPIED_EVENT`). (5) Yüzdeler en büyük kalan yöntemiyle toplamı tam 100.
- Kod: `lib/prompt-outcomes.ts` (+test), `lib/supabase/prompt-outcomes.ts`, `features/prompts/prompt-outcome-section.tsx`.

## 2 · Kullanım hakkı (lisans)
- Oluşturma formunda "İsteğe bağlı ayrıntılar" içinde **Kullanım hakkı** (`FormDisclosure` + `LicensePicker`): Belirtilmedi · Serbest (CC0) · Atıfla serbest ·
  Yalnız kişisel kullanım · Tüm hakları saklı. Detayda "Hakkında" kartında satır (`PromptLicenseRow`).
- Veri: `prompts.license` (CHECK'li, boş = belirtilmedi). `OPTIONAL_COLUMNS`'a eklendi; yalnız doluysa yazılır, düzenlemede yalnız değişince gönderilir
  (sütun canlıda henüz yoksa geri kalan her şey çalışır). **Bu bir etikettir, hukuki koruma DEĞİLDİR** (formda yazıyor).
- Etkin lisans = açık seçim, yoksa kaynak notundan KESİN eşleşme (`CC0`, `CC BY`; `BY-SA/NC/ND` eşlenmez) — toplu yüklenen 3012 kayda migration ile DOKUNULMADI,
  CC0'ı kaynak notundan okunur (`effectiveLicense`). `lib/prompt-license.ts` (+test).
- **Atıfla serbest** promptta Kopyala yanında "Kopyalarken atıf satırı ekle" (varsayılan KAPALI: kopyalanan metin kendiliğinden kirlenmez; yalnız Kopyala
  etkilenir, Çalıştır/Studio metne dokunmaz) → metnin sonuna `— @yazar, Promptly`. Mockup'ta varsayılan açıktı; kopyalanan prompt AI araçlarına gittiği için kapalı yapıldı.
- Dışa aktarma: başkasının promptunun kaynak satırına lisans eklenir ("@aliq · Promptly (CC BY)"), içe aktarmada `Kaynak:` notu olarak korunur ve rozet olarak okunur.
  `import_prompts` RPC'si DEĞİŞMEDİ (lisansı dosyadan almaz; kural 250-*: yazar/durum/görünürlük dosyadan alınmaz).
- **Kullanım Koşulları'ndaki atıf maddesi (CLAUDE.md Ö4) hâlâ yazılmadı** — bu özellik onun yerine geçmez.

## 3 · Studio karşılaştırma
Düzeltme: Studio'da karşılaştırma ALTYAPISI zaten vardı (ek model satırları, `MAX_EXTRA = 2`, model etiketli sonuçlar; `yapilacaklar.md` 10 yalnız bir başlıktı). Eklenenler:
- Sonuçlar **model başına yan yana sütunlarda** (`groupByLabel`; ≥3 modelde `2xl`'de üç sütun; telefonda alt alta), her sonuçta **süre** (`ms`, geçmişten açılanda yok).
- **"Bu daha iyi"** işareti (yalnız karşılaştırırken): TEK sonuç işaretlenir, yerel kalır — hiçbir istek/saklama yok, oylama değil.
- **"Sonuç olarak paylaş"** (yalnız bir Prompt kaynaklıysa): üretilen görsel (`dataUrlToFile`, ağ isteği yok) ya da metin, mevcut sonuç penceresine (`AddResultModal`
  yeni `initial` prop'u) dosya + araç adıyla dolu açılır; yazar her şeyi değiştirebilir. Ayrı bir paylaşım yolu yazılmadı.
- Bir model hata verirse diğeri etkilenmez (mevcut davranış, testle kilitlendi). API anahtarı sunucuya gitmez (testte Supabase gövdelerinde aranır).

## Sınırlar / açık
- "Çalıştı mı?" için ilk sürümde bildirim yok; Keşfet'te "en güvenilir" sıralaması YOK (oy sayısı hâlâ düşük; 3 gerçek kullanıcı). Sonuç paylaşırken "Çalıştı" cevabının önceden doldurulması (faz 2) YAPILMADI.
- Araç adı serbest metindir (katalog dışı yazım farkları ayrı satır olur: "Flux" / "flux"); sürüm de serbest metin.
- Lisans yalnız Prompt'ta; İstek/Workflow/Hazır ayarda yok. Lisans filtresi (Keşfet/arama) YOK.
- Studio'da dar sağ sütun yüzünden iki sütunlu karşılaştırmada eylem düğmeleri metni sarar (`COMPACT`); geniş masaüstünde sütun düzeni gözle denenmedi (yalnız 1280 px ekran görüntüsü).
- `PromptOutcomeSection` ilk yüklemede üç ağ isteği yapar (özet, kendi cevaplarım, kopyalamış mıyım); oturumsuzda yalnız özet.
