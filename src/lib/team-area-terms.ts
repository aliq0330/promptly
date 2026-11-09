import type { Language } from "@/lib/i18n/translations";

/**
 * Ekip alanında (proje/dosya içeriği) Space motorunun metinleri "Space" der; ekipte bu kavram yoktur (docs/history/363-*). `LanguageTermScope`
 * çeviriyi HAM metin üzerinden yeniden yazar (kullanıcının yazdığı ad gibi `{{param}}` değerlerine dokunulmaz):
 * Türkçe'de "Space'e/'ten/'te/'i/'in/'ler…" ek uyumuyla "alana/alandan/alanda/alanı/alanın/alanlar…", İngilizce'de "a Space" → "an area".
 * Cümle başındaki büyük harf korunur; klavye tuşu olan "Space + sürükle" dokunulmaz bırakılır.
 */
function trSuffix(rest: string): string {
  if (/^(?:ten|den)/.test(rest)) return rest.replace(/^(?:ten|den)/, "dan");
  if (/^(?:te|de)/.test(rest)) return rest.replace(/^(?:te|de)/, "da");
  // "alan" art ünlülüdür: ön ünlüler art ünlüye döner (e→a, i→ı, ü→u, ö→o).
  return rest.replace(/e/g, "a").replace(/i/g, "ı").replace(/ü/g, "u").replace(/ö/g, "o");
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const atSentenceStart = (text: string, offset: number) => offset === 0 || /[.!?]\s$/.test(text.slice(0, offset));

export function rewriteAreaTerms(text: string, language: Language): string {
  if (!text.includes("Space")) return text;
  if (language === "tr") {
    return text.replace(/Spaces?(?:['’]([a-zçğıöşü]+))?(?! \+)/g, (match, suffix: string | undefined, offset: number) => {
      const out = (match.startsWith("Spaces") ? "alanlar" : "alan") + (suffix ? trSuffix(suffix) : "");
      return atSentenceStart(text, offset) ? capitalize(out) : out;
    });
  }
  return text
    .replace(/\b([Aa]) Space\b(?! \+)/g, (_match, article: string) => `${article}n area`)
    .replace(/Spaces?\b(?! \+)/g, (match, offset: number) => {
      const out = match === "Spaces" ? "areas" : "area";
      return atSentenceStart(text, offset) ? capitalize(out) : out;
    });
}
