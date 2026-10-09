// Siteyi tamamlar (EKLEME yapar, hiçbir şey silmez):  node supabase/seed/build-fill-seed.mjs
// Çıktı: supabase/seed/viral-fill.sql  (viral-reset.sql'den SONRA, SQL Editor'de çalıştırılır).
//
// Ekler: metin (42) / video (17) / ses (14) promptları, prompt istekleri (eski Türkçe demo
// içeriğinden uyarlanır, bir kısmı gerçek yanıtlı), generatorlar, workflow'lar, beğeniler.
// Tüm id'ler sabit, rastgelelik sabit tohumlu: her çalıştırmada aynı SQL çıkar.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USERS } from "./demo-content.mjs";
import { ROWS as IMAGE_ROWS, IMAGE_BASE } from "./viral-content.mjs";
import { SRC, TEXT_ROWS, VIDEO_ROWS, AUDIO_ROWS, WORKFLOWS } from "./fill-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(here, "fill-cases.json"), "utf8"));
const IMG = JSON.parse(readFileSync(join(here, "viral-cases.json"), "utf8"));
const CATALOG = readFileSync(join(here, "../../src/lib/ai-tool-catalog.ts"), "utf8");
const TOOL_IDS = new Set([...CATALOG.matchAll(/id: "([a-z0-9-]+)", name:/g)].map((m) => m[1]));

const PERSONAS = USERS.map((u) => u.u);
const userId = (name) => `5eed0000-0000-4000-8000-${(PERSONAS.indexOf(name) + 1).toString(16).padStart(12, "0")}`;
const KNOWN_TAGS = new Set("minimalist yazarlik manzara portre fantastik retro kodlama video-uretim 3d-render mimari uzay karakter-tasarimi anime siberpunk muzik-uretim neon siir soyut youtube-video lighting photography composition editorial-photography texture typography studio-lighting animation surreal golden-hour shadow smartphone-photography aspect-ratio architecture focus apple ai-sanat clean-background javascript".split(" "));
const TAG_LABELS = {
  "3d-render": "3D Render", "ai-sanat": "AI Sanat", animation: "Animation", anime: "Anime", apple: "Apple", architecture: "Architecture",
  "aspect-ratio": "Aspect Ratio", "clean-background": "Clean Background", composition: "Composition", "editorial-photography": "Editorial Photography",
  fantastik: "Fantastik", focus: "Focus", "golden-hour": "Golden Hour", javascript: "JavaScript", "karakter-tasarimi": "Karakter Tasarımı",
  kodlama: "Kodlama", lighting: "Lighting", manzara: "Manzara", mimari: "Mimari", minimalist: "Minimalist", "muzik-uretim": "Müzik Üretimi",
  neon: "Neon", photography: "Photography", portre: "Portre", retro: "Retro", shadow: "Shadow", siberpunk: "Siberpunk", siir: "Şiir",
  "smartphone-photography": "Smartphone Photography", soyut: "Soyut", "studio-lighting": "Studio Lighting", surreal: "Sürreal",
  texture: "Texture", typography: "Typography", uzay: "Uzay", "video-uretim": "Video Üretimi", yazarlik: "Yazarlık", "youtube-video": "YouTube Video",
};

// --- helpers --------------------------------------------------------------------
let seed = 20261010;
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
const arr = (xs) => `array[${xs.map(q).join(", ")}]::text[]`;
const NOW = Date.UTC(2026, 9, 9, 10, 0, 0);
const DAY = 86400000;
const ts = (ms) => `'${new Date(ms).toISOString()}'`;
const daysAgo = (min, max) => NOW - (min + rand() * (max - min)) * DAY;
const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
const slugify = (s, sep = "-") =>
  s.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c]).toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");
const hex = (n) => n.toString(16).padStart(12, "0");
const promptUuid = (n) => `5eed0001-0000-4000-8000-${hex(n)}`;
const checkTags = (tags, where) => {
  for (const t of tags) if (!KNOWN_TAGS.has(t)) throw new Error(`bilinmeyen etiket ${t} (${where})`);
};
const checkTools = (tools, where) => {
  for (const t of tools) if (!TOOL_IDS.has(t.split(":")[0])) throw new Error(`bilinmeyen araç ${t} (${where})`);
};
const counters = {};
function uid(kind) {
  const prefix = { request: "0002", generator: "0003", version: "0004", step: "0007", workflow: "0008" }[kind];
  counters[kind] = (counters[kind] ?? 0) + 1;
  return `5eed${prefix}-0000-4000-8000-${hex(counters[kind])}`;
}

