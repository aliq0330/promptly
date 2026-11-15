import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync } from "fflate";
import { buildPackage, renderLicenseFile, sha256Hex, type PackageBuildInput } from "./package-build.ts";
import { createPackageZip, SkillPackageTooLargeError, type ZipSync } from "./package-zip.ts";
import { SKILL_LIMITS } from "./limits.ts";
import { parseSkillMd } from "./skill-md.ts";
import { readSkillZip, stripSingleRoot } from "./zip.ts";

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const input: PackageBuildInput = {
  skill: { slug: "code-reviewer", title: "Code Reviewer", summary: "Reviews code carefully", instructions: "# Role\nYou review code.", category: "software", compat: ["claude-code"], license: "mit", authorUsername: "alice", tags: ["review", "code"] },
  version: "1.2.0",
  changelog: "Added rules",
  sourceUrl: "https://example.test/skills/local?id=abc",
  files: [
    { path: "rules/style.md", bytes: enc("Use small functions.") },
    { path: "examples/one.md", bytes: enc("Example") },
    { path: "scripts/lint.sh", bytes: enc("#!/bin/sh\necho hi\n") },
  ],
};

test("package contains SKILL.md, metadata.json, LICENSE first, then author files sorted", async () => {
  const built = await buildPackage(input);
  assert.deepEqual(built.entries.map((e) => e.path), ["SKILL.md", "metadata.json", "LICENSE", "examples/one.md", "rules/style.md", "scripts/lint.sh"]);
  const skillMd = parseSkillMd(dec(built.entries[0].bytes));
  assert.equal(skillMd.name, "code-reviewer");
  assert.equal(skillMd.version, "1.2.0");
  assert.equal(skillMd.author, "alice");
  assert.equal(skillMd.source, "https://example.test/skills/local?id=abc");
  assert.equal(skillMd.body, "# Role\nYou review code.");
});

test("manifest lists the author files with size, sha256, kind and the script flag", async () => {
  const built = await buildPackage(input);
  assert.equal(built.manifest.schema, 1);
  assert.equal(built.manifest.version, "1.2.0");
  const script = built.manifest.files.find((f) => f.path === "scripts/lint.sh");
  assert.equal(script?.script, true);
  assert.equal(script?.kind, "script");
  assert.equal(script?.sha256, await sha256Hex(enc("#!/bin/sh\necho hi\n")));
  assert.equal(built.manifest.files.length, 3);
  const metadata = JSON.parse(dec(built.entries[1].bytes));
  assert.equal(metadata.license, "MIT");
  assert.deepEqual(metadata.tags, ["review", "code"]);
  assert.equal(metadata.changelog, "Added rules");
  assert.equal(metadata.files.length, 3);
});

test("the same input yields the same ZIP bytes and the same sha256 (content addressed package)", async () => {
  const zipSyncFn = zipSync as unknown as ZipSync;
  const a = createPackageZip("code-reviewer", (await buildPackage(input)).entries, zipSyncFn);
  const b = createPackageZip("code-reviewer", (await buildPackage(input)).entries, zipSyncFn);
  assert.equal(await sha256Hex(a), await sha256Hex(b));
  const changed = createPackageZip("code-reviewer", (await buildPackage({ ...input, version: "1.2.1" })).entries, zipSyncFn);
  assert.notEqual(await sha256Hex(a), await sha256Hex(changed));
});

test("files live under a single {slug}/ folder and survive a round trip through the safe reader", async () => {
  const built = await buildPackage(input);
  const zip = createPackageZip("code-reviewer", built.entries, zipSync as unknown as ZipSync);
  const raw = unzipSync(zip);
  assert.ok(Object.keys(raw).every((name) => name.startsWith("code-reviewer/")));
  const read = readSkillZip(zip);
  assert.deepEqual(read.issues, []);
  assert.deepEqual(read.files.map((f) => f.path).sort(), ["SKILL.md", "examples/one.md", "rules/style.md", "scripts/lint.sh"], "metadata.json and LICENSE are regenerated, not re-imported");
  assert.equal(dec(read.files.find((f) => f.path === "rules/style.md")!.bytes), "Use small functions.");
  assert.ok(read.skillMd?.includes("name: code-reviewer"));
  assert.equal(read.metadata?.title, "Code Reviewer");
  assert.equal(read.metadata?.license, "MIT");
});

