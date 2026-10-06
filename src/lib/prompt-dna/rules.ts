/**
 * Prompt DNA — the rule catalog. 100% local and data-driven: no AI, no
 * network. Every detection the analyzer can make is one row in a table
 * below; to teach the engine a new word, add it to a table — no analyzer
 * code changes.
 *
 * Terms are written naturally (with Turkish letters) and folded at load
 * time. A trailing `*` marks a stem that may take Turkish suffixes
 * ("yağmur*" → yağmurlu, yağmurda …). Be deliberate with stems: a stem that
 * is also the start of an unrelated word ("kar*" → karakter) is a false
 * positive — spell such words out instead (see rules.test.ts).
 */

import { foldText } from "./text.ts";
import type { DnaConfidence, DnaSectionType } from "./types.ts";

export interface LexiconEntry {
  /** Dedupe key (folded) — two spellings of the same thing share it. */
  key: string;
  /** Folded terms; a trailing `*` makes the term a stem. */
  terms: string[];
}

export interface LexiconRule {
  kind: "lexicon";
  id: string;
  section: DnaSectionType;
  confidence: DnaConfidence;
  entries: LexiconEntry[];
}

export interface RegexRule {
  kind: "regex";
  id: string;
  section: DnaSectionType;
  confidence: DnaConfidence;
  /** Runs on the FOLDED text (so write it ASCII). Must not carry a flag other than via `flags`. */
  source: string;
  flags?: string;
  /** Capture group whose text becomes the value (default: the whole match). */
  group?: number;
  /** When true, this rule's matches reserve their span: later `skipIfClaimed` rules ignore overlaps. */
  claims?: boolean;
  skipIfClaimed?: boolean;
  /** Return true to drop a match (e.g. a stopword "adjective"). */
  reject?: (folded: string, match: RegExpExecArray) => boolean;
}

export type DnaRule = LexiconRule | RegexRule;

/** `"key=a|b*|c"` or just `"a|b"` (key = first term). */
function lex(id: string, section: DnaSectionType, confidence: DnaConfidence, specs: string[]): LexiconRule {
  const entries = specs.map((spec): LexiconEntry => {
    const eq = spec.indexOf("=");
    const termsPart = eq === -1 ? spec : spec.slice(eq + 1);
    const terms = termsPart.split("|").map((term) => foldText(term.trim())).filter(Boolean);
    const key = foldText((eq === -1 ? terms[0] : spec.slice(0, eq)).replace(/\*$/, "").trim());
    return { key, terms };
  });
  return { kind: "lexicon", id, section, confidence, entries };
}

function rx(
  id: string,
  section: DnaSectionType,
  confidence: DnaConfidence,
  source: string,
  extra: Partial<Omit<RegexRule, "kind" | "id" | "section" | "confidence" | "source">> = {},
): RegexRule {
  return { kind: "regex", id, section, confidence, source, ...extra };
}

const f = foldText;
const alt = (words: string[]) => words.map((word) => f(word)).join("|");

// --- shared word lists for regex rules ---------------------------------------

const STOP_ADJECTIVES = new Set(["bir", "bu", "su", "o", "ve", "ile", "the", "a", "an", "of", "and", "or", "her", "tek", "bazi", "iki", "uc"]);

const CHARACTER_ADJECTIVES = [
  "genç", "yaşlı", "olgun", "küçük", "güzel", "yakışıklı", "esmer", "sarışın", "uzun boylu", "sakallı",
  "young", "old", "elderly", "beautiful", "handsome", "little", "tall", "blonde", "bearded", "middle aged",
];
const CHARACTER_STEMS = [
  "kadın", "adam", "erkek", "bebek", "çocuk", "robot", "android", "siborg", "cyborg", "kedi", "köpek", "ejderha",
  "savaşçı", "büyücü", "astronot", "samuray", "ninja", "kral", "kraliçe", "vampir", "zombi", "uzaylı", "kovboy",
  "korsan", "şövalye", "hemşire", "öğretmen", "dansçı", "müzisyen", "sporcu",
];
const CHARACTER_EXACT = [
  "kız", "kızı", "kızlar", "peri", "perisi", "periler", "doktor", "doktorlar", "şef",
  "woman", "women", "man", "men", "girl", "girls", "boy", "boys", "child", "children", "kid", "kids", "baby",
  "cyborg", "cat", "dog", "dragon", "warrior", "wizard", "astronaut", "samurai", "knight", "fairy", "vampire",
  "alien", "pirate", "cowboy", "king", "queen", "couple", "soldier", "chef", "dancer", "musician", "athlete",
  "doctor", "nurse", "teacher",
];