// --- istekler (eski içerikten) --------------------------------------------------
const TOOL_ALIAS = { Midjourney: "midjourney", ChatGPT: "chatgpt", Claude: "claude", Runway: "runway", Sora: "sora", Suno: "suno", Udio: "udio", Gemini: "gemini", "Stable Diffusion": "stable-diffusion", "DALL·E": "gpt-image", "Pika": "pika" };
const mapType = (t) => (t === "code" ? { type: "text", category: "coding" } : t === "music" ? { type: "audio", category: "music" } : { type: t, category: null });
const requests = [];
for (const u of USERS) {
  u.requestRows = [];
  for (const [type, title, desc, direction, tool, tags, status] of u.requests) {
    const m = mapType(type);
    const toolId = TOOL_ALIAS[tool];
    const r = { id: uid("request"), author: u.u, type: m.type, category: m.category, title, desc, direction, tool, tools: toolId && TOOL_IDS.has(toolId) ? [toolId] : [], tags: tags.filter((t) => KNOWN_TAGS.has(t)), status, created: daysAgo(6, 40), responses: [] };
    requests.push(r);
    u.requestRows.push(r);
  }
}
const requestOf = (owner, idx) => {
  const r = USERS.find((u) => u.u === owner)?.requestRows[idx];
  if (!r) throw new Error(`istek yok: ${owner}#${idx}`);
  return r;
};

// --- yeni promptlar -----------------------------------------------------------------
const prompts = [];
function addPrompt(p) {
  checkTags(p.tags, p.title);
  checkTools(p.tools, p.title);
  prompts.push(p);
  return p;
}
let textN = 0;
for (const [key, user, title, desc, category, sub, tags, tools, resp] of TEXT_ROWS) {
  const c = CASES.text[key];
  if (!c) throw new Error(`metin vakası yok: ${key}`);
  const handles = c.contributor ? c.contributor.split(",").map((h) => `@${h}`).join(", ") : null;
  const description = `${desc}\n\n${SRC.text}${handles ? ` · katkı: ${handles}` : ""}`;
  const p = { id: promptUuid(0x1000 + textN++), author: user, type: "text", title, description, text: c.prompt, category, sub, tags, tools, created: daysAgo(0.3, 44), requestId: null };
  if (resp) {
    const req = requestOf(resp.owner, resp.idx);
    if (req.author === user) throw new Error(`kendi isteğine yanıt: ${title}`);
    if (req.type !== "text") throw new Error(`yanıt türü uyuşmuyor: ${title}`);
    p.requestId = req.id;
    p.created = req.created + (0.5 + rand() * 4) * DAY;
    p.tags = tags;
    req.responses.push(p);
    if (resp.selected) req.selected = p;
  }
  addPrompt(p);
}
let videoN = 0;
for (const [idx, user, title, desc, category, sub, tags, tools] of VIDEO_ROWS) {
  const c = CASES.video[String(idx)];
  if (!c) throw new Error(`video vakası yok: ${idx}`);
  const description = `${desc}\n\nSüre / oran: ${c.spec}\n\n${SRC.video}`;
  addPrompt({ id: promptUuid(0x2000 + videoN++), author: user, type: "video", title, description, text: c.prompt, category, sub, tags, tools, created: daysAgo(0.3, 44), requestId: null });
}
let audioN = 0;
for (const [, user, title, desc, category, sub, tags, tools, text, srcKey] of AUDIO_ROWS) {
  addPrompt({ id: promptUuid(0x3000 + audioN++), author: user, type: "audio", title, description: `${desc}\n\n${SRC[srcKey]}`, text, category, sub, tags, tools, created: daysAgo(0.3, 44), requestId: null });
}
const promptBy = { text: {}, video: {}, audio: {} };
TEXT_ROWS.forEach((r, i) => (promptBy.text[r[0]] = promptUuid(0x1000 + i)));
VIDEO_ROWS.forEach((r, i) => (promptBy.video[r[0]] = promptUuid(0x2000 + i)));
AUDIO_ROWS.forEach((r, i) => (promptBy.audio[r[0]] = promptUuid(0x3000 + i)));

