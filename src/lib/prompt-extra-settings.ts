/**
 * "Ek Ayar Önerileri" — optional, static prompt-setting suggestions shown
 * inside the Prompt creation form. No AI: every option carries a fixed,
 * `promptFragment` (English, plus a Turkish `promptFragmentTr`); the composed prompt is the user's ORIGINAL text
 * plus the fragments of the selected options, never a rewrite of it.
 *
 * Data model: ContentType -> Category -> SettingGroup -> SettingOption.
 * Content types/categories are the EXISTING taxonomy slugs
 * (`content-taxonomy.ts`); this file only decides which groups apply to a
 * (type, category, subcategory) via `groupIdsFor`, so the panel renders only
 * the relevant groups. Presets are plain `{ id, selection }` data, shaped so
 * user-saved presets can reuse the same type later.
 */
import type { Language } from "@/lib/i18n/translations";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { parseToolRef } from "@/lib/ai-tool-catalog";

export interface SettingOption {
  id: string;
  en: string;
  tr: string;
  /** Static English text appended to the prompt. */
  promptFragment: string;
  /** Turkish counterpart, used when the site language is Turkish. */
  promptFragmentTr: string;
  description?: string;
  sortOrder: number;
}

export interface SettingGroup {
  id: string;
  en: string;
  tr: string;
  /** `suffix` groups are tool parameters (e.g. Midjourney `--ar`), appended after the sentence. */
  kind: "phrase" | "suffix";
  options: SettingOption[];
}

export interface SettingPreset {
  id: string;
  en: string;
  tr: string;
  emoji: string;
  contentType: ContentTypeId;
  /** groupId -> optionId. `userId` is reserved for future user-saved presets. */
  selection: Record<string, string>;
  userId?: string;
}

export type SettingSelection = Record<string, string>;

type Row = readonly [id: string, en: string, tr: string, fragment: string];

function group(id: string, en: string, tr: string, rows: readonly Row[], kind: "phrase" | "suffix" = "phrase"): SettingGroup {
  return {
    id,
    en,
    tr,
    kind,
    options: rows.map(([oid, oen, otr, fragment], index) => ({ id: oid, en: oen, tr: otr, promptFragment: fragment, promptFragmentTr: TR_FRAGMENTS[`${id}:${oid}`] ?? fragment, sortOrder: index })),
  };
}

