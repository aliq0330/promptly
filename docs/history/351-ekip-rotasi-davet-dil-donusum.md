# 351 — Ekibin ayrı rotası, davetleri, dili ve topluluk ↔ ekip dönüşümü (2026-11-07)

350'de Ekipler girişi açıldığında dört sınır bırakılmıştı. Kullanıcı hepsinin çözülmesini ("gerekirse ekibi baştan kur") ve sonra birleştirmeyi istedi.
Ekibi baştan kurmak GEREKMEDİ: arka yüz (tamamen kapalı topluluk, `list_my_teams`) aynı kaldı; dört sınır istemcide çözüldü, yeni migration YOK.

## 1. Ekip sayfası kendi rotasında: `/teams/local?id=&tab=&section=`
- Aynı `CommunityPage` bileşeni iki rotada çalışır (`expect="community" | "team"`). Kimlik YANLIŞ rotada açıldıysa (bildirim, eski bağlantı, sohbet başlığı, SQL'in
  yazdığı `/communities/local?id=` adresleri) sunucudan gelen görünürlüğe bakılıp doğru rotaya `router.replace` edilir; tüm adres parametreleri (tab, section, post…)
  aynen taşınır, yönlenene kadar iskelet çizilir. Bu yüzden SQL bildirim adresleri ve eski bağlantılar DEĞİŞMEDİ.
- `teamHref(id, tab, section)` (`lib/communities.ts`); ekibin bildiği her yüzey onu kullanır (Ekipler kartları, Space şeridi, sohbet bilgisi "Ortak Space'ler",
  sayfanın kendi sekme geçişi). Kenar çubuğunda Ekipler `/teams` önekiyle yanar; Topluluklar yanmaz.

## 2. Ekip davetleri Ekipler'de
- `GroupInvitation.group.visibility` eklendi; `fetchMyInvitations(userId, kind)` ile ayrılır. Topluluklar (rozet sayacı, Davetler bölümü, bildirim satırı)
  `"community"` ister, Ekipler sayfası `"team"`: sayfanın üstünde davet kartları (Kabul et / Reddet, kurallı davette kural onayı) — `InvitesView kind="team" hideWhenEmpty`.
  Kabul eden ekibin Space'ler sekmesine gider. Kartı okunamayan davet topluluk sayılır (eski davranış).

## 3. "Ekip" dili derin sekmelerde
- **`TeamLanguageScope`** (`language-provider.tsx`) + `teamWording()` (`lib/i18n/team-wording.ts`, birim testli): ekip sayfasının altındaki her şeyde (Hakkında, Üyeler,
  Yönetim, pencereler, ayrılma onayı…) bir anahtarın ŞABLON metnindeki "topluluk/community" sözcükleri çevrilir — Türkçede ek uyumuyla (topluluğu→ekibi, toplulukta→ekipte,
  toplulukları→ekipleri, topluluğumuz→ekibimiz), İngilizcede community→team. Çeviri şablonda yapılır, parametreler sonradan girer: kullanıcının yazdığı ekip adı
  ("Topluluk Notları Ekibi") hiç değişmez. Özel karşılık gerekirse `<anahtar>.team` girdisi önceliklidir; `teams.*` anahtarları hiç çevrilmez (zaten ekip dilindedir).
- Sayfanın kendi metinleri için `useTeamT()`; yeni bir ekip yüzeyi yazarken `TeamLanguageScope` ile sar.

## 4. Topluluk ↔ ekip dönüşümü
- Ayarlar'da (yetki: `change_visibility`, sahip/yönetici): toplulukta **"Ekibe çevir"**, ekipte **"Topluluğa çevir"** (kapalı topluluk olur). Görünürlük değişimiyle AYNI yoldan geçer
  (`set_chat_group_visibility`), yalnız onay penceresi ve bildirim "ekip/topluluk" diliyle yazılır. Görünürlük seçicisi iki düzey (Herkese açık · Kapalı) olarak kaldı; ekipte seçici yok.
- Ekibe bağlı Space varken (arşivlenmiş olanlar dahil) ekip topluluğa ÇEVRİLEMEZ (`community_has_team_spaces`, 349): hata onay penceresinde görünür; önce Space'ler silinir.
  Başarılı dönüşümden sonra sayfa yeni rotaya kendiliğinden yönlenir.

## Test
Ağ taklitli `run-teams.mjs` 16/16 (yeni: rota yönlenmeleri + kenar çubuğu, ekip daveti Ekipler'de/Topluluklar'da değil, derin sekmede "topluluk" kalmadığı + ad korunur, iki yönlü
dönüşüm + Space'li ekibin reddi); birim `team-wording.test.ts`; uyarlanan `run-communities` (davet senaryoları restricted/ekip), `run-groups` (varsayılan grup "kapalı"), `run-team-spaces`.
Gerçek Supabase/cihaza karşı DENENMEDİ.

## Kalan sınırlar
- Yönlendirme istemci tarafıdır: eski `/communities/local?id=<ekip>` bağlantısı bir an iskelet gösterip `/teams/local`a geçer.
- `TeamLanguageScope` bir sözcük değiştirir, cümleyi yeniden yazmaz: nadir cümlelerde ("Topluluklara git" gibi başka bir sayfaya gönderme) ifade tuhaf kalabilir; böyle bir metin görülürse `<anahtar>.team` yazılır.
- Bir ekibe gelen davet bildirimi Topluluklar bölümündeki bildirim kategorisine düşer (adres tabanlı kategori).
