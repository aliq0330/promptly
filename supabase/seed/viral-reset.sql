-- ============================================================================
-- Promptly: siteyi sıfırla + viral promptlarla doldur — OTOMATİK ÜRETİLDİ.
-- Kaynak: supabase/seed/viral-content.mjs + viral-cases.json
--         node supabase/seed/build-viral-seed.mjs
--
-- !! GERİ DÖNÜŞÜ YOK !! Aşağıdaki her şey KALICI olarak silinir (soft-delete yok):
--    promptlar, prompt istekleri, generatorlar, workflowlar, hazır ayarlar,
--    yorumlar, beğeniler, kaydedilenler, özel koleksiyonlar, mesajlar,
--    bildirimler, şikâyetler, Studio oturumları.
-- KALANLAR: kullanıcı hesapları + profiller, takipler, engeller, her kullanıcının
--    "Genel" koleksiyonu (boşaltılır), etiket ve taksonomi kataloğu.
--
-- Sonra 72 paylaşım ekler (18 demo kullanıcıya dağıtılmış; her biri
-- 4-4 prompt). Görseller siteyle birlikte yayınlanır
-- (public/viral-seed/ → https://aliq0330.github.io/promptly/viral-seed/N.jpg), bu SQL'i çalıştırmadan ÖNCE
-- bu dalın merge edilip sitenin yeniden yayınlanmış olması gerekir.
--
-- Çalıştırmadan önce: Supabase Dashboard → Database → Backups'tan yedek al.
-- Supabase Dashboard → SQL Editor'e yapıştır, tek seferde çalıştır (tek transaction).
-- Hata olursa hiçbir şey değişmez. Storage'daki dosyalar bu SQL ile silinmez.
-- ============================================================================

begin;

-- Güvenlik: beklenen 18 demo kullanıcı yerinde değilse hiçbir şey silme.
do $guard$
begin
  if (select count(*) from auth.users where id in ('5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000004', '5eed0000-0000-4000-8000-000000000005', '5eed0000-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b', '5eed0000-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-00000000000e', '5eed0000-0000-4000-8000-00000000000f', '5eed0000-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000012')) <> 18 then
    raise exception 'Beklenen % demo kullanıcının tamamı bulunamadı; işlem iptal edildi.', 18;
  end if;
end
$guard$;

-- --- 1. Tüm içeriği sil -------------------------------------------------------
-- Silme sırasında soft-delete / "varsayılan koleksiyon silinemez" trigger'ları
-- cascade'i iptal etmesin diye geçici olarak kapatılıyor, sonunda açılıyor.
alter table public.prompt_comments disable trigger user;
alter table public.prompts disable trigger user;
alter table public.prompt_requests disable trigger user;
alter table public.collections disable trigger user;

delete from public.notifications;
delete from public.reports;
delete from public.message_reactions;
delete from public.message_hidden_for;
delete from public.messages;
delete from public.conversations;            -- conversation_members cascade
do $studio$   -- Studio tabloları (kaldırma migration'ı uygulanmadıysa) varsa temizle
begin
  if to_regclass('public.studio_session_versions') is not null then execute 'delete from public.studio_session_versions'; end if;
  if to_regclass('public.studio_sessions') is not null then execute 'delete from public.studio_sessions'; end if;
end
$studio$;
delete from public.comment_likes;
delete from public.prompt_comments;
delete from public.prompt_likes;
delete from public.prompt_saves;
delete from public.generator_saves;
delete from public.collection_items;
delete from public.collections where not is_default;   -- "Genel" koleksiyonlar kalır
delete from public.content_edits;
delete from public.workflows;                -- steps / connections / tags / media cascade
delete from public.generators;               -- versions / runs / tags / media cascade
delete from public.presets;                  -- tags / uses / fields cascade
delete from public.preset_fields;            -- kullanıcı alan kütüphanesi (preset'siz)
-- Yanıtı seçilmiş (answered) isteklerde yanıt prompt'u silinince seçim boşalır ve
-- prompt_requests_status_shape CHECK'ini bozar; önce bu istekleri kapalıya çek.
update public.prompt_requests set selected_response_prompt_id = null, status = 'closed', closed_by_owner = true
where selected_response_prompt_id is not null;
delete from public.prompts;                  -- media / tags / variables / dna / sürümler / sonuçlar cascade
delete from public.prompt_requests;          -- tags / media cascade

alter table public.prompt_comments enable trigger user;
alter table public.prompts enable trigger user;
alter table public.prompt_requests enable trigger user;
alter table public.collections enable trigger user;

-- Denormalize sayaçları sıfırla (silmeler trigger'larla zaten düşürdü; emin olmak için).
update public.tags set prompt_usage_count = 0, request_usage_count = 0;
update public.collections set item_count = 0;
update public.profiles set follower_count = (select count(*) from public.follows f where f.following_id = profiles.id),
                           following_count = (select count(*) from public.follows f where f.follower_id = profiles.id);

-- --- 2. Viral promptlar ---------------------------------------------------------

-- Kullanılan etiketler yoksa oluşturulur (varsa dokunulmaz).
insert into public.tags (slug, label) values ('3d-render', '3D Render'), ('ai-sanat', 'AI Sanat'), ('animation', 'Animation'), ('anime', 'Anime'), ('architecture', 'Architecture'), ('clean-background', 'Clean Background'), ('composition', 'Composition'), ('editorial-photography', 'Editorial Photography'), ('fantastik', 'Fantastik'), ('golden-hour', 'Golden Hour'), ('karakter-tasarimi', 'Karakter Tasarımı'), ('kodlama', 'Kodlama'), ('lighting', 'Lighting'), ('manzara', 'Manzara'), ('mimari', 'Mimari'), ('minimalist', 'Minimalist'), ('neon', 'Neon'), ('photography', 'Photography'), ('portre', 'Portre'), ('retro', 'Retro'), ('shadow', 'Shadow'), ('siberpunk', 'Siberpunk'), ('soyut', 'Soyut'), ('studio-lighting', 'Studio Lighting'), ('surreal', 'Sürreal'), ('texture', 'Texture'), ('typography', 'Typography') on conflict (slug) do nothing;

insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000001', 'Minyatür siberpunk şehri (tilt-shift)', 'Yukarıdan, tilt-shift etkisiyle çekilmiş, oyuncak gibi minyatür bir siberpunk manzarası. [Cyberpunk] yerine istediğin temayı yazabilirsin.

Kaynak: terry623
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A highly detailed miniature [Cyberpunk] landscape viewed from above, using a tilt-shift lens effect. The scene is filled with toy-like elements, all rendered in high-resolution CG. Dramatic lighting creates a cinematic atmosphere, with vivid colors and strong contrast, emphasizing depth of field and a realistic micro-perspective, making the viewer feel as if overlooking a toy world. The image contains many visual jokes and details worth repeated viewing.', array['gpt-image:gpt-image-1'], 'image', 'style', 'cyberpunk', 'published', 'public', 'original', '2026-09-28T04:04:35.036Z', '2026-09-28T04:04:35.036Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000047', 'https://aliq0330.github.io/promptly/viral-seed/71.jpg', 853, 1280, 'Minyatür siberpunk şehri (tilt-shift)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000047', 'siberpunk', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000047', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000047', 'neon', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000001', 'Ultra gerçekçi 3D oyun karakteri', 'Eski bir strateji oyunundaki karakterin tasarımını ultra gerçekçi bir 3D render olarak yeniden yorumlatan prompt.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1913648013144137840
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Ultra-realistic 3D rendered image that replicates the character design of Natasha from Command & Conquer: Red Alert 3 in 2008, following the original model exactly. The scene is set in a dim and cluttered bedroom from the year 2008. The character is sitting on the carpet, facing an old-fashioned television that is playing Command & Conquer: Red Alert 3 and a game console controller.
The entire room is filled with a nostalgic atmosphere of the year 2008: snack packaging bags, soda cans, posters, and tangled wires are everywhere. Natasha Volkova is captured in the moment of turning her head, looking back at the camera over her shoulder. There is an innocent smile on her iconic ethereally beautiful face. Her upper body is slightly twisted, with a natural dynamic, as if she is reacting to being startled by the flash.
The flash slightly overexposes her face and clothes, making her silhouette stand out more prominently in the dimly lit room. The whole photo appears raw and natural. The strong contrast between light and dark casts deep shadows behind her. The image is full of tactile feel, with a simulated texture that resembles an authentic film snapshot from 2008.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-20T17:31:57.181Z', '2026-09-20T17:31:57.181Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000043', 'https://aliq0330.github.io/promptly/viral-seed/67.jpg', 1024, 1024, 'Ultra gerçekçi 3D oyun karakteri', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000043', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000043', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000043', 'retro', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000001', 'Fütüristik logo koleksiyon kartı', 'Koyu, neon vurgulu, yarı saydam köşeleri yuvarlatılmış fütüristik bir koleksiyon kartı. JSON biçiminde yazılmış, markaya göre uyarlanabilir.

Kaynak: @hewarsaber · https://x.com/hewarsaber/status/1912933875166171515
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', '{
    "prompt": "A futuristic trading card with a dark, moody neon aesthetic and soft sci-fi lighting. The card features a semi-transparent, rounded rectangle with slightly muted glowing edges, appearing as if made of holographic glass. At the center is a large glowing logo of {{logo}}, with no additional text or label, illuminated with a smooth gradient of {{colors}}, but not overly bright. The reflections on the card surface should be subtle, with a slight glossy finish catching ambient light. The background is a dark carbon fiber texture or deep gradient with soft ambient glows bleeding into the edges. Add subtle light rays streaming down diagonally from the top, giving the scene a soft cinematic glow. Apply light motion blur to the edges and reflections to give the scene a sense of depth and energy, as if it''s part of a high-end tech animation still. Below the card, include realistic floor reflections that mirror the neon edges and logo—slightly diffused for a grounded, futuristic look. Text elements are minimal and softly lit: top-left shows ''{{ticker}}'', top-right has a stylized signature, and the bottom displays ''{{company_name}}'' with a serial number ''{{card_number}}'', a revenue badge reading ''{{revenue}}'', and the year ''{{year}}''. Typography should have a faint glow with slight blurring, and all elements should feel premium, elegant, and softly illuminated—like a high-end cyberpunk collectible card.",
    "style": {
        "lighting": "Neon glow, soft reflections",
        "font": "Modern sans-serif, clean and minimal",
        "layout": "Centered, structured like a digital collectible card",
        "materials": "Glass, holographic plastic, glowing metal edges"
    },
    "parameters": {
        "logo": "Tesla logo",
        "ticker": "TSLA",
        "company_name": "Tesla Inc.",
        "card_number": "#0006",
        "revenue": "$96.8B",
        "year": "2025",
        "colors": [
            "red",
            "white",
            "dark gray"
        ]
    },
    "medium": "3D render, high-resolution digital art",
    "size": "1080px by 1080px"
}', array['gpt-image:gpt-image-1'], 'image', 'design', 'branding', 'published', 'public', 'original', '2026-10-07T07:26:58.283Z', '2026-10-07T07:26:58.283Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000044', 'https://aliq0330.github.io/promptly/viral-seed/68.jpg', 1024, 1024, 'Fütüristik logo koleksiyon kartı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000044', 'neon', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000044', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000044', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-000000000001', 'Minimalist fütürist sergi posteri', 'Açık gri zeminde 3:4, 4K çözünürlükte minimalist bir fütürist sergi posteri üretir.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1921906728763105394
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A vertical (3:4) 4K-resolution minimalist futurist exhibition poster with an ultra-light cool gray background (#f4f4f4).

At the center of the poster is a fluid 3D metaball shaped like a classic Coca-Cola bottle in full form, rendered in frosted glass with delicate grainy noise.
The fluid gradient transitions from Coca-Cola Red (#E41C23) to Pearl White (#FFFFFF), giving it a silky glass-like appearance.

High-position softbox lighting casts long, soft colored shadows and a subtle halo.

The fluid overlaps with the text: letters obscured by the frosted glass appear with a gentle Gaussian blur.
•The main title, the classic red “Coca-Cola” logo, is centered and partially obscured by the fluid. The covered letters are slightly blurred through the frosted glass.
•The subtitle, in bold all-caps modern sans-serif pure black font, reads: “TASTE THE FEELING”, placed below the main title. It is also partially overlapped by the fluid and blurred in those areas, while the rest remains sharp.

The overall layout is clean with generous whitespace, balanced composition, sharp focus, and HDR high dynamic range.', array['gpt-image:gpt-image-1'], 'image', 'design', 'poster', 'published', 'public', 'original', '2026-09-27T23:47:03.580Z', '2026-09-27T23:47:03.580Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000009', 'https://aliq0330.github.io/promptly/viral-seed/9.jpg', 853, 1280, 'Minimalist fütürist sergi posteri', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000009', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000009', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000009', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000002', 'JSON dosyası görünümlü kartvizit', 'VS Code''da açılmış bir JSON dosyası gibi tasarlanmış kartvizit; elde tutulurken çekilmiş yakın plan.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1915696926596415492
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A close-up shot of a hand holding a business card designed to look like a JSON file opened in VS Code. The card shows code formatted in realistic syntax-highlighted JSON code. The window includes typical toolbar icons and a title bar labeled Business Card.json, styled exactly like the interface of VS Code. Background is slightly blurred, keeping the focus on the card.
The card displays the following code formatted in JSON:
{
  "name": "Jamez Bondos",
  "title": "Your Title",
  "email": "your@email.com",
  "link": "yourwebsite"
}', array['gpt-image:gpt-image-1'], 'image', 'design', 'branding', 'published', 'public', 'original', '2026-09-13T01:50:31.756Z', '2026-09-13T01:50:31.756Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000050', 'https://aliq0330.github.io/promptly/viral-seed/80.jpg', 1024, 1024, 'JSON dosyası görünümlü kartvizit', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000050', 'kodlama', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000050', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000050', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000002', 'Logo şeklinde yaratıcı kitaplık', 'Bir logonun formundan esinlenen, akışkan eğrili modern bir kitaplık fotoğrafı. [LOGO] yerine istediğin markayı yaz.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1916517976414495161
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a photograph of a modern bookshelf inspired by the shape of [LOGO]. The bookshelf features flowing, interconnected curves forming multiple sections of varying sizes. It is made of sleek matte black metal with wooden shelves inside the loops. Soft, warm LED lighting outlines the inner curves. The bookshelf is mounted on a neutral-toned wall and holds a mix of colorful books, small plants, and minimalistic art pieces. The overall vibe is creative, elegant, and slightly futuristic', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-10-05T05:14:37.352Z', '2026-10-05T05:14:37.352Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000004a', 'https://aliq0330.github.io/promptly/viral-seed/74.jpg', 1024, 1024, 'Logo şeklinde yaratıcı kitaplık', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004a', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004a', 'composition', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004a', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000002', 'Parlayan çizgilerle anatomi diyagramı', 'Bir canlının anatomisini parlak mavi çizgilerden oluşan bir ağla gösteren dijital illüstrasyon. [SUBJECT] yerine istediğin canlıyı yaz.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1914644426334314545
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A digital illustration of a [SUBJECT], portrayed with a network of glowing clean pristine blue lines outlining its anatomy. The image is set against a dark background, highlighting the [SUBJECT] form and features. A specific area such as [PART] is emphasized with a red glow to indicate a point of interest or significance. The style is both educational and visually captivating, designed to resemble an advanced imaging technique', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'digital_art', 'published', 'public', 'original', '2026-09-04T13:30:04.676Z', '2026-09-04T13:30:04.676Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000053', 'https://aliq0330.github.io/promptly/viral-seed/83.jpg', 1024, 1024, 'Parlayan çizgilerle anatomi diyagramı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000053', 'neon', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000053', 'soyut', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000053', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000001b', '5eed0000-0000-4000-8000-000000000002', 'Q-versiyon emoji çıkartma seti', 'Kendi fotoğrafından altı farklı pozda chibi tarzı çıkartma seti üretir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1909800530739679488
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a brand-new set of chibi-style stickers featuring the user as the main character, with six unique poses:
  1.	Making a playful peace sign with both hands and winking.
  2.	Tearful eyes and slightly trembling lips, showing a cute crying expression.
  3.	Arms wide open in a warm, enthusiastic hug pose.
  4.	Lying on their side asleep, resting on a tiny pillow with a sweet smile.
  5.	Pointing forward with confidence, surrounded by shining visual effects.
  6.	Blowing a kiss, with heart symbols floating around.
Maintain the chibi aesthetic:
– Exaggerated, expressive big eyes
– Soft facial lines
– Playful, short black hairstyle
– A white outfit with a bold neckline design
Background: Vibrant red with star or colorful confetti elements for decoration. Leave some clean white space around each sticker.
Aspect ratio: 9:16', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'character_illustration', 'published', 'public', 'original', '2026-09-26T00:26:22.136Z', '2026-09-26T00:26:22.136Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000001b', 'https://aliq0330.github.io/promptly/viral-seed/27.jpg', 853, 1280, 'Q-versiyon emoji çıkartma seti', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001b', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001b', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001b', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-000000000003', 'Siyah-beyaz portre sanatı', 'Yumuşak gri geçişli arka planda, yüzünün yalnızca bir kısmı gölgeden beliren editoryal siyah-beyaz portre.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1922150692145283299
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A high-resolution black and white portrait artwork, in an editorial and fine art photography style. The background features a soft gradient, transitioning from mid-gray to almost pure white, creating a sense of depth and tranquility. Fine film grain adds a tactile, analog-like softness to the image, reminiscent of classic black and white photography.

On the right side of the frame, a blurred yet striking face of Harry Potter subtly emerges from the shadows, not in a traditional pose, but as if caught in a moment of thought or breath. Only a part of his face is visible: perhaps an eye, a cheekbone, the contour of his lips, evoking a sense of mystery, intimacy, and elegance. His features are delicate yet profound, exuding a melancholic and poetic beauty without being overly dramatic.

A gentle, directional light, softly diffused, caresses the curve of his cheek or glints in his eye—this is the emotional core of the image. The rest of the composition is dominated by ample negative space, intentionally kept simple, allowing the image to breathe. There are no texts, no logos in the image—only an interplay of light, shadow, and emotion.

The overall atmosphere is abstract yet deeply human, like a fleeting glance or a half-remembered dream: intimate, timeless, and poignantly beautiful.', array['gpt-image:gpt-image-1'], 'image', 'photography', 'black_white', 'published', 'public', 'original', '2026-09-24T09:22:07.856Z', '2026-09-24T09:22:07.856Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000063', 'https://aliq0330.github.io/promptly/viral-seed/99.jpg', 853, 1280, 'Siyah-beyaz portre sanatı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000063', 'portre', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000063', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000063', 'studio-lighting', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000003', 'Buzlu cam ardında bulanık siluet', 'Buzlu bir yüzeyin arkasında bulanık bir siluet; yalnızca seçilen kısmı net görünen siyah-beyaz fotoğraf. [SUBJECT] ve [PART] alanlarını doldur.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1921487841634156999
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A black and white photograph shows the blurred silhouette of a [SUBJECT] behind a frosted or translucent surface. The [PART] is sharply defined and pressed against the surface, creating a stark contrast with the rest of the hazy, indistinct figure. The background is a soft gradient of gray tones, enhancing the mysterious and artistic atmosphere.', array['gpt-image:gpt-image-1'], 'image', 'photography', 'black_white', 'published', 'public', 'original', '2026-10-08T09:51:52.827Z', '2026-10-08T09:51:52.827Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000062', 'https://aliq0330.github.io/promptly/viral-seed/98.jpg', 853, 1280, 'Buzlu cam ardında bulanık siluet', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000062', 'portre', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000062', 'shadow', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000062', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000003', 'Aile düğün fotoğrafı (Q-versiyon)', 'Fotoğraftaki kişileri düğün kıyafetli 3D chibi karakterlere dönüştürür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @balconychy · https://x.com/balconychy/status/1909426314643222595
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the people in the photo into chibi-style 3D characters. The parents are dressed in Western wedding attire — the father in a formal suit, the mother in a wedding gown. The child is a beautiful flower girl holding a bouquet.

The background features a colorful floral arch.
The characters are in 3D chibi style, while the environment is photorealistic.
The entire scene is placed inside a photo frame.', array['gpt-image:gpt-image-1'], 'image', 'human_character', 'group', 'published', 'public', 'original', '2026-09-19T21:05:00.566Z', '2026-09-19T21:05:00.566Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000021', 'https://aliq0330.github.io/promptly/viral-seed/33.jpg', 853, 1280, 'Aile düğün fotoğrafı (Q-versiyon)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000021', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000021', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000021', 'portre', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-000000000003', 'Çift pozlama (double exposure)', 'İki görüntüyü üst üste bindiren çift pozlama efekti.

Kaynak: rezzycheck (Sora) · https://sora.com/g/gen_01jtc9btfzef080z31v8w9rtbw
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Double exposure, Midjourney style, merging, blending, overlay double exposure image, Double Exposure style, An exceptional masterpiece by Yukisakura revealing a fantastic double exposure composition of Aragorn son of Arathorn''s silhouette harmoniously intertwined with the visually striking, rugged landscapes of Middle Earth during a lively spring season. Sun-bathed pine forests, mountain peaks, and a lone horse cutting through the trail echo outward through the fabric of his figure, adding layers of narrative and solitude. Beautiful tension builds as the stark monochrome background maintains razor-sharp contrast, drawing all focus to the richly layered double exposure. Characterized by its vibrant full-color scheme within Aragorn''s silhouette and crisp, deliberate lines that trace every contour with emotional precision. (Detailed:1.45). (Detailed background:1.4).', array['gpt-image:gpt-image-1'], 'image', 'photography', 'portrait_photography', 'published', 'public', 'original', '2026-09-21T10:45:24.883Z', '2026-09-21T10:45:24.883Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000056', 'https://aliq0330.github.io/promptly/viral-seed/86.jpg', 853, 1280, 'Çift pozlama (double exposure)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000056', 'portre', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000056', 'surreal', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000056', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000004', 'Nostaljik anime film posteri', 'Bilinen bir hikâyeyi katlanma izleriyle eskitilmiş, nostaljik bir anime film afişine dönüştürür.

Kaynak: photis (Sora) · https://sora.com/g/gen_01jsfxrdpjfpebnyed8yaz42nf
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', '{The Lord of the Rings} anime film poster, the anime is in the style of High School DXD. Visible even folds are seen across the poster as it’s been folded over time, and due to some creases over damaging the poster has caused some physical damage scuffing along the creases and the color has partially faded. Indiscriminate flaps and folds and scratches all around simply from moving back and forth causing subtle yet incremental damage with the ever expanding of entropy we cannot escape, but the loving memories in our hearts will forever be whole. Making the objects we collect along the way priceless is the essence you feel when looking at this nostalgic poster.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'poster', 'published', 'public', 'original', '2026-09-03T07:46:58.649Z', '2026-09-03T07:46:58.649Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000004c', 'https://aliq0330.github.io/promptly/viral-seed/76.jpg', 853, 1280, 'Nostaljik anime film posteri', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004c', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004c', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004c', 'fantastik', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000004', 'Renkli vektör sanat şehir posteri', 'Büyük şehir başlıklı, canlı renkli yaz teması vektör sanat posteri. Şehir adını değiştirerek kullan.

Kaynak: @michaelrabone · https://x.com/michaelrabone/status/1913865394139316291
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Barcelona Spain colourful summer vector art poster with big "BARCELONA" title at the top and smaller "SPAIN" title under', array['gpt-image:gpt-image-1'], 'image', 'design', 'poster', 'published', 'public', 'original', '2026-09-27T21:50:37.210Z', '2026-09-27T21:50:37.210Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000003b', 'https://aliq0330.github.io/promptly/viral-seed/59.jpg', 853, 1280, 'Renkli vektör sanat şehir posteri', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003b', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003b', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003b', 'manzara', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000004', 'Retro tarzı tanıtım posteri', 'Kırmızı-sarı ışınsal desenli, iddialı yazılı retro bir tanıtım posteri.

Kaynak: @dotey · https://x.com/dotey/status/1905251524248248650
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A retro-style promotional poster emphasizing bold Chinese text. The background features a red-and-yellow radial burst pattern. In the center of the composition is a beautiful young woman illustrated in a refined vintage art style—she smiles warmly with a graceful, approachable presence. The poster advertises GPT’s latest AI image generation service with key slogans in Chinese, such as: “Shocking price: 9.9 per image”, “Supports all scenes, image blending, partial redrawing”, “3 revisions per image”, and “Direct AI output with no need for manual edits”. At the bottom, prominently display the call-to-action: “If you’re interested, click ‘I want this’ in the bottom-right corner”. Illustrate a hand pressing a button in the bottom-right, and place the OpenAI logo in the bottom-left.', array['gpt-image:gpt-image-1'], 'image', 'design', 'poster', 'published', 'public', 'original', '2026-10-01T10:22:27.794Z', '2026-10-01T10:22:27.794Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000003', 'https://aliq0330.github.io/promptly/viral-seed/3.jpg', 853, 1280, 'Retro tarzı tanıtım posteri', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000003', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000003', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000003', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-000000000004', 'Yaratıcı ipek evren', 'Bir emojiyi veya nesneyi ipek kumaşla sarılmış yumuşak bir 3D objeye dönüştürür.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1914864217867608175
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the {❄️} into a soft 3D object with a silk texture. The entire surface of the object is wrapped in smooth and flowing silk fabric, featuring surreal wrinkle details, soft highlights, and shadows. The object gently floats in the center of a clean light gray background, creating a light and elegant atmosphere. The overall style is surreal, tactile, and modern, conveying a sense of comfort and refined playfulness. Studio lighting, high-resolution rendering.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-08-27T12:42:06.046Z', '2026-08-27T12:42:06.046Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000042', 'https://aliq0330.github.io/promptly/viral-seed/66.jpg', 1024, 1024, 'Yaratıcı ipek evren', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000042', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000042', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000042', 'soyut', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-000000000005', 'El çizimi infografik kart', 'Bej kâğıt dokulu, el çizimi tarzında 9:16 dikey infografik kart. Konuyu kendin belirleyebilirsin.

Kaynak: @dotey · https://x.com/dotey/status/1907870919852179850
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a hand-drawn style infographic card in a 9:16 vertical format. The card should have a clear theme, with a beige or off-white paper-textured background. The overall design should reflect a simple, warm, and handmade aesthetic.

At the top of the card, use large, eye-catching brush-style Chinese cursive calligraphy in red and black for the title, creating strong visual contrast. All text should be in Chinese cursive script. The layout should be divided into 2 to 4 clear sections, each conveying a core idea through concise and refined Chinese phrases. The calligraphy should maintain a fluid, rhythmic style that is both legible and artistically expressive. Leave appropriate blank space around the text.

The card should be accented with simple and fun hand-drawn illustrations or icons — such as figures or symbolic elements — to enhance visual appeal and spark thought or emotional resonance. The overall layout should emphasize visual balance and include ample whitespace, ensuring the design is clean, clear, and easy to read.

“Building a personal brand (IP) is long-term compounding.
Keep updating daily, and results will come — because 99% of people can’t keep it up!”', array['gpt-image:gpt-image-1'], 'image', 'design', 'infographic', 'published', 'public', 'original', '2026-08-27T13:19:46.641Z', '2026-08-27T13:19:46.641Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000026', 'https://aliq0330.github.io/promptly/viral-seed/38.jpg', 853, 1280, 'El çizimi infografik kart', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000026', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000026', 'composition', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000026', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000005', 'El çizimi infografik kart (bilişsel konu)', 'Aynı el çizimi infografik düzeni; bilişsel gelişim ve çevre konusuna uyarlanmış örnek.

Kaynak: @dotey · https://x.com/dotey/status/1907903480678985784
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a hand-drawn style infographic card in vertical 9:16 ratio. The card should have a clear theme, with a beige or off-white paper-textured background. The overall design should convey a rustic, friendly, and handmade aesthetic.

At the top of the card, feature a bold, eye-catching title in large Chinese cursive brush calligraphy using contrasting red and black colors. All text content should be in Chinese cursive script, and the layout should be divided into 2 to 4 clear sections. Each section expresses a core idea with brief and concise Chinese phrases. The cursive font should retain a smooth, rhythmic flow, remaining legible while carrying artistic appeal.

The card should include simple, playful hand-drawn illustrations or icons, such as figures or symbolic elements, to enhance visual interest and spark reader reflection or emotional resonance.

The overall layout should maintain visual balance, with ample white space reserved to ensure clarity, simplicity, and ease of reading and understanding.
<h1><span style="color:red">“Cognition”</span> defines your ceiling  
<span style="color:red">“Circle”</span> defines your opportunities</h1>  
– You can’t earn money beyond your level of cognition,  
– Nor encounter opportunities beyond your social circle.', array['gpt-image:gpt-image-1'], 'image', 'design', 'infographic', 'published', 'public', 'original', '2026-09-27T07:39:29.971Z', '2026-09-27T07:39:29.971Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000022', 'https://aliq0330.github.io/promptly/viral-seed/34.jpg', 853, 1280, 'El çizimi infografik kart (bilişsel konu)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000022', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000022', 'composition', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000022', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000005', 'Kelimenin anlamını harflere işleme', 'Bir kelimenin anlamını harflerin içine yerleştirip kısa bir açıklamayla sunan tipografi çalışması.

Kaynak: @dotey · https://x.com/dotey/status/1918529055340576812
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Integrate the meaning of the word into the letters, cleverly blending graphics and letters.
Word: {beautify}
Add a brief explanation of the word below.', array['gpt-image:gpt-image-1'], 'image', 'design', 'typography', 'published', 'public', 'original', '2026-09-11T03:59:01.076Z', '2026-09-11T03:59:01.076Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000057', 'https://aliq0330.github.io/promptly/viral-seed/87.jpg', 1024, 1024, 'Kelimenin anlamını harflere işleme', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000057', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000057', 'soyut', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000057', 'minimalist', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000005', 'Çocuklar için boyama sayfası', 'Doğrudan yazdırılabilir, siyah-beyaz çizgili boyama sayfası; renk referansıyla birlikte çalışır.

Kaynak: @dotey · https://x.com/dotey/status/1919522110395080838
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A black and white line drawing coloring illustration, suitable for direct printing on standard size (8.5x11 inch) paper, without paper borders. The overall illustration style is fresh and simple, using clear and smooth black outline lines, without shadows, grayscale, or color filling, with a pure white background for easy coloring.
[At the same time, for the convenience of users who are not good at coloring, please generate a complete colored version in the lower right corner as a small image for reference]
Suitable for: [6-9 year old children]
Scene description:
[A unicorn is walking on the grass in the forest, with bright sunshine, blue sky and white clouds]', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'drawing', 'published', 'public', 'original', '2026-09-08T13:56:46.127Z', '2026-09-08T13:56:46.127Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000058', 'https://aliq0330.github.io/promptly/viral-seed/88.jpg', 853, 1280, 'Çocuklar için boyama sayfası', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000058', 'clean-background', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000058', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000058', 'animation', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-000000000006', '35mm film stilinde uçan ada', 'Gökyüzünde süzülen bir şehir adasını 35mm film estetiğiyle üretir. Şehri değiştirebilirsin.

Kaynak: @dotey · https://x.com/dotey/status/1905020833451348283
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', '35 mm photo of Moscow floating in the sky on a flying islands.', array['gpt-image:gpt-image-1'], 'image', 'photography', 'cinematic_photography', 'published', 'public', 'original', '2026-10-01T21:10:53.693Z', '2026-10-01T21:10:53.693Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000001e', 'https://aliq0330.github.io/promptly/viral-seed/30.jpg', 1280, 853, '35mm film stilinde uçan ada', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001e', 'surreal', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001e', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001e', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000006', 'Portaldan geçen karakter', 'Fotoğraftaki kişinin 3D chibi versiyonu, parlayan bir portaldan geçerken izleyicinin elini tutuyor.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1908910838636765204
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A 3D chibi-style version of the person in the photo is stepping through a glowing portal, reaching out and holding the viewer’s hand. As the character pulls the viewer forward, they turn back with a dynamic glance, inviting the viewer into their world.
Behind the portal is the viewer’s real-life environment: a typical programmer’s study with a desk, monitor, and laptop, rendered in realistic detail. Inside the portal lies the character’s 3D chibi world, inspired by the photo, with a cool blue color scheme that sharply contrasts with the real-world surroundings.
The portal itself is a perfectly elliptical frame glowing with mysterious blue and purple light, positioned at the center of the image as a gateway between the two worlds.
The scene is captured from a third-person perspective, clearly showing the viewer’s hand being pulled into the character’s world. Use a 2:3 aspect ratio.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-10-08T06:03:13.139Z', '2026-10-08T06:03:13.139Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000006', 'https://aliq0330.github.io/promptly/viral-seed/6.jpg', 853, 1280, 'Portaldan geçen karakter', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000006', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000006', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000006', 'fantastik', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000006', 'Koleksiyon kartını parçalayan Lara Croft', 'Bir macera koleksiyon kartının çerçevesini kırarak dışarı fırlayan sinematik, ultra fotogerçekçi illüstrasyon.

Kaynak: @op7418 · https://x.com/op7418/status/1912782048160542886
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'An ultra-photorealistic, cinematic-style illustration depicting Lara Croft dynamically bursting through the frame of an “Archaeological Adventure” trading card. She is caught mid-jump or swinging on a rope, wearing her iconic adventurer outfit and possibly firing dual pistols. The muzzle flashes help shatter the card’s ancient stone-carved border, creating a visible dimensional rupture with energy cracks and spatial distortions, scattering dust and debris outward.

Her body lunges forward with powerful momentum, breaking through the card’s flat plane, emphasizing strong motion depth. Inside the card (the background) is a depiction of dense jungle ruins or a trap-filled ancient tomb. The shattered card fragments mix with crumbling stone, flying vines, broken ancient coins, and spent shell casings.

The title “Archaeological Adventure” and the name “Lara Croft” (accompanied by a stylized artifact icon) remain visible on the remaining cracked and weathered parts of the card. The scene is lit with adventurous, dynamic lighting that emphasizes her agility and the perilous environment.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'digital_art', 'published', 'public', 'original', '2026-09-23T07:26:31.343Z', '2026-09-23T07:26:31.343Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000032', 'https://aliq0330.github.io/promptly/viral-seed/50.jpg', 853, 1280, 'Koleksiyon kartını parçalayan Lara Croft', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000032', 'composition', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000032', 'ai-sanat', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000032', 'fantastik', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000004d', '5eed0000-0000-4000-8000-000000000006', 'Kristal küre içinde hikâye sahnesi', 'Pencere kenarındaki sıcak ışıkta duran kristal küre; içinde küçük bir hikâye sahnesi anlatır.

Kaynak: @dotey · https://x.com/dotey/status/1916530529324699858
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A delicate crystal ball rests quietly on a warm, softly lit tabletop by the window. The background is blurred and hazy, with warm-toned sunlight gently passing through the crystal ball, refracting specks of golden light that softly illuminate the dim surroundings.
Inside the crystal ball, a miniature three-dimensional world themed around {Chang’e Flying to the Moon} is naturally displayed — a finely detailed, dreamlike 3D scene. All characters and objects are rendered in adorable chibi style, exquisitely crafted and visually charming, with vivid emotional interactions between them.
The overall atmosphere is rich with East Asian fantasy elements, full of intricate details and a surreal magical realism texture. The entire scene feels poetic and dreamy, luxurious yet elegant, radiating a gentle, comforting glow — as if imbued with life through the warm play of light and shadow.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'fantasy_art', 'published', 'public', 'original', '2026-09-08T15:14:36.645Z', '2026-09-08T15:14:36.645Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000004d', 'https://aliq0330.github.io/promptly/viral-seed/77.jpg', 1024, 1024, 'Kristal küre içinde hikâye sahnesi', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004d', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004d', 'lighting', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004d', 'surreal', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-000000000007', 'Özel anime figürü', 'Masa üstüne konmuş, telefonla çekilmiş gibi görünen anime tarzı bir figür fotoğrafı üretir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1920851135516082246
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate an anime-style figure photo placed on a desktop, presented from a casual, everyday snapshot perspective as if taken with a mobile phone. The figure model is based on the attached character photo, accurately reproducing the full body posture, facial expression, and clothing style of the person in the photo, ensuring the entire figure is fully rendered. The overall design is exquisite and detailed, with hair and clothing featuring natural, soft gradient colors and fine textures. The style leans towards Japanese anime, rich in detail, with realistic textures and a beautiful appearance.', array['gpt-image:gpt-image-1'], 'image', 'style', 'anime', 'published', 'public', 'original', '2026-09-19T03:16:14.216Z', '2026-09-19T03:16:14.216Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000060', 'https://aliq0330.github.io/promptly/viral-seed/96.jpg', 853, 1280, 'Özel anime figürü', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000060', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000060', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000060', '3d-render', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000007', 'Japon tarzı iki panelli manga', '"Kız başkanın günlük iş hayatı" temalı, sevimli anime çizgisinde iki panelli dikey manga.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @hellokaton · https://x.com/hellokaton/status/1910900979194646959
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a two-panel vertical manga in a cute Japanese anime style, theme: “The Daily Work Life of a Girl President.”

Character Design:
Transform the person in the uploaded image into a cute, moe-style anime girl while preserving all key details from the photo — including the outfit (a suit), hairstyle (bright golden-yellow), and facial features.

Panel 1:
- Expression: Pouting, disappointed, resting her cheek on one hand
- Text box: “What do I dooo?! He won’t take my call! (；´д｀)”
- Scene: Warm-toned office, with the U.S. flag in the background. On the desk: a pile of hamburgers and a vintage red rotary phone. The character is on the left side of the frame, the phone on the right.

Panel 2:
- Expression: Furious, face red with anger, gritting teeth
- Action: Slams the desk hard, making the hamburgers jump
- Speech bubble: “Hmph! Double the tariffs! Ignoring me is their loss! ( `д´ )”
- Scene: Same office, now a complete mess

Additional Notes:
- Use a cute, casual handwritten font for all text
- Keep the composition full and expressive, with adequate space for dialogue and intentional white space
- Aspect ratio: 2:3
- The overall visual tone should be colorful and energetic, with a distinctly cartoony style', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'manga_art', 'published', 'public', 'original', '2026-09-11T15:55:43.961Z', '2026-09-11T15:55:43.961Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000028', 'https://aliq0330.github.io/promptly/viral-seed/40.jpg', 853, 1280, 'Japon tarzı iki panelli manga', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000028', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000028', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000028', 'animation', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000007', 'Anime tarzı rozet', 'Fotoğraftaki kişiden saçaklı, yuvarlak bir anime rozeti üretir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @Alittlefatwhale · https://x.com/Alittlefatwhale/status/1922512847030124905
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Based on the person in the attachment, generate a photo of an anime-style badge. Requirements:
Material: Tassel
Shape: Circular
Main subject: A hand holding the badge', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'anime_art', 'published', 'public', 'original', '2026-10-04T04:17:47.616Z', '2026-10-04T04:17:47.616Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000010', 'https://aliq0330.github.io/promptly/viral-seed/16.jpg', 1024, 1024, 'Anime tarzı rozet', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000010', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000010', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000010', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000007', 'Düz tasarımlı çıkartma', 'Fotoğrafı minimalist düz tasarımda chibi çıkartma illüstrasyonuna çevirir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1908044836953108490
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Turn this photo into a chibi-style sticker illustration in a minimalist flat design.
– Keep the character’s recognizable features
– Use a cute, simplified aesthetic
– The sticker should have a thick white border
– The character should break out of the circular frame, adding a playful touch
– The circular base should be a solid flat color (no 3D or gradients)
– Background should be transparent
The overall style should be clean, modern, and visually appealing for use as a fun Q-version sticker.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'illustration', 'published', 'public', 'original', '2026-09-17T15:49:59.021Z', '2026-09-17T15:49:59.021Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000001c', 'https://aliq0330.github.io/promptly/viral-seed/28.jpg', 1024, 1024, 'Düz tasarımlı çıkartma', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001c', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001c', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001c', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-000000000008', 'Minyatür 3D bina', 'Dev bir kahve bardağı şeklindeki tuhaf bir kafenin 3D chibi tarzı minyatür tasarımı.

Kaynak: @dotey · https://x.com/dotey/status/1913759515700285569
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', '3D chibi-style miniature design of a whimsical Starbucks café, shaped like an oversized takeaway coffee cup complete with a lid and straw. The building has two floors, with large glass windows that clearly reveal a cozy and refined interior: wooden furniture, warm lighting, and busy baristas at work. On the street, cute little figurines are strolling or sitting, surrounded by benches, street lamps, and potted plants, creating a charming corner of the city. The overall aesthetic follows a detailed and realistic miniature cityscape style, with soft lighting that evokes a relaxing afternoon atmosphere.', array['gpt-image:gpt-image-1'], 'image', 'spaces', 'architecture', 'published', 'public', 'original', '2026-09-05T09:31:02.866Z', '2026-09-05T09:31:02.866Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000038', 'https://aliq0330.github.io/promptly/viral-seed/56.jpg', 853, 1280, 'Minyatür 3D bina', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000038', 'mimari', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000038', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000038', 'architecture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000008', 'Kişiye özel oda tasarımı', 'Izometrik görünümde, C4D kalitesinde sevimli bir 3D yatak odası tasarımı.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1910698005193515370
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Design a cozy bedroom in a cute 3D style with C4D-quality rendering, presented in an isometric view. The room includes a bed, bookshelf, sofa, green plants, a computer desk, and a computer setup. A framed painting hangs on the wall. Outside the window, a nighttime cityscape is visible with glowing buildings and a dark sky. All furniture and objects should have a soft, rounded, stylized design to match the cute 3D aesthetic. Lighting should be warm and inviting, creating a comfortable nighttime indoor atmosphere.', array['gpt-image:gpt-image-1'], 'image', 'spaces', 'room_design', 'published', 'public', 'original', '2026-09-02T12:24:00.257Z', '2026-09-02T12:24:00.257Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000007', 'https://aliq0330.github.io/promptly/viral-seed/7.jpg', 1024, 1024, 'Kişiye özel oda tasarımı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000007', 'mimari', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000007', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000007', 'architecture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000008', 'Minyatür üç boyutlu sahne (tilt-shift)', 'Tilt-shift tekniğiyle, bir sahnenin chibi tarzı minyatür üç boyutlu sunumu.

Kaynak: @dotey · https://x.com/dotey/status/1911609122547449886
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Miniature three-dimensional scene presentation using tilt-shift photography techniques, depicting a chibi-style version of the scene {Sun Wukong’s Three Battles with the White Bone Demon}', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-20T05:53:37.415Z', '2026-09-20T05:53:37.415Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000029', 'https://aliq0330.github.io/promptly/viral-seed/41.jpg', 1280, 853, 'Minyatür üç boyutlu sahne (tilt-shift)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000029', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000029', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000029', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000008', 'Lego şehir manzarası (Şanghay Bund)', 'Şanghay Bund''u Lego stilinde, canlı renklerle ve yüksek detayla üretir. Şehri değiştirebilirsin.

Kaynak: @dotey · https://x.com/dotey/status/1917713810346872902
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a highly detailed and vividly colored LEGO-style scene of the Shanghai Bund. The foreground features the iconic historical buildings of the Bund, meticulously recreated with LEGO bricks in Western and neoclassical architectural styles — including clock towers, domes, and colonnades. LEGO minifigures are seen strolling along the riverfront, taking photos, and sightseeing, with classic LEGO-style cars parked along the street.
In the background lies the spectacular Huangpu River, assembled with translucent blue LEGO bricks. On the water, LEGO ferries and tour boats sail along. Across the river stands the skyline of Lujiazui in Pudong, including the Oriental Pearl Tower, Shanghai Tower, Jin Mao Tower, and Shanghai World Financial Center — all rendered as vibrant, lifelike LEGO skyscrapers.
The sky is LEGO’s signature bright blue, adorned with a few white LEGO brick clouds, creating a visual full of energy and modernity.', array['gpt-image:gpt-image-1'], 'image', 'spaces', 'city', 'published', 'public', 'original', '2026-09-26T22:47:40.429Z', '2026-09-26T22:47:40.429Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000004f', 'https://aliq0330.github.io/promptly/viral-seed/79.jpg', 1280, 853, 'Lego şehir manzarası (Şanghay Bund)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004f', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004f', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000004f', 'mimari', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000009', 'Moda dergisi kapağı stili', 'Pembe qipao giyen bir kadın, kelebekler ve dergi kapağı düzeniyle yüksek detaylı moda kapağı.

Kaynak: @dotey · https://x.com/dotey/status/1912536019905233194
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A beautiful woman wearing a pink qipao, adorned with delicate floral accessories on her head and colorful blossoms woven into her hair. Around her neck is an elegant white lace collar. One of her hands gently holds several large butterflies. The overall photography style features high-definition detail and texture, resembling a fashion magazine cover. The word “FASHION DESIGN” is placed at the top center of the image. The background is a minimalist light gray, designed to highlight the subject.', array['gpt-image:gpt-image-1'], 'image', 'photography', 'fashion_photography', 'published', 'public', 'original', '2026-08-30T05:51:52.243Z', '2026-08-30T05:51:52.243Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000031', 'https://aliq0330.github.io/promptly/viral-seed/49.jpg', 853, 1280, 'Moda dergisi kapağı stili', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000031', 'editorial-photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000031', 'portre', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000031', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000009', 'Ünlü tablo karakteri OOTD', 'Ünlü bir tablodaki karakteri, günün kombini düzeninde Q-stil 3D C4D karakter olarak giydirir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1909892294217781714
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate a Q-style 3D C4D-rendered character based on the person in the photo, dressed in a fashion-forward “outfit of the day” (OOTD) inspired by a specific profession.
Profession: Fashion Designer
– Keep the original facial features and character pose
– Stylize the character with a cute, long-legged chibi proportion
– Outfit and accessories should reflect the profession, including trendy designer wear, glasses, sketchbook or tablet, and stylish shoes
– Match the outfit with fashion accessories to complete the look
– Use a solid background color that complements the character’s overall color palette (no gradients or textures)

Composition: Aspect ratio: 9:16
Top text: “OOTD”
Left side: the full-body chibi character wearing the complete outfit
Right side: individual clothing items and accessories laid out separately, as if in a style breakdown', array['gpt-image:gpt-image-1'], 'image', 'human_character', 'fashion', 'published', 'public', 'original', '2026-10-01T23:59:36.802Z', '2026-10-01T23:59:36.802Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000001d', 'https://aliq0330.github.io/promptly/viral-seed/29.jpg', 853, 1280, 'Ünlü tablo karakteri OOTD', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001d', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001d', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001d', 'editorial-photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-000000000009', 'Altın kolye', 'Kabartma emoji/figür işlemeli altın kolyenin elde tutulurken çekilmiş fotogerçekçi yakın planı.

Kaynak: @azed_ai · https://x.com/azed_ai/status/1915770501705925106
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A photorealistic close-up of a gold pendant necklace held by female hand. The pendant features a bas-relief engraving of [image /emoji]. The pendant hangs from a polished gold chain. The background is softly blurred with neutral beige tones, and natural lighting, realistic skin tones, Product photography, 16:9 aspect ratio.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-09-07T03:38:45.065Z', '2026-09-07T03:38:45.065Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000048', 'https://aliq0330.github.io/promptly/viral-seed/72.jpg', 1024, 1024, 'Altın kolye', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000048', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000048', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000048', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-000000000009', '3D çift mücevher kutusu figürü', 'Fotoğraftaki kişilerden, pastel tonlarda bir mücevher kutusunda duran koleksiyonluk 3D figür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1909332895115714835
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a finely crafted, adorably charming 3D-rendered collectible figure based on the subjects in the photo, displayed inside a pastel-toned, warm and romantic presentation box. The box is designed in a soft cream color with gentle gold accents, resembling an elegant portable jewelry case.

When opened, the box reveals a heartwarming romantic scene: two chibi-style characters gazing sweetly at each other. The lid is engraved with the words “FOREVER TOGETHER,” surrounded by delicate star and heart motifs.

Inside the box stands the female from the photo, holding a small bouquet of white flowers. Beside her is her partner, the male from the photo. Both characters have large, expressive, sparkling eyes and soft, warm smiles that radiate affection and charm.

Behind them is a round window, through which a sunny skyline of a traditional Chinese town can be seen, along with gently drifting clouds. The interior is softly lit with warm ambient lighting, and petals float in the background to enhance the atmosphere.

The overall color scheme of both the display box and the characters is elegant and harmonious, creating a luxurious and dreamlike miniature keepsake.

Aspect ratio: 9:16', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-08-26T08:11:57.180Z', '2026-08-26T08:11:57.180Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000000c', 'https://aliq0330.github.io/promptly/viral-seed/12.jpg', 853, 1280, '3D çift mücevher kutusu figürü', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000c', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000c', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000c', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-00000000000a', 'RPG tarzı karakter kartı', 'Bir mesleği (örn. programcı) RPG koleksiyon kartı biçiminde yetenek istatistikleriyle gösterir.

Kaynak: @berryxia_ai · https://x.com/berryxia_ai/status/1911334046724165905
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a digital character card in RPG collectible style.
The subject is a {Programmer}, standing confidently with tools or symbols relevant to their job.
Render it in 3D cartoon style, soft lighting, vivid personality.
Include skill bars or stats like [Skill1 +x], [Skill2 +x, e.g., Creativity +10, UI/UX +8].
Add a title banner on top and a nameplate on the bottom.
Frame the card with clean edges like a real figure box.
Make the background fit the profession''s theme.
Colors: warm highlights, profession-matching hues.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'concept_art', 'published', 'public', 'original', '2026-09-02T04:15:47.828Z', '2026-09-02T04:15:47.828Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000002c', 'https://aliq0330.github.io/promptly/viral-seed/44.jpg', 853, 1280, 'RPG tarzı karakter kartı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002c', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002c', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002c', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000046', '5eed0000-0000-4000-8000-00000000000a', 'Özgün canavar yaratımı', 'Bir nesneden esinlenen, canavar yakalama oyunlarına yakışacak özgün bir yaratık tasarlatır.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @Anima_Labs · https://x.com/Anima_Labs/status/1915044265895379166
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create an original creature inspired by this object (photo provided). The creature should look like it belongs in a fantasy monster-catching universe, with a cute or cool design influenced by retro Japanese RPG monster art. The image must include:
– A full-body view of the creature, inspired by the shape, materials or purpose of the object.
– A small orb or capsule (similar an a pokeball) at its feet, designed with patterns and colors matching the object’s look — not a standard Pokéball, but a custom design.
– An invented name for the creature, displayed next to or below it. – Its elemental type (e.g., Fire, Water, Metal, Nature, Electric…), based on the object’s core properties. The illustration should look like it comes from a fantasy creature encyclopedia, with clean lines, soft shadows, and an expressive, character-driven design.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'fantasy_art', 'published', 'public', 'original', '2026-09-19T08:21:16.776Z', '2026-09-19T08:21:16.776Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000046', 'https://aliq0330.github.io/promptly/viral-seed/70.jpg', 1024, 1024, 'Özgün canavar yaratımı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000046', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000046', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000046', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-00000000000a', 'Fantastik karikatür illüstrasyon', 'Kafası sevimli bir bilgisayar monitörü olan çizgi karakter, parlayan mavi bir devre ormanında zıplıyor.

Kaynak: @dotey · https://x.com/dotey/status/1905103477879267823
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A cartoon-style character with a smiling computer monitor as its head, wearing gloves and boots, happily jumping through a glowing, blue, circular portal in a lush, fantasy forest landscape. The forest is detailed with large trees, mushrooms, flowers, a serene river, floating islands, and an atmospheric starry night sky with multiple moons. Bright, vibrant colors with soft lighting, fantasy illustration style.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'cartoon', 'published', 'public', 'original', '2026-09-08T10:08:37.508Z', '2026-09-08T10:08:37.508Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000027', 'https://aliq0330.github.io/promptly/viral-seed/39.jpg', 1280, 853, 'Fantastik karikatür illüstrasyon', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000027', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000027', 'animation', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000027', 'neon', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-00000000000a', 'Steampunk mekanik balık', 'Pirinç gövdeli, dişlileri görünen steampunk tarzı mekanik bir balık.

Kaynak: @f-is-h · https://github.com/f-is-h/f-is-h/blob/main/images/streampank-fish-4.png
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A steampunk-style mechanical fish with a brass body and clearly visible gear mechanisms when in motion.
Its mechanical teeth can be slightly seen, neatly arranged and closed, with both upper and lower teeth visible. Each tooth is triangular in shape and made of diamond material.
The tail fin has a metal wire mesh structure, while other fins are made of semi-transparent amber-colored glass with some subtle bubbles inside.
The eyes are multi-faceted rubies, with clearly visible reflective shine.
The fish has "f-is-h" text clearly visible on its body, with all lowercase letters and careful attention to the hyphen placement.
The image is square, showing the entire fish in the center of the frame, with its head pointing to the right. There is adequate white space around the fish, with more space on the left and right sides. The background has subtle steampunk-style gear patterns.
The entire fish looks very cool. This is a high-definition image with extremely rich details and unique texture and aesthetics. The image should not be too dark.', array['gpt-image:gpt-image-1'], 'image', 'style', 'steampunk', 'published', 'public', 'original', '2026-09-15T03:38:14.633Z', '2026-09-15T03:38:14.633Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000040', 'https://aliq0330.github.io/promptly/viral-seed/64.jpg', 1024, 1024, 'Steampunk mekanik balık', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000040', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000040', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000040', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-00000000000b', 'Bulutlarla şekillenen gökyüzü sanatı', 'Gökyüzündeki dağınık bulutların bir nesne/figür oluşturduğu gündüz fotoğrafı. [SUBJECT] ve [LOCATION] alanlarını doldur.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1913628737872027805
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate image: A photograph captures a daytime scene with a [SUBJECT/OBJECT] formed by scattered clouds in the sky, positioned above a [LOCATION]', array['gpt-image:gpt-image-1'], 'image', 'nature_environment', 'sky', 'published', 'public', 'original', '2026-09-07T07:35:59.974Z', '2026-09-07T07:35:59.974Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000003a', 'https://aliq0330.github.io/promptly/viral-seed/58.jpg', 853, 1280, 'Bulutlarla şekillenen gökyüzü sanatı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003a', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003a', 'surreal', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003a', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-00000000000b', 'Harita görüntüsünden antik hazine haritası', 'Bir harita görüntüsünü eskimiş parşömen üzerinde, gemiler ve pusulalarla antik hazine haritasına dönüştürür.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1919701229363466328
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the image to an ancient treasure map drawn on aged parchment. The map includes detailed elements like sailing ships on the ocean, old ports or castles on the coastline, a dotted path leading to a large ''X'' marking the treasure spot, mountains, palm trees, and a decorative compass rose. The overall style is reminiscent of old pirate adventure films.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'illustration', 'published', 'public', 'original', '2026-09-29T20:43:29.599Z', '2026-09-29T20:43:29.599Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000005b', 'https://aliq0330.github.io/promptly/viral-seed/91.jpg', 853, 1280, 'Harita görüntüsünden antik hazine haritası', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005b', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005b', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005b', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-00000000000b', 'Simge yapının önünde üç hayvanlı selfie', 'Gün batımında, ikonik bir yapının önünde üç hayvanın farklı ifadelerle selfie çektiği sinematik görsel.

Kaynak: @berryxia_ai · https://x.com/berryxia_ai/status/1920795648946782583
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A close-up selfie of three [animal type] with different expressions in front of the iconic [landmark], taken at golden hour with cinematic lighting. The animals are positioned close to the camera with their heads touching, mimicking a selfie pose, showing joyful, surprised, and calm expressions. The background features the full architectural detail of [landmark], softly illuminated, with a warm ambient atmosphere. Shot in a photographic, realistic cartoon style, high detail, 1:1 aspect ratio.', array['gpt-image:gpt-image-1'], 'image', 'nature_environment', 'animal', 'published', 'public', 'original', '2026-09-17T00:01:36.685Z', '2026-09-17T00:01:36.685Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000005e', 'https://aliq0330.github.io/promptly/viral-seed/94.jpg', 1024, 1024, 'Simge yapının önünde üç hayvanlı selfie', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005e', 'golden-hour', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005e', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005e', 'surreal', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-00000000000b', 'Şehre özel hava durumu minyatürü', '45 derece kuşbakışı, izometrik minyatür şehir sahnesi ve hava durumu bilgisi. Şehri değiştirerek kullan.

Kaynak: @dotey · https://x.com/dotey/status/1917988595228438771
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Show a clear 45-degree bird’s-eye view of an isometric miniature city scene featuring Shanghai’s iconic buildings, such as the Oriental Pearl Tower and the Bund. The weather effect—cloudy—blends softly into the city, interacting gently with the architecture. Use physically based rendering (PBR) and realistic lighting. Solid color background, crisp and clean. Centered composition to highlight the precision and detail of the 3D model. Display “Shanghai Cloudy 20°C” and a cloudy weather icon at the top of the image.', array['gpt-image:gpt-image-1'], 'image', 'nature_environment', 'weather', 'published', 'public', 'original', '2026-09-12T02:02:13.778Z', '2026-09-12T02:02:13.778Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000052', 'https://aliq0330.github.io/promptly/viral-seed/82.jpg', 603, 905, 'Şehre özel hava durumu minyatürü', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000052', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000052', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000052', 'mimari', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000064', '5eed0000-0000-4000-8000-00000000000c', 'Gerçek nesne ve elle çizilmiş karalama reklamı', 'Beyaz zeminde gerçek bir nesneyi elle çizilmiş mürekkep karalamayla birleştiren minimalist, akılda kalan reklam.

Kaynak: @azed_ai · https://x.com/azed_ai/status/1923016036120658122
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A minimalist and creative advertisement set on a clean white background.
A real [Real Object] is integrated into a hand-drawn black ink doodle, using loose, playful lines. The [Doodle Concept] interacts with the object in a clever, imaginative way. Include bold black [Ad Copy] text at the top or center. Place the [Brand Logo] clearly at the bottom. The visual should be clean, fun, high-contrast, and conceptually smart.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'advertising', 'published', 'public', 'original', '2026-09-18T20:41:29.624Z', '2026-09-18T20:41:29.624Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000064', 'https://aliq0330.github.io/promptly/viral-seed/100.jpg', 853, 1280, 'Gerçek nesne ve elle çizilmiş karalama reklamı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000064', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000064', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000064', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000025', '5eed0000-0000-4000-8000-00000000000c', 'Pastel güç 3D reklam', 'Bir ürünü kil dokulu, pastel renkli yumuşak 3D çizgi film heykeline çeviren reklam görseli.

Kaynak: @aziz4ai · https://x.com/aziz4ai/status/1925301120252924356
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'a soft 3D cartoon-style sculpture of [brand product], made of smooth clay-like textures and vibrant pastel colors, placed in a minimalist isometric scene that complements the product’s nature, clean composition, gentle lighting, subtle shadows, with the product’s logo and a 3-word slogan displayed clearly below', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'advertising', 'published', 'public', 'original', '2026-09-29T01:20:52.339Z', '2026-09-29T01:20:52.339Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000025', 'https://aliq0330.github.io/promptly/viral-seed/37.jpg', 1024, 1024, 'Pastel güç 3D reklam', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000025', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000025', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000025', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-00000000000c', 'Ünlü tablo karakterli kahvaltılık gevrek reklamı', 'Fotoğraftaki kişinin kişiliğine uygun, kişiye özel bir yulaf karışımı ambalajı ve reklamı üretir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1909542765857587310
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', '“Master Oats”: Based on the visual features of the person in the uploaded photo, generate a custom oatmeal mix that reflects their personality traits — for example, using vegetables, fruits, yogurt, whole grains, etc.

Design a unique cereal box and package aesthetic that aligns with this tailored mix.

Then, create an advertising cover featuring the person as the mascot on the cereal box. The character should retain their recognizable features but be transformed into a cute chibi-style 3D figure with a C4D-quality rendering.

The oatmeal and packaging should be presented in a setting that matches the mood — such as a minimalist kitchen, a sleek supermarket display, or a clean design counter.

The process includes:
– Character analysis and oat mix pairing
– Cereal box concept and design
– Display environment selection
– Final image with mascot figure, packaging, and styled scene composition

All visuals should be balanced, modern, and appealing, reflecting a premium and fun oat brand identity.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'packaging', 'published', 'public', 'original', '2026-10-04T16:44:52.862Z', '2026-10-04T16:44:52.862Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000001a', 'https://aliq0330.github.io/promptly/viral-seed/26.jpg', 1024, 1024, 'Ünlü tablo karakterli kahvaltılık gevrek reklamı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001a', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001a', 'clean-background', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000001a', 'editorial-photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-00000000000c', 'Sosyal medya kapak görseli', 'Tıklama çekmeye odaklı, dikkat çekici bir sosyal medya (Xiaohongshu) gönderi kapağı üretir.

Kaynak: @balconychy · https://x.com/balconychy/status/1905507936526627078
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Draw an image: Create a cover for a Xiaohongshu (RED) post.

Requirements:
– It must be visually compelling enough to attract user clicks.
– Use bold, characterful fonts.
– Vary font sizes to reflect the hierarchy of information; emphasize the structure of the copy.
– The main title should be at least twice the size of regular text.
– Leave white space between text sections.
– Only use bright accent colors to highlight key words and draw attention.
– The background should feature an eye-catching pattern (such as paper texture, notebook, or a WeChat chat window—choose one).
– Add appropriate icons or illustrations to enhance visual layers, but avoid visual clutter.

Copy text:
BREAKING: ChatGPT just got even better!
– Superior multitasking ✨
– Stronger coding ability 💪
– Creativity off the charts 🎨
Try it now!

Image aspect ratio: 9:16', array['gpt-image:gpt-image-1'], 'image', 'design', 'social_media', 'published', 'public', 'original', '2026-09-06T09:26:54.253Z', '2026-09-06T09:26:54.253Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000016', 'https://aliq0330.github.io/promptly/viral-seed/22.jpg', 853, 1280, 'Sosyal medya kapak görseli', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000016', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000016', 'composition', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000016', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-00000000000d', 'Minimalist 3D illüstrasyon (JSON)', 'Sanat stili profilini JSON olarak tanımlayan, minimalist 3D illüstrasyon üretir.

Kaynak: @0xdlk · https://x.com/0xdlk/status/1906843247432929642
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate a toilet with the following JSON profile:
{
  "art_style_profile": {
    "style_name": "Minimalist 3D Illustration",
    "visual_elements": {
      "shape_language": "Rounded edges, smooth and soft forms with simplified geometry",
      "colors": {
        "primary_palette": ["Soft beige, light gray, warm orange"],
        "accent_colors": ["Warm orange for focal elements"],
        "shading": "Soft gradients with smooth transitions, avoiding harsh shadows or highlights"
      },
      "lighting": {
        "type": "Soft, diffused lighting",
        "source_direction": "Above and slightly to the right",
        "shadow_style": "Subtle and diffused, no sharp or high-contrast shadows"
      },
      "materials": {
        "surface_texture": "Matte, smooth surfaces with subtle shading",
        "reflectivity": "Low to none, avoiding glossiness"
      },
      "composition": {
        "object_presentation": "Single, central object displayed in isolation with ample negative space",
        "perspective": "Slightly angled, giving a three-dimensional feel without extreme depth",
        "background": "Solid, muted color that complements the object without distraction"
      },
      "typography": {
        "font_style": "Minimalistic, sans-serif",
        "text_placement": "Bottom-left corner with small, subtle text",
        "color": "Gray, low-contrast against the background"
      },
      "rendering_style": {
        "technique": "3D render with simplified, low-poly aesthetics",
        "detail_level": "Medium detail, focusing on form and color over texture or intricacy"
      }
    },
    "purpose": "To create clean, aesthetically pleasing visuals that emphasize simplicity, approachability, and modernity."
  }
}', array['gpt-image:gpt-image-1'], 'image', 'design', 'graphic_design', 'published', 'public', 'original', '2026-09-08T09:06:05.384Z', '2026-09-08T09:06:05.384Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000019', 'https://aliq0330.github.io/promptly/viral-seed/25.jpg', 1024, 1024, 'Minimalist 3D illüstrasyon (JSON)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000019', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000019', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000019', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-00000000000d', 'Minimalist 3D illüstrasyon (Markdown)', 'Aynı minimalist 3D stilin Markdown biçiminde yazılmış sürümü; biçim farkının sonucu nasıl etkilediğini karşılaştır.

Kaynak: @dotey · https://x.com/dotey/status/1907131027253772399
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Draw a Toilet

## 🎨 Art Style: Minimalist 3D Illustration

### 🟢 Shape Language
- Rounded edges and smooth, soft forms using simplified geometric shapes.

### 🎨 Colors
- **Primary palette:** soft beige, light gray, warm orange.  
- **Accent color:** warm orange for focal elements.  
- **Shading:** gentle gradients and smooth transitions, avoiding harsh shadows and highlights.

### 💡 Lighting
- **Type:** soft, diffuse lighting.  
- **Light source direction:** from above, slightly to the right.  
- **Shadow style:** subtle and diffused, without sharp or high-contrast shadows.

### 🧱 Materials
- **Surface texture:** matte and smooth with subtle light variation.  
- **Reflectivity:** low to none, avoiding noticeable gloss.

### 🖼️ Composition
- **Object presentation:** a single, centered object with generous negative space around it.  
- **Perspective:** slight tilt to suggest depth, but no strong depth-of-field effects.  
- **Background:** flat color, low saturation, harmonious with the subject and non-distracting.

### ✒️ Typography
- **Font style:** minimalist sans-serif.  
- **Text placement:** bottom left corner, small and unobtrusive.  
- **Font color:** gray, low contrast with the background.

### 🖥️ Rendering Style
- **Technique:** 3D rendering in a simplified low-poly style.  
- **Detail level:** medium — focus on shape and color, avoiding complex textures or fine details.

## 🎯 Style Goal
> Create a clean and aesthetically pleasing visual that emphasizes simplicity, approachability, and modernity.', array['gpt-image:gpt-image-1'], 'image', 'design', 'graphic_design', 'published', 'public', 'original', '2026-09-27T08:30:13.775Z', '2026-09-27T08:30:13.775Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000024', 'https://aliq0330.github.io/promptly/viral-seed/36.jpg', 1280, 853, 'Minimalist 3D illüstrasyon (Markdown)', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000024', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000024', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000024', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-00000000000d', '8-bit piksel ikon', 'Beyaz zeminde ortalanmış, sınırlı retro palete sahip minimalist 8-bit piksel logo.

Kaynak: @egeberkina · https://x.com/egeberkina/status/1913654508330058064
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a minimalist 8-bit pixel logo of [🍔], centered on a pure white background. Use a limited retro color palette with pixelated detailing, sharp edges, and clean blocky forms. The logo should be simple, iconic, and clearly recognizable in pixel art style — inspired by classic arcade game aesthetics.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'pixel_art', 'published', 'public', 'original', '2026-10-06T16:52:43.909Z', '2026-10-06T16:52:43.909Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000039', 'https://aliq0330.github.io/promptly/viral-seed/57.jpg', 1024, 1024, '8-bit piksel ikon', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000039', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000039', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000039', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000034', '5eed0000-0000-4000-8000-00000000000d', 'Kâğıt işi emoji ikonu', 'Renkli kesilmiş kâğıttan elle yapılmış gibi görünen, saf beyaz arka planda süzülen emoji ikonu.

Kaynak: @egeberkina · https://x.com/egeberkina/status/1912521263085482464
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A paper craft-style "🔥" floating on a pure white background. The emoji is handcrafted from colorful cut paper with visible textures, creases, and layered shapes. It casts a soft drop shadow beneath, giving a sense of lightness and depth. The design is minimal, playful, and clean — centered in the frame with lots of negative space. Use soft studio lighting to highlight the paper texture and edges.', array['gpt-image:gpt-image-1'], 'image', 'design', 'graphic_design', 'published', 'public', 'original', '2026-09-30T17:25:18.992Z', '2026-09-30T17:25:18.992Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000034', 'https://aliq0330.github.io/promptly/viral-seed/52.jpg', 1024, 1024, 'Kâğıt işi emoji ikonu', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000034', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000034', 'minimalist', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000034', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000003f', '5eed0000-0000-4000-8000-00000000000e', 'Emojiden kremalı dondurma', 'Bir emojiyi kremanın kıvrımlı aktığı iştah açıcı bir dondurma çubuğuna dönüştürür.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1914574278911000967
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate an image: Transform the [🍓] into a creamy ice cream bar, with cream flowing in curved swirls on top, making it look delicious and tempting. The ice cream is floating at a 45-degree angle in mid-air, rendered in a cute chibi-style 3D aesthetic, set against a solid color background with a unified color palette.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'food_beverage', 'published', 'public', 'original', '2026-10-02T07:17:57.354Z', '2026-10-02T07:17:57.354Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000003f', 'https://aliq0330.github.io/promptly/viral-seed/63.jpg', 853, 1280, 'Emojiden kremalı dondurma', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003f', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003f', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003f', '3d-render', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-00000000000e', 'İçinde su altı sahnesi olan buzlu şeker', 'Mavi saydam yüzeyi içinde minik bir dalgıcın olduğu su altı sahnesini gösteren gerçeküstü dondurma.

Kaynak: @madpencil_ · https://x.com/madpencil_/status/1920037538372128998
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Tilt POV shot of a hand holding a surreal popsicle with a transparent blue exterior, revealing an underwater scene inside: a tiny scuba diver with tiny fish floating with bubbles, ocean waves crashing, and a green popsicle stick running through the center. The popsicle is melting slightly, with a wooden stick at the bottom, hand is holding it by the wooden stick, soft focus new york street background, premium product photography', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'food_beverage', 'published', 'public', 'original', '2026-09-15T02:06:27.285Z', '2026-09-15T02:06:27.285Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000041', 'https://aliq0330.github.io/promptly/viral-seed/65.jpg', 853, 1280, 'İçinde su altı sahnesi olan buzlu şeker', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000041', 'surreal', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000041', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000041', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000023', '5eed0000-0000-4000-8000-00000000000e', 'Tüylü cadılar bayramı balkabağı', 'Düz bir balkabağı ikonunu hiper gerçekçi tüy dokulu yumuşak bir 3D nesneye çevirir.

Kaynak: gizakdag · https://x.com/gizakdag/status/1911075302941622512
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform a simple flat vector icon of [🎃] into a soft, 3D fluffy object. The shape is fully covered in fur, with hyperrealistic hair texture and soft shadows. The object is centered on a clean, light gray background and floats gently in space. The style is surreal, tactile, and modern, evoking a sense of comfort and playfulness. Studio lighting, high-resolution render.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-14T09:14:43.042Z', '2026-09-14T09:14:43.042Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000023', 'https://aliq0330.github.io/promptly/viral-seed/35.jpg', 1024, 1024, 'Tüylü cadılar bayramı balkabağı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000023', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000023', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000023', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-00000000000e', 'Sevimli seramik saksı', 'Parlak seramik, hayvan veya nesne şeklinde saksıda renkli sukulentler; yüksek kaliteli ürün fotoğrafı.

Kaynak: @azed_ai · https://x.com/azed_ai/status/1923739813414568075
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A high-quality photo of a cute ceramic [object/animal]-shaped planter with a glossy finish, filled with a variety of vibrant succulents and greenery including a spiky Haworthia, a rosette-shaped Echeveria, and delicate white flowers. The planter has a friendly face and sits on a soft, neutral background with diffused natural lighting, showcasing fine textures and color contrast in a clean, minimalistic composition', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-08-27T15:52:17.962Z', '2026-08-27T15:52:17.962Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000037', 'https://aliq0330.github.io/promptly/viral-seed/55.jpg', 1024, 1024, 'Sevimli seramik saksı', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000037', 'photography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000037', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000037', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000051', '5eed0000-0000-4000-8000-00000000000f', '3D yarı saydam cam dönüşümü', 'Bir nesneyi 3D yarı saydam cam malzemeye dönüştürür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @azed_ai · https://x.com/azed_ai/status/1917948899098243407
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A soft, 3D translucent glass of the attached image with a frosty matte finish and detailed texture, original colors, centered on a light gray background, floats gently in space, soft shadows, natural lighting', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-10-03T11:30:20.301Z', '2026-10-03T11:30:20.301Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000051', 'https://aliq0330.github.io/promptly/viral-seed/81.jpg', 1024, 1024, '3D yarı saydam cam dönüşümü', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000051', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000051', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000051', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-00000000000f', '3D Polaroid''den fırlama efekti', 'Sahnedeki karakteri bir Polaroid fotoğrafın içinden fırlayan 3D chibi figüre dönüştürür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1908238003169903060
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Convert the character in the scene into a 3D chibi-style figure, placed inside a Polaroid photo. The photo paper is being held by a human hand. The character is stepping out of the Polaroid frame, creating a visual effect of breaking through the two-dimensional photo border and entering the real-world 3D space.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-13T14:16:17.092Z', '2026-09-13T14:16:17.092Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000002', 'https://aliq0330.github.io/promptly/viral-seed/2.jpg', 1024, 1024, '3D Polaroid''den fırlama efekti', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000002', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000002', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000002', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-00000000000f', 'Fotoğraftan 3D Q-versiyon stile', 'Sahnedeki kişileri yerleşimi ve kıyafetleri koruyarak 3D chibi figürlere çevirir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @dotey · https://x.com/dotey/status/1908194518345678865
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the characters in the scene into 3D chibi-style figures, while keeping the original scene layout and their clothing exactly the same.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-10-01T06:55:22.033Z', '2026-10-01T06:55:22.033Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000000d', 'https://aliq0330.github.io/promptly/viral-seed/13.jpg', 1024, 1024, 'Fotoğraftan 3D Q-versiyon stile', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000d', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000d', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000000d', 'ai-sanat', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-00000000000f', '3D chibi üniversite maskotu', 'Bir üniversiteyi temsil eden, onun değerlerini yansıtan kişileştirilmiş 3D chibi anime karakter.

Kaynak: @dotey · https://x.com/dotey/status/1911988003729203648
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Create a personified 3D chibi-style anime girl character representing {Northwestern Polytechnical University}, embodying the school’s distinctive strengths in {aeronautics, astronautics, and marine engineering}.', array['gpt-image:gpt-image-1'], 'image', 'human_character', 'character_design', 'published', 'public', 'original', '2026-09-03T03:28:33.164Z', '2026-09-03T03:28:33.164Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000002d', 'https://aliq0330.github.io/promptly/viral-seed/45.jpg', 1280, 853, '3D chibi üniversite maskotu', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002d', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002d', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002d', '3d-render', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000010', 'Tatlı örgü yumuşak oyuncak bebek', 'İki elin tuttuğu, el örgüsü iplikten yapılmış sevimli bir bebeğin profesyonel yakın plan fotoğrafı.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1921148024861938077
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A close-up, professionally composed photograph showcasing a hand-crocheted yarn doll gently cradled by two hands. The doll has a rounded shape, featuring the cute chibi image of the [upload image] character, with vivid contrasting colors and rich details. The hands holding the doll are natural and gentle, with clearly visible finger postures, and natural skin texture and light/shadow transitions, conveying a warm and realistic touch. The background is slightly blurred, depicting an indoor environment with a warm wooden tabletop and natural light streaming in from a window, creating a comfortable and intimate atmosphere. The overall image conveys a sense of exquisite craftsmanship and cherished warmth.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'children_s_illustration', 'published', 'public', 'original', '2026-09-03T01:48:53.813Z', '2026-09-03T01:48:53.813Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000061', 'https://aliq0330.github.io/promptly/viral-seed/97.jpg', 853, 1280, 'Tatlı örgü yumuşak oyuncak bebek', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000061', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000061', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000061', 'photography', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000010', '3D kâğıt heykel pop-up kitap', 'Katmanlı, katlanabilir kâğıt heykellerden oluşan bir pop-up kitap; masa üstünde temiz arka planla.

Kaynak: @dotey · https://x.com/dotey/status/1923264349050675329
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Multi-layered foldable paper sculpture pop-up book, placed on a desk, with a clean background highlighting the main subject. The book presents a 3D flip-book style, with a 2:3 vertical aspect ratio. The open pages display the scene of [Nezha Demon Child version battling Ao Bing]. All elements are finely foldable and assembled, showcasing a realistic and delicate texture of folded paper. The composition uniformly adopts a frontal perspective, with an overall dreamy and beautiful visual style, vibrant and gorgeous colors, full of a fantastical and lively story atmosphere.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'children_s_illustration', 'published', 'public', 'original', '2026-09-10T01:13:05.357Z', '2026-09-10T01:13:05.357Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000020', 'https://aliq0330.github.io/promptly/viral-seed/32.jpg', 1280, 853, '3D kâğıt heykel pop-up kitap', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000020', 'fantastik', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000020', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000020', '3d-render', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000010', 'Sevimli chibi anahtarlık', 'Elde tutulan, ekteki görselin chibi versiyonunu taşıyan renkli bir anahtarlık fotoğrafı.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @azed_ai · https://x.com/azed_ai/status/1916521742052503804
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A close-up photo of a cute, colorful keychain held by person''s hand. The keychain features a chibi-style of the [attached image ]. The keychain is made of soft rubber with bold black outlines and attached to a small silver keyring, neutral background', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'character_illustration', 'published', 'public', 'original', '2026-08-30T02:41:03.242Z', '2026-08-30T02:41:03.242Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000049', 'https://aliq0330.github.io/promptly/viral-seed/73.jpg', 1024, 1024, 'Sevimli chibi anahtarlık', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000049', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000049', 'anime', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000049', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000010', 'Chibi matruşka bebekler', 'Görseldeki kişiyi büyükten küçüğe beş sevimli chibi matruşka bebeğe dönüştürür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1911669883315818497
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the person in the image into a set of cute chibi-style Russian nesting dolls (🪆), with a total of five dolls arranged from largest to smallest. Place them on an elegant wooden table. Horizontal aspect ratio: 3:2.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', 'character_illustration', 'published', 'public', 'original', '2026-08-28T15:06:15.122Z', '2026-08-28T15:06:15.122Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000002b', 'https://aliq0330.github.io/promptly/viral-seed/43.jpg', 1280, 853, 'Chibi matruşka bebekler', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002b', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002b', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002b', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-000000000011', 'Gerçeküstü etkileşim sahnesi', 'Karakalem bir figürün gerçek, renkli bir nesneyle etkileşime girdiği gerçeküstü sahne. [Subject 1] ve [Subject 2] alanlarını doldur.

Kaynak: @umesh_ai · https://x.com/umesh_ai/status/1917444534239191544
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A pencil sketch of [Subject 1] interacting with [Subject 2], where [Subject 2] is rendered as a realistic, full-color object, creating a surreal contrast against the hand-drawn style of [Subject 1] and the background', array['gpt-image:gpt-image-1'], 'image', 'style', 'surreal', 'published', 'public', 'original', '2026-09-21T19:22:29.008Z', '2026-09-21T19:22:29.008Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000055', 'https://aliq0330.github.io/promptly/viral-seed/85.jpg', 1024, 1024, 'Gerçeküstü etkileşim sahnesi', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000055', 'surreal', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000055', 'soyut', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000055', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-000000000011', 'Oyuncak kutusunda ülke dioraması', 'Kartondan bir kutunun içinde, iki elin kapağını tuttuğu 3D baskı bir ülke dioraması.

Kaynak: @TheRelianceAI · https://x.com/TheRelianceAI/status/1925223613055017251
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'An ultra-realistic top-down photograph of a 3D-printed diorama inside a beige cardboard box, with the lid being held open by two human hands. The interior of the box reveals a miniature landscape of [COUNTRY NAME], featuring iconic landmarks, terrain, buildings, rivers, vegetation, and crowds of tiny, detailed human figures. The diorama is filled with vibrant, geographically appropriate elements, all crafted in a tactile, toy-like style using matte 3D-printed textures with visible layer lines. At the top, the inside of the box lid displays the phrase “[COUNTRY NAME]” in large, colorful, raised plastic letters—each letter in a different bright color. The lighting is warm and cinematic, highlighting the textures and shadows to evoke a sense of realism and charm, as if the viewer is opening a magical miniature version of the nation', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-12T00:00:16.274Z', '2026-09-12T00:00:16.274Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000013', 'https://aliq0330.github.io/promptly/viral-seed/19.jpg', 1024, 1024, 'Oyuncak kutusunda ülke dioraması', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000013', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000013', 'manzara', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000013', 'composition', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000011', 'Lego koleksiyon figürü', 'Yüklediğin fotoğraftan, minyatür bir sahnede klasik Lego minifigür stilinde koleksiyon figürü üretir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @ZHO_ZHO_ZHO · https://x.com/ZHO_ZHO_ZHO/status/1910644499354968091
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Generate a vertically-oriented image based on my uploaded photo, using the following prompt:
Classic LEGO minifigure style in a miniature scene — an animal stands beside me. The color palette of the animal should match mine.
Please design the animal based on your understanding of me. You may choose any creature — real, surreal, or fantastical — that you feel best reflects my personality.
The entire scene is set within a transparent glass cube, with a minimalist interior design.
The base of the miniature is matte black with silver accents, following a clean and modern aesthetic.
On the base, there is an elegantly engraved nameplate in a refined serif font, displaying the name of the animal.
The lower part of the base subtly incorporates finely etched biological classification details, similar to a natural history museum display.
The overall composition should resemble a high-end collectible artwork: meticulously crafted, curated in style, and lit with refined lighting.
Balance is key to the layout. The background should feature a smooth gradient transition from dark to light tones, selected to match the dominant color theme.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-10-03T07:39:33.453Z', '2026-10-03T07:39:33.453Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000008', 'https://aliq0330.github.io/promptly/viral-seed/8.jpg', 853, 1280, 'Lego koleksiyon figürü', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000008', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000008', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000008', 'retro', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000011', 'ESC tuş kapağı içinde minyatür diorama', 'Yarı saydam mekanik klavye tuş kapağının içinde minyatür bir bilgisayar kurulumu gösteren izometrik 3D render.

Kaynak: @egeberkina · https://x.com/egeberkina/status/1911368319212408926
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'A hyper-realistic isometric 3D render of a miniature computer setup inside a translucent mechanical keyboard keycap, specifically placed on the ESC key of a real matte-finished mechanical keyboard. Inside the keycap, a tiny figure sits in a modern ergonomic chair, wearing a cozy textured hoodie, working at a glowing ultra-realistic computer screen. The environment is packed with lifelike miniature tech accessories: real-material desk lamps, monitors with reflections, tiny speaker grills, tangled cables, and ceramic mugs. The base of the scene is made of soil, rocks, and moss, with photorealistic textures and imperfections. The lighting inside the cap mimics natural morning sun, casting soft shadows and warm tones, while the outside has cold ambient reflections from the surrounding keyboard. The word “ESC” is subtly etched onto the top of the translucent keycap with a faint frosted glass effect — just barely visible depending on the angle. The surrounding keyboard keys like F1, Q, Shift, and CTRL are crisp, textured, and photorealistically lit. Shot as if taken with a high-end mobile phone camera, with shallow depth of field, perfect white balance, and cinematic detail.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-14T09:10:30.196Z', '2026-09-14T09:10:30.196Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000002f', 'https://aliq0330.github.io/promptly/viral-seed/47.jpg', 1024, 1024, 'ESC tuş kapağı içinde minyatür diorama', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002f', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002f', 'retro', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002f', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000012', 'Markalı mekanik klavye tuşları', '2x2 dizilmiş dört mekanik klavye tuşunda marka sloganı ve logoyu gösteren ultra gerçekçi 3D render.

Kaynak: @egeberkina · https://x.com/egeberkina/status/1918291652210311278
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'ultra-realistic 3D render of four mechanical keyboard keycaps in a tight 2x2 grid, all keys touching. View from an isometric angle. One key is transparent with the word “{just}” printed in {white}. The other three colors are: {black, purple, and white}. One key features the {Github} logo. The other two say "{fork}" and "{it}". Realistic plastic texture, rounded sculpted keycaps, soft shadows, clean light-gray background.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'brand', 'published', 'public', 'original', '2026-09-24T09:58:01.116Z', '2026-09-24T09:58:01.116Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000005a', 'https://aliq0330.github.io/promptly/viral-seed/90.jpg', 1024, 1024, 'Markalı mekanik klavye tuşları', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005a', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005a', 'typography', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000005a', 'texture', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-000000000012', 'Krom emoji rozet', 'Ürün kartına iliştirilmiş, ultra parlak krom bitişli tek bir emoji rozetinin detaylı 3D renderı.

Kaynak: @egeberkina · https://x.com/egeberkina/status/1919398870867440124
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'highly detailed 3D render of a single metallic {👍} emoji pin attached to a vertical product card, ultra-glossy chrome finish, smooth rounded 3D icon, stylized futuristic design, soft reflections, clean shadows, paper card has a die-cut euro hole at the top center, bold title “{Awesome}” above the pin, fun tagline “{Smash that ⭐ if you like it!}” below, soft gray background, soft studio lighting, minimal aesthetic', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-09-20T20:52:43.215Z', '2026-09-20T20:52:43.215Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-000000000059', 'https://aliq0330.github.io/promptly/viral-seed/89.jpg', 853, 1280, 'Krom emoji rozet', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000059', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000059', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-000000000059', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000003e', '5eed0000-0000-4000-8000-000000000012', 'Kawaii emaye rozet', 'Ekteki görseldeki konuyu parlak metal çizgili, canlı emaye dolgulu kawaii rozete çevirir.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @gnrlyxyz · https://x.com/gnrlyxyz/status/1914303110853583302
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Turn the subject in the attached image into a kawaii enamel pin. Use glossy metal outlines and vibrant enamel fill. No extra added features. Square mockup format. White background.', array['gpt-image:gpt-image-1'], 'image', 'product_commercial', 'product', 'published', 'public', 'original', '2026-10-07T12:19:55.594Z', '2026-10-07T12:19:55.594Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000003e', 'https://aliq0330.github.io/promptly/viral-seed/62.jpg', 1024, 1024, 'Kawaii emaye rozet', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003e', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003e', 'texture', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000003e', 'clean-background', 'manual');
insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000012', '3D Q-versiyon çift kar küresi', 'Görseldeki kişileri pencere kenarındaki masada duran bir kar küresi sahnesine dönüştürür.

Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır.

Kaynak: @balconychy · https://x.com/balconychy/status/1909908568129655248
Görsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.', 'Transform the person in the attached image into a snow globe scene.
Overall environment: The snow globe is placed on a tabletop by the window, with a blurred, warm-toned background. Sunlight passes through the globe, casting golden sparkles that gently illuminate the surrounding darkness.
Inside the globe: The characters are in a cute chibi-style 3D design, gazing at each other with eyes full of love.', array['gpt-image:gpt-image-1'], 'image', 'art_illustration', '3d_art', 'published', 'public', 'original', '2026-09-26T18:43:09.276Z', '2026-09-26T18:43:09.276Z');
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values ('5eed0001-0000-4000-8000-00000000002a', 'https://aliq0330.github.io/promptly/viral-seed/42.jpg', 1024, 1024, '3D Q-versiyon çift kar küresi', 0);
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002a', '3d-render', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002a', 'karakter-tasarimi', 'manual');
insert into public.prompt_tags (prompt_id, tag_slug, source) values ('5eed0001-0000-4000-8000-00000000002a', 'lighting', 'manual');

-- --- 3. Beğeniler ve kaydedilenler (demo kullanıcılar arasında) -------------------
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000008', '2026-09-29T09:34:54.102Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000010', '2026-09-30T17:13:51.178Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000006', '2026-10-01T23:21:04.749Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000012', '2026-10-03T16:34:06.928Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-00000000000b', '2026-09-30T02:59:31.174Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000005', '2026-10-03T20:33:45.022Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000047', '5eed0000-0000-4000-8000-000000000002', '2026-10-04T04:03:19.833Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000047');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000047');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000047');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000006', '2026-09-23T04:29:19.287Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000009', '2026-09-24T00:39:20.713Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000010', '2026-09-22T22:15:40.965Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000005', '2026-09-24T09:07:19.208Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-00000000000c', '2026-09-24T13:40:19.969Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000007', '2026-09-20T23:00:48.439Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-00000000000d', '2026-09-26T06:32:44.579Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-00000000000e', '2026-09-25T19:41:56.487Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000004', '2026-09-26T05:42:49.217Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000012', '2026-09-25T04:19:40.132Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-000000000008', '2026-09-23T17:53:46.448Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000043', '5eed0000-0000-4000-8000-00000000000f', '2026-09-23T06:48:03.290Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000005', '2026-10-09T06:18:17.813Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000004', '2026-10-08T08:54:05.792Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000009', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000008', '2026-10-07T10:54:13.299Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000010', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-00000000000f', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000044', '5eed0000-0000-4000-8000-000000000003', '2026-10-09T09:50:00.000Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000044');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000044');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-000000000010', '2026-10-03T06:40:20.698Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-00000000000a', '2026-09-30T14:44:13.466Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-000000000005', '2026-09-30T00:06:46.243Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-00000000000d', '2026-09-30T01:05:27.902Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000009');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-00000000000e', '2026-09-14T02:18:46.986Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000004', '2026-09-13T14:55:14.046Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000010', '2026-09-14T13:07:44.985Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000011', '2026-09-15T04:37:17.897Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000001', '2026-09-17T21:41:51.014Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000007', '2026-09-18T19:22:43.104Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000050');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000001', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-00000000000a', '2026-10-06T20:13:20.291Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-00000000000e', '2026-10-05T12:04:03.536Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-00000000000c', '2026-10-08T11:36:24.977Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-00000000000f', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000006', '2026-10-07T00:49:02.616Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-00000000000b', '2026-10-05T15:48:11.172Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000005', '2026-10-05T10:49:35.285Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000012', '2026-10-07T01:21:29.009Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004a', '5eed0000-0000-4000-8000-000000000011', '2026-10-07T18:55:43.678Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-00000000000f', '2026-09-05T06:33:09.981Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000010', '2026-09-10T04:02:01.217Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000012', '2026-09-10T07:35:03.142Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000001', '2026-09-09T13:28:09.294Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000004', '2026-09-09T03:03:47.628Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-00000000000a', '2026-09-06T21:13:05.743Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000007', '2026-09-04T15:52:05.610Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-00000000000b', '2026-09-08T16:56:10.943Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-00000000000c', '2026-09-09T13:40:15.077Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000053', '5eed0000-0000-4000-8000-000000000009', '2026-09-06T11:54:15.399Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000053');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000053');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000053');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001b', '5eed0000-0000-4000-8000-000000000011', '2026-09-27T08:34:21.024Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001b', '5eed0000-0000-4000-8000-000000000003', '2026-09-29T09:03:28.441Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001b', '5eed0000-0000-4000-8000-000000000001', '2026-09-27T00:17:25.897Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-00000000001b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000001b');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-000000000007', '2026-09-26T07:47:24.854Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-000000000011', '2026-09-28T22:33:28.081Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-00000000000c', '2026-09-29T11:22:07.530Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-000000000001', '2026-09-24T22:01:25.413Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-00000000000d', '2026-09-29T18:49:39.377Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000063');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000004', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-00000000000d', '2026-10-09T07:53:53.545Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000001', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000012', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-00000000000c', '2026-10-09T07:04:46.759Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000006', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000007', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000010', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-00000000000e', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000009', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000008', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000005', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000002', '2026-10-09T09:50:00.000Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000062');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-000000000062');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000062');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-00000000000b', '2026-09-24T03:39:01.775Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000002', '2026-09-21T13:19:50.409Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000011', '2026-09-21T16:32:10.180Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000001', '2026-09-24T02:38:09.455Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000012', '2026-09-21T05:50:49.505Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000010', '2026-09-22T17:39:39.902Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-00000000000c', '2026-09-25T00:15:32.279Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000006', '2026-09-24T22:27:12.757Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-00000000000e', '2026-09-23T07:52:10.787Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-00000000000a', '2026-09-22T08:43:17.724Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000004', '2026-09-21T21:51:43.309Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000021');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-000000000021');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000021');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-000000000011', '2026-09-22T08:26:05.048Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-000000000002', '2026-09-22T22:24:55.679Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-00000000000e', '2026-09-23T10:03:46.583Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-00000000000a', '2026-09-21T22:48:58.638Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-000000000004', '2026-09-26T13:09:35.673Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-00000000000b', '2026-09-22T11:50:14.666Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-00000000000d', '2026-09-21T21:22:12.753Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-000000000009', '2026-09-22T11:26:25.452Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000056', '5eed0000-0000-4000-8000-00000000000c', '2026-09-27T04:29:28.601Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-000000000056');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000056');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-00000000000c', '2026-09-04T03:12:55.251Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-00000000000d', '2026-09-07T18:26:46.275Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000007', '2026-09-07T12:35:25.571Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000005', '2026-09-08T13:21:34.612Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000011', '2026-09-04T03:37:12.059Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000008', '2026-09-09T06:22:49.766Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000002', '2026-09-07T18:42:30.638Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000003', '2026-09-04T22:17:39.073Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004c', '5eed0000-0000-4000-8000-000000000006', '2026-09-05T19:37:37.389Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-00000000004c');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000011', '2026-09-27T23:54:34.959Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000005', '2026-10-03T17:20:42.088Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-00000000000c', '2026-09-30T10:00:13.069Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000008', '2026-10-02T01:19:59.601Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000003', '2026-09-28T06:18:46.020Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-00000000000b', '2026-09-29T12:18:54.225Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-00000000000f', '2026-09-30T21:36:06.185Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000006', '2026-09-29T20:11:45.410Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000001', '2026-10-03T20:00:50.303Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000009', '2026-09-30T20:36:41.862Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-00000000000e', '2026-10-03T09:55:38.727Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003b', '5eed0000-0000-4000-8000-000000000012', '2026-10-01T14:08:16.565Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-00000000003b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000003b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-00000000003b');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000006', '2026-10-06T09:41:41.317Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000008', '2026-10-07T04:09:13.302Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-00000000000f', '2026-10-06T00:20:52.847Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-00000000000b', '2026-10-04T05:12:40.200Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000007', '2026-10-03T02:22:49.411Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000009', '2026-10-04T17:32:46.501Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000012', '2026-10-02T18:10:17.353Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000003');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-000000000005', '2026-08-30T05:51:18.193Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-00000000000b', '2026-08-28T02:24:22.753Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-00000000000e', '2026-08-30T12:38:09.762Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-000000000002', '2026-08-30T14:37:09.960Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000042', '5eed0000-0000-4000-8000-00000000000a', '2026-08-29T12:25:21.369Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000042');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-00000000000a', '2026-09-02T02:57:14.666Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-000000000009', '2026-08-27T15:02:05.124Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-000000000002', '2026-08-29T18:09:46.509Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-000000000011', '2026-08-31T02:52:38.983Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000026', '5eed0000-0000-4000-8000-00000000000d', '2026-08-28T18:26:04.595Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-000000000026');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000026');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-00000000000f', '2026-10-01T02:58:12.032Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000009', '2026-09-28T19:15:06.663Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000003', '2026-10-01T22:19:52.878Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000008', '2026-09-30T01:38:05.311Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-00000000000e', '2026-10-02T12:47:42.831Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000022', '5eed0000-0000-4000-8000-000000000007', '2026-10-02T09:37:20.540Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000022');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000010', '2026-09-16T20:01:27.207Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-00000000000b', '2026-09-14T19:58:23.900Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000004', '2026-09-15T23:43:34.827Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000001', '2026-09-16T18:45:59.421Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-00000000000f', '2026-09-12T10:22:21.259Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000003', '2026-09-13T23:30:48.974Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-000000000007', '2026-09-12T20:16:54.399Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-00000000000a', '2026-09-14T21:16:05.473Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-00000000000c', '2026-09-15T18:21:23.143Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000057', '5eed0000-0000-4000-8000-00000000000d', '2026-09-16T14:39:56.591Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-000000000057');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000057');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000012', '2026-09-10T02:49:54.949Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000010', '2026-09-11T03:15:49.398Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000008', '2026-09-11T06:07:43.016Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000f', '2026-09-09T06:41:46.548Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000c', '2026-09-08T15:19:29.512Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000d', '2026-09-08T18:20:30.219Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000e', '2026-09-13T18:20:53.291Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000011', '2026-09-10T01:03:17.273Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000a', '2026-09-09T09:40:44.766Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000007', '2026-09-11T04:29:51.775Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000009', '2026-09-11T18:04:04.977Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-00000000000b', '2026-09-13T18:16:19.490Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000058', '5eed0000-0000-4000-8000-000000000001', '2026-09-10T22:33:50.624Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000058');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-000000000058');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-00000000000b', '2026-10-03T01:02:28.003Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-00000000000f', '2026-10-06T05:15:28.582Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-00000000000a', '2026-10-06T15:31:41.423Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-000000000008', '2026-10-03T22:34:33.326Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001e', '5eed0000-0000-4000-8000-000000000002', '2026-10-03T10:03:41.850Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-00000000001e');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-00000000001e');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-00000000001e');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000004', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-00000000000c', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000012', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000008', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-00000000000e', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-00000000000d', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000003', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000010', '2026-10-08T20:26:55.158Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-00000000000b', '2026-10-09T02:36:39.178Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000001', '2026-10-09T09:50:00.000Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-000000000006');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000002', '2026-09-27T05:43:59.576Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000007', '2026-09-26T21:11:31.260Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000003', '2026-09-27T22:42:47.426Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000011', '2026-09-27T05:54:09.993Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-00000000000c', '2026-09-24T06:54:29.820Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000032');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004d', '5eed0000-0000-4000-8000-000000000010', '2026-09-08T17:33:36.786Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004d', '5eed0000-0000-4000-8000-00000000000d', '2026-09-10T08:43:30.142Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004d', '5eed0000-0000-4000-8000-000000000005', '2026-09-13T09:39:09.102Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004d', '5eed0000-0000-4000-8000-000000000002', '2026-09-14T03:12:00.119Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-00000000004d');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000c', '2026-09-20T22:31:30.501Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000e', '2026-09-22T09:09:26.404Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-000000000001', '2026-09-22T05:33:35.311Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-000000000012', '2026-09-22T17:17:21.497Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000b', '2026-09-19T08:32:49.713Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000d', '2026-09-20T05:55:27.212Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000f', '2026-09-20T02:15:21.079Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-000000000010', '2026-09-20T23:55:04.733Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-00000000000a', '2026-09-23T20:25:02.495Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000060');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000002', '2026-09-14T05:35:24.295Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-00000000000b', '2026-09-13T20:23:48.153Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-00000000000d', '2026-09-13T08:50:16.013Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000004', '2026-09-15T16:09:49.062Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000008', '2026-09-15T14:28:06.894Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000010', '2026-09-17T14:36:06.539Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-00000000000f', '2026-09-14T15:30:38.712Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000001', '2026-09-13T23:48:56.860Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000009', '2026-09-17T01:53:23.061Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-00000000000a', '2026-09-11T17:44:39.617Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000006', '2026-09-15T19:18:14.148Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000012', '2026-09-17T06:10:01.641Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000028', '5eed0000-0000-4000-8000-000000000003', '2026-09-13T04:45:20.251Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000028');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-000000000028');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000009', '2026-10-07T20:02:53.428Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000002', '2026-10-04T14:43:17.098Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000008', '2026-10-07T23:24:07.506Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000006', '2026-10-07T19:41:13.318Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-00000000000c', '2026-10-06T10:12:49.327Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000010', '2026-10-06T03:14:42.942Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-000000000010');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000010');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000001', '2026-09-22T09:49:12.220Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000003', '2026-09-22T17:50:06.196Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-00000000000c', '2026-09-18T21:44:14.645Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000004', '2026-09-21T10:02:55.218Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-00000000000a', '2026-09-19T02:24:53.492Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000005', '2026-09-18T04:14:09.645Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-00000000000b', '2026-09-23T12:04:58.485Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000011', '2026-09-23T07:35:33.674Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-00000000000f', '2026-09-21T13:17:39.679Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001c', '5eed0000-0000-4000-8000-000000000012', '2026-09-22T15:51:24.849Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-00000000001c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-00000000001c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000001c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-00000000001c');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-000000000002', '2026-09-08T16:02:22.246Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-000000000007', '2026-09-09T20:54:47.674Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-00000000000c', '2026-09-05T11:09:07.202Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-00000000000d', '2026-09-08T16:38:30.307Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000038', '5eed0000-0000-4000-8000-000000000012', '2026-09-10T03:15:36.674Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000038');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-000000000038');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000005', '2026-09-06T03:06:39.052Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-00000000000d', '2026-09-07T07:06:07.359Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-00000000000c', '2026-09-03T10:21:29.829Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000011', '2026-09-05T14:41:52.598Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000003', '2026-09-04T06:41:05.201Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000006', '2026-09-07T05:56:25.445Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000012', '2026-09-05T04:09:54.523Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000010', '2026-09-07T05:14:22.096Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-00000000000b', '2026-09-06T03:01:35.817Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000007');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000007');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000007');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000010', '2026-09-21T13:52:00.320Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000004', '2026-09-21T21:50:04.864Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000007', '2026-09-24T00:14:24.177Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-00000000000a', '2026-09-23T09:14:33.933Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-00000000000e', '2026-09-23T20:29:20.990Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000001', '2026-09-22T10:27:26.340Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000012', '2026-09-25T11:26:26.611Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000005', '2026-09-23T04:35:05.268Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-00000000000f', '2026-09-25T06:22:56.238Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-000000000002', '2026-09-20T13:09:51.291Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000029', '5eed0000-0000-4000-8000-00000000000c', '2026-09-20T18:52:01.298Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000012', '2026-10-02T15:56:41.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000007', '2026-09-29T20:39:18.826Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000009', '2026-09-29T07:27:50.243Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000001', '2026-09-27T15:01:58.582Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-00000000000a', '2026-10-01T14:51:47.501Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-00000000000e', '2026-09-27T04:40:48.225Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000004f', '5eed0000-0000-4000-8000-000000000002', '2026-09-29T04:05:31.555Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-00000000004f');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000004f');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-00000000004f');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000003', '2026-09-03T16:12:52.627Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000012', '2026-09-04T02:23:57.225Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-00000000000f', '2026-08-30T09:23:43.243Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000002', '2026-08-31T14:42:38.037Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-00000000000e', '2026-09-01T19:27:54.325Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000005', '2026-08-31T22:57:11.228Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000031');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000011', '2026-10-03T23:24:37.103Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000008', '2026-10-04T11:56:43.618Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000010', '2026-10-02T16:03:06.448Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000012', '2026-10-05T16:10:11.375Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001d', '5eed0000-0000-4000-8000-000000000001', '2026-10-03T02:53:59.240Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-00000000000a', '2026-09-11T23:49:14.881Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-00000000000d', '2026-09-07T08:08:39.253Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-000000000002', '2026-09-12T16:15:33.490Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-00000000000c', '2026-09-08T10:20:33.637Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-000000000007', '2026-09-09T08:19:42.653Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000048', '5eed0000-0000-4000-8000-000000000012', '2026-09-10T06:19:30.357Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-000000000048');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000048');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-000000000048');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000048');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-000000000010', '2026-08-27T18:09:38.283Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-000000000001', '2026-08-28T16:32:42.424Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-00000000000b', '2026-08-27T06:53:37.028Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-000000000003', '2026-08-27T08:25:53.583Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-000000000006', '2026-08-31T07:15:57.413Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-00000000000e', '2026-08-26T16:06:07.944Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000e' and is_default), '5eed0001-0000-4000-8000-00000000000c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000000c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-00000000000c');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000009', '2026-09-04T17:53:11.061Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000006', '2026-09-06T10:25:58.276Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000007', '2026-09-06T08:42:34.488Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-00000000000b', '2026-09-02T16:13:39.604Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000003', '2026-09-06T11:52:52.520Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000008', '2026-09-03T18:15:13.045Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-00000000000c', '2026-09-06T15:50:50.228Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000001', '2026-09-05T10:15:04.754Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-00000000000e', '2026-09-05T10:11:41.762Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000004', '2026-09-07T18:29:00.899Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000002', '2026-09-07T07:29:43.110Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-000000000010', '2026-09-02T11:30:38.288Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002c', '5eed0000-0000-4000-8000-00000000000d', '2026-09-02T14:59:00.479Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000010' and is_default), '5eed0001-0000-4000-8000-00000000002c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-00000000002c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-00000000002c');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-00000000002c');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000046', '5eed0000-0000-4000-8000-00000000000f', '2026-09-21T09:06:16.483Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000046', '5eed0000-0000-4000-8000-00000000000d', '2026-09-21T03:56:29.289Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000046', '5eed0000-0000-4000-8000-000000000012', '2026-09-21T22:43:17.708Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-000000000046');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-000000000009', '2026-09-14T10:13:54.626Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-000000000001', '2026-09-08T17:53:08.987Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-000000000005', '2026-09-12T23:24:31.261Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-000000000003', '2026-09-11T16:57:56.988Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-000000000011', '2026-09-09T19:18:22.747Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000027', '5eed0000-0000-4000-8000-00000000000f', '2026-09-12T11:06:30.212Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000027');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000027');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-000000000027');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-000000000027');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000009', '2026-09-19T02:47:11.537Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000010', '2026-09-19T20:19:48.621Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-00000000000e', '2026-09-16T22:29:24.721Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000011', '2026-09-18T17:14:08.855Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-00000000000b', '2026-09-18T01:16:23.083Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000012', '2026-09-18T22:28:18.325Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000006', '2026-09-17T00:06:07.559Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000008', '2026-09-17T15:10:34.408Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-00000000000f', '2026-09-15T20:42:57.964Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000007', '2026-09-17T05:13:51.167Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000003', '2026-09-20T00:29:26.779Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000002', '2026-09-19T02:56:14.044Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-00000000000d', '2026-09-19T00:40:01.092Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000040');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-000000000007', '2026-09-08T00:53:06.836Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-00000000000f', '2026-09-10T01:56:30.540Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-000000000001', '2026-09-07T08:49:30.547Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-000000000012', '2026-09-10T01:59:41.852Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003a', '5eed0000-0000-4000-8000-00000000000a', '2026-09-07T12:30:01.032Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-000000000011', '2026-09-30T09:55:37.140Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-00000000000d', '2026-10-05T21:00:54.485Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-000000000009', '2026-10-01T16:27:33.775Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-00000000000e', '2026-10-05T01:39:16.281Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005b', '5eed0000-0000-4000-8000-000000000005', '2026-10-02T00:44:47.523Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-00000000005b');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000007', '2026-09-20T10:15:28.055Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-00000000000a', '2026-09-22T10:16:29.092Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-00000000000f', '2026-09-21T19:43:59.060Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000005', '2026-09-22T21:03:57.057Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000004', '2026-09-22T14:20:51.504Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-00000000000d', '2026-09-17T07:58:40.457Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000009', '2026-09-21T18:44:11.134Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-00000000000c', '2026-09-18T14:15:54.061Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000002', '2026-09-22T09:17:37.687Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000001', '2026-09-21T19:03:38.387Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000008', '2026-09-21T21:57:02.821Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005e', '5eed0000-0000-4000-8000-000000000003', '2026-09-19T00:28:19.544Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-00000000005e');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-00000000005e');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-00000000005e');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-00000000005e');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000001', '2026-09-13T07:21:59.767Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000005', '2026-09-17T22:31:32.752Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-00000000000c', '2026-09-13T13:46:42.950Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000010', '2026-09-13T00:18:46.983Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000008', '2026-09-12T15:45:06.225Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000007', '2026-09-15T20:18:05.059Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-00000000000d', '2026-09-15T22:37:25.262Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000002', '2026-09-12T05:28:35.377Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000004', '2026-09-17T09:12:52.210Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-000000000009', '2026-09-14T16:01:01.773Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000052', '5eed0000-0000-4000-8000-00000000000a', '2026-09-12T15:41:29.768Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000052');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000052');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000064', '5eed0000-0000-4000-8000-00000000000e', '2026-09-19T00:08:06.783Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000064', '5eed0000-0000-4000-8000-000000000011', '2026-09-19T19:38:35.712Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000064', '5eed0000-0000-4000-8000-000000000002', '2026-09-20T19:58:51.017Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000064', '5eed0000-0000-4000-8000-000000000005', '2026-09-24T14:33:36.612Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000e' and is_default), '5eed0001-0000-4000-8000-000000000064');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000064');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000064');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000025', '5eed0000-0000-4000-8000-000000000008', '2026-10-01T03:24:11.171Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000025', '5eed0000-0000-4000-8000-000000000002', '2026-10-02T03:33:55.128Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000025', '5eed0000-0000-4000-8000-000000000010', '2026-10-03T02:06:59.151Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000025', '5eed0000-0000-4000-8000-00000000000a', '2026-10-01T04:26:56.312Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000010' and is_default), '5eed0001-0000-4000-8000-000000000025');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000025');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000025');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000005', '2026-10-07T05:41:08.142Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000009', '2026-10-08T14:34:34.487Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-00000000000e', '2026-10-09T07:52:32.007Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-00000000000a', '2026-10-06T16:42:15.684Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000010', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000011', '2026-10-05T07:12:29.078Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000002', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000006', '2026-10-07T00:32:27.173Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000007', '2026-10-08T14:25:07.029Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000001a', '5eed0000-0000-4000-8000-000000000003', '2026-10-05T20:29:30.168Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-00000000001a');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000001', '2026-09-11T14:12:56.977Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000004', '2026-09-10T01:59:46.967Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-00000000000b', '2026-09-11T16:34:43.241Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000012', '2026-09-12T04:23:14.564Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-00000000000e', '2026-09-09T05:06:49.729Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000011', '2026-09-11T20:12:16.926Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-00000000000f', '2026-09-08T06:26:08.156Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000007', '2026-09-08T15:53:55.741Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000016', '5eed0000-0000-4000-8000-000000000008', '2026-09-11T06:10:03.927Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000016');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000008', '2026-09-11T04:09:36.195Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000009', '2026-09-12T23:11:46.267Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000007', '2026-09-08T21:33:53.580Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000011', '2026-09-10T08:42:33.518Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000003', '2026-09-10T09:16:07.878Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-00000000000c', '2026-09-09T15:19:02.270Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000001', '2026-09-09T14:48:12.703Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000019', '5eed0000-0000-4000-8000-000000000004', '2026-09-13T15:18:11.935Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000019');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-000000000019');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000008', '2026-09-27T20:55:36.055Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000010', '2026-09-29T05:36:04.860Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-00000000000a', '2026-10-02T15:48:41.072Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000007', '2026-10-02T22:13:35.123Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000002', '2026-10-03T05:15:21.711Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-00000000000e', '2026-09-29T11:24:47.640Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000004', '2026-10-01T02:45:45.370Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000003', '2026-10-01T20:13:21.108Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-000000000012', '2026-09-28T14:32:11.585Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000024', '5eed0000-0000-4000-8000-00000000000c', '2026-10-01T17:42:58.431Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000009', '2026-10-07T16:57:47.622Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000012', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-00000000000a', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000005', '2026-10-06T23:51:11.449Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000004', '2026-10-09T03:12:50.481Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-00000000000c', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000006', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000002', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000003', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000007', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000008', '2026-10-08T11:08:02.816Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000001', '2026-10-07T14:28:53.918Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000039', '5eed0000-0000-4000-8000-000000000011', '2026-10-07T04:38:21.126Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-000000000039');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000034', '5eed0000-0000-4000-8000-000000000001', '2026-10-03T14:27:09.194Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000034', '5eed0000-0000-4000-8000-000000000008', '2026-10-02T06:05:27.950Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000034', '5eed0000-0000-4000-8000-00000000000c', '2026-10-05T10:31:45.139Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000034');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000034');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-000000000034');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003f', '5eed0000-0000-4000-8000-00000000000a', '2026-10-05T13:19:11.403Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003f', '5eed0000-0000-4000-8000-00000000000c', '2026-10-03T10:55:33.127Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003f', '5eed0000-0000-4000-8000-000000000005', '2026-10-07T00:32:50.170Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000006', '2026-09-20T15:13:09.160Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000004', '2026-09-16T19:07:10.016Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000010', '2026-09-16T18:26:35.033Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-00000000000b', '2026-09-19T22:21:05.308Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000007', '2026-09-19T22:37:29.671Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-00000000000d', '2026-09-19T21:51:30.776Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000011', '2026-09-17T03:10:06.354Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-00000000000c', '2026-09-19T20:35:40.559Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000009', '2026-09-17T15:58:51.789Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000012', '2026-09-19T11:58:56.233Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-00000000000f', '2026-09-17T01:26:19.459Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000041');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-000000000041');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000041');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000023', '5eed0000-0000-4000-8000-000000000002', '2026-09-16T02:56:53.481Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000023', '5eed0000-0000-4000-8000-00000000000f', '2026-09-18T10:30:42.688Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000023', '5eed0000-0000-4000-8000-00000000000d', '2026-09-15T04:00:29.348Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000023', '5eed0000-0000-4000-8000-00000000000c', '2026-09-19T18:04:04.478Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000d' and is_default), '5eed0001-0000-4000-8000-000000000023');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000023');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000023');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000023');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-00000000000a', '2026-08-31T21:28:32.711Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000010', '2026-09-01T03:44:35.786Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-00000000000c', '2026-09-01T02:47:22.967Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000006', '2026-08-29T14:55:10.607Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000003', '2026-08-28T19:35:23.209Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000005', '2026-08-28T13:33:18.412Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-00000000000b', '2026-08-31T21:43:52.470Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000011', '2026-09-01T18:07:09.324Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000037', '5eed0000-0000-4000-8000-000000000007', '2026-09-02T01:50:31.930Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-000000000037');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000037');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-000000000037');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-000000000037');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000051', '5eed0000-0000-4000-8000-000000000003', '2026-10-05T18:25:04.759Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000051', '5eed0000-0000-4000-8000-000000000004', '2026-10-06T22:08:17.508Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000051', '5eed0000-0000-4000-8000-00000000000a', '2026-10-06T11:27:16.340Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000005', '2026-09-19T11:53:02.295Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000002', '2026-09-17T05:13:06.581Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000007', '2026-09-17T18:19:15.931Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000012', '2026-09-19T00:18:14.706Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-00000000000e', '2026-09-18T06:08:35.300Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000010', '2026-09-14T08:24:15.549Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000009', '2026-09-16T07:56:56.898Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-00000000000a', '2026-09-19T12:56:46.362Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000002');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000e' and is_default), '5eed0001-0000-4000-8000-000000000002');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-000000000002');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000010' and is_default), '5eed0001-0000-4000-8000-000000000002');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-000000000010', '2026-10-05T23:04:08.709Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-00000000000b', '2026-10-01T11:17:21.470Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-000000000008', '2026-10-04T09:15:42.665Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-000000000006', '2026-10-03T22:05:51.244Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-000000000011', '2026-10-04T22:00:23.802Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-000000000007', '2026-10-05T15:22:53.625Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-00000000000c', '2026-10-05T21:35:40.216Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-00000000000d');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-000000000001', '2026-09-08T17:05:30.232Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-000000000008', '2026-09-06T18:16:37.440Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-00000000000e', '2026-09-07T07:23:17.806Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-000000000007', '2026-09-05T17:30:58.864Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002d', '5eed0000-0000-4000-8000-000000000005', '2026-09-03T10:06:04.746Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000002d');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000005', '2026-09-07T07:19:33.949Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-00000000000d', '2026-09-08T19:19:20.216Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-00000000000f', '2026-09-08T12:54:45.837Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000001', '2026-09-04T11:20:44.919Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000008', '2026-09-03T16:51:54.614Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000012', '2026-09-06T23:46:23.849Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000006', '2026-09-03T12:57:05.671Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000011', '2026-09-05T13:33:36.805Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-00000000000e', '2026-09-05T09:36:34.582Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000003', '2026-09-08T01:43:40.075Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-00000000000a', '2026-09-03T10:00:39.761Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000061');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-000000000061');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000061');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000e' and is_default), '5eed0001-0000-4000-8000-000000000061');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000006', '2026-09-12T00:49:41.792Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-00000000000f', '2026-09-13T18:25:08.580Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000002', '2026-09-15T03:46:15.114Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-00000000000c', '2026-09-12T04:53:12.885Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-00000000000e', '2026-09-16T01:06:20.550Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000011', '2026-09-15T14:41:05.451Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000007', '2026-09-11T17:20:23.934Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000012', '2026-09-12T23:37:46.142Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000c' and is_default), '5eed0001-0000-4000-8000-000000000020');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000020');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-000000000020');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000009', '2026-08-31T04:35:15.151Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000005', '2026-08-31T12:57:02.718Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000012', '2026-08-31T23:25:56.136Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000002', '2026-09-02T11:44:20.274Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000006', '2026-09-04T09:58:33.070Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000001', '2026-09-03T05:14:20.711Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000049', '5eed0000-0000-4000-8000-000000000011', '2026-09-03T11:53:20.534Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-000000000049');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-000000000049');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-000000000049');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000012' and is_default), '5eed0001-0000-4000-8000-000000000049');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000007', '2026-09-02T09:13:44.114Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-00000000000a', '2026-08-29T02:30:04.131Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-00000000000d', '2026-08-30T00:32:59.427Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-00000000000f', '2026-09-01T21:45:24.686Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000006', '2026-09-03T13:17:01.472Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-00000000000e', '2026-08-31T10:09:18.686Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000012', '2026-08-28T20:03:17.067Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000003', '2026-08-30T15:29:31.664Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000011', '2026-09-02T01:01:53.453Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000005', '2026-08-30T03:30:31.760Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000001', '2026-08-30T20:23:05.105Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002b', '5eed0000-0000-4000-8000-000000000004', '2026-09-03T07:59:07.526Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-00000000002b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000003' and is_default), '5eed0001-0000-4000-8000-00000000002b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-00000000002b');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000011' and is_default), '5eed0001-0000-4000-8000-00000000002b');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-00000000000e', '2026-09-23T14:54:19.963Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-000000000004', '2026-09-25T08:59:59.112Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-000000000009', '2026-09-22T01:29:08.960Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-000000000007', '2026-09-24T05:26:58.268Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-00000000000c', '2026-09-21T21:45:14.434Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-00000000000f', '2026-09-24T07:23:50.252Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-00000000000a', '2026-09-27T12:26:04.985Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-000000000005', '2026-09-23T21:10:59.901Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000055', '5eed0000-0000-4000-8000-00000000000b', '2026-09-23T17:41:08.633Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000e' and is_default), '5eed0001-0000-4000-8000-000000000055');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000055');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-000000000055');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-00000000000b', '2026-09-17T21:41:09.784Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-00000000000c', '2026-09-15T19:07:02.314Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-000000000004', '2026-09-15T05:46:02.574Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-000000000006', '2026-09-15T19:28:28.135Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-00000000000d', '2026-09-12T11:19:47.845Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-000000000009', '2026-09-15T17:29:56.860Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000013', '5eed0000-0000-4000-8000-00000000000a', '2026-09-12T19:40:57.236Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-00000000000a', '2026-10-07T04:29:36.749Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000010', '2026-10-06T16:29:02.037Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000004', '2026-10-08T17:59:36.277Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000006', '2026-10-07T17:02:00.968Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000005', '2026-10-05T02:36:33.316Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-00000000000f', '2026-10-05T06:45:56.408Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000005' and is_default), '5eed0001-0000-4000-8000-000000000008');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000010' and is_default), '5eed0001-0000-4000-8000-000000000008');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000a' and is_default), '5eed0001-0000-4000-8000-000000000008');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-000000000008');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-00000000000f', '2026-09-19T08:24:05.483Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-00000000000e', '2026-09-16T20:29:34.465Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000001', '2026-09-15T11:03:21.547Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-00000000000a', '2026-09-16T03:48:41.239Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000002', '2026-09-17T18:35:28.487Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000012', '2026-09-14T11:10:13.712Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000009', '2026-09-19T18:15:05.032Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-00000000000c', '2026-09-19T20:10:54.526Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000008', '2026-09-15T09:54:51.230Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000010', '2026-09-19T20:18:24.674Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002f', '5eed0000-0000-4000-8000-000000000006', '2026-09-17T23:04:07.481Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000009' and is_default), '5eed0001-0000-4000-8000-00000000002f');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000001' and is_default), '5eed0001-0000-4000-8000-00000000002f');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-00000000000f', '2026-09-29T13:38:22.520Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000003', '2026-09-29T15:44:13.583Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000007', '2026-09-29T14:41:34.783Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000008', '2026-09-25T07:47:34.944Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000002', '2026-09-26T06:53:37.459Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000006', '2026-09-28T05:45:19.276Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000001', '2026-09-30T05:18:12.218Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000011', '2026-09-29T07:32:24.947Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-00000000000a', '2026-09-29T06:21:37.751Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-00000000000c', '2026-09-25T23:44:34.278Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000010', '2026-09-26T19:15:26.938Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000009', '2026-09-28T08:39:27.274Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000005a', '5eed0000-0000-4000-8000-000000000004', '2026-09-26T03:52:12.898Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-00000000005a');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000007' and is_default), '5eed0001-0000-4000-8000-00000000005a');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-00000000000f', '2026-09-21T01:36:12.969Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-000000000005', '2026-09-22T20:25:28.827Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-000000000010', '2026-09-23T10:03:05.839Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-000000000006', '2026-09-21T11:20:10.280Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-00000000000b', '2026-09-25T13:03:57.020Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-000000000008', '2026-09-21T23:55:29.852Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-000000000059', '5eed0000-0000-4000-8000-00000000000c', '2026-09-21T08:28:18.943Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000f' and is_default), '5eed0001-0000-4000-8000-000000000059');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000008' and is_default), '5eed0001-0000-4000-8000-000000000059');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-000000000059');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003e', '5eed0000-0000-4000-8000-000000000008', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003e', '5eed0000-0000-4000-8000-000000000005', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003e', '5eed0000-0000-4000-8000-00000000000b', '2026-10-09T09:50:00.000Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000003e', '5eed0000-0000-4000-8000-000000000006', '2026-10-09T09:50:00.000Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000006' and is_default), '5eed0001-0000-4000-8000-00000000003e');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000002', '2026-09-29T12:40:43.522Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-00000000000a', '2026-10-01T17:41:54.238Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000004', '2026-10-02T10:11:53.026Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000010', '2026-10-01T18:24:35.326Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-00000000000e', '2026-09-28T15:00:23.030Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000009', '2026-09-29T02:01:37.114Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-00000000000c', '2026-09-27T02:23:10.215Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-000000000005', '2026-09-30T21:53:26.961Z');
insert into public.prompt_likes (prompt_id, user_id, created_at) values ('5eed0001-0000-4000-8000-00000000002a', '5eed0000-0000-4000-8000-00000000000b', '2026-10-02T01:15:27.949Z');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000004' and is_default), '5eed0001-0000-4000-8000-00000000002a');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-00000000000b' and is_default), '5eed0001-0000-4000-8000-00000000002a');
insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = '5eed0000-0000-4000-8000-000000000002' and is_default), '5eed0001-0000-4000-8000-00000000002a');

-- --- 4. Bildirimler: beğeniler trigger'larla bildirim üretti; hepsi "şimdi" tarihli
-- olmasın diye rastgele son 10 güne yayılıyor, eskiler okunmuş sayılıyor.
update public.notifications
set created_at = now() - (random() * interval '10 days'),
    is_read = random() < 0.6
where recipient_id in ('5eed0000-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000002', '5eed0000-0000-4000-8000-000000000003', '5eed0000-0000-4000-8000-000000000004', '5eed0000-0000-4000-8000-000000000005', '5eed0000-0000-4000-8000-000000000006', '5eed0000-0000-4000-8000-000000000007', '5eed0000-0000-4000-8000-000000000008', '5eed0000-0000-4000-8000-000000000009', '5eed0000-0000-4000-8000-00000000000a', '5eed0000-0000-4000-8000-00000000000b', '5eed0000-0000-4000-8000-00000000000c', '5eed0000-0000-4000-8000-00000000000d', '5eed0000-0000-4000-8000-00000000000e', '5eed0000-0000-4000-8000-00000000000f', '5eed0000-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000011', '5eed0000-0000-4000-8000-000000000012');

-- --- 5. Kontrol: sonuçlar aşağıda görünür -------------------------------------------
select 'prompts' as tablo, count(*) from public.prompts
union all select 'prompt_media', count(*) from public.prompt_media
union all select 'prompt_likes', count(*) from public.prompt_likes
union all select 'prompt_requests', count(*) from public.prompt_requests
union all select 'generators', count(*) from public.generators
union all select 'prompt_comments', count(*) from public.prompt_comments
union all select 'profiles (kalmalı)', count(*) from public.profiles;

commit;

