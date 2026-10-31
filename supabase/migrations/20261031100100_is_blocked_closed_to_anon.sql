-- `is_blocked` ziyaretçiye (anon) kapatılır (docs/history/287-*; 224'te "ayrı iş" olarak not edilen sızıntı).
--
-- `is_blocked(a, b)` SECURITY DEFINER olduğu için, herhangi biri `/rest/v1/rpc/is_blocked` ile iki kullanıcı kimliğini vererek "aralarında engel
-- var mı" sorusunun cevabını alabiliyordu — OTURUMSUZ ziyaretçi dahil. Ziyaretçinin engeli olamaz; politikalar onu `auth.uid() is null or …`
-- ile zaten dışarıda tutar ve engel satırlarına `null` ile eşleşen bir şey yoktur. Bu yüzden ziyaretçi için her zaman `false` döner:
-- DAVRANIŞ DEĞİŞMEZ (yalnız sızıntı kapanır). Oturumlu çağıranlar için tanım aynıdır.
--
-- BİLEREK DAHA ÖTESİ YAPILMADI: oturumlu bir çağıranın yalnız KENDİ engel ilişkisini görebilmesi (a ya da b = auth.uid()) kısıtı, 60'tan fazla
-- çağrı noktasını bozar — grup/topluluk davetleri, Space davetleri ve bildirim tetikleyicileri üçüncü kişilerin ilişkisini (ör. topluluk
-- sahibi ↔ davet edilen) bu fonksiyonla sorgular ve `false` dönmesi engeli sessizce kapatırdı. Oturumlu tarafın tam kapatılması, iç çağrılar
-- için ayrı bir yardımcı + politikaların yeniden yazımı ister (docs/history/287-*).

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.role() is distinct from 'anon'
     and exists (
       select 1 from public.blocks
       where (blocker_id = user_a and blocked_id = user_b)
          or (blocker_id = user_b and blocked_id = user_a)
     );
$$;
