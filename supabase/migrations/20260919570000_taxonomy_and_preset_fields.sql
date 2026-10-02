-- Kategori / alt kategori veritabanında + Hazır Ayar alanları (CLAUDE.md Bölüm 9.84).
--
-- 1) `taxonomy_categories` / `taxonomy_subcategories`: içerik taksonomisi
--    (içerik türü -> kategori -> alt kategori) artık yönetilebilir tablolar.
--    Kaynak tohum: src/lib/taxonomy-seed.ts (uygulama aynı veriyi paketli yedek
--    olarak da taşır; canlıda bu satırlar yedeğin yerini alır). Slug'lar
--    prompts / prompt_requests / generators / presets üzerinde saklanan
--    değerlerdir ve DEĞİŞMEZ — yalnızca isimler/ikon/sıra/aktiflik düzenlenir.
--    Herkes okuyabilir; yazma politikası yoktur (yönetim SQL Editor /
--    service_role ile).
-- 2) `preset_fields` / `preset_options`: kullanıcının kendi hazır alanları ve
--    seçenekleri. `preset_id` doluysa alan o hazır ayara aittir; `null` ise
--    kullanıcının "alan kütüphanesi"dir (herhangi bir prompta/hazır ayara
--    eklenebilir). Seçili değerler `presets.selection` jsonb'sindedir
--    ({ alanId: değer }); platform alanları (kod kataloğu) için ayrı satır yoktur.

-- ===== Taksonomi =============================================================
create table public.taxonomy_categories (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('image', 'text', 'audio', 'video')),
  slug text not null check (slug ~ '^[a-z0-9_]{1,60}$'),
  name_en text not null check (char_length(name_en) between 1 and 80),
  name_tr text not null check (char_length(name_tr) between 1 and 80),
  icon text,
  description_en text,
  description_tr text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, slug)
);

create table public.taxonomy_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.taxonomy_categories (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_]{1,60}$'),
  name_en text not null check (char_length(name_en) between 1 and 80),
  name_tr text not null check (char_length(name_tr) between 1 and 80),
  description_en text,
  description_tr text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create index taxonomy_subcategories_category_idx on public.taxonomy_subcategories (category_id, sort_order);

create trigger taxonomy_categories_set_updated_at before update on public.taxonomy_categories
  for each row execute function public.set_updated_at();
create trigger taxonomy_subcategories_set_updated_at before update on public.taxonomy_subcategories
  for each row execute function public.set_updated_at();

alter table public.taxonomy_categories enable row level security;
alter table public.taxonomy_subcategories enable row level security;
create policy "Taxonomy categories are public" on public.taxonomy_categories for select using (true);
create policy "Taxonomy subcategories are public" on public.taxonomy_subcategories for select using (true);

