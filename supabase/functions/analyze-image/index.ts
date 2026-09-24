// analyze-image — Promptly'nin ORTAK Image Analysis Edge Function'ı. Görseli
// + bir `mode` + o moda özel `context` alır, Gemini Vision'a mode'a göre
// FARKLI bir sistem talimatıyla gönderir, yapılandırılmış JSON döndürür.
//
// Bu, önceki (yalnızca Generator'a özel, tek amaçlı) sürümün yerini alıyor —
// production-hardening (CORS, model sabiti, MIME/boyut doğrulaması, timeout,
// hata kategorileri) TAMAMEN KORUNDU, yalnızca istek/yanıt şekli üç moda göre
// genelleştirildi:
//   - mode: "generator_builder" — Generator Builder'ın "Görselden Alanları
//     Doldur"u: gönderilen GERÇEK alan listesine göre mapping + eksik alan
//     önerisi.
//   - mode: "prompt_builder" — düz prompt oluşturma sayfasının "Görselden
//     İlham Al"ı: analiz özeti + prompt/negatif prompt.
//   - mode: "prompt_request" — prompt isteği oluşturmanın (yalnızca içerik
//     türü Görsel'ken) yardımcısı: analiz özeti + istek alanı önerileri +
//     önerilen açıklama.
//
// GEMINI_API_KEY hâlâ yalnızca bir Supabase Edge Function Secret — bu
// dosyada literal bir key YOK, repoya asla commit edilmemeli.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Tek, merkezi model sabiti — Google modeli tekrar değiştirirse güncellemesi
// gereken TEK yer burası; hem istek URL'inde hem başarılı response'un
// "model" alanında kullanılıyor.
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Bu proje frontend'de (src/lib/supabase/image-analysis.ts) de aynı listeyi
// kabul ediyor — iki taraf da senkron, birinde geçerli olan diğerinde de
// geçerli.
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Base64 metninin kabaca gerçek bayt boyutu (4/3 oranı) — frontend zaten
// görseli optimize edip gönderiyor (resizeImageToBlob, max 1600px), ama Edge
// Function bu garantiye KÖRÜ KÖRÜNE güvenmiyor.
const MAX_BASE64_LENGTH = Math.ceil((15 * 1024 * 1024 * 4) / 3);

// Gemini'ye giden istek sonsuza dek asılı kalmasın diye gerçek bir zaman
// aşımı.
const GEMINI_TIMEOUT_MS = 25_000;

type ImageAnalysisMode = "generator_builder" | "prompt_builder" | "prompt_request";
const VALID_MODES: ImageAnalysisMode[] = ["generator_builder", "prompt_builder", "prompt_request"];