const AUDIENCE_STEMS = [
  "yeni başlayan", "başlangıç", "uzman", "çocuk", "genç", "yetişkin", "öğrenci", "girişimci", "geliştirici",
  "yazılımcı", "öğretmen", "anne", "profesyonel", "kurumsal", "müşteri", "yatırımcı", "sporcu", "ev kadını",
];
const AUDIENCE_ENGLISH = [
  "beginners", "kids", "children", "students", "developers", "entrepreneurs", "teachers", "professionals", "parents",
  "teenagers", "adults", "customers", "investors", "designers", "marketers",
];

const LANGUAGE_WORDS = [
  "türkçe", "ingilizce", "almanca", "fransızca", "ispanyolca", "italyanca", "rusça", "arapça", "japonca", "korece",
];
const LANGUAGE_WORDS_EN = ["english", "turkish", "german", "french", "spanish", "italian", "russian", "arabic", "japanese", "korean"];
/** Folded language names — a clause that is only one of these ("Türkçe yaz") is a language instruction, not a task. */
export const LANGUAGE_WORD_SET = new Set([...LANGUAGE_WORDS, ...LANGUAGE_WORDS_EN].map((word) => foldText(word)));

// --- the rule table (processing order = priority for claimed spans) ----------

export const DNA_RULES: DnaRule[] = [
  // ---- constraints (claims its span so "80 kelime" is not also a format) ----
  rx("constraints.limit", "constraints", "medium",
    "\\b(?:en fazla|en az|en cok|maksimum|minimum|maximum|max|min|at most|at least|up to|not more than|no more than)\\s+\\d+\\s*[a-z]+(?:\\s+[a-z]+)?",
    { claims: true }),
  rx("constraints.must", "constraints", "medium",
    "\\b(?:mutlaka|kesinlikle|asla|zorunlu|must|always|never)\\s+[^,.;\\n!?]{3,60}", { claims: true }),
  lex("constraints.short", "constraints", "medium", ["kisa tut|kisa ve oz|kisa olsun|keep it short|be concise"]),

  // ---- output / technical quality -----------------------------------------
  rx("output.aspect", "output", "high",
    "(?<![\\d:])(?:16\\s?:\\s?9|9\\s?:\\s?16|1\\s?:\\s?1|4\\s?:\\s?3|3\\s?:\\s?4|21\\s?:\\s?9|2\\s?:\\s?3|3\\s?:\\s?2|4\\s?:\\s?5|5\\s?:\\s?4|3\\s?:\\s?1|1\\s?:\\s?2|2\\s?:\\s?1)(?![\\d:])"),
  rx("output.resolution", "output", "high", "\\b(?:[248]\\s?k|uhd|fhd|hd)\\b"),
  rx("output.pixels", "output", "high", "\\b(?:480|720|1080|1440|2160)\\s?p\\b"),
  rx("output.size", "output", "high", "\\b\\d{3,5}\\s?[x×]\\s?\\d{3,5}\\b"),
  rx("output.fps", "output", "high", "\\b\\d{2,3}\\s?fps\\b"),
  rx("output.dpi", "output", "high", "\\b\\d{2,4}\\s?dpi\\b"),
  lex("output.quality", "output", "medium", [
    "ultra detaylı|ultra detayli|ultra detailed",
    "yüksek detaylı|highly detailed|hyper detailed",
    "yüksek çözünürlük*|high resolution",
    "yüksek kalite*|high quality",
    "masterpiece|şaheser",
    "keskin odak|sharp focus",
    "transparent background|şeffaf arka plan*",
  ]),
  lex("output.file", "output", "medium", ["png", "jpg", "jpeg", "webp", "svg", "mp4", "mp3", "wav", "gif", "pdf"]),

  // ---- camera / lens -------------------------------------------------------
  rx("camera.focal", "camera", "high", "\\b\\d{2,3}\\s?mm\\b"),
  rx("camera.aperture", "camera", "high", "\\bf\\s?/\\s?\\d{1,2}(?:[.,]\\d)?\\b"),
  rx("camera.aperture2", "camera", "medium", "\\bf\\d{1,2}(?:\\.\\d)?\\b"),
  rx("camera.iso", "camera", "high", "\\biso\\s?\\d{2,5}\\b"),
  rx("camera.shutter", "camera", "medium", "(?<![\\d/])1\\s?/\\s?(?:\\d{3,4}|30|60)\\s?(?:s|sn|saniye)?\\b"),
  lex("camera.gear", "camera", "high", [
    "dslr", "mirrorless", "gopro", "drone", "fisheye|balık gözü",
    "makro|macro", "telefoto|telephoto", "geniş açı|geniş açılı|wide angle", "tilt shift",
    "dar alan derinliği|sığ alan derinliği|shallow depth of field", "bokeh", "anamorfik|anamorphic",
    "analog film|35mm film", "kodak*", "fujifilm", "leica", "hasselblad", "polaroid",
  ]),

  // ---- composition ---------------------------------------------------------
  lex("composition.shots", "composition", "high", [
    "close=yakın çekim|yakın plan|close up|closeup",
    "wide=geniş çekim|geniş plan|wide shot",
    "medium=orta çekim|orta plan|medium shot",
    "birdseye=kuş bakışı|kuş bakış açısı|aerial view|top down",
    "lowangle=düşük açı|low angle|alttan çekim",
    "highangle=yüksek açı|high angle|üstten çekim",
    "overshoulder=omuz üstü|over the shoulder",
    "fullbody=tam boy|full body",
    "halfbody=yarım boy|bel üstü|half body",
    "symmetry=simetrik*|symmetrical",
    "thirds=üçler kuralı|rule of thirds",
    "centered=merkezi kompozisyon|centered composition",
    "dutch=eğik açı|dutch angle",
    "eyelevel=göz hizası|eye level",
    "pov=pov|birinci şahıs",
    "isometric=izometrik*|isometric",
    "flatlay=flat lay",
    "portraitshot=portre çekimi",
  ]),

  // ---- lighting ------------------------------------------------------------
  lex("lighting.terms", "lighting", "high", [
    "neon*", "rim light", "backlight*|backlit|arkadan ışık*", "softbox", "stüdyo ışığı|stüdyo aydınlatma*",
    "gün ışığı|doğal ışık*", "ay ışığı|ay ışığında", "mum ışığı|mum ışığında", "altın saat|golden hour",
    "mavi saat|blue hour", "volumetrik|volumetric", "chiaroscuro", "low key", "high key",
    "dramatik ışık*|dramatic lighting", "sinematik ışık*|cinematic lighting", "ışık huzme*|god rays",
    "yumuşak ışık*|soft light*|soft lighting", "sert ışık*|hard light*",
  ]),
  rx("lighting.phrase", "lighting", "medium",
    "\\b([a-z]+)\\s+(?:isik|isigi|isiklar|isiklari|isiklandirma|aydinlatma|lighting|light)\\b",
    { reject: (_f, m) => STOP_ADJECTIVES.has(m[1]) }),

  // ---- style ---------------------------------------------------------------
  lex("style.terms", "style", "high", [
    "sinematik*|cinematic", "fotogerçekçi*|photorealistic|photorealism", "hiper gerçekçi*|hyperrealistic|hyper realistic",
    "minimalist*|minimal tasarım", "anime|manga", "çizgi film*|cartoon", "illüstrasyon*|illustration",
    "suluboya|watercolor", "yağlı boya|oil painting", "dijital sanat*|digital art", "3d render*|3d", "pixel art|piksel sanat*",
    "low poly", "vintage", "retro", "cyberpunk", "steampunk", "fütüristik*|futuristic", "gotik|gothic", "art deco",
    "sürrealist*|surreal*", "film noir", "comic|çizgi roman*", "konsept sanat*|concept art", "vaporwave", "synthwave",
    "editorial", "lo fi|lofi", "belgesel*|documentary", "fantastik|fantasy", "sci fi|bilim kurgu", "isometric art",
    "claymation", "unreal engine", "octane render", "ghibli", "pixar", "disney", "wes anderson",
  ]),

  // ---- color ---------------------------------------------------------------
  lex("color.terms", "color", "medium", [
    "pastel*", "monokrom*|monochrome", "siyah beyaz|black and white|grayscale|gri tonlama",
    "canlı renk*|vivid colors|vibrant colors", "soluk renk*|muted colors", "sıcak renk*|sıcak ton*|warm tones",
    "soğuk renk*|soğuk ton*|cool tones", "doygun renk*|saturated", "renk paleti|color palette", "sepya|sepia",
  ]),
  lex("color.base", "color", "low", [
    "kırmızı*|red", "mavi*|blue", "yeşil*|green", "sarı|sarısı|yellow", "turuncu*|orange", "mor|morumsu|purple",
    "pembe*|pink", "siyah*|black", "beyaz*|white", "gri|grey|gray", "kahverengi*|brown", "bordo*", "lacivert*|navy",
    "turkuaz*|teal", "gümüş*|silver", "cyan",
  ]),

  // ---- weather / time ------------------------------------------------------
  lex("weather.terms", "weather", "high", [
    "yağmur*|rain|rainy|raining", "kar yağış*|karlı*|kar fırtına*|snow|snowy|snowing", "fırtına*|storm|stormy",
    "rüzgar*|rüzgâr*|windy", "sisli*|sis|fog|foggy|mist|misty", "puslu*|pus", "bulutlu*|bulut*|cloudy|overcast",
    "güneşli*|sunny", "gök gürültü*|şimşek*|thunder|lightning",
  ]),
  lex("time.terms", "time", "high", [
    "gece|geceleri|geceyarısı|gece yarısı|night|midnight", "gündüz|daytime", "sabah*|morning", "akşam*|evening",
    "öğleden sonra|afternoon", "gün batımı|gün batarken|sunset", "gün doğumu|sunrise", "alacakaranlık*|dusk|twilight|dawn",
    "şafak*", "kış|kışın|kış mevsimi|winter", "sonbahar*|autumn", "ilkbahar*|bahar|baharda|bahar mevsimi",
    "yaz mevsimi|yaz günü|summer",
  ]),
  rx("time.decade", "time", "medium", "\\b(?:(?:[5-9]0|(?:19|20)\\d0)\\s*(?:lar|ler)|(?:19|20)\\d0s)\\b"),

  // ---- atmosphere ----------------------------------------------------------
  lex("atmosphere.terms", "atmosphere", "medium", [
    "melankoli*|melankolik*|moody", "huzurlu*|huzur|peaceful|serene", "gizemli*|gizem|mysterious", "dramatik*|dramatic",
    "romantik*|romantic", "nostaljik*|nostalji*|nostalgic", "kasvetli*|gloomy", "karamsar*", "epik*|epic",
    "rüya gibi|rüyamsı|dreamy", "büyülü*|ethereal", "ürpertici*|eerie", "tekinsiz*", "yalnızlık*|loneliness",
    "whimsical", "cozy|sıcacık", "gergin atmosfer|tense",
  ]),
  rx("atmosphere.phrase", "atmosphere", "medium", "\\b([a-z]+)\\s+atmosfer\\w*\\b", { reject: (_f, m) => STOP_ADJECTIVES.has(m[1]) }),

  // ---- motion (video) ------------------------------------------------------
  lex("motion.terms", "motion", "high", [
    "yavaş çekim|slow motion|slow mo", "time lapse|timelapse|hızlandırılmış", "zoom in|yakınlaştırma*", "zoom out|uzaklaştırma*",
    "panning|pan çekim*", "dolly*", "tracking shot|takip çekimi", "kamera hareketi*", "el kamerası|handheld", "drone çekimi|drone shot",
    "steadicam", "crane shot|vinç çekimi", "orbit*", "hızlı kesme*|jump cut",
  ]),

  // ---- audio / music -------------------------------------------------------
  rx("audio.bpm", "audio", "high", "\\b\\d{2,3}\\s?bpm\\b"),
  lex("audio.terms", "audio", "medium", [
    "lo fi|lofi", "jazz*|caz", "rock", "pop", "elektronik müzik|electronic music|edm", "ambient", "orkestra*|orchestral",
    "piyano*|piano", "gitar*|guitar", "davul*|drums", "trap", "hip hop|hiphop", "klasik müzik|classical music", "akustik*|acoustic",
    "enstrümantal*|instrumental", "vokal*|vocals", "melodi*|melody", "ritim*|rhythm", "tempo*", "bas gitar|bass", "synth*",
    "arabesk", "türkü", "rap", "beat",
  ]),

  // ---- technology / tools --------------------------------------------------
  lex("technology.high", "technology", "high", [
    "next.js|nextjs|next js", "react|reactjs|react js", "vue*", "svelte*", "angular*", "typescript*", "javascript*", "python*", "java", "kotlin*",
    "swift", "rust", "golang|go lang", "php", "ruby", "c#", "c++", "node.js|nodejs|node js", "deno", "django", "flask", "fastapi",
    "laravel", "supabase", "firebase", "postgres*|postgresql", "mysql", "mongodb", "redis", "sqlite", "prisma", "drizzle",
    "tailwind*", "bootstrap", "graphql", "trpc", "rest api", "api|apisi|apiyi|apileri", "sql", "docker*", "kubernetes", "aws",
    "azure", "gcp", "vercel", "netlify", "github", "linux", "openai", "chatgpt", "gpt 4o|gpt 4|gpt4|gpt 5", "claude*",
    "midjourney*", "stable diffusion", "dall e|dalle", "photoshop", "figma", "blender", "unreal engine",
    "after effects", "premiere", "davinci resolve", "cinema 4d", "comfyui", "controlnet", "n8n", "zapier", "stripe",
    "react native", "flutter", "expo",
  ]),
  lex("technology.medium", "technology", "medium", ["flux", "lora", "sora", "runway", "kling", "pika", "suno", "udio", "elevenlabs", "gemini", "llama", "mistral"]),

  // ---- platform ------------------------------------------------------------
  lex("platform.terms", "platform", "high", [
    "instagram*", "tiktok*", "youtube*", "linkedin*", "twitter*", "facebook*", "pinterest*", "snapchat*", "whatsapp*", "telegram*",
    "reddit*", "spotify*", "reels", "web sitesi*|website", "landing page", "e ticaret|e commerce", "amazon", "etsy", "trendyol",
    "newsletter", "podcast*", "blog*",
  ]),

  // ---- tone ----------------------------------------------------------------
  lex("tone.terms", "tone", "medium", [
    "samimi*|friendly", "resmi dil|resmi bir dil|resmi üslup|resmi ton*|formal", "profesyonel*|professional", "ciddi*|serious",
    "eğlenceli*|playful", "mizahi*|humorous|esprili*|witty", "motive edici|motivasyonel", "ikna edici|persuasive",
    "sade bir dil|sade dil|simple language", "akademik*|academic", "dostane|casual", "sıcakkanlı*|empathetic", "heyecan verici*|exciting",
    "bilgilendirici*|informative", "ilham verici*|inspirational", "duygusal*|emotional",
  ]),

  // ---- format / length -----------------------------------------------------
  rx("format.duration", "format", "high",
    "\\b\\d+\\s*(?:saniye\\w*|sn\\b|dakika\\w*|dk\\b|seconds?|secs?|minutes?|mins?)", { skipIfClaimed: true }),
  rx("format.count", "format", "high",
    "\\b\\d+\\s*(?:kelime\\w*|karakter\\w*|paragraf\\w*|madde\\w*|satir\\w*|cumle\\w*|sayfa\\w*|slayt\\w*|words?|characters?|paragraphs?|sentences?|pages?|slides?|bullet points?)",
    { skipIfClaimed: true }),
  lex("format.terms", "format", "medium", [
    "blog yazısı*|blog post", "makale*|article", "e posta metni|e posta taslağı|email draft|email copy", "senaryo*|screenplay|script", "hikaye*|story", "slogan*",
    "reklam metni*|ad copy", "tweet*", "thread", "özet|özeti|özetini|summary", "rapor|raporu|report", "sunum*|presentation",
    "liste|listesi|listeler|liste halinde", "tablo*|table", "markdown", "json", "csv", "yaml", "html", "madde madde|maddeler halinde|bullet points",
    "adım adım|step by step", "kod bloğu|code block",
  ]),

  // ---- language ------------------------------------------------------------
  rx("language.cue", "language", "high", `\\b(?:${alt(LANGUAGE_WORDS)})\\s*(?:yaz\\w*|olarak|dilinde|cevap\\w*|yanit\\w*|ver\\w*|olsun|konus\\w*)`),
  rx("language.cueEn", "language", "high", `\\b(?:in|respond in|write in|answer in|reply in)\\s+(?:${alt(LANGUAGE_WORDS_EN)})\\b`),

  // ---- role ----------------------------------------------------------------
  rx("role.tr", "role", "medium", "\\bsen\\s+bir\\s+([a-z][a-z ]{2,40}?)(?=\\s*(?:sin|sun)\\b|\\s*[,.;:\\n]|$)", { group: 1 }),
  rx("role.en", "role", "medium", "\\b(?:you are an?|act as an?|act as)\\s+([a-z][a-z ]{2,40}?)(?=\\s*[,.;:\\n]|$)", { group: 1 }),

  // ---- audience ------------------------------------------------------------
  rx("audience.explicit", "audience", "high", "\\bhedef kitle\\w*\\s*[:=]?\\s*([^,.;\\n!?]{3,50})", { group: 1 }),
  rx("audience.tr", "audience", "medium",
    `\\b((?:(?:genc|yeni)\\s+)?(?:${alt(AUDIENCE_STEMS)})\\w{0,8})\\s+icin\\b`, { group: 1 }),
  rx("audience.en", "audience", "medium", `\\bfor\\s+((?:[a-z]+\\s+)?(?:${alt(AUDIENCE_ENGLISH)}))\\b`, { group: 1 }),

  // ---- location ------------------------------------------------------------
  lex("location.places", "location", "high", [
    "istanbul*", "ankara*", "izmir*", "antalya*", "bursa*", "kapadokya*", "bodrum*", "galata kulesi*", "kapalıçarşı*|kapalicarsi*",
    "boğaz*", "tokyo*", "kyoto*", "seul*|seoul", "pekin*|beijing", "şangay*|shanghai", "hong kong", "bangkok*", "singapur*|singapore",
    "dubai*", "paris*", "londra*|london", "roma|romada|rome", "venedik*|venice", "barselona*|barcelona", "madrid*", "berlin*",
    "amsterdam*", "prag|pragda|prague", "viyana*|vienna", "new york*", "los angeles", "san francisco", "chicago", "miami",
    "las vegas", "toronto", "sidney|sydney", "kahire*|cairo", "marakeş*|marrakech", "moskova*|moscow", "atina|atinada|athens",
    "lizbon*|lisbon", "eyfel*|eiffel", "türkiye*|turkiye|turkey", "japonya*|japan", "italya*", "fransa*", "ispanya*",
    "almanya*", "ingiltere*", "amerika*", "çin|çinde", "mısır|mısırda", "yunanistan*",
  ]),
  lex("location.generic", "location", "medium", [
    "sokak*|street", "cadde*", "orman*|forest", "dağ|dağı|dağda|dağlar|dağlarda|mountain*", "sahil*|plaj*|beach", "çöl|çölde|desert",
    "ofis*|office", "mutfak*|kitchen", "oda|odada|odanın|odası|odalar", "kafe|kafede|kafeler|kafenin|cafe", "restoran*|restaurant",
    "okul*", "hastane*", "kütüphane*|library", "müze*|museum", "şehir*|city", "kasaba*|village", "bahçe*|garden", "havalimanı|airport",
    "istasyon*", "metro", "köprü*|bridge", "çatı|çatıda|rooftop", "sahne|sahnede|stage", "stüdyo*|studio", "uzay|uzayda|uzayın|uzaya|space",
    "gezegen*", "tapınak*|temple", "kale|kalesi|kalede|kaleler|castle", "saray*|palace", "mağara*|cave", "göl|gölde|lake", "nehir*|river",
    "ada|adada|island", "market", "tren istasyonu", "gökdelen*|skyscraper", "lüks otel|otel*|hotel",
  ]),

  // ---- subject -------------------------------------------------------------
  lex("subject.terms", "subject", "medium", ["portre*|portrait", "manzara*|landscape", "natürmort|still life", "ürün çekimi|ürün fotoğraf*|product shot"]),
  lex("subject.objects", "subject", "low", [
    "ürün|ürünü|ürünler*|product", "araba*|otomobil*|car", "bina|binanın|binalar|binada|binası|building", "mimari|mimarisi|architecture", "yemek*|food", "kahve*|coffee",
    "telefon*|phone", "logo", "poster*", "afiş*", "ikon|ikonu|ikonlar|icon", "kapak|kapağı|cover", "maskot*|mascot", "mobilya*|furniture",
    "şişe*|bottle", "saat tasarımı|watch design",
  ]),

  // ---- character (people, creatures) --------------------------------------
  rx("character.noun", "character", "medium",
    `\\b(?:(?:${alt(CHARACTER_ADJECTIVES)})\\s+(?:bir\\s+)?)?(?:(?:${alt(CHARACTER_STEMS)})\\w{0,6}|(?:${alt(CHARACTER_EXACT)}))\\b`),
];