-- ---- seed: categories (32) ----
insert into public.taxonomy_categories (content_type, slug, name_en, name_tr, icon, description_en, description_tr, sort_order)
values
  ('image', 'human_character', 'Human & Character', 'İnsan & Karakter', 'users', 'People, characters and portrait-led visuals.', 'Portreler, karakterler ve insan odaklı görseller.', 0),
  ('image', 'photography', 'Photography', 'Fotoğrafçılık', 'camera', 'Photography genres and shooting styles.', 'Fotoğraf türleri ve çekim tarzları.', 1),
  ('image', 'art_illustration', 'Art & Illustration', 'Sanat & İllüstrasyon', 'palette', 'Drawing, painting and illustration work.', 'Çizim, boyama ve illüstrasyon çalışmaları.', 2),
  ('image', 'style', 'Style', 'Stil', 'sparkles', 'Visual looks and aesthetic directions.', 'Görsel üslup ve estetik yönler.', 3),
  ('image', 'product_commercial', 'Product & Commercial', 'Ürün & Ticari', 'shopping-bag', 'Product, advertising and brand visuals.', 'Ürün, reklam ve marka görselleri.', 4),
  ('image', 'spaces', 'Spaces', 'Mekân', 'building-2', 'Interiors, exteriors and architectural scenes.', 'İç ve dış mekânlar, mimari sahneler.', 5),
  ('image', 'nature_environment', 'Nature & Environment', 'Doğa & Çevre', 'leaf', 'Nature, animals, sky and environment.', 'Doğa, hayvanlar, gökyüzü ve çevre.', 6),
  ('image', 'design', 'Design', 'Tasarım', 'pen-tool', 'Interfaces, posters, logos and graphic design.', 'Arayüz, poster, logo ve grafik tasarım.', 7),
  ('text', 'writing', 'Writing', 'Yazarlık', 'pen-line', 'Stories, poetry and creative writing.', 'Hikâye, şiir ve yaratıcı yazarlık.', 0),
  ('text', 'social_media', 'Social Media', 'Sosyal Medya', 'share-2', 'Social media posts and captions.', 'Sosyal medya gönderileri ve açıklamaları.', 1),
  ('text', 'marketing', 'Marketing', 'Pazarlama', 'megaphone', 'Ad, sales and campaign copy.', 'Reklam, satış ve kampanya metinleri.', 2),
  ('text', 'seo', 'SEO', 'SEO', 'search', 'SEO articles, keywords and headlines.', 'SEO makaleleri, anahtar kelime ve başlıklar.', 3),
  ('text', 'business_professional', 'Business & Professional', 'İş & Profesyonel', 'briefcase', 'Emails, reports, résumés and business documents.', 'E-posta, rapor, CV ve iş belgeleri.', 4),
  ('text', 'education', 'Education', 'Eğitim', 'graduation-cap', 'Lessons, homework, exams and teaching material.', 'Ders, ödev, sınav ve öğretim içerikleri.', 5),
  ('text', 'research', 'Research', 'Araştırma', 'microscope', 'Research, summaries and analysis.', 'Araştırma, özet ve analiz.', 6),
  ('text', 'coding', 'Coding', 'Kodlama', 'code', 'Writing code, debugging and automation.', 'Kod yazma, hata ayıklama ve otomasyon.', 7),
  ('audio', 'music', 'Music', 'Müzik', 'music', 'Songs, genres and instrumentals.', 'Şarkılar, tür ve enstrümantal çalışmalar.', 0),
  ('audio', 'vocals', 'Vocals', 'Vokal', 'mic', 'Vocal types and singing styles.', 'Vokal türleri ve söyleyiş tarzları.', 1),
  ('audio', 'voiceover', 'Voiceover', 'Seslendirme', 'mic-vocal', 'Voiceover, dubbing and narration.', 'Seslendirme, dublaj ve anlatıcı sesleri.', 2),
  ('audio', 'sound_effects', 'Sound Effects', 'Ses Efektleri', 'audio-lines', 'Sound effects and foley.', 'Ses efektleri ve foley.', 3),
  ('audio', 'podcast', 'Podcast', 'Podcast', 'podcast', 'Podcast intros, conversations and interviews.', 'Podcast girişleri, konuşmaları ve röportajlar.', 4),
  ('audio', 'ambience', 'Ambience', 'Ortam', 'waves', 'Ambient sounds and atmospheres.', 'Ortam sesleri ve atmosferler.', 5),
  ('video', 'cinematic', 'Cinematic', 'Sinematik', 'clapperboard', 'Film, trailers and cinematic scenes.', 'Film, fragman ve sinematik sahneler.', 0),
  ('video', 'social_media', 'Social Media', 'Sosyal Medya', 'smartphone', 'Short-form video and social formats.', 'Kısa video ve sosyal medya formatları.', 1),
  ('video', 'advertising', 'Advertising', 'Reklam', 'megaphone', 'Product and brand advertising videos.', 'Ürün ve marka reklam videoları.', 2),
  ('video', 'animation', 'Animation', 'Animasyon', 'shapes', '2D, 3D and motion-graphics animation.', '2D, 3D ve hareketli grafik animasyonlar.', 3),
  ('video', 'music_video', 'Music Video', 'Müzik Videosu', 'disc-3', 'Music videos, lyric videos and visualizers.', 'Klip, lyric video ve görselleştirmeler.', 4),
  ('video', 'education', 'Education', 'Eğitim', 'graduation-cap', 'Tutorials and educational video.', 'Eğitim videoları ve anlatımlar.', 5),
  ('video', 'story_entertainment', 'Story & Entertainment', 'Hikâye & Eğlence', 'popcorn', 'Short films, comedy, drama and action.', 'Kısa film, komedi, dram ve macera.', 6),
  ('video', 'visual_effects', 'Visual Effects', 'Görsel Efekt', 'wand-sparkles', 'VFX, transitions and camera effects.', 'VFX, geçişler ve kamera efektleri.', 7),
  ('video', 'product_commercial', 'Product & Commercial', 'Ürün & Ticari', 'package', 'Product showcases and commercial video.', 'Ürün tanıtımı ve ticari videolar.', 8),
  ('video', 'documentary', 'Documentary', 'Belgesel', 'video', 'Documentary and news-style content.', 'Belgesel ve haber tarzı içerikler.', 9)
on conflict (content_type, slug) do nothing;

