// Gerçek medyalı seed: her demo kullanıcıya 5 görsel + 5 video + 5 ses promptu (toplam 255).
//   node supabase/seed/build-media-seed.mjs            → supabase/seed/media-seed.sql (tek dosya, korumalı)
//   CHUNK_DIR=/yol node supabase/seed/build-media-seed.mjs → ayrıca parça parça (MCP / küçük SQL penceresi için)
//
// Medya SENTEZ DEĞİL, internetten alınmış gerçek açık içeriktir (kaynaklar ve lisanslar her açıklamada yazılı):
//   • görsel : DiffusionDB (poloclub/diffusiondb, CC0 1.0) — Stable Diffusion çıktısı + o görseli üreten GERÇEK prompt
//   • video  : OpenVid-1M (nkp37/OpenVid-1M, CC BY 4.0) — Pixabay/Pexels stok klibi + klibin GERÇEK altyazısı (prompt)
//   • ses    : Song Describer Dataset (Zenodo 10072001, CC BY-SA 4.0) — Jamendo parçasının 30 sn'lik kesiti + insan açıklaması
// Dosyalar public/seed-media/ altında durur ve siteyle (GitHub Pages) yayınlanır; ÖNCE site yayınlanmalıdır.
// Tüm id'ler ve rastgelelik sabit tohumludur: script her çalıştığında aynı SQL'i üretir.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGE_ROWS, IMAGE_THEME, VIDEO_ROWS, VIDEO_THEME, AUDIO_GENRES, AUDIO_DEFAULT_GENRE,
} from "./media-seed-content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(here, "media-seed-cases.json"), "utf8"));
const BASE = "https://aliq0330.github.io/promptly/seed-media";

// Canlıdaki 17 demo kullanıcı (id = 5eed0000-…-0000000000NN; 02 = "veli" canlıda yok).
const IDS = { ali: 1, ayse: 3, mehmet: 4, zeynep: 5, can: 6, elif: 7, burak: 8, selin: 9, emre: 10, deniz: 11, ceren: 12, kaan: 13, melis: 14, onur: 15, ipek: 16, baran: 17, ece: 18 };
const PERSONAS = Object.keys(IDS);
const userId = (name) => `5eed0000-0000-4000-8000-${IDS[name].toString(16).padStart(12, "0")}`;
const promptId = (base, n) => `5eed0003-0000-4000-8000-${(base + n).toString(16).padStart(12, "0")}`;
const IMG_BASE = 0x4000, VID_BASE = 0x5000, AUD_BASE = 0x6000;
const PER_USER = 5;

