import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOfPath, formatBytes, isEditablePath, joinSkillPath, sanitizeFileName } from "./paths.ts";
import { validateSkillPath } from "./package-validate.ts";

test("file names become safe path segments", () => {
  assert.equal(sanitizeFileName("Çok İyi Kural (1).MD"), "Cok-Iyi-Kural-1.md");
  assert.equal(sanitizeFileName("../../etc/passwd.md"), "passwd.md");
  assert.equal(sanitizeFileName("C:\\Users\\x\\notes.txt"), "notes.txt");
  assert.equal(sanitizeFileName(".env"), "env");
  assert.equal(sanitizeFileName("***.md"), "file.md");
  assert.equal(sanitizeFileName("a b c.JSON"), "a-b-c.json");
  assert.equal(sanitizeFileName("x".repeat(300) + ".md").length, 83);
});

test("joined paths pass the path validator whenever the extension is allowed", () => {
  for (const [folder, name] of [["rules", "My Rule"], ["references", "Şema Notları.pdf"], ["", "readme"], ["scripts", "run it.sh"], ["tools", "manifest.json"]] as const) {
    const path = joinSkillPath(folder, name, "md");
    assert.equal(validateSkillPath(path), null, path);
  }
  assert.equal(joinSkillPath("rules", "style"), "rules/style");
  assert.equal(joinSkillPath("rules", "style", "md"), "rules/style.md");
  assert.equal(joinSkillPath("rules", "style.txt", "md"), "rules/style.txt");
});

test("folder detection, byte formatting and editability", () => {
  assert.equal(folderOfPath("rules/a.md"), "rules");
  assert.equal(folderOfPath("README.md"), "");
  assert.equal(folderOfPath("other/a.md"), "");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
  assert.equal(isEditablePath("rules/a.md", 100), true);
  assert.equal(isEditablePath("references/a.pdf", 100), false);
  assert.equal(isEditablePath("rules/a.md", 2 * 1024 * 1024), false);
});
