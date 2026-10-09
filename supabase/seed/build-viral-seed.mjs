// Siteyi sıfırlayıp viral promptlarla doldurur:  node supabase/seed/build-viral-seed.mjs
// Çıktı: supabase/seed/viral-reset.sql  (Supabase Dashboard → SQL Editor'de çalıştırılır).
//
// Ne yapar:
//   1. Tüm içeriği KALICI olarak siler (prompt, istek, generator, workflow, hazır ayar,
//      yorum, beğeni, kaydetme, koleksiyon, mesaj, bildirim, şikâyet ...). Soft-delete YOK.
//   2. Kullanıcılar (auth.users + profiles), takipler, engeller, avatarlar, "Genel"
//      koleksiyonları ve taksonomi/etiket kataloğu KALIR.
//   3. 18 demo personaya, viral-cases.json'daki gerçek promptlar + görsellerle
//      (kaynak ve lisans açıklamada) yeni paylaşımlar ekler.
//
// Tüm id'ler sabit, rastgelelik sabit tohumlu: script her çalıştığında aynı SQL'i üretir.
// Görseller public/viral-seed/N.jpg olarak repoda durur ve siteyle birlikte yayınlanır.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROWS, IMAGE_BASE, IMAGE_CREDIT } from "./viral-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(here, "viral-cases.json"), "utf8"));

// Demo kullanıcıların sabit id'leri (build-demo-seed.mjs: uid("user") sayacı).
const PERSONAS = ["ali", "veli", "ayse", "mehmet", "zeynep", "can", "elif", "burak", "selin", "emre", "deniz", "ceren", "kaan", "melis", "onur", "ipek", "baran", "ece"];
const userId = (name) => `5eed0000-0000-4000-8000-${(PERSONAS.indexOf(name) + 1).toString(16).padStart(12, "0")}`;

// Canlıdaki mevcut etiket slug'ları (yeni etiket oluşturulmuyor).
const KNOWN_TAGS = new Set("minimalist yazarlik manzara portre fantastik retro kodlama video-uretim 3d-render mimari uzay karakter-tasarimi anime siberpunk muzik-uretim neon siir soyut youtube-video lighting photography composition editorial-photography texture typography studio-lighting animation surreal golden-hour shadow smartphone-photography aspect-ratio architecture focus apple ai-sanat clean-background javascript".split(" "));
// Canlıdaki etiket adları (slug → görünen ad). SQL, eksik etiketi güvenle ekler.
const TAG_LABELS = {
  "3d-render": "3D Render", "ai-sanat": "AI Sanat", animation: "Animation", anime: "Anime", apple: "Apple", architecture: "Architecture",
  "aspect-ratio": "Aspect Ratio", "clean-background": "Clean Background", composition: "Composition", "editorial-photography": "Editorial Photography",
  fantastik: "Fantastik", focus: "Focus", "golden-hour": "Golden Hour", javascript: "JavaScript", "karakter-tasarimi": "Karakter Tasarımı",
  kodlama: "Kodlama", lighting: "Lighting", manzara: "Manzara", mimari: "Mimari", minimalist: "Minimalist", "muzik-uretim": "Müzik Üretimi",
  neon: "Neon", photography: "Photography", portre: "Portre", retro: "Retro", shadow: "Shadow", siberpunk: "Siberpunk", siir: "Şiir",
  "smartphone-photography": "Smartphone Photography", soyut: "Soyut", "studio-lighting": "Studio Lighting", surreal: "Sürreal",
  texture: "Texture", typography: "Typography", uzay: "Uzay", "video-uretim": "Video Üretimi", yazarlik: "Yazarlık", "youtube-video": "YouTube Video",
};
const KNOWN_CATS = {
  human_character: "portrait character character_design human child elderly group couple fashion beauty makeup hair body_pose",
  photography: "portrait_photography street_photography landscape nature night_photography studio wedding travel architectural_photography product_photography food_photography fashion_photography macro wildlife minimal cinematic_photography black_white",
  art_illustration: "digital_art concept_art illustration cartoon drawing oil_painting watercolor sketch pixel_art poster collage character_illustration painting anime_art manga_art 3d_art fantasy_art sci_fi_art children_s_illustration",
  style: "realistic cinematic anime manga 3d pixar_style cyberpunk fantasy retro vintage minimalist noir steampunk dark_fantasy low_poly futuristic editorial luxury streetwear dark surreal",
  product_commercial: "product advertising e_commerce packaging brand logo product_mockup cosmetics clothing technology fashion_product food_beverage",
  spaces: "architecture interior exterior home office restaurant store city village futuristic_city hotel room_design",
  nature_environment: "landscape mountain sea forest desert animal plant space planet weather flower sunset sky seasons",
  design: "ui ux web_design mobile_app dashboard poster banner social_media presentation infographic logo_design branding typography 3d_design graphic_design",
};