// --- generatorlar (eski içerikten) ----------------------------------------------------
const GEN_TYPE = { image: "image", design: "image", video: "video", audio: "audio" };
const GEN_CAT = { design: "design", writing: "writing", marketing: "marketing", code: "coding" };
const imageCasesOf = (user) => IMAGE_ROWS.filter((r) => r[1] === user).map((r) => r[0]);
const generators = [];
for (const u of USERS) {
  u.genRows = [];
  const imgs = imageCasesOf(u.u);
  u.generators.forEach(([topic, title, desc, , , negative, fields], i) => {
    const wantsCover = topic === "image" || topic === "design";
    const g = { id: uid("generator"), versionId: uid("version"), author: u.u, type: GEN_TYPE[topic] ?? "text", category: GEN_CAT[topic] ?? null, title, desc, negative, fields, created: daysAgo(2, 45), coverCase: wantsCover && imgs.length ? imgs[i % imgs.length] : null };
    generators.push(g);
    u.genRows.push(g);
  });
}
const generatorOf = (user, idx) => {
  const g = USERS.find((u) => u.u === user)?.genRows[idx];
  if (!g) throw new Error(`generator yok: ${user}:${idx}`);
  return g;
};

// --- SQL ---------------------------------------------------------------------------------
const out = [];
const emit = (s) => out.push(s);
const userIds = PERSONAS.map(userId).map(q).join(", ");
const allPrompts = prompts;
emit(`-- ============================================================================
-- Promptly: eksik içeriği tamamla (viral-reset.sql'den SONRA) — OTOMATİK ÜRETİLDİ.
-- Kaynak: supabase/seed/fill-content.mjs + fill-cases.json
--         node supabase/seed/build-fill-seed.mjs
--
-- HİÇBİR ŞEY SİLMEZ, yalnızca ekler. İki kez çalıştırılırsa ikinci seferde hata verip
-- hiçbir şey değiştirmez (tek transaction + "zaten uygulandı" kontrolü).
--
-- Ekler: ${prompts.filter((p) => p.type === "text").length} metin, ${prompts.filter((p) => p.type === "video").length} video, ${prompts.filter((p) => p.type === "audio").length} ses promptu,
--        ${requests.length} prompt isteği (${requests.filter((r) => r.responses.length).length}'inde gerçek yanıt), ${generators.length} generator, ${WORKFLOWS.length} workflow, beğeniler.
-- Kaynaklar: prompts.chat (CC0), awesome-ad-video-prompts (CC BY 4.0), awesome-ai-music-prompts (MIT),
--            Awesome Suno Resources (CC BY 4.0). Her açıklamada kaynak bağlantısı yer alır.
-- Supabase Dashboard → SQL Editor'e yapıştır, tek seferde çalıştır.
-- ============================================================================

begin;

do $guard$
begin
  if exists (select 1 from public.prompts where id = ${q(prompts[0].id)}) then
    raise exception 'Bu seed zaten uygulanmış; işlem iptal edildi.';
  end if;
  if (select count(*) from auth.users where id in (${userIds})) <> ${PERSONAS.length} then
    raise exception 'Beklenen % demo kullanıcının tamamı bulunamadı; işlem iptal edildi.', ${PERSONAS.length};
  end if;
end
$guard$;

-- Kullanılan etiketler yoksa oluşturulur (varsa dokunulmaz).`);
const usedTags = [...new Set([...prompts.flatMap((p) => p.tags), ...requests.flatMap((r) => r.tags)])].sort();
for (const t of usedTags) if (!TAG_LABELS[t]) throw new Error(`etiket adı eksik: ${t}`);
emit(`insert into public.tags (slug, label) values ${usedTags.map((t) => `(${q(t)}, ${q(TAG_LABELS[t])})`).join(", ")} on conflict (slug) do nothing;\n`);

// 1. istekler
emit(`-- --- 1. Prompt istekleri ---------------------------------------------------------`);
for (const r of requests) {
  emit(`insert into public.prompt_requests (id, author_id, title, description, creative_direction, preferred_tool, content_type, category, tools, status, created_at, updated_at) values (${q(r.id)}, ${q(userId(r.author))}, ${q(r.title)}, ${q(r.desc)}, ${q(r.direction)}, ${q(r.tool)}, ${q(r.type)}, ${q(r.category)}, ${arr(r.tools)}, 'open', ${ts(r.created)}, ${ts(r.created)});`);
  for (const t of r.tags) emit(`insert into public.prompt_request_tags (request_id, tag_slug) values (${q(r.id)}, ${q(t)});`);
}

// 2. promptlar (+ yanıtlar)
emit(`\n-- --- 2. Metin / video / ses promptları (+ isteklere verilen yanıtlar) -----------------`);
for (const p of allPrompts) {
  const origin = p.requestId ? `'request_response', ${q(p.requestId)}` : `'original', null`;
  emit(`insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, request_id, created_at, updated_at) values (${q(p.id)}, ${q(userId(p.author))}, ${q(p.title)}, ${q(p.description)}, ${q(p.text)}, ${arr(p.tools)}, ${q(p.type)}, ${q(p.category)}, ${q(p.sub)}, 'published', 'public', ${origin}, ${ts(p.created)}, ${ts(p.created)});`);
  for (const t of p.tags) emit(`insert into public.prompt_tags (prompt_id, tag_slug, source) values (${q(p.id)}, ${q(t)}, 'manual');`);
}

