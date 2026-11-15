/**
 * Anlamsal sürüm (MAJOR.MINOR.PATCH) yardımcıları (docs/history/389-*). Saf, bağımlılıksız (Node + tarayıcı + Edge). Ön ek/ek bilgi (`-beta`, `+build`)
 * desteklenmez: veritabanı kısıtı yalnız `^[0-9]+\.[0-9]+\.[0-9]+$` kabul eder. Sayılar 9 haneyi aşamaz (karşılaştırma güvenli kalsın).
 */
export type SemverBump = "patch" | "minor" | "major";

const PATTERN = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;

export function parseSemver(value: string): [number, number, number] | null {
  const match = PATTERN.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isValidSemver(value: string): boolean {
  return value.length <= 32 && parseSemver(value) !== null;
}

/** Sayısal karşılaştırma: `1.10.0 > 1.9.0`. Geçersiz değer en küçük sayılır. Negatif / 0 / pozitif döner. */
export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a) ?? [-1, -1, -1];
  const right = parseSemver(b) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** En yüksek sürüm (yoksa `null`). */
export function latestSemver(versions: readonly string[]): string | null {
  let best: string | null = null;
  for (const version of versions) {
    if (parseSemver(version) && (best === null || compareSemver(version, best) > 0)) best = version;
  }
  return best;
}

/** `1.2.3` → patch `1.2.4`, minor `1.3.0`, major `2.0.0`. Geçersiz girdi `1.0.0` başlangıcına düşer. */
export function bumpSemver(version: string, bump: SemverBump): string {
  const parsed = parseSemver(version);
  if (!parsed) return "1.0.0";
  const [major, minor, patch] = parsed;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
