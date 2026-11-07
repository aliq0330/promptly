/**
 * Ekip dili (docs/history/351-*): ekip = "tamamen kapalı" topluluk; ekip sayfasının derin sekmelerinde (Hakkında, Üyeler, Yönetim, pencereler)
 * "topluluk" geçen her ŞABLON metin, parametreler doldurulmadan ÖNCE "ekip" diline çevrilir — kullanıcı içeriği (ekip adı, açıklama) şablona sonradan
 * girdiği için asla çevrilmez. Türkçede ek uyumu (topluluğu→ekibi, toplulukta→ekipte, toplulukları→ekipleri) kurala bağlıdır; İngilizcede
 * community→team. Yeni bir metin için özel karşılık gerekirse `<anahtar>.team` girdisi eklenir (öncelik onundur, bkz. `TeamLanguageScope`).
 */
import type { Language } from "./translations";

const FRONT: Record<string, string> = { a: "e", "ı": "i", o: "e", u: "i", "ö": "e", "ü": "i" };
/** Ek ünlülerini "ekip" sözcüğünün ince-düz uyumuna çevirir: a→e, ı→i, o→e, u→i, ö→e, ü→i. */
function harmonize(suffix: string): string {
  return suffix.replace(/[aıouöü]/g, (v) => FRONT[v] ?? v);
}

function turkish(text: string): string {
  // "topluluğ" + ünlüyle başlayan ek (topluluğu, topluluğun, topluluğunda…) → "ekib" + uyumlu ek.
  let out = text.replace(/(?<!\p{L})([Tt])opluluğ(\p{L}*)/gu, (_m, t: string, rest: string) => `${t === "T" ? "E" : "e"}kib${harmonize(rest)}`);
  // "topluluk" + ünsüzle başlayan ek ya da yalın (topluluk, toplulukta, topluluktan, topluluklar, toplulukları…) → "ekip" + uyumlu ek.
  out = out.replace(/(?<!\p{L})([Tt])opluluk(\p{L}*)/gu, (_m, t: string, rest: string) => `${t === "T" ? "E" : "e"}kip${harmonize(rest)}`);
  return out;
}

function english(text: string): string {
  return text.replace(/(?<![\w-])([Cc])ommunit(y|ies)(?![\w-])/g, (_m, c: string, form: string) => {
    const team = form === "y" ? "team" : "teams";
    return c === "C" ? `T${team.slice(1)}` : team;
  });
}

/** Bir şablon metni ekip diline çevirir (yalnız "topluluk/community" sözcükleri; başka hiçbir şeye dokunmaz). */
export function teamWording(text: string, language: Language): string {
  return language === "tr" ? turkish(text) : english(text);
}
