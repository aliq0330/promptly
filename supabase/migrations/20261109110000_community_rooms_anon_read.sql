-- Sohbet odaları düzeltmesi (docs/history/352-*): `messages` ve `community_rooms` okuma politikaları `can_read_room`'u çağırır;
-- ziyaretçi (anon) bu politikalara tabidir, EXECUTE yetkisi olmayınca sorgu boş dönmek yerine "permission denied" verir
-- (canlı duman testinde yakalandı). `can_read_message` gibi anon'a açılır; `auth.uid()` boş olduğundan her zaman false döner,
-- yani ziyaretçi hiçbir oda/mesaj satırı görmez. Yalnız ekleyici.
grant execute on function public.can_read_room(uuid) to anon;
