import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync } from "fflate";
import { FAST_COMPRESSION_ABOVE_BYTES, createPackageZip, type ZipSync } from "./package-zip.ts";

/** Büyük paketler Edge'in CPU süresini aşmasın diye hızlı seviyeyle sıkıştırılır (docs/history/416-*); seçim yalnız içeriğe bağlıdır. */
const entry = (path: string, size: number, fill = 97) => ({ path, bytes: new Uint8Array(size).fill(fill) });

function levelsUsed(entries: ReturnType<typeof entry>[]): number[] {
  const seen: number[] = [];
  const spy: ZipSync = (data) => {
    for (const [, options] of Object.values(data)) seen.push(options.level);
    return zipSync(data as never);
  };
  createPackageZip("s", entries, spy);
  return seen;
}

test("a small package keeps the best-compression level", () => {
  assert.deepEqual(levelsUsed([entry("SKILL.md", 100), entry("rules/a.md", 1000)]), [6, 6]);
});

test("a package above the threshold switches every entry to the fast level", () => {
  assert.deepEqual(levelsUsed([entry("SKILL.md", 100), entry("references/big.md", FAST_COMPRESSION_ABOVE_BYTES)]), [1, 1]);
  assert.deepEqual(levelsUsed([entry("references/edge.md", FAST_COMPRESSION_ABOVE_BYTES)]), [6], "exactly the threshold is still level 6");
});

test("the same content gives the same bytes at either level, and a fast ZIP unzips to the original files", () => {
  const entries = [entry("SKILL.md", 10, 65), entry("references/big.md", FAST_COMPRESSION_ABOVE_BYTES + 1, 66)];
  const a = createPackageZip("s", entries, zipSync as unknown as ZipSync);
  const b = createPackageZip("s", entries, zipSync as unknown as ZipSync);
  assert.deepEqual(a, b);
  const files = unzipSync(a);
  assert.equal(files["s/references/big.md"].length, FAST_COMPRESSION_ABOVE_BYTES + 1);
  assert.equal(files["s/SKILL.md"][0], 65);
});