// --- special rule data (used directly by the analyzer) -------------------------

/** Words that end a negative clause: "… olmasın", "… without". Folded. */
export const NEGATIVE_SUFFIX_MARKERS = [
  "olmasin", "olmamali", "bulunmasin", "icermesin", "gorunmesin", "yer almasin", "yer almamali", "kullanma", "kullanmayin",
  "kullanmasin", "istemiyorum", "olmadan", "olmasini istemiyorum",
];
/** Words that start a negative phrase: "no text", "without watermark". Folded. */
export const NEGATIVE_PREFIX_MARKERS = ["no", "without", "avoid", "exclude", "excluding", "do not include", "dont include", "never include"];
/** "negative prompt: …" blocks (Turkish and English). Folded. */
export const NEGATIVE_BLOCK_MARKERS = ["negative prompt", "negatif prompt"];
/** Word boundaries inside a negative list. */
export const LIST_JOINERS = new Set(["ve", "and", "veya", "or", "ile", "ya da"]);
/** Words that stop a backwards walk over a negative clause ("ama", "but"…). */
export const CLAUSE_BREAKERS = new Set(["ama", "ancak", "fakat", "ve", "ile", "but", "however", "and", "ya", "yani"]);

/** Imperative verbs (folded). Turkish ones count only at the END of a clause, English ones at the START. */
export const TASK_VERBS_TR = [
  "yaz", "yazin", "olustur", "olusturun", "hazirla", "hazirlayin", "uret", "uretin", "cevir", "cevirin", "ozetle", "ozetleyin",
  "acikla", "aciklayin", "anlat", "anlatin", "listele", "planla", "tasarla", "kodla", "gelistir", "karsilastir", "oner", "duzelt",
  "iyilestir", "yorumla", "incele", "degerlendir", "ciz", "cizin", "analiz et", "tasvir et",
];
export const TASK_VERBS_EN = [
  "write", "create", "generate", "make", "build", "design", "explain", "summarize", "translate", "list", "draft", "compose",
  "develop", "implement", "refactor", "fix", "analyze", "review", "draw", "illustrate", "describe",
];

/** Gentle fillers that may follow a Turkish imperative ("yaz lütfen"). Folded. */
export const TASK_TRAILERS = new Set(["lutfen", "please", "rica ederim"]);