/** Turkish prompt fragments, keyed `groupId:optionId`. Tool-parameter (suffix) groups are language-neutral. */
const TR_FRAGMENTS: Record<string, string> = {
  "lens:24mm": "24mm geniş açı lensle çekilmiş",
  "lens:35mm": "35mm lensle çekilmiş",
  "lens:50mm": "50mm lensle çekilmiş",
  "lens:85mm": "85mm lensle çekilmiş",
  "lens:135mm": "135mm tele lensle çekilmiş",
  "lens:macro": "makro lensle çekilmiş",
  "lens:fisheye": "balık gözü lensle çekilmiş",
  "angle:eye_level": "göz hizasından",
  "angle:low_angle": "alçak açıdan",
  "angle:high_angle": "yüksek açıdan",
  "angle:birds_eye": "kuş bakışı görünümle",
  "angle:dutch": "eğik açıyla",
  "angle:over_shoulder": "omuz üstü çekim olarak",
  "framing:extreme_close": "çok yakın plan çekimde",
  "framing:close_up": "yakın plan çekimde",
  "framing:medium": "orta plan çekimde",
  "framing:full_body": "boydan çekimde",
  "framing:wide": "geniş plan çekimde",
  "dof:shallow": "sığ alan derinliği ve yumuşak bokeh ile",
  "dof:deep": "derin alan derinliği ile, her şey net odakta",
  "dof:tilt_shift": "tilt-shift etkisiyle",
  "perspective:one_point": "tek noktalı perspektifle",
  "perspective:two_point": "iki noktalı perspektifle",
  "perspective:wide_interior": "geniş açılı iç mekân perspektifiyle",
  "perspective:aerial": "havadan perspektifle",
  "perspective:symmetrical": "simetrik ön görünümle",
  "lighting:golden_hour": "altın saatte",
  "lighting:blue_hour": "mavi saatte",
  "lighting:soft": "yumuşak, dağınık ışıkta",
  "lighting:dramatic": "dramatik ışıkla",
  "lighting:studio": "stüdyo ışığında",
  "lighting:natural": "doğal pencere ışığında",
  "lighting:backlit": "yumuşak kenar ışığıyla arkadan aydınlatılmış",
  "lighting:neon": "neon ışıklarla aydınlatılmış",
  "lighting:low_key": "low-key ışıkta",
  "time_of_day:sunrise": "gün doğumunda",
  "time_of_day:midday": "öğle vakti",
  "time_of_day:sunset": "gün batımında",
  "time_of_day:night": "geceleyin",
  "weather:clear": "açık bir gökyüzü altında",
  "weather:foggy": "yoğun sis içinde",
  "weather:rainy": "yağmur altında",
  "weather:snowy": "yağan karda",
  "weather:stormy": "fırtınalı bir gökyüzü altında",
  "pose:standing": "doğal bir şekilde ayakta",
  "pose:walking": "yürürken adım atarken yakalanmış",
  "pose:sitting": "rahat bir şekilde oturuyor",
  "pose:leaning": "rahatça yaslanmış",
  "pose:looking_back": "omzunun üzerinden geriye bakıyor",
  "pose:candid": "doğal, pozsuz bir anda",
  "skin:natural": "doğal cilt dokusuyla",
  "skin:smooth": "pürüzsüz, kusursuz bir cilde sahip",
  "skin:freckles": "çillerle",
  "skin:dewy": "nemli, parlak bir ten ile",
  "hair:long_flowing": "uzun dalgalı saçlarla",
  "hair:short": "kısa saçlarla",
  "hair:curly": "kıvırcık saçlarla",
  "hair:braided": "örgülü saçlarla",
  "hair:windswept": "rüzgârda savrulan saçlarla",
  "style:cinematic": "sinematik film görünümü",
  "style:photorealistic": "foto gerçekçi, çok detaylı",
  "style:anime": "anime tarzında",
  "style:watercolor": "suluboya tarzında",
  "style:oil_painting": "yağlı boya tarzında",
  "style:render_3d": "cilalı bir 3D render olarak",
  "style:minimalist": "minimalist bir tarzda",
  "style:vintage": "vintage film estetiğiyle",
  "style:cyberpunk": "cyberpunk tarzında",
  "color:warm": "sıcak bir renk paletiyle",
  "color:cool": "soğuk bir renk paletiyle",
  "color:monochrome": "tek renkli bir paletle",
  "color:pastel": "yumuşak pastel renklerle",
  "color:vibrant": "canlı, doygun renklerle",
  "color:muted": "soluk, doğal tonlarla",
  "color:black_white": "siyah beyaz",
  "background:city_street": "hareketli bir şehir sokağının önünde",
  "background:studio_backdrop": "temiz bir stüdyo fonunun önünde",
  "background:nature": "doğal bir açık hava ortamında",
  "background:blurred": "hafifçe bulanık bir arka planla",
  "background:white": "saf beyaz bir arka plan üzerinde",
  "background:gradient": "pürüzsüz gradyan bir arka plan üzerinde",
  "composition:thirds": "üçler kuralı kullanılarak",
  "composition:centered": "ortalı bir kompozisyonla",
  "composition:symmetry": "simetrik bir kompozisyonla",
  "composition:leading_lines": "güçlü yönlendirici çizgilerle",
  "composition:negative_space": "bol boş alanla",
  "aspect_ratio:1_1": "kare 1:1 görsel oranında",
  "aspect_ratio:4_5": "4:5 görsel oranında",
  "aspect_ratio:16_9": "16:9 görsel oranında",
  "aspect_ratio:9_16": "9:16 dikey görsel oranında",
  "aspect_ratio:3_2": "3:2 görsel oranında",
  "product_placement:hero": "ürün kahraman olarak ortada",
  "product_placement:floating": "ürün havada süzülürken",
  "product_placement:surface": "yansıtıcı bir yüzeyde duran",
  "product_placement:in_hand": "elde tutulan",
  "product_placement:lifestyle": "bir yaşam sahnesine yerleştirilmiş",
  "material:glossy": "parlak bir yüzeyle",
  "material:matte": "mat bir yüzeyle",
  "material:metallic": "fırçalanmış metalik yüzeylerle",
  "material:glass": "net cam detaylarla",
  "material:wood": "doğal ahşap dokularla",
  "material:fabric": "yumuşak kumaş dokularla",
  "commercial_style:ecommerce": "temiz bir e-ticaret ürün çekimi olarak",
  "commercial_style:luxury": "lüks, premium bir reklam görünümüyle",
  "commercial_style:minimal_ad": "minimal bir reklam olarak",
  "commercial_style:editorial": "editoryal dergi tarzında",
  "arch_style:modern": "modern mimaride",
  "arch_style:minimalist": "minimalist mimaride",
  "arch_style:brutalist": "brütalist mimaride",
  "arch_style:classical": "klasik mimaride",
  "arch_style:industrial": "endüstriyel bir tarzda",
  "arch_style:futuristic": "fütüristik mimaride",
  "tone:professional": "profesyonel bir tonda yazılmış",
  "tone:friendly": "samimi, sohbet havasında bir tonda yazılmış",
  "tone:persuasive": "ikna edici bir tonda yazılmış",
  "tone:humorous": "esprili bir tonda",
  "tone:formal": "resmi bir tonda yazılmış",
  "tone:inspirational": "ilham verici bir tonda yazılmış",
  "audience:general": "genel bir kitleye yönelik",
  "audience:young_adults": "gençlere yönelik",
  "audience:professionals": "çalışan profesyonellere yönelik",
  "audience:parents": "ebeveynlere yönelik",
  "audience:students": "öğrencilere yönelik",
  "audience:executives": "yoğun yöneticilere yönelik",
  "length:short": "kısa tutulmuş (100 kelimenin altında)",
  "length:medium": "yaklaşık 300 kelime uzunluğunda",
  "length:long": "detaylı (800+ kelime)",
  "length:one_paragraph": "tek bir paragrafta",
  "structure:bullets": "madde işaretleriyle yapılandırılmış",
  "structure:steps": "adım adım anlatılmış",
  "structure:headings": "net başlıklar ve alt başlıklarla",
  "structure:qa": "soru-cevap formatında",
  "structure:storytelling": "hikâye anlatımı yapısında",
  "language:turkish": "Türkçe yazılmış",
  "language:english": "İngilizce yazılmış",
  "language:bilingual": "hem Türkçe hem İngilizce yazılmış",
  "language:plain": "sade, anlaşılır bir dille",
  "cta:buy_now": "'Hemen al' çağrısıyla biten",
  "cta:sign_up": "'Kaydol' çağrısıyla biten",
  "cta:learn_more": "'Daha fazla bilgi' çağrısıyla biten",
  "cta:contact": "'İletişime geç' çağrısıyla biten",
  "cta:limited": "acil, sınırlı süreli bir fırsat çağrısıyla",
  "platform:instagram": "Instagram için optimize edilmiş",
  "platform:linkedin": "LinkedIn için optimize edilmiş",
  "platform:tiktok": "TikTok için optimize edilmiş",
  "platform:email": "e-posta formatında",
  "platform:landing": "bir landing page için yazılmış",
  "platform:google_ads": "Google Ads için yazılmış",
  "sales_goal:awareness": "marka bilinirliği oluşturma amacıyla",
  "sales_goal:conversion": "dönüşüm sağlamaya odaklanmış",
  "sales_goal:launch": "bir ürün lansmanı için",
  "sales_goal:retention": "müşteriyi elde tutmaya odaklanmış",
  "code_detail:comments": "net satır içi yorumlarla",
  "code_detail:tests": "birim testleri dahil",
  "code_detail:typed": "sıkı tipleme ile",
  "code_detail:explained": "kısa bir açıklamayla",
  "code_detail:production": "prodüksiyona hazır ve iyi yapılandırılmış",
  "code_detail:minimal": "kısa ve minimal",
  "genre:pop": "pop tarzında",
  "genre:rock": "rock tarzında",
  "genre:electronic": "elektronik tarzda",
  "genre:hip_hop": "hip hop tarzında",
  "genre:jazz": "caz tarzında",
  "genre:classical": "klasik tarzda",
  "genre:lofi": "lo-fi tarzında",
  "genre:ambient": "ambient tarzında",
  "genre:orchestral": "sinematik orkestral tarzda",
  "vocal:female": "kadın solo vokalle",
  "vocal:male": "erkek solo vokalle",
  "vocal:choir": "tam bir koro ile",
  "vocal:instrumental": "tamamen enstrümantal, vokalsiz",
  "vocal:whisper": "yumuşak fısıltı vokallerle",
  "tempo:slow": "yavaş bir tempoda (yaklaşık 70 BPM)",
  "tempo:mid": "orta bir tempoda (yaklaşık 100 BPM)",
  "tempo:upbeat": "hareketli bir tempoda (yaklaşık 128 BPM)",
  "tempo:fast": "hızlı bir tempoda (yaklaşık 150 BPM)",
  "instrument:piano": "piyano ile",
  "instrument:acoustic_guitar": "akustik gitar ile",
  "instrument:electric_guitar": "elektro gitar ile",
  "instrument:strings": "zengin yaylı çalgılarla",
  "instrument:synth": "analog synthesizer'larla",
  "instrument:drums": "güçlü davullarla",
  "instrument:sax": "saksafon ile",
  "mood:happy": "neşeli, ferahlatıcı bir havayla",
  "mood:melancholic": "hüzünlü bir havayla",
  "mood:epic": "epik, güçlü bir havayla",
  "mood:calm": "sakin, rahatlatıcı bir havayla",
  "mood:tense": "gergin, merak uyandıran bir havayla",
  "mood:romantic": "romantik bir havayla",
  "mood:nostalgic": "nostaljik bir havayla",
  "atmosphere:dreamy": "rüya gibi bir atmosferle",
  "atmosphere:dark": "karanlık bir atmosferle",
  "atmosphere:warm": "sıcak bir atmosferle",
  "atmosphere:spacious": "ferah, yankılı bir atmosferle",
  "atmosphere:intimate": "samimi bir atmosferle",
  "atmosphere:futuristic": "fütüristik bir atmosferle",
  "duration_audio:15s": "yaklaşık 15 saniye uzunluğunda",
  "duration_audio:30s": "yaklaşık 30 saniye uzunluğunda",
  "duration_audio:1m": "yaklaşık 1 dakika uzunluğunda",
  "duration_audio:2m": "yaklaşık 2 dakika uzunluğunda",
  "duration_audio:3m": "yaklaşık 3 dakika uzunluğunda",
  "sound_character:analog": "sıcak analog bir sesle",
  "sound_character:digital": "net dijital bir sesle",
  "sound_character:tape": "lo-fi kaset doygunluğuyla",
  "sound_character:bass": "ağır, derin bas ile",
  "sound_character:airy": "parlak ve havadar bir sesle",
  "camera_move:static": "sabit kamerayla",
  "camera_move:pan": "yavaş bir pan hareketiyle",
  "camera_move:dolly_in": "yavaş bir dolly-in ile",
  "camera_move:tracking": "akıcı bir takip çekimiyle",
  "camera_move:handheld": "elde kamera hareketiyle",
  "camera_move:drone": "geniş bir drone çekimiyle",
  "camera_move:orbit": "yörüngesel bir kamera hareketiyle",
  "shot:establishing": "kurucu bir geniş çekimle açılan",
  "shot:medium": "orta plan çekimde",
  "shot:close_up": "yakın plan çekimde",
  "shot:pov": "birinci şahıs POV çekimi olarak",
  "shot:over_shoulder": "omuz üstü çekim olarak",
  "style_video:cinematic": "sinematik film tarzında",
  "style_video:documentary": "belgesel tarzında",
  "style_video:anime": "anime tarzında",
  "style_video:vintage": "vintage film görünümüyle",
  "style_video:commercial": "cilalı bir reklam tarzında",
  "style_video:surreal": "gerçeküstü bir tarzda",
  "duration_video:5s": "5 saniye uzunluğunda",
  "duration_video:10s": "10 saniye uzunluğunda",
  "duration_video:15s": "15 saniye uzunluğunda",
  "duration_video:30s": "30 saniye uzunluğunda",
  "duration_video:60s": "60 saniye uzunluğunda",
  "aspect_video:16_9": "16:9 görsel oranında",
  "aspect_video:9_16": "9:16 dikey görsel oranında",
  "aspect_video:1_1": "kare 1:1 görsel oranında",
  "aspect_video:21_9": "21:9 ultra geniş görsel oranında",
};

