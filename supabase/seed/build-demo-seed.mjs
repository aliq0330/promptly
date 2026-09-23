// Demo hesap seed'ini üretir:  node supabase/seed/build-demo-seed.mjs
// Çıktı: supabase/seed/demo-users.sql (Supabase Dashboard → SQL Editor'de çalıştırılır).
//
// Tüm id'ler sabittir (5eed...), rastgelelik sabit tohumlu — script her
// çalıştığında birebir aynı SQL'i üretir. SQL dosyası kendi başına
// idempotent: başta önceki demo verisini silip yeniden oluşturur.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USERS, RESPONSES, COMMENTS, COLLECTION_NAMES, PASSWORD, EMAIL_DOMAIN } from "./demo-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// --- deterministic helpers ---------------------------------------------------
let seed = 20260923;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

const counters = {};
function uid(kind) {
  const prefix = { user: "0000", prompt: "0001", request: "0002", generator: "0003", version: "0004", comment: "0005", collection: "0006" }[kind];
  counters[kind] = (counters[kind] ?? 0) + 1;
  return `5eed${prefix}-0000-4000-8000-${counters[kind].toString(16).padStart(12, "0")}`;
}

const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const DAY = 86400000;
const ts = (ms) => `'${new Date(ms).toISOString()}'`;
const daysAgo = (min, max) => NOW - (min + rand() * (max - min)) * DAY;

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
const slugify = (s, sep = "-") =>
  s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c]).toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");

// --- images ------------------------------------------------------------------
// picsum.photos: gerçek fotoğraflar, seed ile sabit. loremflickr canlıda
// güvenilir şekilde yüklenmediği için bırakıldı (keyword eşleşmesi kayboldu).
let lock = 100;
const SIZES = { "--ar 16:9": [1600, 900], "--ar 21:9": [1680, 720], "--ar 4:3": [1200, 900], "--ar 1:1": [1080, 1080], "--ar 3:4": [900, 1200], "--ar 4:5": [960, 1200], "--ar 9:16": [720, 1280] };
function imageFor(promptText, keywords) {
  const ar = Object.keys(SIZES).find((k) => promptText.includes(k)) ?? "--ar 4:5";
  const [w, h] = SIZES[ar];
  lock += 1;
  return { url: `https://picsum.photos/seed/${slugify(keywords)}-${lock}/${w}/${h}`, w, h };
}
const coverFor = (keywords) => `https://picsum.photos/seed/${slugify(keywords)}-${(lock += 1)}/1200/675`;

// --- build model ---------------------------------------------------------------
const users = USERS.map((u, i) => ({ ...u, id: uid("user"), joined: NOW - (60 + i * 3) * DAY }));
const byName = Object.fromEntries(users.map((u) => [u.u, u]));

const prompts = []; // {id, author, type, title, desc, text, tool, tags, image, created, requestId, show}
const requests = [];
const generators = [];

for (const u of users) {
  for (const [type, title, desc, text, tool, tags, kw] of u.prompts) {
    prompts.push({ id: uid("prompt"), author: u, type, title, desc, text, tool, tags, image: type === "image" && kw ? imageFor(text, kw) : null, created: daysAgo(3, 50) });
  }
  u.requestIds = [];
  for (const [type, title, desc, direction, tool, tags, status] of u.requests) {
    const r = { id: uid("request"), author: u, type, title, desc, direction, tool, tags, status, created: daysAgo(6, 40), responses: [] };
    requests.push(r);
    u.requestIds.push(r);
  }
  for (const [category, title, desc, sub, kw, negative, fields] of u.generators) {
    generators.push({ id: uid("generator"), versionId: uid("version"), author: u, category, title, desc, sub, cover: coverFor(kw), negative, fields, created: daysAgo(2, 45) });
  }
}

for (const [owner, idx, responder, title, desc, text, tool, kw, selected] of RESPONSES) {
  const req = byName[owner].requestIds[idx];
  if (!req) throw new Error(`request ${owner}#${idx} yok`);
  if (req.status !== "open") throw new Error(`request ${owner}#${idx} kapalı, yanıt verilemez`);
  const p = {
    id: uid("prompt"), author: byName[responder], type: req.type, title, desc, text, tool, tags: req.tags,
    image: req.type === "image" && kw ? imageFor(text, kw) : null,
    created: req.created + (0.5 + rand() * 4) * DAY, requestId: req.id,
  };
  prompts.push(p);
  req.responses.push(p);
  if (selected) req.selected = p;
}

