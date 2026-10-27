-- /followers ve /following sayfaları (docs/history/257-*) kişileri en yeni takip önce, 50'şerli sayfalarla okur:
--   where following_id = $1 order by created_at desc, follower_id   (takipçiler)
--   where follower_id  = $1 order by created_at desc, following_id  (takip ettiklerim)
-- Yalnızca ekleyici: iki bileşik dizin; 100 000 takipçili bir kişide her sayfa için tüm satırları sıralamak yerine dizinden okunur.
create index if not exists follows_following_created_idx on public.follows (following_id, created_at desc, follower_id);
create index if not exists follows_follower_created_idx on public.follows (follower_id, created_at desc, following_id);
