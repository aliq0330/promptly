-- Promptly — Studio özelliği kaldırıldı (20260919620000_studio_sessions.sql geri alınıyor).
--
-- Bu iki tablo yalnızca Studio'ya aitti: başka hiçbir tablo/fonksiyon/trigger bunlara
-- referans vermiyordu (kaynaklar kopyalanmıyor, yalnızca `refs` jsonb ile referanslanıyordu),
-- bu yüzden Prompt / Generator / Workflow / Hazır Ayar / Prompt DNA verilerine dokunulmaz.
-- GERİ DÖNÜŞÜ YOK: kullanıcıların kayıtlı Studio oturumları ve versiyonları silinir.
drop table if exists public.studio_session_versions;
drop table if exists public.studio_sessions;