// --- SQL -----------------------------------------------------------------------
const out = [];
const emit = (s) => out.push(s);
const userIds = users.map((u) => q(u.id)).join(", ");
const userEmails = users.map((u) => q(`${u.u}@${EMAIL_DOMAIN}`)).join(", ");
// Önceki demo hesapları + demo e-postalarıyla daha önce elle açılmış hesaplar.
const oldUsers = `select id from auth.users where id in (${userIds}) or lower(email) in (${userEmails})`;

emit(`-- ============================================================================
-- Promptly demo hesapları — OTOMATİK ÜRETİLDİ, elle düzenleme.
-- Kaynak: supabase/seed/demo-content.mjs  →  node supabase/seed/build-demo-seed.mjs
--
-- ${users.length} kullanıcı, ${prompts.length} prompt (${RESPONSES.length}'i isteklere yanıt), ${requests.length} prompt isteği,
-- ${generators.length} generator + beğeniler, yorumlar, takipler, koleksiyonlar.
-- Giriş: <kullanıcı>@${EMAIL_DOMAIN} / ${PASSWORD}
--
-- Supabase Dashboard → SQL Editor'e yapıştırıp çalıştır. Tekrar çalıştırmak
-- güvenli: önce önceki demo verisini (5eed... id'li hesapları)
-- siler, sonra baştan oluşturur. DİKKAT: bu demo e-postalarından biriyle
-- (ör. veli@${EMAIL_DOMAIN}) daha önce açılmış bir hesap varsa o hesap ve
-- içerikleri de silinir. Başka hiçbir hesaba dokunmaz.
-- Tüm migration'ların (20260919330000 dahil) uygulanmış olması gerekir.
-- ============================================================================

begin;

-- --- 0. Önceki demo verisini temizle ---------------------------------------------
-- Silme sırasında soft-delete / "varsayılan koleksiyon silinemez" trigger'ları
-- cascade'i iptal etmesin diye geçici olarak kapatılıyor.
alter table public.prompt_comments disable trigger user;
alter table public.prompts disable trigger user;
alter table public.prompt_requests disable trigger user;
alter table public.collections disable trigger user;
delete from public.notifications where recipient_id in (${oldUsers}) or actor_id in (${oldUsers});
-- Silinecek hesapların isteklerine BAŞKA kullanıcıların verdiği yanıtlar
-- silinmesin: istekten ayrılıp normal (original) paylaşım olarak kalıyorlar.
update public.prompts set origin_type = 'original', request_id = null
where request_id in (select id from public.prompt_requests where author_id in (${oldUsers}))
  and author_id not in (${oldUsers});
delete from auth.users where id in (${oldUsers});
alter table public.prompt_comments enable trigger user;
alter table public.prompts enable trigger user;
alter table public.prompt_requests enable trigger user;
alter table public.collections enable trigger user;
`);

