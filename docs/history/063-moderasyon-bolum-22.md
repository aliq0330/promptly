### 9.63 Moderasyon (Bölüm 22)

Migration `20260919500000_moderation.sql` (canlı projeye MCP ile uygulandı; `aliq03` moderatör).
- **Rol:** `profiles.role` (`user`/`moderator`). `protect_profile_role` trigger'ı istemcinin (auth.uid() dolu) rol değiştirmesini reddeder; rol yalnızca SQL Editor/service_role ile verilir (`update profiles set role='moderator' where username='…'`). `is_moderator()` RPC'si.
- **Şikâyet kuyruğu:** `/moderation` (yalnızca moderatör; sidebar'da görünür). `moderation_report_queue(status)` şikâyet + raportör + hedef özeti (mesaj içeriği yalnızca moderatöre) döndürür; `moderate_report(id, action, note)` → `dismissed` / `reviewed` / `removed` (prompt/istek/generator/workflow/yorum siler, mesajı soft-delete eder; aynı hedefin diğer açık şikâyetlerini kapatır). Şikâyet hedefleri generator ve workflow'u da kapsar; `reports.reviewed_by/reviewed_at/resolution_note` eklendi.
- **Şikâyet et girişleri:** gönderi üç-nokta menüsü (prompt/generator/istek/workflow, sahibi değilse) ve yorumlar (+ profil/mesaj zaten vardı).
- **Engelleme artık içeriği gizler:** `lib/supabase/blocked-users.ts` (oturum başına önbellekli, engel/kaldır işleminde geçersiz kılınır); feed/keşif/arama/etiket dışı akışlardaki prompt, istek, generator, workflow ve tüm yorum sorguları engellenen kullanıcının içeriğini süzer. Tek yönlüdür; engellenen profil sayfası ve o yazarın profil listesi açık kalır (engeli kaldırabilmek için).
- i18n: `moderation.*`/`nav.moderation` TR+EN eklendi.
- Doğrulama: tsc/lint/build temiz; canlı DB'de rol yükseltme ve kuyruk erişimi sıradan kullanıcıda reddedildi, aliq03'te çalıştı; ağ taklitli Playwright 6/6. Gerçek şikâyet→karar akışı canlıda uçtan uca denenmedi.
- Bilinçli sınır: kullanıcı yasaklama/askıya alma yok (kullanıcı şikâyeti yalnızca incelenir); etiket sayfası ve profil listeleri engel filtresinin dışında; açık sayfalardaki önbellekli akış engelden sonra yenilemeyle güncellenir.