-- ---- seed: subcategories (310) ----
insert into public.taxonomy_subcategories (category_id, slug, name_en, name_tr, sort_order)
select c.id, v.slug, v.name_en, v.name_tr, v.sort_order
from (values
  ('image', 'human_character', 'portrait', 'Portrait', 'Portre', 0),
  ('image', 'human_character', 'character', 'Character', 'Karakter', 1),
  ('image', 'human_character', 'character_design', 'Character Design', 'Karakter Tasarımı', 2),
  ('image', 'human_character', 'human', 'Human', 'İnsan', 3),
  ('image', 'human_character', 'child', 'Child', 'Çocuk', 4),
  ('image', 'human_character', 'elderly', 'Elderly', 'Yaşlı', 5),
  ('image', 'human_character', 'group', 'Group', 'Grup', 6),
  ('image', 'human_character', 'couple', 'Couple', 'Çift', 7),
  ('image', 'human_character', 'fashion', 'Fashion', 'Moda', 8),
  ('image', 'human_character', 'beauty', 'Beauty', 'Güzellik', 9),
  ('image', 'human_character', 'makeup', 'Makeup', 'Makyaj', 10),
  ('image', 'human_character', 'hair', 'Hair', 'Saç', 11),
  ('image', 'human_character', 'body_pose', 'Body & Pose', 'Vücut / Poz', 12),
  ('image', 'photography', 'portrait_photography', 'Portrait Photography', 'Portre Fotoğrafı', 0),
  ('image', 'photography', 'street_photography', 'Street Photography', 'Sokak Fotoğrafı', 1),
  ('image', 'photography', 'landscape', 'Landscape', 'Manzara', 2),
  ('image', 'photography', 'nature', 'Nature', 'Doğa', 3),
  ('image', 'photography', 'night_photography', 'Night Photography', 'Gece Fotoğrafı', 4),
  ('image', 'photography', 'studio', 'Studio', 'Stüdyo', 5),
  ('image', 'photography', 'wedding', 'Wedding', 'Düğün', 6),
  ('image', 'photography', 'travel', 'Travel', 'Seyahat', 7),
  ('image', 'photography', 'architectural_photography', 'Architectural Photography', 'Mimari Fotoğraf', 8),
  ('image', 'photography', 'product_photography', 'Product Photography', 'Ürün Fotoğrafı', 9),
  ('image', 'photography', 'food_photography', 'Food Photography', 'Yemek Fotoğrafı', 10),
  ('image', 'photography', 'fashion_photography', 'Fashion Photography', 'Moda Fotoğrafı', 11),
  ('image', 'photography', 'macro', 'Macro', 'Makro', 12),
  ('image', 'photography', 'wildlife', 'Wildlife', 'Vahşi Yaşam', 13),
  ('image', 'photography', 'minimal', 'Minimal', 'Minimal', 14),
  ('image', 'photography', 'cinematic_photography', 'Cinematic Photography', 'Sinematik', 15),
  ('image', 'photography', 'black_white', 'Black & White', 'Siyah Beyaz', 16),
  ('image', 'art_illustration', 'digital_art', 'Digital Art', 'Dijital Sanat', 0),
  ('image', 'art_illustration', 'concept_art', 'Concept Art', 'Konsept Sanat', 1),
  ('image', 'art_illustration', 'illustration', 'Illustration', 'İllüstrasyon', 2),
  ('image', 'art_illustration', 'cartoon', 'Cartoon', 'Karikatür', 3),
  ('image', 'art_illustration', 'drawing', 'Drawing', 'Çizim', 4),
  ('image', 'art_illustration', 'oil_painting', 'Oil Painting', 'Yağlı Boya', 5),
  ('image', 'art_illustration', 'watercolor', 'Watercolor', 'Suluboya', 6),
  ('image', 'art_illustration', 'sketch', 'Sketch', 'Eskiz', 7),
  ('image', 'art_illustration', 'pixel_art', 'Pixel Art', 'Pixel Art', 8),
  ('image', 'art_illustration', 'poster', 'Poster', 'Poster', 9),
  ('image', 'art_illustration', 'collage', 'Collage', 'Kolaj', 10),
  ('image', 'art_illustration', 'character_illustration', 'Character Illustration', 'Karakter İllüstrasyonu', 11),
  ('image', 'art_illustration', 'painting', 'Painting', 'Boyama', 12),
  ('image', 'art_illustration', 'anime_art', 'Anime Art', 'Anime', 13),
  ('image', 'art_illustration', 'manga_art', 'Manga Art', 'Manga', 14),
  ('image', 'art_illustration', '3d_art', '3D Art', '3D', 15),
  ('image', 'art_illustration', 'fantasy_art', 'Fantasy Art', 'Fantastik', 16),
  ('image', 'art_illustration', 'sci_fi_art', 'Sci-Fi Art', 'Bilim Kurgu', 17),
  ('image', 'art_illustration', 'children_s_illustration', 'Children''s Illustration', 'Çocuk İllüstrasyonu', 18),
  ('image', 'style', 'realistic', 'Realistic', 'Gerçekçi', 0),
  ('image', 'style', 'cinematic', 'Cinematic', 'Sinematik', 1),
  ('image', 'style', 'anime', 'Anime', 'Anime', 2),
  ('image', 'style', 'manga', 'Manga', 'Manga', 3),
  ('image', 'style', '3d', '3D', '3D', 4),
  ('image', 'style', 'pixar_style', 'Pixar-style', 'Pixar Benzeri', 5),
  ('image', 'style', 'cyberpunk', 'Cyberpunk', 'Cyberpunk', 6),
  ('image', 'style', 'fantasy', 'Fantasy', 'Fantastik', 7),
  ('image', 'style', 'retro', 'Retro', 'Retro', 8),
  ('image', 'style', 'vintage', 'Vintage', 'Vintage', 9),
  ('image', 'style', 'minimalist', 'Minimalist', 'Minimalist', 10),
  ('image', 'style', 'noir', 'Noir', 'Noir', 11),
  ('image', 'style', 'steampunk', 'Steampunk', 'Steampunk', 12),
  ('image', 'style', 'dark_fantasy', 'Dark Fantasy', 'Dark Fantasy', 13),
  ('image', 'style', 'low_poly', 'Low Poly', 'Low Poly', 14),
  ('image', 'style', 'futuristic', 'Futuristic', 'Futuristik', 15),
  ('image', 'style', 'editorial', 'Editorial', 'Editorial', 16),
  ('image', 'style', 'luxury', 'Luxury', 'Luxury', 17),
  ('image', 'style', 'streetwear', 'Streetwear', 'Streetwear', 18),
  ('image', 'style', 'dark', 'Dark', 'Dark', 19),
  ('image', 'style', 'surreal', 'Surreal', 'Surreal', 20),
  ('image', 'product_commercial', 'product', 'Product', 'Ürün Görseli', 0),
  ('image', 'product_commercial', 'advertising', 'Advertising', 'Reklam', 1),
  ('image', 'product_commercial', 'e_commerce', 'E-commerce', 'E-ticaret', 2),
  ('image', 'product_commercial', 'packaging', 'Packaging', 'Ambalaj', 3),
  ('image', 'product_commercial', 'brand', 'Brand', 'Marka', 4),
  ('image', 'product_commercial', 'logo', 'Logo', 'Logo', 5),
  ('image', 'product_commercial', 'product_mockup', 'Product Mockup', 'Ürün Mockup', 6),
  ('image', 'product_commercial', 'cosmetics', 'Cosmetics', 'Kozmetik', 7),
  ('image', 'product_commercial', 'clothing', 'Clothing', 'Giyim', 8),
  ('image', 'product_commercial', 'technology', 'Technology', 'Teknoloji', 9),
  ('image', 'product_commercial', 'fashion_product', 'Fashion Product', 'Moda Ürünü', 10),
  ('image', 'product_commercial', 'food_beverage', 'Food & Beverage', 'Yiyecek & İçecek', 11),
  ('image', 'spaces', 'architecture', 'Architecture', 'Mimari', 0),
  ('image', 'spaces', 'interior', 'Interior', 'İç Mekân', 1),
  ('image', 'spaces', 'exterior', 'Exterior', 'Dış Mekân', 2),
  ('image', 'spaces', 'home', 'Home', 'Ev', 3),
  ('image', 'spaces', 'office', 'Office', 'Ofis', 4),
  ('image', 'spaces', 'restaurant', 'Restaurant', 'Restoran', 5),
  ('image', 'spaces', 'store', 'Store', 'Mağaza', 6),
  ('image', 'spaces', 'city', 'City', 'Şehir', 7),
  ('image', 'spaces', 'village', 'Village', 'Köy', 8),
  ('image', 'spaces', 'futuristic_city', 'Futuristic City', 'Fütüristik Şehir', 9),
  ('image', 'spaces', 'hotel', 'Hotel', 'Otel', 10),
  ('image', 'spaces', 'room_design', 'Room Design', 'Oda Tasarımı', 11),
  ('image', 'nature_environment', 'landscape', 'Landscape', 'Manzara', 0),
  ('image', 'nature_environment', 'mountain', 'Mountain', 'Dağ', 1),
  ('image', 'nature_environment', 'sea', 'Sea', 'Deniz', 2),
  ('image', 'nature_environment', 'forest', 'Forest', 'Orman', 3),
  ('image', 'nature_environment', 'desert', 'Desert', 'Çöl', 4),
  ('image', 'nature_environment', 'animal', 'Animal', 'Hayvan', 5),
  ('image', 'nature_environment', 'plant', 'Plant', 'Bitki', 6),
  ('image', 'nature_environment', 'space', 'Space', 'Uzay', 7),
  ('image', 'nature_environment', 'planet', 'Planet', 'Gezegen', 8),
  ('image', 'nature_environment', 'weather', 'Weather', 'Hava Durumu', 9),
  ('image', 'nature_environment', 'flower', 'Flower', 'Çiçek', 10),
  ('image', 'nature_environment', 'sunset', 'Sunset', 'Gün Batımı', 11),
  ('image', 'nature_environment', 'sky', 'Sky', 'Gökyüzü', 12),
  ('image', 'nature_environment', 'seasons', 'Seasons', 'Mevsimler', 13),
  ('image', 'design', 'ui', 'UI', 'UI', 0),
  ('image', 'design', 'ux', 'UX', 'UX', 1),
  ('image', 'design', 'web_design', 'Web Design', 'Web Tasarımı', 2),
  ('image', 'design', 'mobile_app', 'Mobile App', 'Mobil Tasarım', 3),
  ('image', 'design', 'dashboard', 'Dashboard', 'Dashboard', 4),
  ('image', 'design', 'poster', 'Poster', 'Poster', 5),
  ('image', 'design', 'banner', 'Banner', 'Afiş / Banner', 6),
  ('image', 'design', 'social_media', 'Social Media', 'Sosyal Medya', 7),
  ('image', 'design', 'presentation', 'Presentation', 'Sunum', 8),
  ('image', 'design', 'infographic', 'Infographic', 'Infografik', 9),
  ('image', 'design', 'logo_design', 'Logo Design', 'Logo', 10),
  ('image', 'design', 'branding', 'Branding', 'Branding', 11),
  ('image', 'design', 'typography', 'Typography', 'Tipografi', 12),
  ('image', 'design', '3d_design', '3D Design', '3D Tasarım', 13),
  ('image', 'design', 'graphic_design', 'Graphic Design', 'Grafik Tasarım', 14),
  ('text', 'writing', 'story', 'Story', 'Hikâye', 0),
  ('text', 'writing', 'novel', 'Novel', 'Roman', 1),
  ('text', 'writing', 'screenplay', 'Screenplay', 'Senaryo', 2),
  ('text', 'writing', 'poetry', 'Poetry', 'Şiir', 3),
  ('text', 'writing', 'dialogue', 'Dialogue', 'Diyalog', 4),
  ('text', 'writing', 'character_writing', 'Character Writing', 'Karakter Yazımı', 5),
  ('text', 'writing', 'world_building', 'World Building', 'Dünya Kurma', 6),
  ('text', 'writing', 'fiction', 'Fiction', 'Kurgu', 7),
  ('text', 'writing', 'creative_writing', 'Creative Writing', 'Yaratıcı Yazarlık', 8),
  ('text', 'social_media', 'instagram', 'Instagram', 'Instagram', 0),
  ('text', 'social_media', 'tiktok', 'TikTok', 'TikTok', 1),
  ('text', 'social_media', 'youtube', 'YouTube', 'YouTube', 2),
  ('text', 'social_media', 'x_twitter', 'X / Twitter', 'X / Twitter', 3),
  ('text', 'social_media', 'linkedin', 'LinkedIn', 'LinkedIn', 4),
  ('text', 'social_media', 'facebook', 'Facebook', 'Facebook', 5),
  ('text', 'social_media', 'social_media_caption', 'Social Media Caption', 'Sosyal Medya Açıklaması', 6),
  ('text', 'social_media', 'social_media_post', 'Social Media Post', 'Sosyal Medya Gönderisi', 7),
  ('text', 'social_media', 'viral_content', 'Viral Content', 'Viral İçerik', 8),
  ('text', 'marketing', 'ad_copy', 'Ad Copy', 'Reklam Metni', 0),
  ('text', 'marketing', 'sales_copy', 'Sales Copy', 'Satış Metni', 1),
  ('text', 'marketing', 'product_description', 'Product Description', 'Ürün Açıklaması', 2),
  ('text', 'marketing', 'landing_page', 'Landing Page', 'Landing Page', 3),
  ('text', 'marketing', 'email_marketing', 'Email Marketing', 'E-posta Pazarlama', 4),
  ('text', 'marketing', 'campaign', 'Campaign', 'Kampanya', 5),
  ('text', 'marketing', 'brand_copy', 'Brand Copy', 'Marka Metni', 6),
  ('text', 'marketing', 'slogan', 'Slogan', 'Slogan', 7),
  ('text', 'marketing', 'cta', 'CTA', 'CTA', 8),
  ('text', 'seo', 'seo_article', 'SEO Article', 'SEO Makalesi', 0),
  ('text', 'seo', 'blog', 'Blog', 'Blog', 1),
  ('text', 'seo', 'keyword', 'Keyword', 'Anahtar Kelime', 2),
  ('text', 'seo', 'meta_description', 'Meta Description', 'Meta Description', 3),
  ('text', 'seo', 'headline', 'Headline', 'Başlık', 4),
  ('text', 'seo', 'product_seo', 'Product SEO', 'Ürün SEO', 5),
  ('text', 'seo', 'content_optimization', 'Content Optimization', 'İçerik Optimizasyonu', 6),
  ('text', 'business_professional', 'email', 'Email', 'E-posta', 0),
  ('text', 'business_professional', 'resume', 'Resume', 'CV', 1),
  ('text', 'business_professional', 'cover_letter', 'Cover Letter', 'Ön Yazı', 2),
  ('text', 'business_professional', 'report', 'Report', 'Rapor', 3),
  ('text', 'business_professional', 'presentation', 'Presentation', 'Sunum', 4),
  ('text', 'business_professional', 'meeting_summary', 'Meeting Summary', 'Toplantı Özeti', 5),
  ('text', 'business_professional', 'business_plan', 'Business Plan', 'İş Planı', 6),
  ('text', 'business_professional', 'proposal', 'Proposal', 'Teklif', 7),
  ('text', 'business_professional', 'documentation', 'Documentation', 'Dokümantasyon', 8),
  ('text', 'education', 'lesson', 'Lesson', 'Ders', 0),
  ('text', 'education', 'homework', 'Homework', 'Ödev', 1),
  ('text', 'education', 'exam', 'Exam', 'Sınav', 2),
  ('text', 'education', 'quiz', 'Quiz', 'Quiz', 3),
  ('text', 'education', 'lesson_plan', 'Lesson Plan', 'Ders Planı', 4),
  ('text', 'education', 'summary', 'Summary', 'Özet', 5),
  ('text', 'education', 'flashcard', 'Flashcard', 'Flashcard', 6),
  ('text', 'education', 'teacher', 'Teacher', 'Öğretmen', 7),
  ('text', 'education', 'student', 'Student', 'Öğrenci', 8),
  ('text', 'research', 'research', 'Research', 'Araştırma', 0),
  ('text', 'research', 'summarization', 'Summarization', 'Özetleme', 1),
  ('text', 'research', 'analysis', 'Analysis', 'Analiz', 2),
  ('text', 'research', 'comparison', 'Comparison', 'Karşılaştırma', 3),
  ('text', 'research', 'data_analysis', 'Data Analysis', 'Veri Analizi', 4),
  ('text', 'research', 'literature', 'Literature', 'Literatür', 5),
  ('text', 'research', 'reporting', 'Reporting', 'Raporlama', 6),
  ('text', 'coding', 'code', 'Code', 'Kod', 0),
  ('text', 'coding', 'web', 'Web', 'Web', 1),
  ('text', 'coding', 'mobile', 'Mobile', 'Mobil', 2),
  ('text', 'coding', 'frontend', 'Frontend', 'Frontend', 3),
  ('text', 'coding', 'backend', 'Backend', 'Backend', 4),
  ('text', 'coding', 'javascript', 'JavaScript', 'JavaScript', 5),
  ('text', 'coding', 'typescript', 'TypeScript', 'TypeScript', 6),
  ('text', 'coding', 'python', 'Python', 'Python', 7),
  ('text', 'coding', 'sql', 'SQL', 'SQL', 8),
  ('text', 'coding', 'api', 'API', 'API', 9),
  ('text', 'coding', 'debugging', 'Debugging', 'Debugging', 10),
  ('text', 'coding', 'automation', 'Automation', 'Otomasyon', 11),
  ('audio', 'music', 'song', 'Song', 'Şarkı', 0),
  ('audio', 'music', 'instrumental', 'Instrumental', 'Enstrümantal', 1),
  ('audio', 'music', 'beat', 'Beat', 'Beat', 2),
  ('audio', 'music', 'electronic', 'Electronic', 'Elektronik', 3),
  ('audio', 'music', 'rock', 'Rock', 'Rock', 4),
  ('audio', 'music', 'pop', 'Pop', 'Pop', 5),
  ('audio', 'music', 'hip_hop', 'Hip Hop', 'Hip Hop', 6),
  ('audio', 'music', 'rap', 'Rap', 'Rap', 7),
  ('audio', 'music', 'jazz', 'Jazz', 'Jazz', 8),
  ('audio', 'music', 'classical', 'Classical', 'Klasik', 9),
  ('audio', 'music', 'ambient', 'Ambient', 'Ambient', 10),
  ('audio', 'music', 'lo_fi', 'Lo-fi', 'Lo-fi', 11),
  ('audio', 'music', 'synthwave', 'Synthwave', 'Synthwave', 12),
  ('audio', 'music', 'metal', 'Metal', 'Metal', 13),
  ('audio', 'music', 'folk', 'Folk', 'Folk', 14),
  ('audio', 'music', 'film_score', 'Film Score', 'Film Müziği', 15),
  ('audio', 'music', 'game_music', 'Game Music', 'Oyun Müziği', 16),
  ('audio', 'vocals', 'female_vocal', 'Female Vocal', 'Kadın Vokal', 0),
  ('audio', 'vocals', 'male_vocal', 'Male Vocal', 'Erkek Vokal', 1),
  ('audio', 'vocals', 'choir', 'Choir', 'Koro', 2),
  ('audio', 'vocals', 'backing_vocal', 'Backing Vocal', 'Arka Vokal', 3),
  ('audio', 'vocals', 'rap_vocal', 'Rap Vocal', 'Rap Vokal', 4),
  ('audio', 'vocals', 'spoken_word', 'Spoken Word', 'Spoken Word', 5),
  ('audio', 'voiceover', 'advertisement', 'Advertisement', 'Reklam', 0),
  ('audio', 'voiceover', 'dubbing', 'Dubbing', 'Dublaj', 1),
  ('audio', 'voiceover', 'story', 'Story', 'Hikâye', 2),
  ('audio', 'voiceover', 'podcast', 'Podcast', 'Podcast', 3),
  ('audio', 'voiceover', 'education', 'Education', 'Eğitim', 4),
  ('audio', 'voiceover', 'narrator', 'Narrator', 'Anlatıcı', 5),
  ('audio', 'voiceover', 'character_voice', 'Character Voice', 'Karakter Sesi', 6),
  ('audio', 'sound_effects', 'sfx', 'SFX', 'SFX', 0),
  ('audio', 'sound_effects', 'cinematic_effect', 'Cinematic Effect', 'Sinematik Efekt', 1),
  ('audio', 'sound_effects', 'game_effect', 'Game Effect', 'Oyun Efekti', 2),
  ('audio', 'sound_effects', 'nature_sounds', 'Nature Sounds', 'Doğa Sesleri', 3),
  ('audio', 'sound_effects', 'ambience', 'Ambience', 'Ortam', 4),
  ('audio', 'sound_effects', 'foley', 'Foley', 'Foley', 5),
  ('audio', 'sound_effects', 'ui_sounds', 'UI Sounds', 'UI Sesleri', 6),
  ('audio', 'sound_effects', 'transition_sounds', 'Transition Sounds', 'Geçiş Sesleri', 7),
  ('audio', 'podcast', 'podcast_intro', 'Podcast Intro', 'Podcast Giriş', 0),
  ('audio', 'podcast', 'podcast_outro', 'Podcast Outro', 'Podcast Çıkış', 1),
  ('audio', 'podcast', 'podcast_conversation', 'Podcast Conversation', 'Podcast Konuşması', 2),
  ('audio', 'podcast', 'interview', 'Interview', 'Röportaj', 3),
  ('audio', 'podcast', 'storytelling', 'Storytelling', 'Hikâye Anlatımı', 4),
  ('audio', 'ambience', 'rain', 'Rain', 'Yağmur', 0),
  ('audio', 'ambience', 'forest', 'Forest', 'Orman', 1),
  ('audio', 'ambience', 'city', 'City', 'Şehir', 2),
  ('audio', 'ambience', 'cafe', 'Cafe', 'Kafe', 3),
  ('audio', 'ambience', 'sea', 'Sea', 'Deniz', 4),
  ('audio', 'ambience', 'storm', 'Storm', 'Fırtına', 5),
  ('audio', 'ambience', 'space', 'Space', 'Uzay', 6),
  ('audio', 'ambience', 'horror', 'Horror', 'Korku', 7),
  ('audio', 'ambience', 'ambient', 'Ambient', 'Ambient', 8),
  ('video', 'cinematic', 'film', 'Film', 'Film', 0),
  ('video', 'cinematic', 'cinematic_scene', 'Cinematic Scene', 'Sinematik Sahne', 1),
  ('video', 'cinematic', 'trailer', 'Trailer', 'Trailer', 2),
  ('video', 'cinematic', 'teaser', 'Teaser', 'Teaser', 3),
  ('video', 'cinematic', 'film_intro', 'Film Intro', 'Film Intro', 4),
  ('video', 'cinematic', 'film_outro', 'Film Outro', 'Film Outro', 5),
  ('video', 'social_media', 'tiktok', 'TikTok', 'TikTok', 0),
  ('video', 'social_media', 'reels', 'Reels', 'Reels', 1),
  ('video', 'social_media', 'shorts', 'Shorts', 'Shorts', 2),
  ('video', 'social_media', 'youtube', 'YouTube', 'YouTube', 3),
  ('video', 'social_media', 'story', 'Story', 'Story', 4),
  ('video', 'social_media', 'viral_video', 'Viral Video', 'Viral Video', 5),
  ('video', 'advertising', 'product_ad', 'Product Ad', 'Ürün Reklamı', 0),
  ('video', 'advertising', 'brand_ad', 'Brand Ad', 'Marka Reklamı', 1),
  ('video', 'advertising', 'social_media_ad', 'Social Media Ad', 'Sosyal Medya Reklamı', 2),
  ('video', 'advertising', 'ugc', 'UGC', 'UGC', 3),
  ('video', 'advertising', 'product_presentation', 'Product Presentation', 'Ürün Tanıtımı', 4),
  ('video', 'advertising', 'campaign', 'Campaign', 'Kampanya', 5),
  ('video', 'animation', '2d', '2D', '2D', 0),
  ('video', 'animation', '3d', '3D', '3D', 1),
  ('video', 'animation', 'anime', 'Anime', 'Anime', 2),
  ('video', 'animation', 'motion_graphics', 'Motion Graphics', 'Motion Graphics', 3),
  ('video', 'animation', 'character_animation', 'Character Animation', 'Character Animation', 4),
  ('video', 'animation', 'explainer', 'Explainer', 'Explainer', 5),
  ('video', 'animation', 'cartoon', 'Cartoon', 'Cartoon', 6),
  ('video', 'music_video', 'music_video', 'Music Video', 'Klip', 0),
  ('video', 'music_video', 'lyric_video', 'Lyric Video', 'Lyric Video', 1),
  ('video', 'music_video', 'visualizer', 'Visualizer', 'Visualizer', 2),
  ('video', 'music_video', 'concert', 'Concert', 'Konser', 3),
  ('video', 'music_video', 'performance', 'Performance', 'Performans', 4),
  ('video', 'education', 'tutorial', 'Tutorial', 'Tutorial', 0),
  ('video', 'education', 'lesson', 'Lesson', 'Ders', 1),
  ('video', 'education', 'explainer', 'Explainer', 'Explainer', 2),
  ('video', 'education', 'presentation', 'Presentation', 'Sunum', 3),
  ('video', 'education', 'screen_recording', 'Screen Recording', 'Ekran Kaydı', 4),
  ('video', 'education', 'educational_animation', 'Educational Animation', 'Eğitim Animasyonu', 5),
  ('video', 'story_entertainment', 'short_film', 'Short Film', 'Kısa Film', 0),
  ('video', 'story_entertainment', 'story', 'Story', 'Hikâye', 1),
  ('video', 'story_entertainment', 'comedy', 'Comedy', 'Komedi', 2),
  ('video', 'story_entertainment', 'horror', 'Horror', 'Korku', 3),
  ('video', 'story_entertainment', 'action', 'Action', 'Aksiyon', 4),
  ('video', 'story_entertainment', 'drama', 'Drama', 'Dram', 5),
  ('video', 'story_entertainment', 'fantasy', 'Fantasy', 'Fantastik', 6),
  ('video', 'story_entertainment', 'sci_fi', 'Sci-Fi', 'Bilim Kurgu', 7),
  ('video', 'visual_effects', 'vfx', 'VFX', 'VFX', 0),
  ('video', 'visual_effects', 'cgi', 'CGI', 'CGI', 1),
  ('video', 'visual_effects', 'green_screen', 'Green Screen', 'Green Screen', 2),
  ('video', 'visual_effects', 'transition', 'Transition', 'Transition', 3),
  ('video', 'visual_effects', 'slow_motion', 'Slow Motion', 'Slow Motion', 4),
  ('video', 'visual_effects', 'time_lapse', 'Time Lapse', 'Time Lapse', 5),
  ('video', 'visual_effects', 'camera_effects', 'Camera Effects', 'Camera Effects', 6),
  ('video', 'product_commercial', 'product_video', 'Product Video', 'Ürün Videosu', 0),
  ('video', 'product_commercial', 'e_commerce', 'E-commerce', 'E-ticaret', 1),
  ('video', 'product_commercial', 'product_presentation', 'Product Presentation', 'Ürün Tanıtımı', 2),
  ('video', 'product_commercial', 'fashion', 'Fashion', 'Moda', 3),
  ('video', 'product_commercial', 'automotive', 'Automotive', 'Otomobil', 4),
  ('video', 'product_commercial', 'technology', 'Technology', 'Teknoloji', 5),
  ('video', 'product_commercial', 'restaurant', 'Restaurant', 'Restoran', 6),
  ('video', 'documentary', 'nature', 'Nature', 'Doğa', 0),
  ('video', 'documentary', 'history', 'History', 'Tarih', 1),
  ('video', 'documentary', 'science', 'Science', 'Bilim', 2),
  ('video', 'documentary', 'travel', 'Travel', 'Seyahat', 3),
  ('video', 'documentary', 'interview', 'Interview', 'Röportaj', 4),
  ('video', 'documentary', 'news', 'News', 'Haber', 5)
) as v(content_type, category_slug, slug, name_en, name_tr, sort_order)
join public.taxonomy_categories c on c.content_type = v.content_type and c.slug = v.category_slug
on conflict (category_id, slug) do nothing;