// 1. users
emit(`-- --- 1. Auth kullanıcıları (profil + "Genel" koleksiyonu trigger ile oluşur) ---`);
for (const u of users) {
  const email = `${u.u}@${EMAIL_DOMAIN}`;
  emit(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(email)}, extensions.crypt(${q(PASSWORD)}, extensions.gen_salt('bf')), ${ts(u.joined)}, '{"provider":"email","providers":["email"]}', ${q(JSON.stringify({ display_name: u.name }))}, ${ts(u.joined)}, ${ts(u.joined)}, '', '', '', '');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(u.id)}, ${q(u.id)}, ${q(JSON.stringify({ sub: u.id, email, email_verified: true }))}, 'email', ${ts(u.joined)}, ${ts(u.joined)}, ${ts(u.joined)});`);
}
emit(`\n-- Profil detayları`);
for (const u of users) {
  const interests = `array[${u.interests.map(q).join(", ")}]::text[]`;
  emit(`update public.profiles set bio = ${q(u.bio)}, avatar_url = ${q(`https://randomuser.me/api/portraits/${u.g}/${u.a}.jpg`)}, website = ${q(u.site)}, interests = ${interests}, created_at = ${ts(u.joined)} where id = ${q(u.id)};`);
}

// 2. requests
emit(`\n-- --- 2. Prompt istekleri -------------------------------------------------------`);
for (const r of requests) {
  emit(`insert into public.prompt_requests (id, author_id, title, description, creative_direction, preferred_tool, content_type, status, created_at, updated_at) values (${q(r.id)}, ${q(r.author.id)}, ${q(r.title)}, ${q(r.desc)}, ${q(r.direction)}, ${q(r.tool)}, ${q(r.type)}, 'open', ${ts(r.created)}, ${ts(r.created)});`);
  for (const t of r.tags) emit(`insert into public.prompt_request_tags (request_id, tag_slug) values (${q(r.id)}, ${q(t)});`);
}

// 3. prompts (originals first, responses after — requests are still open)
emit(`\n-- --- 3. Promptlar (+ isteklere verilen yanıtlar) ------------------------------`);
for (const p of prompts) {
  const origin = p.requestId ? `'request_response', ${q(p.requestId)}` : `'original', null`;
  emit(`insert into public.prompts (id, author_id, title, description, prompt_text, tool, content_type, status, origin_type, request_id, created_at, updated_at) values (${q(p.id)}, ${q(p.author.id)}, ${q(p.title)}, ${q(p.desc)}, ${q(p.text)}, ${q(p.tool)}, ${q(p.type)}, 'published', ${origin}, ${ts(p.created)}, ${ts(p.created)});`);
  if (p.image) emit(`insert into public.prompt_media (prompt_id, url, width, height, alt, position) values (${q(p.id)}, ${q(p.image.url)}, ${p.image.w}, ${p.image.h}, ${q(p.title)}, 0);`);
  for (const t of p.tags) emit(`insert into public.prompt_tags (prompt_id, tag_slug, source) values (${q(p.id)}, ${q(t)}, 'manual');`);
}

// 4. selections + closed requests
emit(`\n-- --- 4. Seçilen yanıtlar ve kapatılan istekler ---------------------------------`);
for (const r of requests) {
  if (r.selected) emit(`update public.prompt_requests set selected_response_prompt_id = ${q(r.selected.id)}, status = 'answered' where id = ${q(r.id)};`);
  else if (r.status === "closed") emit(`update public.prompt_requests set status = 'closed', closed_by_owner = true where id = ${q(r.id)};`);
}

// 5. generators
emit(`\n-- --- 5. Generatorlar -----------------------------------------------------------`);
for (const g of generators) {
  const fields = g.fields.map((f, order) => {
    const [type, label, path, ...rest] = f;
    const key = path.split(".").pop();
    const field = { id: `f_${g.id.slice(-4)}_${order}`, key, label, description: "", type: type, required: false, options: [], defaultValue: "", placeholder: "", min: null, max: null, step: null, order, condition: null, jsonPath: path };
    if (["select", "multi_select", "radio"].includes(type)) {
      field.options = rest[0].map((l) => ({ label: l, value: slugify(l, "_") }));
      if (type !== "multi_select") field.defaultValue = field.options[0].value;
    } else if (type === "slider" || type === "number") {
      [field.min, field.max, field.step, field.defaultValue] = rest;
    } else if (type === "color") {
      field.defaultValue = rest[0];
    } else if (type === "toggle" || type === "checkbox") {
      field.defaultValue = "true";
    } else if (type === "text" || type === "textarea") {
      field.placeholder = `${label} yaz...`;
    }
    return field;
  });
  const schema = JSON.stringify({ fields });
  const template = JSON.stringify({ sections: [{ id: "positive", title: "Prompt", content: "", order: 0, enabled: true }] });
  const slug = `${slugify(g.title)}-${g.author.u}`;
  emit(`insert into public.generators (id, creator_id, title, slug, description, cover_url, category, subcategory, visibility, status, enable_negative_prompt, created_at, updated_at) values (${q(g.id)}, ${q(g.author.id)}, ${q(g.title)}, ${q(slug)}, ${q(g.desc)}, ${q(g.cover)}, ${q(g.category)}, ${q(g.sub)}, 'public', 'published', ${g.negative ? "true" : "false"}, ${ts(g.created)}, ${ts(g.created)});
