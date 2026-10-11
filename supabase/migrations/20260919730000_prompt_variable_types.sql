-- Tipli prompt değişkenleri (CLAUDE.md §9.145, 1a).
--
-- Bir değişken artık yalnızca serbest metin değil: tek seçim, çoklu seçim,
-- sayı, kaydırıcı ya da aç/kapa olabilir. Prompt metnine yazılan değer her
-- zaman düz bir string olduğundan `{ad}` jeton motoru DEĞİŞMİYOR; yalnızca
-- değeri üreten giriş denetimi türe göre değişiyor.
--
-- Tamamen EKLEYİCİ: mevcut satırlar otomatik `type = 'text'` kalır, hiçbir
-- kolon düşürülmez / yeniden adlandırılmaz.
--   options : [{ "label": "...", "value": "..." }]  (select / multi_select)
--   config  : { min, max, step }                    (number / slider)
--             { onText, offText }                   (toggle)

alter table public.prompt_variables
  add column if not exists type text not null default 'text',
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table public.prompt_variables
  add constraint prompt_variables_type_check
    check (type in ('text', 'select', 'multi_select', 'number', 'slider', 'toggle')),
  add constraint prompt_variables_options_shape
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 50),
  add constraint prompt_variables_config_shape
    check (jsonb_typeof(config) = 'object'),
  add constraint prompt_variables_choice_has_options
    check (type not in ('select', 'multi_select') or jsonb_array_length(options) >= 2);