-- ===== Hazır Ayar alanları ===================================================
create table public.preset_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  preset_id uuid references public.presets (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  type text not null check (type in ('single_select', 'multi_select', 'dropdown', 'text', 'number', 'slider', 'toggle', 'color')),
  kind text not null default 'phrase' check (kind in ('phrase', 'suffix')),
  content_types text[] not null default '{}',
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index preset_fields_owner_idx on public.preset_fields (owner_id) where preset_id is null;
create index preset_fields_preset_idx on public.preset_fields (preset_id, sort_order);

create table public.preset_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.preset_fields (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  value text not null check (char_length(btrim(value)) between 1 and 200),
  sort_order integer not null default 0,
  fragment_en text check (fragment_en is null or char_length(fragment_en) <= 200),
  fragment_tr text check (fragment_tr is null or char_length(fragment_tr) <= 200),
  created_at timestamptz not null default now()
);
create index preset_options_field_idx on public.preset_options (field_id, sort_order);

create trigger preset_fields_set_updated_at before update on public.preset_fields
  for each row execute function public.set_updated_at();

alter table public.preset_fields enable row level security;
alter table public.preset_options enable row level security;

-- Bir alan: sahibine her zaman; bir hazır ayara aitse o hazır ayar herkese
-- açık + yayınlanmışsa herkese (hazır ayarı uygulayabilmek için alanlarını okumak gerekir).
create policy "Preset fields readable by owner or via a public preset"
  on public.preset_fields for select
  using (
    owner_id = auth.uid()
    or (preset_id is not null and exists (
      select 1 from public.presets p
      where p.id = preset_fields.preset_id and p.status = 'published' and p.visibility = 'public'
    ))
  );
-- Bir hazır ayara alan eklemek için o hazır ayarın sahibi olmak gerekir.
create policy "Users create their own preset fields"
  on public.preset_fields for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (preset_id is null or exists (select 1 from public.presets p where p.id = preset_id and p.creator_id = auth.uid()))
  );
create policy "Users update their own preset fields"
  on public.preset_fields for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (preset_id is null or exists (select 1 from public.presets p where p.id = preset_id and p.creator_id = auth.uid()))
  );
create policy "Users delete their own preset fields"
  on public.preset_fields for delete to authenticated using (owner_id = auth.uid());

create policy "Preset options are readable wherever their field is"
  on public.preset_options for select
  using (exists (select 1 from public.preset_fields f where f.id = preset_options.field_id));
create policy "Users manage options of their own fields"
  on public.preset_options for insert to authenticated
  with check (exists (select 1 from public.preset_fields f where f.id = preset_options.field_id and f.owner_id = auth.uid()));
create policy "Users update options of their own fields"
  on public.preset_options for update to authenticated
  using (exists (select 1 from public.preset_fields f where f.id = preset_options.field_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.preset_fields f where f.id = preset_options.field_id and f.owner_id = auth.uid()));
create policy "Users delete options of their own fields"
  on public.preset_options for delete to authenticated
  using (exists (select 1 from public.preset_fields f where f.id = preset_options.field_id and f.owner_id = auth.uid()));
