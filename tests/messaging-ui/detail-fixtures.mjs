// Detay sayfası testleri/ekran görüntüleri için ZENGİN taklit veri (medya, etiket, araç, yorum): prompts · prompt_requests · workflows · presets.
import { U } from "./mock.mjs";

export const svg = (a, b, w = 1200, h = 900) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)}`;
const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const TAGS = [{ tags: { slug: "marka", label: "Marka" } }, { tags: { slug: "3d-render", label: "3D Render" } }, { tags: { slug: "typography", label: "Typography" } }];
const LONG = "ultra-realistic 3D render of four mechanical keyboard keycaps in a tight 2x2 grid, all keys touching. View from an isometric angle. One key is transparent with the word \"{just}\" printed in white. The other three colors are: {black, purple, and white}. One key features the {Github} logo. The other two say \"fork\" and \"it\". Realistic plastic texture, rounded sculpted keycaps, soft shadows, clean light-gray background. ".repeat(2);
export const DESC = "2×2 dizilmiş dört mekanik klavye tuşunda marka sloganı ve logoyu gösteren ultra gerçekçi 3D render.\nKaynak: @egeberkina · https://x.com/egeberkina/status/1918291652210311278\nGörsel: © 2025 jamez-bondos (awesome-gpt4o-images), CC BY 4.0. Prompt, orijinal paylaşımdan alıntıdır.";
export const ID = { prompt: "a0000000-0000-4000-8000-000000000001", request: "a0000000-0000-4000-8000-000000000002", workflow: "a0000000-0000-4000-8000-000000000003", preset: "a0000000-0000-4000-8000-000000000004" };
export const PAGES = { prompt: `/prompts/local?id=${ID.prompt}`, request: `/requests/local?id=${ID.request}`, workflow: `/workflows/local?id=${ID.workflow}`, preset: `/presets/local?id=${ID.preset}` };

export function installDetailData(context) {
  const base = { like_count: 13, save_count: 1, comment_count: 4, created_at: "2026-09-20T10:00:00Z" };
  const rows = {
    prompts: { id: ID.prompt, title: "Markalı mekanik klavye tuşları", description: DESC, prompt_text: LONG, tool: null, tools: ["gpt-image:gpt-image-1"], content_type: "image", category: "image-3d", subcategory: null, status: "published", origin_type: "original", request_id: null, ...base, copy_count: 7, show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.carol), prompt_media: [{ id: "m1", url: svg("#6d5bd0", "#d9d2c3"), width: 1200, height: 900, alt: "Klavye tuşları", position: 0 }], prompt_tags: TAGS },
    prompt_requests: { id: ID.request, title: "Retro-fütüristik sokak posteri", description: "Neon harfli, yağmurlu bir şehir akşamı posteri istiyorum. Üst yarıda büyük başlık, alt yarıda küçük bir slogan olsun.", creative_direction: "Blade Runner estetiği, mor-turuncu tonlar, hafif film greni.", preferred_tool: null, tools: ["midjourney"], content_type: "image", category: "image-3d", subcategory: null, reference_image_url: svg("#1b2a49", "#e86a3c", 1200, 800), reference_image_width: 1200, reference_image_height: 800, status: "open", selected_response_prompt_id: null, response_count: 2, like_count: 5, comment_count: 4, created_at: "2026-09-20T10:00:00Z", deleted_at: null, is_draft: false, visibility: "public", community_id: null, profiles: author(U.carol), prompt_request_tags: TAGS, prompt_request_media: [] },
    workflows: { id: ID.workflow, creator_id: U.carol.id, title: "Ürün fotoğrafından kampanya görseli", description: "Ham ürün fotoğrafını önce temizleyip sonra sahneye yerleştiren üç adımlı akış.", cover_url: svg("#2a6f6a", "#e9d8a6", 1200, 675), content_types: ["image", "text"], category: null, subcategory: null, tools: ["midjourney"], status: "published", visibility: "public", community_id: null, like_count: 9, save_count: 2, comment_count: 4, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z", profiles: author(U.carol), workflow_steps: [{ count: 3 }], workflow_tags: TAGS, workflow_media: [] },
    presets: { id: ID.preset, creator_id: U.carol.id, title: "Sinematik portre ayarı", description: "Yumuşak ışık, sığ alan derinliği ve sıcak tonlama için hazır parametre seti.", cover_url: svg("#7a3e2e", "#f2d6b3", 1200, 675), content_type: "image", category: "image-portrait", subcategory: null, tools: [], selection: {}, status: "published", visibility: "public", community_id: null, like_count: 6, comment_count: 4, save_count: 1, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z", profiles: author(U.carol), preset_tags: TAGS },
  };
  const wanted = { prompts: ID.prompt, prompt_requests: ID.request, workflows: ID.workflow, presets: ID.preset };
  return context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const idEq = url.searchParams.get("id");
    if (route.request().method() === "GET" && rows[table] && idEq === `eq.${wanted[table]}`) {
      const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? rows[table] : [rows[table]]) });
    }
    if (route.request().method() === "GET" && table === "workflow_steps") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.fallback();
  });
}


/** Dört yorum (üçten fazlası: "Tümünü gör" davranışı için) — sayfanın ana içeriğine bağlanır. */
export function seedComments(db, kind) {
  const comments = [["Deniz", "Kare formatta çok iyi duruyor, mağaza paneline kırpmadan koydum."], ["Elif", "Müşterime gösterdim, reklam çekimi sanmış 😄"], ["Selin", "Cam ve metal yüzeylerde de aynı kalitede çıkıyor mu?"], ["Mert", "Dördüncü yorum — daralt/aç davranışı için."]];
  const column = kind === "request" ? "request_id" : kind === "workflow" ? "workflow_id" : kind === "preset" ? "preset_id" : "prompt_id";
  comments.forEach(([name, body], i) => db.comments.push({ id: crypto.randomUUID(), body: `${name}: ${body}`, author_id: [U.bob, U.dave, U.amy, U.zed][i].id, [column]: ID[kind], parent_id: null, created_at: `2026-09-2${i}T10:00:00Z` }));
}