interface GeneratorBuilderFieldContext {
  key?: unknown;
  label?: unknown;
  type?: unknown;
  options?: unknown;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** `generator_builder` — Generator Builder'ın gönderdiği GERÇEK generator meta bilgisi + GERÇEK, creator-tanımlı alan listesine göre bir eşleme+öneri talimatı üretir. Sabit "subject/style/character" gibi hiçbir alan hiçbir yerde varsayılmıyor — her şey `context.fields`'ten geliyor. */
function buildGeneratorBuilderPrompt(context: unknown): string {
  const ctx = (context ?? {}) as {
    generator?: { name?: unknown; description?: unknown; category?: unknown };
    fields?: unknown;
  };
  const generator = ctx.generator ?? {};
  const rawFields = Array.isArray(ctx.fields) ? (ctx.fields as GeneratorBuilderFieldContext[]) : [];

  const fieldLines =
    rawFields.length > 0
      ? rawFields
          .map((f) => {
            const key = asString(f.key);
            const label = asString(f.label);
            const type = asString(f.type, "text");
            const options = asStringArray(f.options);
            if (!key) return null;
            const optionsPart = options.length > 0 ? `, options: [${options.map((o) => `"${o}"`).join(", ")}]` : "";
            return `- key: "${key}", label: "${label || key}", type: "${type}"${optionsPart}`;
          })
          .filter((line): line is string => Boolean(line))
          .join("\n")
      : "(Bu generatorda henüz hiç alan yok.)";

  return `
Sen Promptly platformunun Generator Builder'ı için görsel analiz motorusun.

GENERATOR BİLGİSİ:
İsim: ${asString(generator.name, "(belirtilmemiş)")}
Açıklama: ${asString(generator.description, "(belirtilmemiş)")}
Kategori: ${asString(generator.category, "(belirtilmemiş)")}

MEVCUT ALANLAR:
${fieldLines}

GÖREV:

1. Gönderilen görseli detaylı analiz et.
2. Görselde GERÇEKTEN görülen bilgileri, YUKARIDAKİ mevcut alanlarla eşleştir.
   Yalnızca yukarıdaki listede verilen "key" değerlerini kullan (örn.
   "hair_color") — icat edilmiş/başka bir isim ASLA kullanma.
   select/radio/multi_select tipindeki bir alan için SADECE o alanın
   "options" listesindeki değerlerden birini yaz — listede olmayan bir
   değer asla uydurma.
   Görselden çıkarılamayan/belirsiz alanları "mappedValues" içine hiç ekleme.
3. Görselde, mevcut alanların KAPSAMADIĞI ama bu generator için gerçekten
   anlamlı olan (görselde açıkça görülen) yeni özellikler varsa, en fazla 6
   tane yeni alan öner. Zaten var olan bir alanla aynı/çok benzer bir alanı
   ASLA tekrar önerme.
   Her öneri için YALNIZCA şu tiplerden birini kullan: "text", "select",
   "multi_select", "color", "number". "select" veya "multi_select"
   öneriyorsan görselden çıkardığın 2-6 gerçek seçenek ekle (options).
4. Anlamlı hiçbir yeni alan yoksa "suggestedFields" dizisini boş bırak.

Görselde olmayan bilgileri kesinlikle uydurma. Belirsiz alanları boş bırak.

ÇIKTIYI YALNIZCA GEÇERLİ JSON OLARAK VER. Markdown kullanma. Kod bloğu
kullanma. Açıklama yazma.

JSON yapısı:
{
  "mappedValues": { "<field_key>": "<değer>" },
  "suggestedFields": [
    { "label": "", "type": "text", "options": [] }
  ]
}
`;
}

/** `prompt_builder` — düz prompt oluşturma sayfasının görsel yardımcısı. Generator şeması/field mapping'iyle HİÇ ilgisi yok; amaç doğrudan bir image-generation promptu üretmek. */
function buildPromptBuilderPrompt(): string {
  return `
Sen Promptly platformunun Prompt Oluşturma yardımcısı için görsel analiz
motorusun.

Gönderilen görseli analiz et: konu, karakter, stil, kompozisyon, renkler,
ışık, ortam, arka plan, kamera açısı/perspektifi, atmosfer, materyaller,
görsel estetik.

Görselde gerçekten görülebilen özellikleri analiz et. Görselde olmayan
detayları uydurma. Belirsiz olan hiçbir şeyi analiz özetine ekleme.

GÖREV:

1. "analysis" alanında, kullanıcıya gösterilecek KISA ve OKUNABİLİR bir
   özet ver — ham teknik rapor değil. Yalnızca görselde gerçekten
   belirgin olan 4-8 özelliği, kısa Türkçe anahtar/değer çiftleri olarak
   ver (örn. "Konu", "Stil", "Işık", "Arka Plan", "Kompozisyon", "Renk").
2. "prompt" alanında, analiz edilen bilgileri birleştirip yüksek kaliteli,
   İngilizce, image-generation için optimize edilmiş, doğal akan tek bir
   prompt metni oluştur (konu, karakter, görünüm, kıyafet, poz, ortam,
   kamera, kompozisyon, ışık, renk, stil, kalite gibi analiz edilen
   bilgileri mümkün olduğunca birleştir). Görselde bulunmayan özellikleri
   ekleme.
3. "negativePrompt" alanında, varsa görselde AÇIKÇA kaçınılması gereken
   birkaç kısa terim ver (İngilizce, virgülle ayrılmış); anlamlı bir şey
   yoksa boş string bırak.

ÇIKTIYI YALNIZCA GEÇERLİ JSON OLARAK VER. Markdown kullanma. Kod bloğu
kullanma. Açıklama yazma.

JSON yapısı:
{
  "analysis": { "Konu": "", "Stil": "" },
  "prompt": "",
  "negativePrompt": ""
}
`;
}

/** `prompt_request` — yalnızca içerik türü "Görsel" seçiliyken kullanılan istek yardımcısı. Amaç ne bir Generator ne doğrudan nihai bir prompt — kullanıcının "başka birinden nasıl bir prompt istediğini" tarif etmesine yardımcı olmak. */
function buildPromptRequestPrompt(): string {
  return `
Sen Promptly platformunun Prompt İsteği oluşturma yardımcısı için görsel
analiz motorusun.

Gönderilen görseli analiz et: konu, stil, kompozisyon, renk, ışık, karakter,
kıyafet, ortam, arka plan, önemli detaylar.

Amacın bir Generator oluşturmak DEĞİL, doğrudan nihai bir prompt üretmek de
DEĞİL — kullanıcının, bu görsele benzer bir çalışma için BAŞKA bir
kullanıcıdan nasıl bir prompt istediğini daha kolay tarif edebilmesine
yardımcı olmak.

Görselde gerçekten görülebilen özellikleri analiz et, olmayanı uydurma.

GÖREV:

1. "analysis" alanında, kullanıcıya gösterilecek kısa, okunabilir bir özet
   ver (4-8 Türkçe anahtar/değer çifti, örn. "Konu", "Stil", "Renk Paleti").
2. "suggestedFields" alanında, aşağıdaki dört alan için (yalnızca görselden
   gerçekten çıkarılabiliyorsa) kısa, Türkçe öneriler ver: "style" (istenen
   stil), "subject" (istenen konu), "colorPalette" (renk paleti), "details"
   (özel detaylar — virgülle ayrılmış kısa liste). Çıkarılamayan bir alanı
   tamamen atla (obje içine hiç ekleme).
3. "suggestedDescription" alanında, kullanıcının bir Prompt İsteği
   açıklaması olarak doğrudan kullanabileceği, 2-4 cümlelik, Türkçe, bu
   görsele benzer bir çalışma istediğini anlatan bir paragraf yaz.

ÇIKTIYI YALNIZCA GEÇERLİ JSON OLARAK VER. Markdown kullanma. Kod bloğu
kullanma. Açıklama yazma.

JSON yapısı:
{
  "analysis": { "Konu": "" },
  "suggestedFields": { "style": "", "subject": "", "colorPalette": "", "details": "" },
  "suggestedDescription": ""
}
`;
}

function buildPromptForMode(mode: ImageAnalysisMode, context: unknown): string {
  switch (mode) {
    case "generator_builder":
      return buildGeneratorBuilderPrompt(context);
    case "prompt_builder":
      return buildPromptBuilderPrompt();
    case "prompt_request":
      return buildPromptRequestPrompt();
  }
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Gemini API key kontrolü
    if (!GEMINI_API_KEY) {
      return jsonResponse({ error: "GEMINI_API_KEY bulunamadı." }, 500);
    }

    // Sadece POST
    if (req.method !== "POST") {
      return jsonResponse({ error: "Sadece POST isteği kabul edilir." }, 405);
    }

    // Request body — JSON parse hatası net bir 400'e düşüyor (genel 500
    // yerine); bu gerçek bir sunucu hatası değil, istemcinin gönderdiği
    // gövdenin bozuk olması.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Geçersiz istek gövdesi — geçerli bir JSON bekleniyor." }, 400);
    }

