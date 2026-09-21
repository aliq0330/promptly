-- Promptly — Mesajlaşma Faz C: gerçek zamanlı senkronizasyon.
--
-- Bölüm 21 Faz 6'dan beri belgelenmiş sınırlama: mesajlaşma yalnızca
-- sayfa yüklendiğinde/ziyaret edildiğinde çekiliyordu, karşı tarafın
-- gönderdiği bir mesaj sayfa yeniden ziyaret edilene kadar görünmüyordu.
-- Bu migration'ın TEK işi — hiçbir yeni tablo/sütun/politika yok, yalnızca
-- iki tabloyu Supabase'in Realtime "Postgres Changes" yayınına (`supabase_
-- realtime` publication) ekliyor. Bir tablo bu publication'a eklenmeden
-- `supabase.channel(...).on('postgres_changes', ...)` hiçbir olay almaz —
-- bu, kod tarafında değil, yalnızca bu SQL ile açılabilecek bir proje
-- ayarı.
--
-- Güvenlik notu: Supabase'in Realtime sunucusu, bir "Postgres Changes"
-- aboneliğini o tablonun RLS SELECT politikasına göre yetkilendiriyor
-- (abone olan bağlantının auth.uid()'sine göre) — `messages` ve
-- `conversation_members` üzerinde bu politikalar zaten Bölüm 19'da
-- yazılmıştı (`is_conversation_member(conversation_id)` / `auth.uid() =
-- user_id`) ve hiç değişmedi. Yani bir konuşmanın üyesi olmayan biri bu
-- kanala abone olsa bile hiçbir satır olayı almaz — REST üzerinden zaten
-- göremediği bir satırı Realtime üzerinden de göremiyor.

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_members;
