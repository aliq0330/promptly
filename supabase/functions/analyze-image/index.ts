// analyze-image — Promptly'nin AI Vision Generator sistemi için Supabase
// Edge Function'ı. Görseli + MIME type'ı alır, Gemini Vision'a gönderir,
// yapılandırılmış JSON döndürür.
//
// Bu dosya, kullanıcının Dashboard'dan paylaştığı çalışan koda dayanıyor —
// davranış (CORS, request/response şekli, analysisPrompt) DEĞİŞTİRİLMEDİ,
// yalnızca production-hardening eklendi (bkz. her bölümün başındaki not):
//   - Model adı artık merkezi bir sabit (GEMINI_MODEL) — değiştirmek için
//     tek satır.
//   - MIME type + görsel/istek gövdesi daha sıkı doğrulanıyor.
//   - Gemini isteğine gerçek bir timeout eklendi (AbortController).
//   - Body parse hatası artık genel 500 yerine net bir 400 dönüyor.
//
// GEMINI_API_KEY hâlâ yalnızca bir Supabase Edge Function Secret — bu
// dosyada literal bir key YOK, repoya asla commit edilmemeli.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Tek, merkezi model sabiti (§12) — Google modeli tekrar değiştirirse
// (ör. "models/gemini-X is no longer available") güncellemesi gereken TEK
// yer burası; hem istek URL'inde hem başarılı response'un "model" alanında
// kullanılıyor, iki yerde aynı string'i elle senkron tutmaya gerek yok.
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Bu proje frontend'de (src/lib/supabase/vision-analysis.ts) de aynı
// listeyi kabul ediyor — iki taraf da senkron, birinde geçerli olan
// diğerinde de geçerli.
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Base64 metninin kabaca gerçek bayt boyutu (4/3 oranı) — frontend zaten
// görseli optimize edip gönderiyor (resizeImageToBlob, max 1600px), ama
// Edge Function bu garantiye KÖRÜ KÖRÜNE güvenmiyor; doğrudan bu endpoint'e
// atılan aşırı büyük bir payload'ı (§13 "request body validation") erken
// reddediyor.
const MAX_BASE64_LENGTH = Math.ceil((15 * 1024 * 1024 * 4) / 3);

