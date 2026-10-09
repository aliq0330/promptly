-- Video ve ses promptlarına GERÇEKTEN oynatılabilir örnek çıktı ekler.
-- (17 video + 14 ses; dosyalar public/viral-seed/media/ altında, siteyle yayınlanır.)
--
-- Medya, supabase/seed/media/ betikleriyle SENTEZLENMİŞTİR (yapay zekâ çıktısı değil):
-- videolar prompta uygun renk paletli hareketli gradyanlar, sesler prompta uygun
-- tür/tempoda elle programlanmış kısa parçalardır; kapaklar parçanın gerçek dalga biçimi.
-- Siteye "örnek çıktı" olarak yazarın kendi sonucu (prompt_results) + kart kapağı
-- (prompt_media) şeklinde eklenir. Tekrar çalıştırmak güvenlidir (zaten varsa atlar).
--
-- ÖNCE bu dalın merge edilip sitenin yayınlanmış olması gerekir; yoksa dosyalar 404 verir.
begin;

with m (prompt_id, kind, media_url, thumb_url, w, h) as (values
  ('5eed0001-0000-4000-8000-000000002000', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2000.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2000.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002001', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2001.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2001.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002002', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2002.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2002.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002003', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2003.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2003.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002004', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2004.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2004.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002005', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2005.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2005.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002006', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2006.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2006.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002007', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2007.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2007.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002008', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2008.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2008.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002009', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2009.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2009.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200a', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200a.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200a.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200b', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200b.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200b.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200c', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200c.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200c.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200d', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200d.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200d.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200e', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200e.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200e.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200f', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200f.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200f.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002010', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2010.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2010.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000003000', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3000.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3000.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003001', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3001.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3001.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003002', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3002.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3002.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003003', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3003.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3003.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003004', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3004.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3004.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003005', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3005.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3005.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003006', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3006.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3006.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003007', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3007.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3007.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003008', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3008.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3008.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003009', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3009.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3009.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300a', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300a.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300a.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300b', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300b.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300b.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300c', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300c.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300c.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300d', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300d.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300d.jpg', 480, 480)
)
insert into public.prompt_results (prompt_id, creator_id, media_type, media_url, thumbnail_url, tool, has_modification)
select m.prompt_id::uuid, p.author_id, m.kind, m.media_url, m.thumb_url, p.tool, false
from m join public.prompts p on p.id = m.prompt_id::uuid
where p.content_type = m.kind
  and not exists (select 1 from public.prompt_results r where r.prompt_id = p.id and r.creator_id = p.author_id);

with m (prompt_id, kind, media_url, thumb_url, w, h) as (values
  ('5eed0001-0000-4000-8000-000000002000', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2000.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2000.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002001', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2001.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2001.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002002', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2002.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2002.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002003', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2003.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2003.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002004', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2004.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2004.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002005', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2005.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2005.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002006', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2006.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2006.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002007', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2007.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2007.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002008', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2008.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2008.jpg', 360, 640),
  ('5eed0001-0000-4000-8000-000000002009', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2009.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2009.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200a', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200a.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200a.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200b', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200b.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200b.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200c', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200c.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200c.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200d', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200d.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200d.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200e', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200e.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200e.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-00000000200f', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200f.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-200f.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000002010', 'video', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2010.mp4', 'https://aliq0330.github.io/promptly/viral-seed/media/v-2010.jpg', 640, 360),
  ('5eed0001-0000-4000-8000-000000003000', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3000.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3000.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003001', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3001.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3001.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003002', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3002.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3002.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003003', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3003.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3003.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003004', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3004.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3004.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003005', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3005.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3005.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003006', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3006.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3006.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003007', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3007.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3007.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003008', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3008.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3008.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-000000003009', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3009.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-3009.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300a', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300a.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300a.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300b', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300b.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300b.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300c', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300c.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300c.jpg', 480, 480),
  ('5eed0001-0000-4000-8000-00000000300d', 'audio', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300d.mp3', 'https://aliq0330.github.io/promptly/viral-seed/media/a-300d.jpg', 480, 480)
)
insert into public.prompt_media (prompt_id, url, width, height, alt, position)
select m.prompt_id::uuid, m.thumb_url, m.w, m.h, p.title, 0
from m join public.prompts p on p.id = m.prompt_id::uuid
where p.content_type = m.kind
  and not exists (select 1 from public.prompt_media pm where pm.prompt_id = p.id);

select p.content_type as tur, count(*) as prompt,
       count(*) filter (where exists (select 1 from public.prompt_results r where r.prompt_id = p.id)) as sonuclu,
       count(*) filter (where exists (select 1 from public.prompt_media pm where pm.prompt_id = p.id)) as kapakli
from public.prompts p where p.content_type in ('video', 'audio') group by 1 order by 1;

commit;