// --- deterministic helpers -----------------------------------------------------
let seed = 20261009;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}
const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const NOW = Date.UTC(2026, 9, 9, 10, 0, 0);
const DAY = 86400000;
const ts = (ms) => `'${new Date(ms).toISOString()}'`;
const promptUuid = (n) => `5eed0001-0000-4000-8000-${Number(n).toString(16).padStart(12, "0")}`;

// --- model ---------------------------------------------------------------------
// Referans fotoğraf/görsel gerektiren (görselden görsele) promptlar — tek tek incelendi.
const REFERENCE_PHOTO_CASES = new Set([2, 6, 8, 12, 13, 16, 26, 27, 28, 29, 33, 40, 42, 43, 62, 70, 73, 81, 96]);
const needsReferencePhoto = (n) => REFERENCE_PHOTO_CASES.has(n);

const prompts = ROWS.map(([n, user, title, desc, category, subcategory, tags]) => {
  const c = CASES[String(n)];
  if (!c) throw new Error(`viral-cases.json içinde vaka ${n} yok`);
  if (!PERSONAS.includes(user)) throw new Error(`bilinmeyen persona ${user}`);
  if (!KNOWN_CATS[category]?.split(" ").includes(subcategory)) throw new Error(`geçersiz kategori ${category}/${subcategory} (vaka ${n})`);
  for (const t of tags) if (!KNOWN_TAGS.has(t)) throw new Error(`bilinmeyen etiket ${t} (vaka ${n})`);
  if (new Set(tags).size !== tags.length) throw new Error(`yinelenen etiket (vaka ${n})`);
  const by = c.by;
  const sourceLine = `Kaynak: ${by}${c.src ? ` · ${c.src}` : ""}`;
  const note = needsReferencePhoto(n) ? "Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır." : null;
  const description = [desc, note, `${sourceLine}\n${IMAGE_CREDIT} Prompt, orijinal paylaşımdan alıntıdır.`].filter(Boolean).join("\n\n");
  return {
    n, id: promptUuid(n), user, title, description, text: c.prompt.trim(), category, subcategory, tags,
    image: { url: `${IMAGE_BASE}/${n}.jpg`, w: c.w, h: c.h },
    created: NOW - (0.3 + rand() * 44) * DAY,
  };
});
if (new Set(prompts.map((p) => p.n)).size !== prompts.length) throw new Error("yinelenen vaka");
const perUser = Object.fromEntries(PERSONAS.map((u) => [u, prompts.filter((p) => p.user === u).length]));
for (const [u, c] of Object.entries(perUser)) if (c === 0) throw new Error(`${u} için paylaşım yok`);

// --- SQL -----------------------------------------------------------------------
const out = [];
const emit = (s) => out.push(s);
const userIds = PERSONAS.map(userId).map(q).join(", ");

