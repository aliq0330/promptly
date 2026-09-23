-- Demo görsellerini loremflickr.com'dan picsum.photos'a taşır (CLAUDE.md 9.43).
-- demo-users.sql'i daha önce çalıştırdıysan tüm seed'i yeniden çalıştırmak
-- yerine yalnızca bunu çalıştırman yeterli. Yalnızca 5eed… demo satırlarına
-- dokunur, tekrar çalıştırmak güvenlidir.
begin;

update public.prompt_media
set url = replace(regexp_replace(url,
  '^https://loremflickr\.com/(\d+)/(\d+)/([^?]+)\?lock=(\d+)$',
  'https://picsum.photos/seed/\3-\4/\1/\2'), ',', '-')
where url like 'https://loremflickr.com/%'
  and prompt_id::text like '5eed%';

update public.generators
set cover_url = replace(regexp_replace(cover_url,
  '^https://loremflickr\.com/(\d+)/(\d+)/([^?]+)\?lock=(\d+)$',
  'https://picsum.photos/seed/\3-\4/\1/\2'), ',', '-')
where cover_url like 'https://loremflickr.com/%'
  and id::text like '5eed%';

commit;