    const mode = typeof body.mode === "string" ? (body.mode as ImageAnalysisMode) : null;
    if (!mode || !VALID_MODES.includes(mode)) {
      return jsonResponse(
        { error: `Geçersiz mode. "generator_builder", "prompt_builder" veya "prompt_request" olmalı.` },
        400,
      );
    }

    const image = body.image;
    const mimeType = typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType : "image/jpeg";

    // Görsel kontrolü — yalnızca "var mı" değil, gerçekten bir string mi de
    // kontrol ediliyor.
    if (!image || typeof image !== "string") {
      return jsonResponse({ error: "Görsel gönderilmedi." }, 400);
    }

    // MIME type doğrulaması.
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return jsonResponse(
        { error: `Desteklenmeyen görsel formatı: ${mimeType}. Yalnızca JPEG, PNG veya WebP destekleniyor.` },
        400,
      );
    }

    // Base64 başındaki data:image/...;base64, kısmını temizle
    const base64Image = image.includes(",") ? image.split(",")[1] : image;

    if (!base64Image || base64Image.length === 0) {
      return jsonResponse({ error: "Görsel boş." }, 400);
    }
    if (base64Image.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: "Görsel çok büyük." }, 400);
    }

    const analysisPrompt = buildPromptForMode(mode, body.context);

    // =========================================================
    // GEMINI — model adı GEMINI_MODEL sabitinden geliyor
    // =========================================================

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), GEMINI_TIMEOUT_MS);

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: timeoutController.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Image } },
                { text: analysisPrompt },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
    } catch (fetchError) {
      // AbortController süresi dolunca fetch bir AbortError fırlatır — bunu
      // gerçek bir ağ hatasından ayırt edip net bir "timeout" mesajı
      // dönüyoruz.
      const isTimeout = fetchError instanceof Error && fetchError.name === "AbortError";
      console.error(isTimeout ? "Gemini API timeout" : "Gemini API network error", fetchError);
      return jsonResponse(
        {
          error: isTimeout ? "Görsel analizi zaman aşımına uğradı." : "Gemini API'ye ulaşılamadı.",
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
        },
        isTimeout ? 504 : 502,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Gemini hata kontrolü
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API Error:", errorText);
      return jsonResponse({ error: "Gemini API hatası", status: geminiResponse.status, details: errorText }, 500);
    }

    // Gemini response
    const geminiData = await geminiResponse.json();

    // Gemini'den gelen text
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Gemini response:", JSON.stringify(geminiData));
      return jsonResponse({ error: "Gemini geçerli bir analiz döndürmedi.", response: geminiData }, 500);
    }

    // JSON parse
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Gemini Raw Text:", text);
      return jsonResponse({ error: "Gemini JSON formatında sonuç döndürmedi.", raw: text }, 500);
    }

    // Başarılı response
    return jsonResponse({ success: true, mode, model: GEMINI_MODEL, data: result }, 200);
  } catch (error) {
    console.error("Unexpected Error:", error);
    return jsonResponse(
      { error: "Sunucu tarafında beklenmeyen hata oluştu.", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
