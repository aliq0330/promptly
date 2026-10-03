-- Workflow'a alt kategori (Bölüm 9.89): oluşturma ekranları artık aynı TaxonomyPicker'ı
-- (tür → kategori → alt kategori) kullanıyor; workflows tablosunda yalnızca alt kategori eksikti.
alter table public.workflows add column if not exists subcategory text;
