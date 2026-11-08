# 359 — Telefonda /teams (Ekipler) sayfası: "Bugün" + büyük ekip kartı dili

**Durum:** uygulandı (2026-11-08). Yalnız telefon; masaüstü ve veritabanı değişmedi.

Sorun: Topluluklar/Spaces ilk ekranda dolu, Ekipler birkaç kart + altta todo listesiydi. Kullanıcı 4 yönlü mockup'tan **1 (Bugün) + 2'nin kart dili**ni seçti.

Düzen (telefon): büyük başlık + tek kontrol satırı (değişmedi) · bekleyen davetler · **Senden bekleyenler · N** (`my_team_todos`, tüm ekipler, en çok 5; ayrıntılı inceleme satırı olan ekibin "N onay" özeti gizlenir; satır alt satırında ekip adı; "İncele"/"Aç") · **Ekiplerim** (`PhoneTeamCard`: renkli bant, taşan karo, üye yığını, "Rol · N üye · N Space", turuncu "N onay bekliyor" / "N yeni mesaj" çipleri [ilgili sekmeye bağlantı], "Aç"; bekleyen iş varsa "Aç" dolu, yoksa çerçeveli) · **Son Space'ler** (ilk üç ekibin Space'lerinden son güncellenen 2; `TeamSpaceMini` Ekip ana ekranıyla ortak). Alt menü boşluğu `PHONE_HOME_BOTTOM_PAD`. Masaüstü `TeamCard` ızgarası + `TodoList` aynı. Yeni sunucu işi YOK (`my_teams`, `my_team_todos`, `team_list_spaces`).

Sapma: "Son açılan Space'ler" yerine "Son Space'ler" (son açma verisi yok). Test: `run-team-hub` 42 (46/46). İngilizce: `tm.home.myTeams/pendingApprovals/unreadMessages`. Gerçek cihaz/Supabase DENENMEDİ.
