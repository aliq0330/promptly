# 366 — Ekip sayfası: "Yön B · Merkez" (tek seferlik uygulama planı)

**Durum: UYGULANDI (kod + 1 ekleyici migration + testler). Gerçek Supabase / gerçek cihaz DENENMEDİ.**
Kaynak: kullanıcının seçtiği tasarım "Ekip sayfası — 3 yön" tuvalinde **B · Merkez** (9 alt sayfa × masaüstü 1440 / tablet 768 / telefon 390).
Önceki düzen (A/C karışımı: Gezgin yol çubuğu + liste satırları, `363-*`…`365-*`) yerini alır. Veri modeli, roller, onay motoru, URL'ler AYNI kalır.

## Tasarım ilkesi
Uygulama menüsü yerinde kalır. Ekip, renkli **bant** + alt çizgili **sekmelerle** bir ana sayfa gibi açılır; içerik görsel kartlardır; öğe ayrıntısı
yandan açılan **çekmece**dir (telefonda alttan açılan sayfa). Telefonda üst düzey ekranlar bant + kaydırılan sekme şeridi taşır; bir proje/dosya/öğe
açılınca bant yerine o sayfanın kendi başlığı (geri · yol · sohbet · bilgi) gelir.

## Ekran → bileşen eşlemesi
| Mockup | Sayfa | Kod |
|---|---|---|
| ortak | Bant + sekmeler | `team-band.tsx` (`TeamBand`, `TeamTabs`) — `team-page.tsx` kabuğu |
| B1 | Genel bakış | `team-projects-section.tsx` (`TeamProjectsSection` artık Genel bakış): Senden bekleyenler şeridi, proje kartları, Son etkinlik, Kanallar |
| B2 | Proje | `team-project-page.tsx` `ProjectHome`: başlık kartı, dosya kartları, panolar, Kişiler/Değişkenler (xl yan sütun, dar ekranda ⓘ) |
| B3 | Dosya | `FilePage` + `team-area-view.tsx` `AreaCardGrid`: onay çubuğu, tür çipleri, görsel kart ızgarası |
| B4 | Öğe | `team-item-drawer.tsx` — `AreaItemDetail variant="drawer"` (masaüstü/tablet yan çekmece, telefon alt sayfa) |
| B5 | Onaylar | `team-approvals-section.tsx` — masaüstü 3 sütunlu pano, tablet/telefon segmentli liste |
| B6 | Sohbet | `team-chat-section.tsx`: kanal + proje sohbeti çipleri kartın içinde, sağda kanal bilgisi/çevrimiçi/sabit mesaj |
| B7 | Üyeler | `team-members-section.tsx`: üye kartları + "Davet et" formu + bekleyen davetler |
| B8 | Panel | `team-panel-section.tsx`: büyük grafik kartı, 4 kutu, en hareketli projeler, dikkat gerekenler |
| B9 | Yönetim | `team-admin-section.tsx`: hap şeridi + Genel (profil · politikalar · denetim · tehlikeli) ızgarası; telefonda liste → alt sayfa |

## Sekmeler ve adresler (geriye uyumlu)
`tab=projects` anahtarı KORUNUR, etiketi "Genel bakış" olur (eski bağlantılar/bildirimler çalışır). Yeni: `tab=approvals` (Onaylar; konuk görmez).
`?project= &file= &board= &item= &review=` aynen çalışır; `item` artık çekmece açar, kapatmak parametreyi kaldırır.

## Veritabanı (tek ekleyici migration: `20261117100000_team_center_views.sql`)
Üç OKUMA RPC'si, yazma yok, tablo/sütun değişikliği yok (expand-only, yıkıcı SQL yok):
- `team_review_board(p_team)` → `{items, proposals}`: lider her şeyi, diğerleri yalnız KENDİ öğelerini görür; durumlar bekleyen / değişiklik istenen / bugün onaylanan; `can_decide` yalnız projede lider.
- `team_recent_activity(p_team, p_limit)` → eklenen / onaylanan / değişiklik istenen öğe, açılan dosya, katılan üye. Taslak kuralı `_team_item_visible` ile; kişi ancak ROLÜ OLDUĞU projelerin etkinliğini görür.
- `team_member_project_roles(p_team)` → üye başına lider/düzenleyici/görüntüleyici proje sayısı (yalnız ÇAĞIRANIN görebildiği projeler; konuk çağıramaz).
Hepsi `security definer`, `search_path` sabit, anon EXECUTE kapalı. SQL testi `supabase/tests/team-center-views.sql`; `scripts/smoke-test.mjs` CHECKS'e üçü eklendi.

## İstemci veri katmanı
`src/lib/supabase/team-center.ts` (RPC çağrıları) + `src/lib/team-center.ts` (saf yardımcılar: onay panosu paketleme/sütunlama, etkinlik cümlesi, rol özeti; birim testli).

## i18n
Yeni anahtarlar `src/lib/i18n/translations-team-center.ts` (`tc.*`) — TR + EN birlikte. Eski anahtarlar yeniden kullanıldı.

## Testler
Ağ taklitli Playwright `run-team-hub.mjs` / `run-team-projects.mjs` yeni DOM'a göre güncellendi, yeni senaryolar (bant+sekmeler, Genel bakış, çekmece, Onaylar panosu, üye kartları, yönetim hap şeridi). Taklit (`mock.mjs`) yeni üç RPC'yi bilir.

## Bilinçli sınırlar
- Sohbette "proje öğesi kartı" (mockup'taki mesaj içi Afiş başlık promptu kartı) yok: mesaja ekip öğesi paylaşma şeması bu işte eklenmedi.
- Bantta "N çevrimiçi" yalnız sohbet/üye ekranlarında (bant üye listesi çekmez).
- Gerçek Supabase, Realtime, gerçek telefon/tablet DENENMEDİ.