const GROUPS: Record<string, SettingGroup> = {};
function def(g: SettingGroup) {
  GROUPS[g.id] = g;
}

// ---- Image / Video shared camera + look ---------------------------------
def(group("lens", "Lens", "Lens", [
  ["24mm", "24mm", "24mm", "shot with a 24mm wide-angle lens"],
  ["35mm", "35mm", "35mm", "shot with a 35mm lens"],
  ["50mm", "50mm", "50mm", "shot with a 50mm lens"],
  ["85mm", "85mm", "85mm", "shot with an 85mm lens"],
  ["135mm", "135mm", "135mm", "shot with a 135mm telephoto lens"],
  ["macro", "Macro", "Makro", "shot with a macro lens"],
  ["fisheye", "Fisheye", "Balık gözü", "shot with a fisheye lens"],
]));
def(group("angle", "Camera angle", "Kamera açısı", [
  ["eye_level", "Eye level", "Göz hizası", "at eye level"],
  ["low_angle", "Low angle", "Alçak açı", "from a low-angle perspective"],
  ["high_angle", "High angle", "Yüksek açı", "from a high-angle perspective"],
  ["birds_eye", "Bird's-eye", "Kuş bakışı", "from a bird's-eye view"],
  ["dutch", "Dutch angle", "Eğik açı", "with a dutch angle"],
  ["over_shoulder", "Over the shoulder", "Omuz üstü", "as an over-the-shoulder shot"],
]));
def(group("framing", "Framing", "Kadraj", [
  ["extreme_close", "Extreme close-up", "Çok yakın plan", "in an extreme close-up"],
  ["close_up", "Close-up", "Yakın plan", "in a close-up shot"],
  ["medium", "Medium shot", "Orta plan", "in a medium shot"],
  ["full_body", "Full body", "Boydan", "in a full-body shot"],
  ["wide", "Wide shot", "Geniş plan", "in a wide shot"],
]));
def(group("dof", "Depth of field", "Alan derinliği", [
  ["shallow", "Shallow (bokeh)", "Sığ (bokeh)", "with shallow depth of field and creamy bokeh"],
  ["deep", "Deep focus", "Derin netlik", "with deep depth of field, everything in sharp focus"],
  ["tilt_shift", "Tilt-shift", "Tilt-shift", "with a tilt-shift effect"],
]));
def(group("perspective", "Perspective", "Perspektif", [
  ["one_point", "One-point", "Tek noktalı", "in one-point perspective"],
  ["two_point", "Two-point", "İki noktalı", "in two-point perspective"],
  ["wide_interior", "Wide interior", "Geniş iç mekân", "with a wide-angle interior perspective"],
  ["aerial", "Aerial", "Havadan", "from an aerial perspective"],
  ["symmetrical", "Symmetrical facade", "Simetrik cephe", "with a symmetrical frontal view"],
]));
def(group("lighting", "Lighting", "Işık", [
  ["golden_hour", "Golden hour", "Altın saat", "during golden hour"],
  ["blue_hour", "Blue hour", "Mavi saat", "during blue hour"],
  ["soft", "Soft light", "Yumuşak ışık", "in soft diffused light"],
  ["dramatic", "Dramatic", "Dramatik", "with dramatic lighting"],
  ["studio", "Studio", "Stüdyo", "in studio lighting"],
  ["natural", "Window light", "Pencere ışığı", "in natural window light"],
  ["backlit", "Backlit", "Arkadan ışık", "backlit with a soft rim light"],
  ["neon", "Neon", "Neon", "lit by neon lights"],
  ["low_key", "Low key", "Low key", "in low-key lighting"],
]));
def(group("time_of_day", "Time of day", "Günün zamanı", [
  ["sunrise", "Sunrise", "Gün doğumu", "at sunrise"],
  ["midday", "Midday", "Öğle", "at midday"],
  ["sunset", "Sunset", "Gün batımı", "at sunset"],
  ["night", "Night", "Gece", "at night"],
]));
def(group("weather", "Weather", "Hava", [
  ["clear", "Clear sky", "Açık hava", "under a clear sky"],
  ["foggy", "Foggy", "Sisli", "in thick fog"],
  ["rainy", "Rainy", "Yağmurlu", "in the rain"],
  ["snowy", "Snowy", "Karlı", "in falling snow"],
  ["stormy", "Stormy", "Fırtınalı", "under stormy skies"],
]));
def(group("pose", "Pose", "Poz", [
  ["standing", "Standing", "Ayakta", "standing naturally"],
  ["walking", "Walking", "Yürürken", "caught mid-stride while walking"],
  ["sitting", "Sitting", "Otururken", "sitting relaxed"],
  ["leaning", "Leaning", "Yaslanmış", "leaning casually"],
  ["looking_back", "Looking back", "Geriye bakan", "glancing back over the shoulder"],
  ["candid", "Candid", "Doğal an", "in a candid, unposed moment"],
]));
def(group("skin", "Skin", "Cilt", [
  ["natural", "Natural texture", "Doğal doku", "with natural skin texture"],
  ["smooth", "Smooth", "Pürüzsüz", "with smooth, flawless skin"],
  ["freckles", "Freckles", "Çil", "with freckles"],
  ["dewy", "Dewy glow", "Parlak / nemli", "with a dewy, glowing complexion"],
]));
def(group("hair", "Hair", "Saç", [
  ["long_flowing", "Long & flowing", "Uzun, dalgalı", "with long flowing hair"],
  ["short", "Short", "Kısa", "with short hair"],
  ["curly", "Curly", "Kıvırcık", "with curly hair"],
  ["braided", "Braided", "Örgülü", "with braided hair"],
  ["windswept", "Windswept", "Rüzgârda savrulan", "with windswept hair"],
]));
def(group("style", "Style", "Stil", [
  ["cinematic", "Cinematic", "Sinematik", "cinematic film look"],
  ["photorealistic", "Photorealistic", "Foto gerçekçi", "photorealistic, highly detailed"],
  ["anime", "Anime", "Anime", "in anime style"],
  ["watercolor", "Watercolor", "Suluboya", "in a watercolor style"],
  ["oil_painting", "Oil painting", "Yağlı boya", "in an oil painting style"],
  ["render_3d", "3D render", "3D render", "as a polished 3D render"],
  ["minimalist", "Minimalist", "Minimalist", "in a minimalist style"],
  ["vintage", "Vintage", "Vintage", "with a vintage film aesthetic"],
  ["cyberpunk", "Cyberpunk", "Cyberpunk", "in a cyberpunk style"],
]));
def(group("color", "Color", "Renk", [
  ["warm", "Warm", "Sıcak", "with a warm color palette"],
  ["cool", "Cool", "Soğuk", "with a cool color palette"],
  ["monochrome", "Monochrome", "Tek renk", "in a monochrome palette"],
  ["pastel", "Pastel", "Pastel", "in soft pastel colors"],
  ["vibrant", "Vibrant", "Canlı", "with vibrant, saturated colors"],
  ["muted", "Muted", "Soluk / doğal", "with muted, natural tones"],
  ["black_white", "Black & white", "Siyah-beyaz", "in black and white"],
]));
def(group("background", "Background", "Arka plan", [
  ["city_street", "City street", "Şehir sokağı", "against a bustling city street"],
  ["studio_backdrop", "Studio backdrop", "Stüdyo fonu", "against a clean studio backdrop"],
  ["nature", "Nature", "Doğa", "in a natural outdoor setting"],
  ["blurred", "Blurred", "Bulanık", "with a softly blurred background"],
  ["white", "Pure white", "Saf beyaz", "on a pure white background"],
  ["gradient", "Gradient", "Gradyan", "on a smooth gradient background"],
]));
def(group("composition", "Composition", "Kompozisyon", [
  ["thirds", "Rule of thirds", "Üçler kuralı", "using the rule of thirds"],
  ["centered", "Centered", "Ortalı", "with a centered composition"],
  ["symmetry", "Symmetrical", "Simetrik", "with a symmetrical composition"],
  ["leading_lines", "Leading lines", "Yönlendirici çizgiler", "with strong leading lines"],
  ["negative_space", "Negative space", "Boş alan", "with generous negative space"],
]));
def(group("aspect_ratio", "Aspect ratio", "Görsel oranı", [
  ["1_1", "1:1", "1:1", "in a square 1:1 aspect ratio"],
  ["4_5", "4:5", "4:5", "in a 4:5 aspect ratio"],
  ["16_9", "16:9", "16:9", "in a 16:9 aspect ratio"],
  ["9_16", "9:16", "9:16", "in a 9:16 vertical aspect ratio"],
  ["3_2", "3:2", "3:2", "in a 3:2 aspect ratio"],
]));
def(group("product_placement", "Product placement", "Ürün konumu", [
  ["hero", "Centered hero", "Ortada kahraman", "with the product centered as the hero"],
  ["floating", "Floating", "Havada", "with the product floating in mid-air"],
  ["surface", "On surface", "Yüzey üstünde", "resting on a reflective surface"],
  ["in_hand", "In hand", "Elde", "held in a hand"],
  ["lifestyle", "Lifestyle scene", "Yaşam sahnesi", "placed in a lifestyle setting"],
]));
def(group("material", "Material", "Malzeme", [
  ["glossy", "Glossy", "Parlak", "with a glossy finish"],
  ["matte", "Matte", "Mat", "with a matte finish"],
  ["metallic", "Metallic", "Metalik", "with brushed metallic surfaces"],
  ["glass", "Glass", "Cam", "with clear glass details"],
  ["wood", "Wood", "Ahşap", "with natural wood textures"],
  ["fabric", "Fabric", "Kumaş", "with soft fabric textures"],
]));
def(group("commercial_style", "Commercial style", "Ticari stil", [
  ["ecommerce", "Clean e-commerce", "Temiz e-ticaret", "as a clean e-commerce product shot"],
  ["luxury", "Luxury", "Lüks", "with a luxury premium advertising look"],
  ["minimal_ad", "Minimal ad", "Minimal reklam", "as a minimal advertisement"],
  ["editorial", "Editorial", "Editoryal", "in an editorial magazine style"],
]));
def(group("arch_style", "Architectural style", "Mimari stil", [
  ["modern", "Modern", "Modern", "in modern architecture"],
  ["minimalist", "Minimalist", "Minimalist", "in minimalist architecture"],
  ["brutalist", "Brutalist", "Brütalist", "in brutalist architecture"],
  ["classical", "Classical", "Klasik", "in classical architecture"],
  ["industrial", "Industrial", "Endüstriyel", "in an industrial style"],
  ["futuristic", "Futuristic", "Fütüristik", "in futuristic architecture"],
]));