// 3. seçilen yanıtlar + kapalı istekler
emit(`\n-- --- 3. Seçilen yanıtlar ve kapatılan istekler -------------------------------------`);
for (const r of requests) {
  if (r.selected) emit(`update public.prompt_requests set selected_response_prompt_id = ${q(r.selected.id)}, status = 'answered' where id = ${q(r.id)};`);
  else if (r.status === "closed") emit(`update public.prompt_requests set status = 'closed', closed_by_owner = true where id = ${q(r.id)};`);
}

// 4. generatorlar
emit(`\n-- --- 4. Generatorlar -----------------------------------------------------------------`);
for (const g of generators) {
  const fields = g.fields.map((f, order) => {
    const [type, label, path, ...rest] = f;
    const key = path.split(".").pop();
    const field = { id: `f_${g.id.slice(-4)}_${order}`, key, label, description: "", type, required: false, options: [], defaultValue: "", placeholder: "", min: null, max: null, step: null, order, condition: null, jsonPath: path };
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
  const slug = `${slugify(g.title)}-${g.author}`;
  const cover = g.coverCase ? `${IMAGE_BASE}/${g.coverCase}.jpg` : null;
  emit(`insert into public.generators (id, creator_id, title, slug, description, cover_url, content_type, category, visibility, status, enable_negative_prompt, created_at, updated_at) values (${q(g.id)}, ${q(userId(g.author))}, ${q(g.title)}, ${q(slug)}, ${q(g.desc)}, ${q(cover)}, ${q(g.type)}, ${q(g.category)}, 'public', 'published', ${g.negative ? "true" : "false"}, ${ts(g.created)}, ${ts(g.created)});
insert into public.generator_versions (id, generator_id, version_number, schema, template, created_by, created_at) values (${q(g.versionId)}, ${q(g.id)}, 1, ${q(schema)}::jsonb, ${q(template)}::jsonb, ${q(userId(g.author))}, ${ts(g.created)});
update public.generators set current_version_id = ${q(g.versionId)}, updated_at = ${ts(g.created)} where id = ${q(g.id)};`);
  if (cover) {
    const c = IMG[String(g.coverCase)];
    emit(`insert into public.generator_media (generator_id, url, width, height, alt, position) values (${q(g.id)}, ${q(cover)}, ${c.w}, ${c.h}, ${q(g.title)}, 0);`);
  }
}

// 5. workflow'lar
emit(`\n-- --- 5. Workflow'lar -----------------------------------------------------------------`);
function resolveRef(ref) {
  const [kind, a, b] = ref.split(":");
  if (kind === "img") return { type: "prompt", id: promptUuid(Number(a)) };
  if (kind === "text") { if (!promptBy.text[a]) throw new Error(`workflow metin ref yok: ${a}`); return { type: "prompt", id: promptBy.text[a] }; }
  if (kind === "video") { if (!promptBy.video[a]) throw new Error(`workflow video ref yok: ${a}`); return { type: "prompt", id: promptBy.video[a] }; }
  if (kind === "audio") { if (!promptBy.audio[a]) throw new Error(`workflow ses ref yok: ${a}`); return { type: "prompt", id: promptBy.audio[a] }; }
  if (kind === "gen") return { type: "generator", id: generatorOf(a, Number(b)).id };
  throw new Error(`bilinmeyen ref ${ref}`);
}
const imageCaseSet = new Set(IMAGE_ROWS.map((r) => r[0]));
const workflows = [];
for (const w of WORKFLOWS) {
  const wf = { ...w, id: uid("workflow"), created: daysAgo(1, 30) };
  checkTools(w.tools, w.title);
  workflows.push(wf);
  emit(`insert into public.workflows (id, creator_id, title, description, cover_url, content_types, category, subcategory, tools, status, visibility, created_at, updated_at) values (${q(wf.id)}, ${q(userId(w.user))}, ${q(w.title)}, ${q(w.desc)}, ${q(w.cover ? `${IMAGE_BASE}/${w.cover}.jpg` : null)}, ${arr(w.types)}, ${q(w.category)}, ${q(w.sub)}, ${arr(w.tools)}, 'published', 'public', ${ts(wf.created)}, ${ts(wf.created)});`);
  if (w.cover) {
    if (!imageCaseSet.has(w.cover)) throw new Error(`workflow kapak vakası yok: ${w.cover}`);
    emit(`insert into public.workflow_media (workflow_id, url, width, height, alt, position) values (${q(wf.id)}, ${q(`${IMAGE_BASE}/${w.cover}.jpg`)}, ${IMG[String(w.cover)].w}, ${IMG[String(w.cover)].h}, ${q(w.title)}, 0);`);
  }
  const stepIds = w.steps.map(() => uid("step"));
  const connections = [];
  w.steps.forEach(([title, description, instructions, ref, outLabel], i) => {
    const { type, id } = resolveRef(ref);
    const outId = `out_${i + 1}`;
    const inputs = i === 0 ? [] : [{ id: `in_${i + 1}`, label: w.steps[i - 1][4], source: { stepId: stepIds[i - 1], outputId: `out_${i}` } }];
    if (i > 0) connections.push({ from: stepIds[i - 1], to: stepIds[i], outKey: `out_${i}`, inKey: `in_${i + 1}` });
    emit(`insert into public.workflow_steps (id, workflow_id, position, title, description, instructions, step_type, ${type === "prompt" ? "prompt_id" : "generator_id"}, inputs, outputs) values (${q(stepIds[i])}, ${q(wf.id)}, ${i}, ${q(title)}, ${q(description)}, ${q(instructions)}, ${q(type)}, ${q(id)}, ${q(JSON.stringify(inputs))}::jsonb, ${q(JSON.stringify([{ id: outId, label: outLabel }]))}::jsonb);`);
  });
  for (const c of connections) emit(`insert into public.workflow_connections (workflow_id, from_step_id, to_step_id, output_key, input_key) values (${q(wf.id)}, ${q(c.from)}, ${q(c.to)}, ${q(c.outKey)}, ${q(c.inKey)});`);
}

// 6. beğeniler + kaydetmeler
emit(`\n-- --- 6. Beğeniler ve kaydedilenler -----------------------------------------------------`);
for (const p of prompts) {
  const likers = sample(PERSONAS.filter((u) => u !== p.author), randInt(2, 11));
  for (const liker of likers) emit(`insert into public.prompt_likes (prompt_id, user_id, created_at) values (${q(p.id)}, ${q(userId(liker))}, ${ts(Math.min(NOW - 600000, p.created + (0.05 + rand() * 6) * DAY))});`);
  for (const saver of sample(likers, randInt(0, Math.min(3, likers.length)))) emit(`insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = ${q(userId(saver))} and is_default), ${q(p.id)});`);
}
for (const g of generators) {
  for (const liker of sample(PERSONAS.filter((u) => u !== g.author), randInt(1, 8))) emit(`insert into public.prompt_likes (generator_id, user_id, created_at) values (${q(g.id)}, ${q(userId(liker))}, ${ts(Math.min(NOW - 600000, g.created + (0.05 + rand() * 8) * DAY))});`);
}
for (const w of workflows) {
  for (const liker of sample(PERSONAS.filter((u) => u !== w.user), randInt(1, 6))) emit(`insert into public.prompt_likes (workflow_id, user_id, created_at) values (${q(w.id)}, ${q(userId(liker))}, ${ts(Math.min(NOW - 600000, w.created + (0.05 + rand() * 6) * DAY))});`);
}

emit(`
-- --- 7. Bildirimler: bu seed'in beğenileri/yanıtları trigger'larla bildirim üretti; hepsi
-- "şimdi" tarihli olmasın diye rastgele son 10 güne yayılıyor (eski bildirimlere dokunulmaz).
update public.notifications
set created_at = now() - (random() * interval '10 days'),
    is_read = random() < 0.6
where created_at = now() and recipient_id in (${userIds});

-- --- 8. Kontrol ---------------------------------------------------------------------------
select content_type as tur, count(*) as prompt from public.prompts group by 1
union all select 'istek', count(*) from public.prompt_requests
union all select 'istek (yanıtlı)', count(*) from public.prompt_requests where response_count > 0
union all select 'generator', count(*) from public.generators
union all select 'workflow', count(*) from public.workflows
union all select 'workflow adımı', count(*) from public.workflow_steps
order by 1;

commit;
`);

const file = join(here, "viral-fill.sql");
writeFileSync(file, out.join("\n") + "\n");
const byType = (t) => prompts.filter((p) => p.type === t).length;
console.log(`${file}: text ${byType("text")}, video ${byType("video")}, audio ${byType("audio")}, requests ${requests.length} (answered ${requests.filter((r) => r.selected).length}, with responses ${requests.filter((r) => r.responses.length).length}), generators ${generators.length}, workflows ${workflows.length}`);
