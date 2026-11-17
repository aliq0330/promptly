import { SKILL_LIMITS } from "./limits.ts";
import type { PackageEntry } from "./package-build.ts";

/**
 * ZIP baytlarını üretir (docs/history/389-*). ZIP kütüphanesi (`fflate`) DIŞARIDAN verilir: bu dosya bağımlılıksız kalır ve Edge'e olduğu gibi kopyalanır;
 * Edge `npm:fflate`, tarayıcı/test `fflate` verir. Yayın BİR KEZ derlenir ve değişmezdir: çıktı yalnız içeriğe bağlıdır (sabit zaman damgası), yani aynı
 * içerik aynı baytları ve aynı `sha256`'yı verir (içerik adresli paket yolu buna dayanır; zaman dilimi sabit olmalıdır — Edge UTC'dir).
 */
type ZipEntry = [Uint8Array, { level: 1 | 6; mtime: number }];
export type ZipSync = (data: Record<string, ZipEntry>) => Uint8Array;

/** 1980-01-01 00:00:00 UTC (ZIP'in en erken zaman damgası). */
export const ZIP_FIXED_MTIME = Date.UTC(1980, 0, 1);

export class SkillPackageTooLargeError extends Error {
  readonly size: number;
  constructor(size: number) {
    super("skill_package_too_large");
    this.size = size;
  }
}

/**
 * Bu toplam açılmış boyutun (bayt) üstündeki paketler hızlı sıkıştırılır (docs/history/416-*). Ölçüm (Node 22, 8 × 5 MB metin = en kötü durum): seviye 6 ≈ 2,7 sn CPU / 4,8 MB ZIP, seviye 1 ≈ 0,66 sn / 7,3 MB.
 * Edge Function'ın istek başına CPU süresi sınırlıdır; küçük/orta paketler (olağan durum) seviye 6'da kalır, yalnız sınıra yakın büyük paketler seviye 1'e düşer. Seçim yalnız içeriğe bağlıdır → aynı içerik yine aynı baytları verir.
 */
export const FAST_COMPRESSION_ABOVE_BYTES = 4 * 1024 * 1024;

/** Dosyalar `{slug}/…` klasörü altına konur (Claude gibi araçlar tek üst klasör bekler). */
export function createPackageZip(slug: string, entries: readonly PackageEntry[], zipSync: ZipSync): Uint8Array {
  const data: Record<string, ZipEntry> = {};
  const level = entries.reduce((sum, entry) => sum + entry.bytes.length, 0) > FAST_COMPRESSION_ABOVE_BYTES ? 1 : 6;
  for (const entry of entries) data[`${slug}/${entry.path}`] = [entry.bytes, { level, mtime: ZIP_FIXED_MTIME }];
  const zip = zipSync(data);
  if (zip.length > SKILL_LIMITS.maxZipBytes) throw new SkillPackageTooLargeError(zip.length);
  return zip;
}