// ---- Text ----------------------------------------------------------------
def(group("tone", "Tone", "Ton", [
  ["professional", "Professional", "Profesyonel", "written in a professional tone"],
  ["friendly", "Friendly", "Samimi", "written in a friendly, conversational tone"],
  ["persuasive", "Persuasive", "İkna edici", "written in a persuasive tone"],
  ["humorous", "Humorous", "Esprili", "with a humorous tone"],
  ["formal", "Formal", "Resmi", "written in a formal tone"],
  ["inspirational", "Inspirational", "İlham verici", "written in an inspirational tone"],
]));
def(group("audience", "Audience", "Hedef kitle", [
  ["general", "General", "Genel", "aimed at a general audience"],
  ["young_adults", "Young adults", "Gençler", "aimed at young adults"],
  ["professionals", "Professionals", "Profesyoneller", "aimed at working professionals"],
  ["parents", "Parents", "Ebeveynler", "aimed at parents"],
  ["students", "Students", "Öğrenciler", "aimed at students"],
  ["executives", "Executives", "Yöneticiler", "aimed at busy executives"],
]));
def(group("length", "Length", "Uzunluk", [
  ["short", "Short", "Kısa", "kept short (under 100 words)"],
  ["medium", "Medium", "Orta", "around 300 words long"],
  ["long", "In-depth", "Detaylı", "in-depth (800+ words)"],
  ["one_paragraph", "One paragraph", "Tek paragraf", "in a single paragraph"],
]));
def(group("structure", "Structure", "Yapı", [
  ["bullets", "Bullet points", "Madde işaretleri", "structured as bullet points"],
  ["steps", "Step by step", "Adım adım", "explained step by step"],
  ["headings", "Headings", "Başlıklı", "with clear headings and subheadings"],
  ["qa", "Q&A", "Soru-cevap", "in a question-and-answer format"],
  ["storytelling", "Storytelling", "Hikâye", "in a storytelling structure"],
]));
def(group("language", "Language", "Dil", [
  ["turkish", "Turkish", "Türkçe", "written in Turkish"],
  ["english", "English", "İngilizce", "written in English"],
  ["bilingual", "Turkish + English", "Türkçe + İngilizce", "written in both Turkish and English"],
  ["plain", "Plain language", "Sade dil", "using simple, plain language"],
]));
def(group("cta", "CTA", "CTA", [
  ["buy_now", "Buy now", "Hemen al", "ending with a 'Buy now' call to action"],
  ["sign_up", "Sign up", "Kaydol", "ending with a 'Sign up' call to action"],
  ["learn_more", "Learn more", "Daha fazla bilgi", "ending with a 'Learn more' call to action"],
  ["contact", "Contact us", "İletişime geç", "ending with a 'Contact us' call to action"],
  ["limited", "Limited offer", "Sınırlı fırsat", "with an urgent limited-time offer call to action"],
]));
def(group("platform", "Platform", "Platform", [
  ["instagram", "Instagram", "Instagram", "optimized for Instagram"],
  ["linkedin", "LinkedIn", "LinkedIn", "optimized for LinkedIn"],
  ["tiktok", "TikTok", "TikTok", "optimized for TikTok"],
  ["email", "Email", "E-posta", "formatted as an email"],
  ["landing", "Landing page", "Landing page", "written for a landing page"],
  ["google_ads", "Google Ads", "Google Ads", "written for Google Ads"],
]));
def(group("sales_goal", "Sales goal", "Satış amacı", [
  ["awareness", "Awareness", "Farkındalık", "with the goal of building brand awareness"],
  ["conversion", "Conversion", "Dönüşüm", "focused on driving conversions"],
  ["launch", "Product launch", "Ürün lansmanı", "for a product launch"],
  ["retention", "Retention", "Müşteriyi tutma", "focused on customer retention"],
]));
def(group("code_detail", "Code details", "Kod detayı", [
  ["comments", "Comments", "Yorum satırları", "with clear inline comments"],
  ["tests", "Tests", "Testler", "including unit tests"],
  ["typed", "Strict typing", "Sıkı tipleme", "with strict typing"],
  ["explained", "Explanation", "Açıklama", "with a brief explanation"],
  ["production", "Production-ready", "Prodüksiyona hazır", "production-ready and well structured"],
  ["minimal", "Minimal", "Minimal", "concise and minimal"],
]));