insert into public.generator_versions (id, generator_id, version_number, schema, template, created_by, created_at) values (${q(g.versionId)}, ${q(g.id)}, 1, ${q(schema)}::jsonb, ${q(template)}::jsonb, ${q(g.author.id)}, ${ts(g.created)});
update public.generators set current_version_id = ${q(g.versionId)}, updated_at = ${ts(g.created)} where id = ${q(g.id)};`);
}

// 6. follows
emit(`\n-- --- 6. Takipler ---------------------------------------------------------------`);
for (const u of users) {
  for (const other of sample(users.filter((x) => x !== u), randInt(5, 11))) {
    emit(`insert into public.follows (follower_id, following_id, created_at) values (${q(u.id)}, ${q(other.id)}, ${ts(daysAgo(1, 55))});`);
  }
}

// 7. likes (prompts + generators)
emit(`\n-- --- 7. Beğeniler ---------------------------------------------------------------`);
for (const p of prompts) {
  for (const liker of sample(users.filter((x) => x !== p.author), randInt(2, 11))) {
    emit(`insert into public.prompt_likes (prompt_id, user_id, created_at) values (${q(p.id)}, ${q(liker.id)}, ${ts(Math.min(NOW, p.created + rand() * 10 * DAY))});`);
  }
}
for (const g of generators) {
  for (const liker of sample(users.filter((x) => x !== g.author), randInt(1, 8))) {
    emit(`insert into public.prompt_likes (generator_id, user_id, created_at) values (${q(g.id)}, ${q(liker.id)}, ${ts(Math.min(NOW, g.created + rand() * 10 * DAY))});`);
  }
}

// 8. comments (+ replies + comment likes)
emit(`\n-- --- 8. Yorumlar ---------------------------------------------------------------`);
function writeComments(targetCol, targetId, owner, created, pool, count) {
  for (let i = 0; i < count; i++) {
    const author = pick(users.filter((x) => x !== owner));
    const id = uid("comment");
    const at = Math.min(NOW - 3600000, created + (0.1 + rand() * 12) * DAY);
    emit(`insert into public.prompt_comments (id, ${targetCol}, author_id, body, created_at) values (${q(id)}, ${q(targetId)}, ${q(author.id)}, ${q(pick(pool))}, ${ts(at)});`);
    if (rand() < 0.35) {
      emit(`insert into public.prompt_comments (${targetCol}, author_id, body, parent_id, created_at) values (${q(targetId)}, ${q(owner.id)}, ${q(pick(COMMENTS.reply))}, ${q(id)}, ${ts(Math.min(NOW, at + rand() * DAY))});`);
    }
    for (const liker of sample(users.filter((x) => x !== author), randInt(0, 3))) {
      emit(`insert into public.comment_likes (comment_id, user_id) values (${q(id)}, ${q(liker.id)});`);
    }
  }
}
for (const p of prompts) writeComments("prompt_id", p.id, p.author, p.created, COMMENTS[p.type] ?? COMMENTS.text, randInt(0, 4));
for (const r of requests) writeComments("request_id", r.id, r.author, r.created, COMMENTS.request, randInt(0, 3));
for (const g of generators) writeComments("generator_id", g.id, g.author, g.created, COMMENTS.generator, randInt(0, 2));

// 9. collections
emit(`\n-- --- 9. Koleksiyonlar (Genel + birer özel koleksiyon) ---------------------------`);
for (const u of users) {
  const others = prompts.filter((p) => p.author !== u);
  const savedPrompts = sample(others, randInt(3, 7));
  const savedGenerators = sample(generators.filter((g) => g.author !== u), randInt(1, 3));
  const genel = `(select id from public.collections where owner_id = ${q(u.id)} and is_default)`;
  for (const p of savedPrompts) emit(`insert into public.collection_items (collection_id, prompt_id) values (${genel}, ${q(p.id)});`);
  for (const g of savedGenerators) emit(`insert into public.collection_items (collection_id, generator_id) values (${genel}, ${q(g.id)});`);
  const colId = uid("collection");
  emit(`insert into public.collections (id, owner_id, name, visibility) values (${q(colId)}, ${q(u.id)}, ${q(pick(COLLECTION_NAMES))}, ${q(rand() < 0.6 ? "public" : "private")});`);
  for (const p of sample(savedPrompts, Math.min(3, savedPrompts.length))) emit(`insert into public.collection_items (collection_id, prompt_id) values (${q(colId)}, ${q(p.id)});`);
}

emit(`
-- --- 10. Bildirimler: yukarıdaki eylemler trigger'larla bildirim üretti; hepsi
-- "şimdi" tarihli olmasın diye rastgele son 10 güne yayılıyor, eskiler okunmuş.
update public.notifications
set created_at = now() - (random() * interval '10 days'),
    is_read = random() < 0.6
where recipient_id in (${userIds});

commit;
`);

const file = join(here, "demo-users.sql");
writeFileSync(file, out.join("\n") + "\n");
console.log(`${file}: ${users.length} users, ${prompts.length} prompts, ${requests.length} requests, ${generators.length} generators`);
