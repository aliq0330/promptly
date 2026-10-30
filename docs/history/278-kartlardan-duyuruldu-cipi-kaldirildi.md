# 278 — Kartlardan "X topluluğunda alıntılandı" çipi kaldırıldı

**Durum:** uygulandı, yalnız istemci kodu (migration yok). Ağ taklitli Playwright'ta sınandı (`run-space-posts` 8/8 [6. ve 7. senaryo güncellendi], `run-card-title` 4/4, `run-interest` 12/12, `run-home-motion` 10/10, `run-discover` 9/9, `run-community-posts` 36/36, `run-communities` 66/66, `run-quotes` 12/12, `run-detail-pages` 45/45, `run-feed-scroll` 3/3, `run-feed-filters` 18/18); gerçek cihaza karşı denenmedi.

## Karar
Kullanıcı kartlardaki "… topluluğunda duyuruldu/alıntılandı" yazısını istemedi. 215'te eklenen çip (`AnnouncedChip`; "Kedi Sevenler topluluğunda alıntılandı" / "3 toplulukta alıntılandı") prompt, istek, workflow ve hazır ayar kartlarının rozet satırından kalktı.

## Değişen
- `PromptCard`, `RequestCard`, `WorkflowCard`, `PresetCard`: çip çizilmez.
- `FeedGrid`: `AnnouncedProvider` kalktı — her liste sayfası için görünen içeriklerin topluluk gönderilerini soran ekstra `community_posts` sorgusu (+ `community_cards`) artık yapılmıyor (liste başına bir istek az).
- Ölü kod silindi: `features/communities/announced-chip.tsx`, `fetchAnnouncedIn` + `AnnouncedKey` (`lib/supabase/communities.ts`), `announced.in` / `announced.inMany` çevirileri.
- DOKUNULMADI: içeriğin detay sayfasındaki "N kez alıntılandı" sayacı, topluluk başvuru gönderisinin kendi kartı/sayfası, "Topluluklarda alıntıla" eylemi.

## Doğrulama
`run-space-posts` 6: alıntılanmış içeriğin kartında çip yok ve `community_posts?kind=eq.application` sorgusu yapılmaz (`announcedQueries` 0); 7 (İngilizce): "Quoted in …" yazısı yok. Yeni kullanıcıya görünür metin yok (İngilizce karşılık gerekmedi; silinen çeviri anahtarları kullanılmıyordu).