// ---- Audio ---------------------------------------------------------------
def(group("genre", "Genre", "Tür", [
  ["pop", "Pop", "Pop", "in a pop style"],
  ["rock", "Rock", "Rock", "in a rock style"],
  ["electronic", "Electronic", "Elektronik", "in an electronic style"],
  ["hip_hop", "Hip hop", "Hip hop", "in a hip hop style"],
  ["jazz", "Jazz", "Jazz", "in a jazz style"],
  ["classical", "Classical", "Klasik", "in a classical style"],
  ["lofi", "Lo-fi", "Lo-fi", "in a lo-fi style"],
  ["ambient", "Ambient", "Ambient", "in an ambient style"],
  ["orchestral", "Cinematic score", "Film müziği", "in a cinematic orchestral style"],
]));
def(group("vocal", "Vocal", "Vokal", [
  ["female", "Female", "Kadın", "with a female lead vocal"],
  ["male", "Male", "Erkek", "with a male lead vocal"],
  ["choir", "Choir", "Koro", "with a full choir"],
  ["instrumental", "Instrumental", "Enstrümantal", "purely instrumental, no vocals"],
  ["whisper", "Whispered", "Fısıltı", "with soft whispered vocals"],
]));
def(group("tempo", "Tempo", "Tempo", [
  ["slow", "Slow", "Yavaş", "at a slow tempo (around 70 BPM)"],
  ["mid", "Mid", "Orta", "at a mid tempo (around 100 BPM)"],
  ["upbeat", "Upbeat", "Hareketli", "at an upbeat tempo (around 128 BPM)"],
  ["fast", "Fast", "Hızlı", "at a fast tempo (around 150 BPM)"],
]));
def(group("instrument", "Instrument", "Enstrüman", [
  ["piano", "Piano", "Piyano", "featuring piano"],
  ["acoustic_guitar", "Acoustic guitar", "Akustik gitar", "featuring acoustic guitar"],
  ["electric_guitar", "Electric guitar", "Elektro gitar", "featuring electric guitar"],
  ["strings", "Strings", "Yaylılar", "featuring lush strings"],
  ["synth", "Synth", "Synth", "featuring analog synthesizers"],
  ["drums", "Drums", "Davul", "driven by punchy drums"],
  ["sax", "Saxophone", "Saksafon", "featuring saxophone"],
]));
def(group("mood", "Emotion", "Duygu", [
  ["happy", "Happy", "Neşeli", "with a happy, uplifting mood"],
  ["melancholic", "Melancholic", "Hüzünlü", "with a melancholic mood"],
  ["epic", "Epic", "Epik", "with an epic, powerful mood"],
  ["calm", "Calm", "Sakin", "with a calm, relaxing mood"],
  ["tense", "Tense", "Gergin", "with a tense, suspenseful mood"],
  ["romantic", "Romantic", "Romantik", "with a romantic mood"],
  ["nostalgic", "Nostalgic", "Nostaljik", "with a nostalgic mood"],
]));
def(group("atmosphere", "Atmosphere", "Atmosfer", [
  ["dreamy", "Dreamy", "Rüya gibi", "with a dreamy atmosphere"],
  ["dark", "Dark", "Karanlık", "with a dark atmosphere"],
  ["warm", "Warm", "Sıcak", "with a warm atmosphere"],
  ["spacious", "Spacious", "Ferah", "with a spacious, reverberant atmosphere"],
  ["intimate", "Intimate", "Samimi", "with an intimate atmosphere"],
  ["futuristic", "Futuristic", "Fütüristik", "with a futuristic atmosphere"],
]));
def(group("duration_audio", "Duration", "Süre", [
  ["15s", "15 s", "15 sn", "about 15 seconds long"],
  ["30s", "30 s", "30 sn", "about 30 seconds long"],
  ["1m", "1 min", "1 dk", "about 1 minute long"],
  ["2m", "2 min", "2 dk", "about 2 minutes long"],
  ["3m", "3 min", "3 dk", "about 3 minutes long"],
]));
def(group("sound_character", "Sound character", "Ses karakteri", [
  ["analog", "Warm analog", "Sıcak analog", "with a warm analog sound"],
  ["digital", "Crisp digital", "Net dijital", "with a crisp digital sound"],
  ["tape", "Lo-fi tape", "Lo-fi kaset", "with lo-fi tape saturation"],
  ["bass", "Heavy bass", "Ağır bas", "with heavy, deep bass"],
  ["airy", "Bright & airy", "Parlak, havadar", "with a bright and airy sound"],
]));