test("an over-large package is refused with a dedicated error", () => {
  const huge: ZipSync = () => new Uint8Array(SKILL_LIMITS.maxZipBytes + 1);
  assert.throws(() => createPackageZip("x", [], huge), SkillPackageTooLargeError);
});

test("LICENSE points at the SPDX text and credits the author; proprietary keeps rights reserved", () => {
  assert.ok(renderLicenseFile("mit", "alice", null).includes("SPDX-License-Identifier: MIT"));
  assert.ok(renderLicenseFile("apache-2.0", null, "https://x.test").includes("https://spdx.org/licenses/Apache-2.0.html"));
  assert.ok(renderLicenseFile("proprietary", "bob", null).startsWith("All rights reserved."));
  assert.ok(renderLicenseFile("cc0-1.0", "carol", null).includes("Author: @carol"));
});

// ---------- kötü ZIP fixture seti ----------
const zipOf = (entries: Record<string, Uint8Array>) => zipSync(Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, [bytes, { level: 6 as const }]])) as never);

test("zip slip entries are reported and dropped, never extracted", () => {
  const read = readSkillZip(zipOf({ "SKILL.md": enc("# a"), "../evil.md": enc("x"), "rules/../../evil2.md": enc("x"), "/abs/evil3.md": enc("x"), "rules\\back.md": enc("x"), "rules/ok.md": enc("ok") }));
  const byCode = read.issues.map((i) => i.code).sort();
  assert.ok(byCode.includes("path_traversal"));
  assert.ok(byCode.includes("path_absolute"));
  assert.ok(byCode.includes("path_backslash"));
  assert.deepEqual(read.files.map((f) => f.path).sort(), ["SKILL.md", "rules/ok.md"]);
});

test("hidden files are reported, macOS junk is silently ignored", () => {
  const read = readSkillZip(zipOf({ "SKILL.md": enc("# a"), ".env.md": enc("K=1"), "__MACOSX/._SKILL.md": enc("junk"), ".DS_Store": enc("x"), "rules/.DS_Store": enc("x") }));
  assert.deepEqual(read.issues.map((i) => i.code), ["path_hidden"]);
  assert.deepEqual(read.files.map((f) => f.path), ["SKILL.md"]);
});

test("a single top-level folder is stripped", () => {
  assert.equal(stripSingleRoot(["my-skill/SKILL.md", "my-skill/rules/a.md"]), "my-skill/");
  assert.equal(stripSingleRoot(["SKILL.md", "rules/a.md"]), "");
  assert.equal(stripSingleRoot(["a/x.md", "b/y.md"]), "");
  assert.equal(stripSingleRoot(["my-skill/SKILL.md", "../evil.md", "/abs.md", "x\\y.md"]), "my-skill/", "a path-escape entry cannot break root detection");
  const read = readSkillZip(zipOf({ "my-skill/SKILL.md": enc("# a"), "my-skill/rules/a.md": enc("r") }));
  assert.deepEqual(read.files.map((f) => f.path).sort(), ["SKILL.md", "rules/a.md"]);
});

test("a file that declares more than the per-file limit is skipped before inflating", () => {
  const read = readSkillZip(zipOf({ "SKILL.md": enc("# a"), "references/huge.md": new Uint8Array(SKILL_LIMITS.maxFileBytes + 1).fill(0x61) }));
  assert.ok(read.issues.some((i) => i.code === "file_too_large" && i.path === "references/huge.md"));
  assert.deepEqual(read.files.map((f) => f.path), ["SKILL.md"]);
});

