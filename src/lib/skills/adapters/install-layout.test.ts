import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { unzipSync, zipSync } from "fflate";
import { buildPackage } from "../package-build.ts";
import { createPackageZip, type ZipSync } from "../package-zip.ts";
import { CLAUDE_CODE_ADAPTER, CODEX_ADAPTER, CURSOR_ADAPTER } from "./index.ts";

/**
 * Adaptör komutu ile GERÇEK yayın ZIP'inin birlikte doğru klasör düzenini verdiğini sınar (docs/history/413-*): önce komut metni ayrı, ZIP adları ayrı
 * sınanıyordu ve ikisi birleşince `<slug>/<slug>/SKILL.md` (çift klasör) çıkıyordu.
 */
const SLUG = "kod-gozden-gecirici";
const ZIP = `${SLUG}-1.0.0.zip`;
const enc = (text: string) => new TextEncoder().encode(text);

async function buildZip(): Promise<Uint8Array> {
  const built = await buildPackage({
    skill: { slug: SLUG, title: "Kod", summary: "Kod gözden geçirir", instructions: "# Rol\nGözden geçir.", category: "software", compat: ["claude-code"], license: "mit", authorUsername: "alice", tags: [] },
    version: "1.0.0",
    changelog: "",
    sourceUrl: null,
    files: [{ path: "rules/stil.md", bytes: enc("Küçük fonksiyonlar.") }],
  });
  return createPackageZip(SLUG, built.entries, zipSync as unknown as ZipSync);
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, base) : [full.slice(base.length + 1)];
  });
}

for (const adapter of [CLAUDE_CODE_ADAPTER, CODEX_ADAPTER, CURSOR_ADAPTER]) {
  test(`${adapter.id}: the install command puts SKILL.md at <skills dir>/<slug>/SKILL.md (no doubled folder)`, async () => {
    const zip = await buildZip();
    for (const step of adapter.steps({ slug: SLUG, zipFileName: ZIP })) {
      // Komutu kabuğa vermeden anlamını denetle: `-d <hedef>` ve ZIP girişleri → ortaya çıkan yollar.
      const target = /-d (\S+)$/.exec(step.command)?.[1];
      assert.ok(target, step.command);
      const produced = Object.keys(unzipSync(zip)).map((name) => `${target}/${name}`);
      const skillsDir = target;
      assert.ok(produced.includes(`${skillsDir}/${SLUG}/SKILL.md`), `${step.command} → ${produced.join(", ")}`);
      assert.ok(produced.includes(`${skillsDir}/${SLUG}/rules/stil.md`));
      assert.ok(!produced.some((path) => path.includes(`/${SLUG}/${SLUG}/`)), "çift klasör yok");
    }
  });
}

test("the Claude Code command really extracts to <dir>/<slug>/SKILL.md when `unzip` is installed", async (context) => {
  if (spawnSync("unzip", ["-v"]).status !== 0) return context.skip("unzip is not installed");
  const work = mkdtempSync(join(tmpdir(), "skill-install-"));
  try {
    writeFileSync(join(work, ZIP), await buildZip());
    mkdirSync(join(work, "home"));
    const [personal] = CLAUDE_CODE_ADAPTER.steps({ slug: SLUG, zipFileName: ZIP }).map((step) => step.command);
    // `~` geçici HOME'a açılır: gerçek kullanıcı klasörüne asla yazılmaz.
    execFileSync("bash", ["-c", personal], { cwd: work, stdio: "ignore", env: { ...process.env, HOME: join(work, "home") } });
    const files = listFiles(join(work, "home")).sort();
    assert.deepEqual(files, [`.claude/skills/${SLUG}/LICENSE`, `.claude/skills/${SLUG}/SKILL.md`, `.claude/skills/${SLUG}/metadata.json`, `.claude/skills/${SLUG}/rules/stil.md`]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