// ---- Video ---------------------------------------------------------------
def(group("camera_move", "Camera movement", "Kamera hareketi", [
  ["static", "Static", "Sabit", "with a static camera"],
  ["pan", "Pan", "Pan", "with a slow pan"],
  ["dolly_in", "Dolly in", "Dolly in", "with a slow dolly-in"],
  ["tracking", "Tracking", "Takip", "with a smooth tracking shot"],
  ["handheld", "Handheld", "Elde", "with handheld camera movement"],
  ["drone", "Drone", "Drone", "with a sweeping drone shot"],
  ["orbit", "Orbit", "Yörünge", "with an orbiting camera move"],
]));
def(group("shot", "Shot", "Shot", [
  ["establishing", "Establishing wide", "Kurucu geniş", "opening with an establishing wide shot"],
  ["medium", "Medium", "Orta", "in a medium shot"],
  ["close_up", "Close-up", "Yakın", "in a close-up shot"],
  ["pov", "POV", "POV", "as a first-person POV shot"],
  ["over_shoulder", "Over the shoulder", "Omuz üstü", "as an over-the-shoulder shot"],
]));
def(group("style_video", "Style", "Stil", [
  ["cinematic", "Cinematic", "Sinematik", "in a cinematic film style"],
  ["documentary", "Documentary", "Belgesel", "in a documentary style"],
  ["anime", "Anime", "Anime", "in an anime style"],
  ["vintage", "Vintage film", "Vintage film", "with a vintage film look"],
  ["commercial", "Commercial", "Reklam", "in a polished commercial style"],
  ["surreal", "Surreal", "Gerçeküstü", "in a surreal style"],
]));
def(group("duration_video", "Duration", "Süre", [
  ["5s", "5 s", "5 sn", "5 seconds long"],
  ["10s", "10 s", "10 sn", "10 seconds long"],
  ["15s", "15 s", "15 sn", "15 seconds long"],
  ["30s", "30 s", "30 sn", "30 seconds long"],
  ["60s", "60 s", "60 sn", "60 seconds long"],
]));
def(group("aspect_video", "Aspect ratio", "Aspect ratio", [
  ["16_9", "16:9", "16:9", "in a 16:9 aspect ratio"],
  ["9_16", "9:16", "9:16", "in a 9:16 vertical aspect ratio"],
  ["1_1", "1:1", "1:1", "in a square 1:1 aspect ratio"],
  ["21_9", "21:9", "21:9", "in a 21:9 ultrawide aspect ratio"],
]));