test("a high compression ratio on a large file is rejected as a zip bomb", () => {
  const read = readSkillZip(zipOf({ "SKILL.md": enc("# a"), "references/zeros.md": new Uint8Array(4 * 1024 * 1024) }));
  assert.ok(read.issues.some((i) => i.code === "zip_bomb" && i.path === "references/zeros.md"));
  assert.ok(!read.files.some((f) => f.path === "references/zeros.md"));
});

test("too many files and an oversized total abort the whole read", () => {
  const manyEntries: Record<string, Uint8Array> = { "SKILL.md": enc("# a") };
  for (let i = 0; i < SKILL_LIMITS.maxFiles + 5; i += 1) manyEntries[`references/f${i}.md`] = enc(`file ${i}`);
  const many = readSkillZip(zipOf(manyEntries));
  assert.ok(many.issues.some((i) => i.code === "too_many_files"));
  assert.deepEqual(many.files, []);

  const filler = new Uint8Array(SKILL_LIMITS.maxFileBytes);
  for (let i = 0; i < filler.length; i += 1) filler[i] = (i * 31 + (i >> 7)) & 0x7f | 0x20; // sıkıştırması zor, oran sınırına takılmasın
  const total = readSkillZip(zipOf(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`references/p${i}.md`, filler]))));
  assert.ok(total.issues.some((i) => i.code === "total_too_large" || i.code === "zip_too_large"));
  assert.deepEqual(total.files, []);
});

test("garbage that is not a ZIP is reported as unreadable, not thrown", () => {
  assert.deepEqual(readSkillZip(enc("this is definitely not a zip")).issues.map((i) => i.code), ["zip_unreadable"]);
});

test("a ZIP over the size limit is refused up front", () => {
  assert.deepEqual(readSkillZip(new Uint8Array(SKILL_LIMITS.maxZipBytes + 1)).issues.map((i) => i.code), ["zip_too_large"]);
});

test("a header that understates the size never yields more bytes than it declared", () => {
  const zip = zipOf({ "SKILL.md": enc("# a"), "references/x.md": enc("0123456789".repeat(100)) });
  // Merkezi dizindeki "açılmış boyut" alanını 1000 → 10'a düşür (yalan söyleyen başlık).
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 46 < zip.length; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50) {
      const nameLength = view.getUint16(i + 28, true);
      const name = dec(zip.slice(i + 46, i + 46 + nameLength));
      if (name === "references/x.md") view.setUint32(i + 24, 10, true);
    }
  }
  const read = readSkillZip(zip);
  const file = read.files.find((f) => f.path === "references/x.md");
  assert.ok(!file || file.bytes.length <= 10, "output is bounded by the declared size");
});

// ---- Klasör içe aktarma (docs/history/398-*) ----
import { readSkillFolder } from "./zip.ts";

test("klasör içe aktarma ZIP ile aynı kuralları uygular: tek üst klasör soyulur, SKILL.md ve metadata ayrıştırılır, kaçan yol atlanır", () => {
  const read = readSkillFolder([
    { path: "my-skill/SKILL.md", bytes: enc("# Merhaba") },
    { path: "my-skill/rules/a.md", bytes: enc("kural") },
    { path: "my-skill/metadata.json", bytes: enc(JSON.stringify({ license: "mit" })) },
    { path: "my-skill/.DS_Store", bytes: enc("x") },
    { path: "my-skill/../evil.md", bytes: enc("x") },
  ]);
  assert.deepEqual(read.files.map((file) => file.path).sort(), ["SKILL.md", "rules/a.md"]);
  assert.equal(read.skillMd, "# Merhaba");
  assert.deepEqual(read.metadata, { license: "mit" });
  assert.ok(read.issues.some((issue) => issue.path.includes("evil")), "kaçan yol raporlanır");
});

test("klasör içe aktarma sayı ve boyut sınırlarını uygular", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ path: `s/f${i}.md`, bytes: enc("x") }));
  assert.equal(readSkillFolder(many).issues[0].code, "too_many_files");
});