// Gemini'ye giden istek sonsuza dek asılı kalmasın diye gerçek bir zaman
// aşımı (§11 "timeout") — Edge Function'ın kendi platform sınırına
// (genelde ~150s) çarpıp anlamsız bir hata vermesindense, burada kontrollü
// ve erken kesiliyor.
const GEMINI_TIMEOUT_MS = 25_000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const analysisPrompt = `
Sen Promptly platformunun görsel analiz motorusun.

Gönderilen görseli çok detaylı şekilde analiz et.

AMAÇ:

Bu görselden Promptly'nin Generator sisteminde kullanılabilecek
yapılandırılmış prompt parametreleri çıkarmaktır.

Görselde gerçekten görülebilen özellikleri analiz et.

Görselde olmayan detayları kesin gerçekmiş gibi uydurma.

Belirsiz veya görselden çıkarılamayan alanları boş bırak.

Özellikle aşağıdaki alanları analiz et:

1. category
2. subject
3. style
4. character
5. face
6. hair
7. eyes
8. eyebrows
9. skin
10. body
11. clothing
12. accessories
13. pose
14. action
15. environment
16. background
17. architecture
18. objects
19. camera
20. composition
21. lighting
22. atmosphere
23. colors
24. photography
25. quality
26. negative_prompt
27. prompt

KARAKTER ANALİZİ:

Görselde insan/karakter varsa mümkün olduğunca analiz et:

- gender presentation
- approximate age
- face shape
- skin appearance
- eye shape
- eye color
- eyebrow shape
- nose shape
- mouth/lips
- hair style
- hair length
- hair color
- body type
- body build
- clothing
- accessories
- pose
- expression

KAMERA ANALİZİ:

- shot type
- camera angle
- camera distance
- lens impression
- depth of field
- focus
- composition
- perspective

IŞIK ANALİZİ:

- lighting type
- light direction
- light intensity
- color temperature
- shadows

ORTAM ANALİZİ:

- location
- background
- weather
- time of day
- atmosphere
- architecture
- visible objects

RENK ANALİZİ:

Görselde baskın olarak görülen renkleri belirt.

Örneğin:

["black", "white", "warm beige", "purple"]

Görselde açıkça görülemeyen renkleri ekleme.

PROMPT:

"prompt" alanında analiz edilen bilgileri doğal,
detaylı ve kaliteli bir görüntü üretim promptuna dönüştür.

Prompt;

- konu
- karakter
- görünüm
- kıyafet
- poz
- ortam
- kamera
- kompozisyon
- ışık
- renk
- stil
- kalite

gibi analiz edilen bilgileri mümkün olduğunca birleştirmelidir.

Ancak görselde bulunmayan özellikleri ekleme.

GENERATOR UYUMLULUĞU:

Değerleri mümkün olduğunca standart,
kısa ve Generator alanlarına aktarılabilir şekilde üret.

Örneğin göz rengi görselde açıkça yeşil görünüyorsa:

"color": "green"

kullan.

Göz rengi belirsizse:

"color": ""

kullan.

Benzer şekilde diğer alanlarda da tahmin yapmak yerine
görsel kanıtına öncelik ver.

ÇIKTI FORMATI:

Çıktıyı SADECE GEÇERLİ JSON olarak ver.

Markdown kullanma.

Kod bloğu kullanma.

Açıklama yazma.

JSON yapısı:

{
  "category": "",
  "subject": {
    "type": "",
    "description": ""
  },
  "style": {
    "name": "",
    "details": []
  },
  "character": {
    "gender": "",
    "age": "",
    "face": {
      "shape": "",
      "skin": "",
      "eyes": {
        "shape": "",
        "color": ""
      },
      "eyebrows": "",
      "nose": "",
      "mouth": ""
    },
    "hair": {
      "style": "",
      "length": "",
      "color": ""
    },
    "body": {
      "type": "",
      "build": ""
    }
  },
  "clothing": [],
  "accessories": [],
  "pose": "",
  "action": "",
  "environment": {
    "location": "",
    "background": "",
    "weather": "",
    "time_of_day": ""
  },
  "objects": [],
  "camera": {
    "shot_type": "",
    "angle": "",
    "distance": "",
    "lens": "",
    "focus": "",
    "depth_of_field": ""
  },
  "composition": {
    "framing": "",
    "subject_position": "",
    "perspective": ""
  },
  "lighting": {
    "type": "",
    "direction": "",
    "intensity": "",
    "temperature": "",
    "shadows": ""
  },
  "colors": [],
  "quality": "",
  "negative_prompt": [],
  "prompt": ""
}

Tekrar:

- Görselde olmayan bilgileri uydurma.
- Belirsiz alanları boş bırak.
- Görselde gerçekten görülebilen bilgileri mümkün olduğunca detaylandır.
- JSON dışına hiçbir şey yazma.
`;

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

    // Request body — (§13/§36) JSON parse hatası artık genel 500'e değil,
    // net bir 400'e düşüyor; önceki davranışta bu da dıştaki genel
    // catch'e takılıp "Sunucu tarafında beklenmeyen hata oluştu" diyordu,
    // ki bu gerçek bir sunucu hatası değil, istemcinin gönderdiği
    // gövdenin bozuk olmasıydı.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Geçersiz istek gövdesi — geçerli bir JSON bekleniyor." }, 400);
    }

    const image = body.image;
    const mimeType = typeof body.mimeType === "string" && body.mimeType.trim() ? body.mimeType : "image/jpeg";

    // Görsel kontrolü — (§13) artık yalnızca "var mı" değil, gerçekten bir
    // string mi de kontrol ediliyor.
    if (!image || typeof image !== "string") {
      return jsonResponse({ error: "Görsel gönderilmedi." }, 400);
    }

    // MIME type doğrulaması (§15/§16 "invalid_image" kategorisi).
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

    // =========================================================
    // GEMINI — model adı GEMINI_MODEL sabitinden geliyor (§12)
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
      // (§11/§16 "timeout" kategorisi) AbortController süresi dolunca
      // fetch bir AbortError fırlatır — bunu gerçek bir ağ hatasından
      // ayırt edip net bir "timeout" mesajı dönüyoruz.
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
    return jsonResponse({ success: true, model: GEMINI_MODEL, data: result }, 200);
  } catch (error) {
    console.error("Unexpected Error:", error);
    return jsonResponse(
      { error: "Sunucu tarafında beklenmeyen hata oluştu.", details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