// ---- Tool parameters (suffix) -------------------------------------------
def(group("mj_ar", "Aspect ratio (--ar)", "Oran (--ar)", [
  ["1_1", "1:1", "1:1", "--ar 1:1"],
  ["4_5", "4:5", "4:5", "--ar 4:5"],
  ["16_9", "16:9", "16:9", "--ar 16:9"],
  ["9_16", "9:16", "9:16", "--ar 9:16"],
], "suffix"));
def(group("mj_stylize", "Stylize (--stylize)", "Stilizasyon (--stylize)", [
  ["low", "Low", "Düşük", "--stylize 50"],
  ["mid", "Medium", "Orta", "--stylize 250"],
  ["high", "High", "Yüksek", "--stylize 750"],
], "suffix"));
def(group("mj_chaos", "Chaos (--chaos)", "Kaos (--chaos)", [
  ["low", "Low", "Düşük", "--chaos 10"],
  ["mid", "Medium", "Orta", "--chaos 30"],
  ["high", "High", "Yüksek", "--chaos 60"],
], "suffix"));

const MIDJOURNEY_GROUPS = ["mj_ar", "mj_stylize", "mj_chaos"];

const IMAGE_DEFAULT = ["lens", "angle", "framing", "dof", "lighting", "style", "color", "background", "composition", "aspect_ratio"];
const IMAGE_PORTRAIT = ["lens", "angle", "framing", "lighting", "pose", "skin", "hair", "style", "color", "background", "aspect_ratio"];
const IMAGE_PRODUCT = ["lens", "lighting", "product_placement", "background", "composition", "commercial_style", "material", "color", "aspect_ratio"];
const IMAGE_ARCH = ["lens", "perspective", "lighting", "time_of_day", "weather", "material", "arch_style", "framing", "aspect_ratio"];

const TEXT_DEFAULT = ["tone", "audience", "length", "structure", "language"];
const TEXT_AD = ["tone", "audience", "length", "cta", "platform", "sales_goal", "language"];
const TEXT_CODE = ["length", "structure", "code_detail", "language"];

const AUDIO_MUSIC = ["genre", "vocal", "tempo", "instrument", "mood", "atmosphere", "duration_audio", "sound_character"];
const AUDIO_VOICE = ["vocal", "tempo", "mood", "duration_audio", "sound_character"];
const AUDIO_SFX = ["atmosphere", "mood", "duration_audio", "sound_character"];

