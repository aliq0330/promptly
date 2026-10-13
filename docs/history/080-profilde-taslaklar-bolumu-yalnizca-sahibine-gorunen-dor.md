### 9.80 Profilde "Taslaklar" bölümü — yalnızca sahibine görünen, dört türlü sekme

Kullanıcının isteği üzerine — Bölüm 9.65'in kurduğu taslak sisteminin
(`prompts.status='draft'`, `prompt_requests.is_draft`, generator/workflow'un
zaten var olan draft/published durumu; `lib/supabase/drafts.ts`'in
`fetchOwnDrafts`/`deleteDraft` fonksiyonları; dört oluşturma sayfasının
header'ındaki "Taslaklar (N)" butonu) bugüne kadar tek giriş noktası, o dört
sayfanın kendi header'ıydı — profilden taslaklara ulaşmanın bir yolu yoktu.
Bu görev, **hiçbir yeni taslak mekanizması kurmadan**, yalnızca var olan
`fetchOwnDrafts`/`deleteDraft`'ı profile ikinci bir giriş noktası olarak
bağlıyor.

**Yeni bileşen — `src/features/profile/profile-drafts-panel.tsx`
(`ProfileDraftsPanel`):** dört türün (`prompt`/`request`/`generator`/
`workflow`) taslaklarını `fetchOwnDrafts(kind, userId)` ile paralel çekip tek,
`updatedAt`'e göre sıralanmış bir listede birleştiriyor; üstte `Tabs`
(segmented) ile **Tümü / Prompt / Prompt İsteği / Generator / Workflow** alt
sekmeleri (her birinin sayısı), `postKindTabs`'ın (Bölüm 9.66) zaten kurduğu
aynı desen. Her satır hangi türden olduğunu (ikon + `draft.kindPrompt`/
`kindRequest`/`kindGenerator`/`kindWorkflow` — bu çeviri anahtarları zaten
`translations.ts`'te duruyordu, kullanılmıyordu, tam bu iş için önceden
eklenmiş), başlığı, son düzenleme zamanını (`formatRelativeTime`), "Devam
et" (o türün kendi `?edit=<id>` rotasına) ve iki-tıklamalı onaylı "Sil"
(`deleteDraft(kind, id)`, `DraftsButton`'ın modal listesindeki BİREBİR aynı
görsel/davranış deseni — kopyalanmadı, aynı kart/buton/onay yapısı yeniden
üretildi) gösteriyor. Boş durum `EmptyState` (`draft.empty`).

**Profile entegrasyonu:** `ProfileTabs`'ın `ProfileTabKey` union'ına
`"drafts"` eklendi; `profile-view.tsx`'in `tabs` listesine, **yalnızca
`isOwnProfile` iken** (`"saved"`/`"liked"` ile birebir aynı koşul —
"Kaydedilenler"/"Beğeniler"in zaten kullandığı, kanıtlanmış görünürlük
mekanizması), "posts"tan hemen sonra `{key:"drafts", label:
t("profile.tabDrafts")}` eklendi — bu tab RLS'in zaten yalnızca sahibine
döndürdüğü taslak satırlarına bakıyor, ama arayüzde de başkasının profiline
hiç teklif edilmiyor. `activeTab === "drafts"` dalı `<ProfileDraftsPanel
userId={user.id} />` render ediyor — var olan `"posts"`/`"saved"`/`"liked"`/
`"about"` dallarının hiçbiri değiştirilmedi.

**i18n:** `profile.tabDrafts`/`profile.draftKindsAriaLabel` (TR+EN)
eklendi; alt sekme etiketleri zaten var olan `draft.kindPrompt` ailesini
kullanıyor — yeni bir string yinelenmedi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, placeholder
Supabase env ile tam `npm run build` (37 rota, değişmedi) sıfır hatayla
geçti. Değişiklik üç dosyada küçük bir ekleme + bir yeni dosya
(`profile-tabs.tsx`, `profile-view.tsx`, `translations.ts`,
`profile-drafts-panel.tsx`) — var olan hiçbir profil sekmesi/oluşturma
sayfasının "Taslaklar (N)" butonu dokunulmadı (`git diff` ile doğrulandı).
Bu sandbox'ta Playwright/tarayıcı kurulu olmadığından gerçek bir tıklama
testi yapılamadı (Bölüm 9.79'un da belirttiği aynı araç sınırı) — mantık
tamamen var olan, zaten test edilmiş `fetchOwnDrafts`/`deleteDraft`
fonksiyonlarına dayandığından ve `Tabs`/`EmptyState`/`Button` gibi paylaşılan
bileşenler değiştirilmeden kullanıldığından düşük riskli kabul edildi;
kullanıcının canlı/yerel ortamda kendi profilinde "Taslaklar" sekmesini,
alt sekmelerini, "Devam et" ve "Sil" akışlarını bizzat denemesi gerekiyor.

**Bilinen sınırlamalar:**
- Gerçek bir tarayıcıda görsel/tıklama doğrulaması yapılamadı (yukarıda
  açıklandı).
- Migration içermiyor — bu görev tamamen frontend, kullanıcının
  Dashboard'da yapması gereken bir adım yok.

---
