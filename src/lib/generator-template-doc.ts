/**
 * Generator prompt şablonu — `src/lib/prompt-doc.ts`'in jenerik belge
 * modelinin Generator'a özgü katmanı. Saf ve DOM'suz (yalnızca tip import'u).
 *
 * İKİ biçim vardır:
 *  - KANONİK (veritabanında, `generator_versions.template` JSONB'sinde):
 *    alanlar **anahtarla** (`key`) bağlanır → `Profesyonel bir {{stil}} tarzında`.
 *    Anahtar değişmediği sürece alanın görünen adı değişse bile her kullanım
 *    kendiliğinden doğru kalır (yeniden adlandırma güvenli).
 *  - GÖRÜNEN (düzenleyicide): aynı jeton alanın **adıyla** gösterilir →
 *    `Profesyonel bir {Stil} tarzında`. Düzenleyicinin metni = görünen metin;
 *    kanonik ↔ görünen dönüşümü her değişiklikte iki yönde yapılır.
 *
 * Aynı alan şablonda birden çok yerde geçebilir. Yinelenen adlar görünen
 * metinde "Stil", "Stil (2)" gibi ayrıştırılır; böylece
 * `toDisplayText(fromDisplayText(d)) === d` her zaman geçerlidir (imleç
 * konumu bozulmaz).
 */

import type { GeneratorField, GeneratorTemplate, GeneratorValues } from "@/types";

const CANONICAL_TOKEN = /\{\{([^{}\n]+)\}\}/g;
const DISPLAY_TOKEN = /\{([^{}\n]+)\}/g;

function cleanName(raw: string): string {
  return raw.replace(/[{}\n]/g, " ").replace(/\s+/g, " ").trim();
}