const VIDEO_DEFAULT = ["camera_move", "angle", "shot", "lighting", "style_video", "atmosphere", "duration_video", "aspect_video"];
const VIDEO_SOCIAL = ["shot", "camera_move", "style_video", "duration_video", "aspect_video"];

/** Group ids relevant to a taxonomy position, in display (and composition) order. */
export function groupIdsFor(
  type: ContentTypeId,
  category: string | null,
  subcategory: string | null,
  tools: readonly string[] = [],
): string[] {
  let ids: string[];
  if (type === "image") {
    if (subcategory === "portrait" || subcategory === "portrait_photography" || category === "human_character") ids = IMAGE_PORTRAIT;
    else if (category === "product_commercial" || subcategory === "product_photography") ids = IMAGE_PRODUCT;
    else if (category === "spaces" || subcategory === "architectural_photography") ids = IMAGE_ARCH;
    else ids = IMAGE_DEFAULT;
  } else if (type === "text") {
    if (category === "marketing" || subcategory === "ad_copy" || subcategory === "social_media_caption") ids = TEXT_AD;
    else if (category === "coding") ids = TEXT_CODE;
    else ids = TEXT_DEFAULT;
  } else if (type === "audio") {
    if (category === "voiceover" || category === "vocals") ids = AUDIO_VOICE;
    else if (category === "sound_effects" || category === "ambience") ids = AUDIO_SFX;
    else ids = AUDIO_MUSIC;
  } else {
    ids = category === "social_media" || category === "advertising" ? VIDEO_SOCIAL : VIDEO_DEFAULT;
  }
  if (type === "image" && tools.some((ref) => parseToolRef(ref).toolId === "midjourney")) {
    return [...ids, ...MIDJOURNEY_GROUPS];
  }
  return ids;
}

export function groupsFor(ids: readonly string[]): SettingGroup[] {
  return ids.map((id) => GROUPS[id]).filter((g): g is SettingGroup => Boolean(g));
}

export function settingFragment(option: SettingOption, language: Language): string {
  return language === "en" ? option.promptFragment : option.promptFragmentTr;
}

export function settingLabel(item: { en: string; tr: string }, language: Language): string {
  return language === "en" ? item.en : item.tr;
}

/** Drops selections whose group is not part of `groups` or whose option no longer exists. */
export function sanitizeSelection(selection: SettingSelection, groups: readonly SettingGroup[]): SettingSelection {
  const out: SettingSelection = {};
  for (const g of groups) {
    const optionId = selection[g.id];
    if (optionId && g.options.some((o) => o.id === optionId)) out[g.id] = optionId;
  }
  return out;
}

/**
 * ORIGINAL prompt + selected fragments (group order). The original is never
 * modified: with no selection it is returned untouched. Tool parameters
 * (`suffix` groups) go after the sentence.
 */
export function composePrompt(original: string, selection: SettingSelection, groups: readonly SettingGroup[], language: Language = "en"): string {
  const phrases: string[] = [];
  const suffixes: string[] = [];
  for (const g of groups) {
    const option = g.options.find((o) => o.id === selection[g.id]);
    if (!option) continue;
    (g.kind === "suffix" ? suffixes : phrases).push(settingFragment(option, language));
  }
  if (phrases.length === 0 && suffixes.length === 0) return original;
  const base = original.trim().replace(/[.\s]+$/, "");
  const sentence = [base, ...phrases].filter(Boolean).join(", ");
  const withStop = sentence ? `${sentence}.` : "";
  return [withStop, ...suffixes].filter(Boolean).join(" ");
}

export const SETTING_PRESETS: SettingPreset[] = [
  { id: "cinematic", en: "Cinematic", tr: "Sinematik", emoji: "🎬", contentType: "image", selection: { lens: "85mm", dof: "shallow", lighting: "dramatic", style: "cinematic" } },
  { id: "pro_portrait", en: "Professional portrait", tr: "Profesyonel portre", emoji: "📸", contentType: "image", selection: { lens: "85mm", angle: "eye_level", framing: "medium", lighting: "soft", skin: "natural", background: "blurred" } },
  { id: "anime", en: "Anime", tr: "Anime", emoji: "🎨", contentType: "image", selection: { style: "anime", color: "vibrant", lighting: "soft", composition: "thirds" } },
  { id: "product_studio", en: "Studio product", tr: "Stüdyo ürün", emoji: "🛍️", contentType: "image", selection: { lens: "50mm", lighting: "studio", background: "white", commercial_style: "ecommerce", product_placement: "hero" } },
  { id: "marketing_copy", en: "Persuasive marketing", tr: "İkna edici pazarlama", emoji: "📣", contentType: "text", selection: { tone: "persuasive", length: "short", cta: "buy_now" } },
  { id: "blog_post", en: "Friendly blog post", tr: "Samimi blog yazısı", emoji: "✍️", contentType: "text", selection: { tone: "friendly", structure: "headings", length: "medium" } },
  { id: "chill_lofi", en: "Chill lo-fi", tr: "Sakin lo-fi", emoji: "🎧", contentType: "audio", selection: { genre: "lofi", tempo: "slow", mood: "calm", vocal: "instrumental" } },
  { id: "epic_score", en: "Epic score", tr: "Epik film müziği", emoji: "🎻", contentType: "audio", selection: { genre: "orchestral", mood: "epic", instrument: "strings", tempo: "mid" } },
  { id: "cinematic_video", en: "Cinematic scene", tr: "Sinematik sahne", emoji: "🎥", contentType: "video", selection: { camera_move: "dolly_in", angle: "low_angle", lighting: "dramatic", style_video: "cinematic", aspect_video: "21_9" } },
  { id: "vertical_social", en: "Vertical social clip", tr: "Dikey sosyal klip", emoji: "📱", contentType: "video", selection: { shot: "close_up", camera_move: "handheld", duration_video: "15s", aspect_video: "9_16" } },
];