// --- yardımcılar -------------------------------------------------------------
let seed = 20261031;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
function sample(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c.slice(0, n);
}
const q = (s) => (s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const DAY = 86400000;
const ts = (ms) => `'${new Date(ms).toISOString()}'`;

// --- kullanıcı eşleştirme (tema tercihi) --------------------------------------
const IMG_PREF = {
  ali: ["cty", "sci", "mood"], ayse: ["nat", "cre", "mood"], mehmet: ["abs", "sur", "mood"], zeynep: ["mood", "jar", "nat"],
  can: ["sci", "cty", "fan"], elif: ["fan", "sur", "cre"], burak: ["arc", "cty", "obj"], selin: ["prd", "obj", "fod"],
  emre: ["fan", "cre", "jar"], deniz: ["nat", "cre", "spc"], ceren: ["fod", "prd", "obj"], kaan: ["abs", "obj", "prd"],
  melis: ["fod"], onur: ["sci", "abs", "spc"], ipek: ["cre", "fan", "nat"], baran: ["spc", "sci", "fan"], ece: ["obj", "abs", "prd"],
};
const VID_PREF = {
  ali: ["abs", "cty"], ayse: ["obj", "nat"], mehmet: ["mood", "abs"], zeynep: ["mood", "nat"], can: ["cty", "mood", "nat"],
  elif: ["abs", "cre"], burak: ["cty"], selin: ["obj"], emre: ["nat", "mood"], deniz: ["nat", "cre"], ceren: ["fod", "obj"],
  kaan: ["abs", "obj"], melis: ["fod", "obj"], onur: ["abs"], ipek: ["cre", "nat"], baran: ["abs", "nat"], ece: ["obj", "abs"],
};
const AUD_PREF = {
  mehmet: ["electronic", "jazz", "folk", "pop", "rock"], ali: ["electronic"], ayse: ["classical", "jazz"], zeynep: ["classical", "ambient"],
  can: ["film", "classical"], elif: ["pop", "electronic"], burak: ["ambient", "jazz"], selin: ["pop", "jazz"], emre: ["rock", "metal", "electronic"],
  deniz: ["folk", "ambient"], ceren: ["pop", "electronic"], kaan: ["electronic"], melis: ["jazz", "folk"], onur: ["electronic"],
  ipek: ["folk", "classical"], baran: ["ambient", "electronic", "film"], ece: ["ambient", "classical"],
};

/** Her kullanıcıya PER_USER öğe: tur tur dolaşır, her seferinde tercih sırasına en yakın boştaki öğeyi alır. */
function assign(items, themeOf, pref) {
  const free = new Set(items.map((x) => x.n));
  const byUser = Object.fromEntries(PERSONAS.map((p) => [p, []]));
  for (let round = 0; round < PER_USER; round++) {
    const order = [...PERSONAS.slice(round % PERSONAS.length), ...PERSONAS.slice(0, round % PERSONAS.length)];
    for (const p of order) {
      let best = null, bestRank = 1e9;
      for (const n of free) {
        const i = (pref[p] ?? []).indexOf(themeOf(n));
        const rank = i === -1 ? 50 : i;
        if (rank < bestRank) { best = n; bestRank = rank; }
      }
      free.delete(best);
      byUser[p].push(best);
    }
  }
  return byUser;
}

// --- içerik üretimi -------------------------------------------------------------
const prompts = [];
const results = []; // video + ses için oynatılabilir çıktı
const covers = [];  // prompt_media kapakları
const usedTags = new Set();

function addPrompt(p) {
  p.created = NOW - (0.6 + rand() * 38) * DAY;
  prompts.push(p);
  p.tags.forEach((t) => usedTags.add(t));
}

// Görseller
const imgRow = Object.fromEntries(IMAGE_ROWS.map((r) => [r[0], r]));
const imgBy = assign(CASES.image, (n) => imgRow[n][2], IMG_PREF);
for (const [user, list] of Object.entries(imgBy)) {
  for (const n of list) {
    const c = CASES.image[n];
    const [, title, theme] = imgRow[n];
    const [category, sub, tags] = IMAGE_THEME[theme];
    const id = promptId(IMG_BASE, n);
    addPrompt({
      id, author: user, type: "image", title,
      description: `${title} — Stable Diffusion ile üretilmiş gerçek bir görsel ve onu ortaya çıkaran orijinal prompt, hiçbir değişiklik yapılmadan paylaşıldı.\n\n` +
        `Üretim ayarları: ${c.step} adım · CFG ${c.cfg} · örnekleyici k_lms · tohum ${c.seed} · ${c.w}×${c.h} px.\n\n` +
        `Kaynak: DiffusionDB (CC0 1.0, kamu malı) · https://huggingface.co/datasets/poloclub/diffusiondb · dosya ${c.src} (parça ${c.part}).`,
      text: c.prompt, tools: [], category, sub, tags,
    });
    covers.push({ id, url: `${BASE}/i-${String(n).padStart(3, "0")}.jpg`, w: c.w, h: c.h, alt: title, color: c.color, ph: c.ph });
  }
}

// Videolar
const vidRow = Object.fromEntries(VIDEO_ROWS.map((r) => [r[0], r]));
const VID_TOOLS = ["kling", "runway", "wan", "veo"];
const vidBy = assign(CASES.video, (n) => vidRow[n][2], VID_PREF);
for (const [user, list] of Object.entries(vidBy)) {
  for (const n of list) {
    const c = CASES.video[n];
    const [, title, theme] = vidRow[n];
    const [category, sub, tags] = VIDEO_THEME[theme];
    const id = promptId(VID_BASE, n);
    const stock = c.src === "pexels" ? "Pexels" : "Pixabay";
    const tool = VID_TOOLS[n % VID_TOOLS.length];
    addPrompt({
      id, author: user, type: "video", title,
      description: `${title} — gerçek bir stok video klibi (${c.dur} sn, ${c.w}×${c.h}) ve klibi betimleyen gerçek metin. Aşağıdaki prompt'u bir metinden-videoya modeline vererek benzer bir sahne kurabilirsin. ` +
        `Örnek çıktı yapay zekâ üretimi DEĞİL, gerçek bir çekimdir.\n\n` +
        `Prompt metni: OpenVid-1M veri setindeki klip altyazısıdır (İngilizce, otomatik üretilmiş).\n\n` +
        `Kaynak: OpenVid-1M (CC BY 4.0) · https://huggingface.co/datasets/nkp37/OpenVid-1M · klip ${c.file} · görüntü kaynağı ${stock} (${stock} Lisansı: ücretsiz kullanım, atıf zorunlu değil).`,
      text: c.prompt, tools: [tool], category, sub, tags,
    });
    const f = `${BASE}/v-${String(n).padStart(3, "0")}`;
    covers.push({ id, url: `${f}.jpg`, w: c.w, h: c.h, alt: title, color: c.color, ph: c.ph });
    results.push({ id, kind: "video", media: `${f}.mp4`, thumb: `${f}.jpg`, w: c.w, h: c.h, tool });
  }
}

// Sesler
const LIC_NAME = { by: "CC BY", "by-sa": "CC BY-SA" };
function genreOf(prompt) {
  for (const g of AUDIO_GENRES) if (g[3].test(prompt)) return g;
  return AUDIO_DEFAULT_GENRE;
}
const audGenre = CASES.audio.map((c) => genreOf(c.prompt));
const audBy = assign(CASES.audio, (n) => audGenre[n][0], AUD_PREF);
for (const [user, list] of Object.entries(audBy)) {
  for (const n of list) {
    const c = CASES.audio[n];
    const [gkey, sub, genreTr] = audGenre[n];
    const trackTitle = c.title.replace(new RegExp(`^${c.artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*`), "").trim();
    const title = `${trackTitle} — ${genreTr}`;
    const id = promptId(AUD_BASE, n);
    const tool = n % 2 === 0 ? "suno" : "udio";
    const tags = gkey === "film" ? ["muzik-uretim", "sinematik"] : gkey === "ambient" ? ["muzik-uretim", "lofi"] : ["muzik-uretim"];
    const category = "music";
    addPrompt({
      id, author: user, type: "audio", title,
      description: `${title} — gerçek bir müzik parçasının (${c.artist} · “${trackTitle}”) 30 saniyelik kesiti ve onu dinleyen bir insanın yazdığı açıklama. ` +
        `Açıklamayı Suno / Udio gibi bir müzik modeline prompt olarak vererek benzer bir ruh hâli arayabilirsin. Örnek çıktı yapay zekâ üretimi DEĞİL, gerçek bir kayıttır.\n\n` +
        `Prompt metni: Song Describer Dataset açıklaması (İngilizce, CC BY-SA 4.0) · https://zenodo.org/records/10072001\n\n` +
        `Parça: ${c.artist} — ${trackTitle} (Jamendo) · ${c.url} · Lisans: ${LIC_NAME[c.lic]} ${c.licurl} · kesit parçanın 0:25–0:55 aralığıdır, başı ve sonu yumuşatılmıştır (değişiklik yapıldı).`,
      text: c.prompt, tools: [tool], category, sub, tags,
    });
    const f = `${BASE}/a-${String(n).padStart(3, "0")}`;
    covers.push({ id, url: `${f}.jpg`, w: 480, h: 480, alt: title, color: c.color, ph: c.ph });
    results.push({ id, kind: "audio", media: `${f}.mp3`, thumb: `${f}.jpg`, w: 480, h: 480, tool });
  }
}

prompts.sort((a, b) => a.id.localeCompare(b.id));

// Beğeniler (altı tepki) ve kaydetmeler
const REACTIONS = ["love", "love", "love", "fire", "wow", "clap", "idea", "haha"];
const likesOf = new Map();
for (const p of prompts) {
  const n = randInt(2, 10);
  likesOf.set(p.id, sample(PERSONAS.filter((u) => u !== p.author), n));
}

// --- SQL -------------------------------------------------------------------------
const TAG_LABELS = {
  "3d-render": "3D Render", "ai-sanat": "AI Sanat", animation: "Animation", architecture: "Architecture", composition: "Composition",
  drone: "Drone", fantastik: "Fantastik", focus: "Focus", "golden-hour": "Golden Hour", lighting: "Lighting", lofi: "Lofi", manzara: "Manzara",
  mimari: "Mimari", minimalist: "Minimalist", "muzik-uretim": "Müzik Üretimi", neon: "Neon", photography: "Photography", shadow: "Shadow",
  siberpunk: "Siberpunk", sinematik: "Sinematik", soyut: "Soyut", "studio-lighting": "Studio Lighting", surreal: "Surreal", texture: "Texture",
  uzay: "Uzay", "video-uretim": "Video Üretimi",
};
const allUsers = PERSONAS.map(userId);

const header = (n) => `-- ============================================================================
-- Promptly: gerçek medyalı seed (${n}) — OTOMATİK ÜRETİLDİ (supabase/seed/build-media-seed.mjs).
-- HİÇBİR ŞEY SİLMEZ, yalnızca ekler. Tek transaction; tekrar çalıştırılırsa hata verip hiçbir şey değiştirmez.
-- ÖNCE public/seed-media/ dosyalarının siteyle yayınlanmış olması gerekir (aksi hâlde medya 404 verir).
-- ============================================================================
begin;
do $guard$
begin
  if (select count(*) from auth.users where id in (${allUsers.map(q).join(", ")})) <> ${allUsers.length} then
    raise exception 'Beklenen % demo kullanıcının tamamı bulunamadı; işlem iptal edildi.', ${allUsers.length};
  end if;
end
$guard$;
`;

function promptSql(p) {
  const out = [];
  out.push(`insert into public.prompts (id, author_id, title, description, prompt_text, tools, content_type, category, subcategory, status, visibility, origin_type, created_at, updated_at) values (${q(p.id)}, ${q(userId(p.author))}, ${q(p.title)}, ${q(p.description)}, ${q(p.text)}, array[${p.tools.map(q).join(", ")}]::text[], ${q(p.type)}, ${q(p.category)}, ${q(p.sub)}, 'published', 'public', 'original', ${ts(p.created)}, ${ts(p.created)});`);
  for (const t of p.tags) out.push(`insert into public.prompt_tags (prompt_id, tag_slug, source) values (${q(p.id)}, ${q(t)}, 'manual');`);
  const cv = covers.find((c) => c.id === p.id);
  out.push(`insert into public.prompt_media (prompt_id, url, width, height, alt, position, dominant_color, placeholder) values (${q(p.id)}, ${q(cv.url)}, ${cv.w}, ${cv.h}, ${q(cv.alt)}, 0, ${q(cv.color)}, ${q(cv.ph)});`);
  const r = results.find((x) => x.id === p.id);
  if (r) out.push(`insert into public.prompt_results (prompt_id, creator_id, media_type, media_url, thumbnail_url, width, height, tool, has_modification, created_at) values (${q(p.id)}, ${q(userId(p.author))}, ${q(r.kind)}, ${q(r.media)}, ${q(r.thumb)}, ${r.w}, ${r.h}, ${q(r.tool)}, false, ${ts(p.created + 60000)});`);
  const likers = likesOf.get(p.id);
  for (const liker of likers) {
    out.push(`insert into public.prompt_likes (prompt_id, user_id, reaction, created_at) values (${q(p.id)}, ${q(userId(liker))}, ${q(REACTIONS[Math.floor(rand() * REACTIONS.length)])}, ${ts(Math.min(NOW - 600000, p.created + (0.05 + rand() * 6) * DAY))});`);
  }
  for (const saver of sample(likers, randInt(0, Math.min(3, likers.length)))) {
    out.push(`insert into public.collection_items (collection_id, prompt_id) values ((select id from public.collections where owner_id = ${q(userId(saver))} and is_default), ${q(p.id)});`);
  }
  return out.join("\n");
}

const tagSql = () => `insert into public.tags (slug, label) values ${[...usedTags].sort().map((t) => `(${q(t)}, ${q(TAG_LABELS[t] ?? t)})`).join(", ")} on conflict (slug) do nothing;`;
// Bu transaction'ın beğenileri trigger'larla bildirim üretti (created_at = now()); son 10 güne yayılır, eski bildirimlere dokunulmaz.
const notifSql = `update public.notifications
set created_at = now() - (random() * interval '10 days'), is_read = random() < 0.6
where created_at = now() and recipient_id in (${allUsers.map(q).join(", ")});`;

// Tek dosya
const main = [header(`${prompts.length} prompt`)];
main.push(`do $g2$ begin if exists (select 1 from public.prompts where id = ${q(prompts[0].id)}) then raise exception 'Bu seed zaten uygulanmış; işlem iptal edildi.'; end if; end $g2$;`);
main.push(tagSql());
for (const p of prompts) main.push(promptSql(p));
main.push(notifSql);
main.push(`select content_type as tur, count(*) as prompt, count(*) filter (where exists (select 1 from public.prompt_media m where m.prompt_id = p.id)) as kapakli, count(*) filter (where exists (select 1 from public.prompt_results r where r.prompt_id = p.id)) as sonuclu from public.prompts p where p.id::text like '5eed0003-%' group by 1 order by 1;`);
main.push("commit;\n");
writeFileSync(join(here, "media-seed.sql"), main.join("\n"));

if (process.env.CHUNK_DIR) {
  mkdirSync(process.env.CHUNK_DIR, { recursive: true });
  const size = Number(process.env.CHUNK_SIZE ?? 12);
  let part = 0;
  for (let i = 0; i < prompts.length; i += size, part++) {
    const slice = prompts.slice(i, i + size);
    const parts = [`begin;`, tagSql(), ...slice.map(promptSql), notifSql, "commit;\n"];
    writeFileSync(join(process.env.CHUNK_DIR, `part-${String(part).padStart(2, "0")}.sql`), parts.join("\n"));
  }
  console.log(`${part} parça yazıldı → ${process.env.CHUNK_DIR}`);
}

if (process.env.SAMPLE_OUT) {
  // Doğrulama için: her türden bir prompt, sonunda ROLLBACK (hiçbir şey kalıcı olmaz).
  const pick = ["image", "video", "audio"].map((t) => prompts.find((p) => p.type === t));
  const body = [`begin;`, tagSql(), ...pick.map(promptSql), notifSql,
    `select p.content_type, p.like_count, p.save_count, (select count(*) from public.prompt_media m where m.prompt_id = p.id) kapak, (select count(*) from public.prompt_results r where r.prompt_id = p.id) sonuc, (select count(*) from public.prompt_tags t where t.prompt_id = p.id) etiket from public.prompts p where p.id in (${pick.map((p) => q(p.id)).join(", ")}) order by 1;`,
    `rollback;`];
  writeFileSync(process.env.SAMPLE_OUT, body.join("\n"));
}

const per = (t) => Object.fromEntries(PERSONAS.map((u) => [u, prompts.filter((p) => p.author === u && p.type === t).length]));
console.log(`media-seed.sql: ${prompts.length} prompt (image ${prompts.filter((p) => p.type === "image").length}, video ${prompts.filter((p) => p.type === "video").length}, audio ${prompts.filter((p) => p.type === "audio").length}), ${results.length} çıktı, ${[...likesOf.values()].reduce((a, l) => a + l.length, 0)} beğeni`);
console.log("kullanıcı başına:", PERSONAS.map((u) => `${u}:${prompts.filter((p) => p.author === u).length}`).join(" "));