emit(`-- ============================================================================
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
-- Sonra ${prompts.length} paylaşım ekler (${PERSONAS.length} demo kullanıcıya dağıtılmış; her biri
-- ${Math.min(...Object.values(perUser))}-${Math.max(...Object.values(perUser))} prompt). Görseller siteyle birlikte yayınlanır
-- (public/viral-seed/ → ${IMAGE_BASE}/N.jpg), bu SQL'i çalıştırmadan ÖNCE
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
  if (select count(*) from auth.users where id in (${userIds})) <> ${PERSONAS.length} then
    raise exception 'Beklenen % demo kullanıcının tamamı bulunamadı; işlem iptal edildi.', ${PERSONAS.length};
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
`);

const usedTags = [...new Set(prompts.flatMap((p) => p.tags))].sort();
for (const t of usedTags) if (!TAG_LABELS[t]) throw new Error(`etiket adı eksik: ${t}`);
emit(`-- Kullanılan etiketler yoksa oluşturulur (varsa dokunulmaz).`);
emit(`insert into public.tags (slug, label) values ${usedTags.map((t) => `(${q(t)}, ${q(TAG_LABELS[t])})`).join(", ")} on conflict (slug) do nothing;\n`);

for (const p of prompts) {
  emit(`insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values (${q(p.id)}, ${q(userId(p.user))}, ${q(p.title)}, ${q(p.description)}, ${q(p.text)}, array['gpt-image:gpt-image-1'], 'image', ${q(p.category)}, ${q(p.subcategory)}, 'published', 'public', 'original', ${ts(p.created)}, ${ts(p.created)});
insert into public.prompt_media (prompt_id, url, width, height, alt, position) values (${q(p.id)}, ${q(p.image.url)}, ${p.image.w}, ${p.image.h}, ${q(p.title)}, 0);`);
  for (const t of p.tags) emit(`insert into public.prompt_tags (prompt_id, tag_slug, source) values (${q(p.id)}, ${q(t)}, 'manual');`);
}

// --- 3. Beğeniler + kaydetmeler ----------------------------------------------------
emit(`\n-- --- 3. Beğeniler ve kaydedilenler (demo kullanıcılar arasında) -------------------`);
for (const p of prompts) {
  const others = PERSONAS.filter((u) => u !== p.user);
  const likers = sample(others, randInt(3, 13));
  for (const liker of likers) {
    emit(`insert into public.prompt_likes (prompt_id, user_id, created_at) values (${q(p.id)}, ${q(userId(liker))}, ${ts(Math.min(NOW - 600000, p.created + (0.05 + rand() * 6) * DAY))});`);
  }
  for (const saver of sample(likers, randInt(0, Math.min(4, likers.length)))) {
    emit(`insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = ${q(userId(saver))} and is_default), ${q(p.id)});`);
  }
}

emit(`
-- --- 4. Bildirimler: beğeniler trigger'larla bildirim üretti; hepsi "şimdi" tarihli
-- olmasın diye rastgele son 10 güne yayılıyor, eskiler okunmuş sayılıyor.
update public.notifications
set created_at = now() - (random() * interval '10 days'),
    is_read = random() < 0.6
where recipient_id in (${userIds});

-- --- 5. Kontrol: sonuçlar aşağıda görünür -------------------------------------------
select 'prompts' as tablo, count(*) from public.prompts
union all select 'prompt_media', count(*) from public.prompt_media
union all select 'prompt_likes', count(*) from public.prompt_likes
union all select 'prompt_requests', count(*) from public.prompt_requests
union all select 'generators', count(*) from public.generators
union all select 'prompt_comments', count(*) from public.prompt_comments
union all select 'profiles (kalmalı)', count(*) from public.profiles;

commit;
`);

const file = join(here, "viral-reset.sql");
writeFileSync(file, out.join("\n") + "\n");
console.log(`${file}: ${prompts.length} prompts, ${PERSONAS.length} personas`);
console.log(Object.entries(perUser).map(([u, c]) => `${u}:${c}`).join(" "));
