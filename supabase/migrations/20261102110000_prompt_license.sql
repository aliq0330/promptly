-- Prompt başına kullanım hakkı / lisans (docs/history/296-*): yazarın niyetini gösteren etiket.
--
-- YALNIZCA EKLEYİCİ (expand): tek yeni sütun, boş = "belirtilmemiş". Hiçbir mevcut satıra dokunulmaz (3012 toplu yüklenen kaydın CC0 olduğu
-- kaynak notundan zaten türetilir — `detectLicense`; arayüz açık seçimi önce, kaynak notunu sonra kullanır). Bu bir hukuki koruma DEĞİLDİR.
--
--   cc0 = serbest · cc-by = atıfla serbest · personal = yalnız kişisel kullanım · all-rights = tüm hakları saklı

alter table public.prompts
  add column if not exists license text check (license is null or license in ('cc0', 'cc-by', 'personal', 'all-rights'));
