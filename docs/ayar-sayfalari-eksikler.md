# Ayar sayfaları — mockup dışında kalanlar ve tamamlama listesi (481'in devamı, 482)

Durum: ✔ bekliyor · ✔ yapıldı. Her madde tek tek işaretlenir.

## A. Telefonda hâlâ eski sayfa olan (mockup'ta olmayan) yüzeyler
1. ✔ Topluluk · Özet (`stats-section`)
2. ✔ Topluluk · Duyurular (`announcements-section`)
3. ✔ Topluluk · Moderasyon (`moderation-section`)
4. ✔ Topluluk · İşlem geçmişi (`audit-section`)
5. ✔ Ekip · Genel bakış (`OverviewSection`)
6. ✔ Ekip · Gruplar (`AdminGroupsSection`)
7. ✔ Ekip · Dışa aktar (`ExportSection`)

## B. Telefona hiç gelmeyen (md+'da eski bileşende duran) özellikler
8. ✔ Odaların sıralanması (yukarı/aşağı; «Sırala» düğmesi). Silme zaten arşivdeki odalar sayfasındaydı (yalnız sahip), değişmedi
9. ✔ Kanalda «kim yazar» (herkes / yalnız yönetici-lider)
10. ✔ Dosya «başka yere kopyala» (`CopyItemsDialog`)
11. ✔ Yasaklılar listesi + yasağı kaldırma (topluluk, Davetler sayfası)

## C. Masaüstü/tablet (md+) tutarsızlıkları
12. ✔ Topluluk yönetimi: eski «Ayarlar ▾» menüsü + kartlar → telefondakiyle AYNI liste + alt sayfalar
13. ✔ Ekip yönetimi: eski çip satırı + iki sütun → aynı liste + alt sayfalar
14. ✔ Topluluk «Üyeler → Davetler», «Hakkında → Bildirim tercihleri» → aynı sayfalar
15. ✔ Space «Üyeler» sekmesi → `SpaceMembersSx`
16. ✔ Ekip üyesi sayfası (D1) yalnız telefonda → her boyutta
17. ✔ md+'da sayfa başlığı/geri bağlantısı (`SxPage` md+ kipinde üst çubuk yok)

## D. Adres / gezinme
18. ✔ Proje ayarları ve dosya ayarları adres parametresi taşımıyor (`&sub=`), geri tuşu kapatmıyor

## E. /settings (Ayarlar) — yeni dile geçirilecekler
19. ✔ Ana liste `/settings`
20. ✔ `/settings/account` · 21. `/settings/privacy` · 22. `/settings/notifications` · 23. `/settings/calls`
24. ✔ `/settings/preferences` · 25. `/settings/developer` (+ `ai`, `extension`, `telegram`, `api`) · 26. `/settings/legal`
27. ✔ `/settings/danger` · 28. `/settings/blocked`

## F. Testler ve dokümantasyon
29. ✔ (bkz. 482 notu: güncellenen paketler) Eski arayüz testlerinin yeni DOM'a göre güncellenmesi (run-team-hub, run-team-projects, run-communities/groups/rooms)
30. ✔ CLAUDE.md, docs/history/482-*, README satırı, bu liste
