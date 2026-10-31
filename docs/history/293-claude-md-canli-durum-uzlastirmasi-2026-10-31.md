# 293 — CLAUDE.md "Durum / Açık işler" uzlaştırması (2026-10-31, ikinci tur)

**Durum:** uygulandı (yalnızca belge; kod/şema değişikliği yok).

## Neden
Kullanıcı "sitede eksik ne?" diye sorulunca CLAUDE.md'deki "Açık işler" listesinin aynen tekrarlandığını, oysa çoğunun yapıldığını söyledi. Liste
286'dan sonra güncellenmemişti: araya 288–292 (tam ekran yazma, uzun basma menüsü, gerçek medyalı seed, otomatik oynatma) ve `287` migration'ları girmişti.

## Ne doğrulandı (salt-okunur)
Canlı proje `xqxybhjcyrvaroknucdq`:
- `supabase_migrations.schema_migrations`: **185** kayıt, son sürüm `20261031100200` (286'daki sayı 182'ydi). Repodaki son üç migration (`287-*`) canlıda.
- 20 profil (17 demo), **3455 prompt** (3410 yayında+herkese açık, 0 taslak, 44 topluluğa özgü), 50 istek, 27 workflow, 47 hazır ayar, 24 Space, 26 hikâye, 10 alıntı, 15 topluluk, 206 sonuç.
- Tür dağılımı metin 2619 · görsel 551 · video 154 · ses 131; 3388 prompt kategorili (67 kategorisiz); 718 promptta değişken var. Yani prompts.chat içeriği artık "hep
  `text`, kategorisiz, `${…}` çevrilmemiş" değil (`260-*` toplu tür/kategori, `253-*` şablon değişkenleri uygulanmış).
- Edge Function'lar aynı 5 ve aynı sürümlerde; `api_tokens` tablosu yok (Ö6 başlamadı); `dominant_color` boş görsel sayısı 6.

## Doğrulanamayanlar (dürüst sınır)
- Gerçek cihaz/oturum denemeleri (Ö5): kullanıcı çoğunu yaptığını bildirdi, hangilerinin kaldığı kayıtlı değil; sandbox `*.supabase.co` tarayıcı yolunu çalıştıramaz. CLAUDE.md'de
  "yapılmadı" yerine "kullanıcı bildirdi, kayıtlı değil" yazıldı.
- Ö4 (Kullanım Koşulları'nda yeniden kullanma/atıf maddesi): `legal-content.ts` repoda hâlâ eski; kullanıcı başka yerde çözdüyse CLAUDE.md'den silinecek.

## Değişenler
`CLAUDE.md` Bölüm 9: "Durum", "Migration durumu", Ö4/Ö5/Contract/Küçük temizlik maddeleri ve arşiv numarası güncellendi. `docs/yapilacaklar.md` C bölümündeki eskimiş
prompts.chat notu düzeltildi.
