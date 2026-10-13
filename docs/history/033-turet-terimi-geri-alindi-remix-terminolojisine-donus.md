### 9.33 "Türet" terimi geri alındı — "Remix" terminolojisine dönüş

Kullanıcının açık isteği üzerine ("Ben daha önce remix yerine türet
kullanmıştım bunları eski haline getir türet olmasın") Bölüm 9.16-9.18'de
yapılan "Remix → Türet" UI yeniden adlandırması tamamen geri alındı —
sadece metin, hiçbir mantık/routing/ikon değişikliği yok:
- `prompt-detail-view.tsx`: origin rozeti "Türet"→"Remix"; "Türetme
  geçmişi:" breadcrumb→"Remix zinciri:"; "Türet" eylem butonu→"Remixle";
  sekme etiketi "Türetilen promptlar (N)"→"Remixler (N)".
- `create-prompt-form.tsx`: sayfa başlığı "Türet"→"Remix Oluştur";
  "(türetme)" son eki→"(remix)"; "Bu türetme profilimde görünsün mü?"→"Bu
  remix profilimde görünsün mü?"; iki radyo açıklaması ve bilgi bandı
  "türet(ilen)" ifadelerinden "remix"e geri döndü.
- `remix-map-node-card.tsx`, `remix-node-detail-panel.tsx`,
  `remix-branch-map.tsx`: düğüm rozetleri/lejant "Türet"→"Remix";
  "Türetme sayısı:"→"Remix sayısı:"; panel butonu "Türet"→"Remixle".
- `profile-view.tsx`, `profile-badges.tsx`, `profile-stats.tsx`,
  `profile-toolbar.tsx`: sekme etiketi "Türetilen promptlar"→"Remixler";
  boş-durum başlığı, rozet metni, istatistik butonu etiketi ve sıralama
  seçeneği hepsi "remix" köküne döndü.
- `prompt-card-footer.tsx`, `post-context.tsx`, ve kod içi Türkçe
  yorumlar (`copy-prompt-button.tsx`, `prompt-preview-box.tsx`,
  `remix-branch-map.tsx`, `local-prompt-view.tsx`) da dahil, kullanıcıya
  görünen HER "türet" kökü kelime "remix"e çevrildi.
- **Bilinçli olarak dokunulmayan:** "Prompt geçmişi" sekme adı (Bölüm
  9.17'de ayrı bir kullanıcı talebiyle "Remix Dallanma Haritası"ndan
  değiştirilmişti, "türet" kelimesi hiç içermiyordu) ve `GitBranch` ikonu
  (Bölüm 9.17'de `Repeat2`'den değiştirilmişti — metin değil, ve "remix"
  kavramı için de anlamlı bir ikon) — kullanıcının isteği yalnızca "türet"
  kelimesini hedefliyordu, bu ikisi kapsam dışı bırakıldı. Kod içi tip/
  bileşen/dosya adları (`RemixGraphNode`, `isRemixMode`,
  `remix-branch-map.tsx` vb.) zaten hiç "türet" içermiyordu, değişmedi.

**Nasıl doğrulandı:** `grep -i türet` `src/` genelinde sıfır eşleşmeye
düştü. `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
değişmedi) sıfır hatayla geçti. Bu görev hiçbir yeni migration
içermiyor (tamamen metin), PR #18 olarak `main`'e merge edildi.

**Bilinen sınırlamalar:** Yok — bu, önceki bir kullanıcı talebiyle
yapılan terminoloji değişikliğini yine kullanıcının talebiyle tersine
çeviren, kapsamı net bir düzeltme.

---