/** Her alan anahtarı için benzersiz görünen ad (etiket; boşsa anahtar; çakışırsa " (2)", " (3)"…). */
export function fieldDisplayNames(fields: Pick<GeneratorField, "key" | "label" | "order">[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  const ordered = [...fields].sort((a, b) => a.order - b.order);
  for (const field of ordered) {
    const base = cleanName(field.label) || cleanName(field.key) || field.key;
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base} (${n})`;
      n += 1;
    }
    used.add(candidate);
    names.set(field.key, candidate);
  }
  return names;
}

/** Kanonik `{{anahtar}}` → görünen `{Ad}`. Bilinmeyen anahtar `{anahtar}` olarak kalır (yetim jeton). */
export function toDisplayText(canonical: string, fields: Pick<GeneratorField, "key" | "label" | "order">[]): string {
  const names = fieldDisplayNames(fields);
  return canonical.replace(CANONICAL_TOKEN, (_match, key: string) => `{${names.get(key) ?? key}}`);
}

/** Görünen `{Ad}` → kanonik `{{anahtar}}`. Eşleşmeyen jetonlar olduğu gibi kalır. */
export function fromDisplayText(display: string, fields: Pick<GeneratorField, "key" | "label" | "order">[]): string {
  const names = fieldDisplayNames(fields);
  const byName = new Map<string, string>();
  for (const [key, name] of names) byName.set(name, key);
  return display.replace(DISPLAY_TOKEN, (match, name: string) => {
    const key = byName.get(name);
    return key ? `{{${key}}}` : match;
  });
}

/** Kanonik metinde geçen tüm alan anahtarları (ilk görünme sırasıyla, tekil). */
export function templateKeys(canonical: string): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const match of canonical.matchAll(CANONICAL_TOKEN)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      keys.push(match[1]);
    }
  }
  return keys;
}

/** Bir alanın şablonda kaç yerde kullanıldığı. */
export function templateUsageCount(canonical: string, key: string): number {
  let count = 0;
  for (const match of canonical.matchAll(CANONICAL_TOKEN)) if (match[1] === key) count += 1;
  return count;
}

/** Bir alanı silerken şablondaki tüm kullanımlarını kontrollü kaldırır (çevre boşluğu toparlanır). */
export function removeFieldFromTemplate(canonical: string, key: string): string {
  const targets = [...canonical.matchAll(CANONICAL_TOKEN)].filter((match) => match[1] === key);
  let result = canonical;
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const match = targets[i];
    let start = match.index ?? 0;
    let end = start + match[0].length;
    const before = result[start - 1];
    const after = result[end];
    if (before === " " && (after === " " || after === undefined || after === "\n" || /[,.;:!?]/.test(after))) {
      start -= 1;
    } else if (after === " " && (before === undefined || before === "\n")) {
      end += 1;
    }
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

/** Şablonda artık var olmayan bir alana işaret eden anahtarlar. */
export function orphanTemplateKeys(canonical: string, fields: Pick<GeneratorField, "key">[]): string[] {
  const known = new Set(fields.map((field) => field.key));
  return templateKeys(canonical).filter((key) => !known.has(key));
}

/**
 * Bir alanın o anki değerinin cümle içinde geçecek kısa metni (yalnızca
 * değer, "Etiket:" öneki YOK): seçimlerde seçeneğin görünen adı, çoklu
 * seçimde virgülle birleşimi, açık bir checkbox/toggle'da alanın adı.
 * Gerçekten boşsa null.
 */
export function fieldValueText(field: GeneratorField, values: GeneratorValues): string | null {
  const raw = values[field.key];
  const label = field.label?.trim() || field.key;
  switch (field.type) {
    case "select":
    case "radio": {
      const value = Array.isArray(raw) ? "" : (raw ?? "").trim();
      if (!value) return null;
      return field.options.find((option) => option.value === value)?.label ?? value;
    }
    case "multi_select": {
      const list = Array.isArray(raw) ? raw.filter((item) => item.trim().length > 0) : [];
      if (list.length === 0) return null;
      return list.map((value) => field.options.find((option) => option.value === value)?.label ?? value).join(", ");
    }
    case "checkbox":
    case "toggle": {
      const value = Array.isArray(raw) ? "" : (raw ?? "");
      return value === "true" ? label : null;
    }
    default: {
      const value = (Array.isArray(raw) ? "" : (raw ?? "")).trim();
      return value.length > 0 ? value : null;
    }
  }
}

export type RenderedTemplateSegment =
  | { kind: "text"; text: string }
  | { kind: "value"; key: string; text: string }
  | { kind: "placeholder"; key: string; text: string };

/**
 * Şablonu mevcut değerlerle çözer.
 *  - Dolu alan → değeri.
 *  - Boş (ama görünür) alan → `[Etiket]` yer tutucusu: alan sessizce
 *    silinmez, promptun anlamı bozulmaz, eksik olduğu görünür kalır.
 *  - Koşulu sağlanmayan (gizli) alan ya da kapalı toggle/checkbox → kasıtlı
 *    olarak yok sayılır, çevre boşluğu toparlanır.
 *  - Şemada bulunmayan anahtar → aynen bırakılır (`{{anahtar}}`).
 * `isVisible` dışarıdan verilir (bu dosya koşul mantığını yinelemez).
 */
export function renderTemplateDoc(
  canonical: string,
  fields: GeneratorField[],
  values: GeneratorValues,
  isVisible: (field: GeneratorField, values: GeneratorValues) => boolean,
): { text: string; segments: RenderedTemplateSegment[] } {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const raw: RenderedTemplateSegment[] = [];
  let cursor = 0;
  for (const match of canonical.matchAll(CANONICAL_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) raw.push({ kind: "text", text: canonical.slice(cursor, index) });
    cursor = index + match[0].length;
    const key = match[1];
    const field = byKey.get(key);
    if (!field) {
      raw.push({ kind: "text", text: match[0] });
      continue;
    }
    if (!isVisible(field, values)) continue; // gizli alan: kaldır
    const text = fieldValueText(field, values);
    if (text !== null) {
      raw.push({ kind: "value", key, text });
    } else if (field.type === "checkbox" || field.type === "toggle") {
      continue; // kapalı toggle: kaldır
    } else {
      raw.push({ kind: "placeholder", key, text: `[${field.label?.trim() || field.key}]` });
    }
  }
  if (cursor < canonical.length) raw.push({ kind: "text", text: canonical.slice(cursor) });

  // Kaldırılan jetonların bıraktığı boşluğu YALNIZCA birleşme noktasında
  // toparla (yazarın kendi metnindeki boşluklara dokunma).
  const segments: RenderedTemplateSegment[] = [];
  for (const segment of raw) {
    const previous = segments[segments.length - 1];
    if (segment.kind === "text" && previous && previous.kind === "text") {
      const a = previous.text;
      const b = segment.text;
      previous.text =
        a.endsWith(" ") && (b.startsWith(" ") || /^[,.;:!?]/.test(b)) ? a.slice(0, -1) + b : a + b;
      continue;
    }
    segments.push({ ...segment });
  }
  const text = segments.map((segment) => segment.text).join("");
  return { text, segments };
}

/** Şablon JSONB'sindeki prompt şablonu metni (ilk bölüm; yoksa boş). */
export function getTemplateText(template: GeneratorTemplate | null | undefined): string {
  return template?.sections?.[0]?.content ?? "";
}

/** Prompt şablonu metnini ilk bölüme yazar (bölüm yoksa oluşturur; kimlik/başlık korunur). */
export function withTemplateText(template: GeneratorTemplate, text: string): GeneratorTemplate {
  const [first, ...rest] = template.sections ?? [];
  if (!first) {
    return { sections: [{ id: "section-prompt", title: "Prompt", content: text, order: 0, enabled: true }] };
  }
  return { ...template, sections: [{ ...first, content: text }, ...rest] };
}
