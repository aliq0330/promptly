import assert from "node:assert/strict";
import { test } from "node:test";
import { SKILL_LIMITS } from "./limits.ts";
import { decodeUtf8, describeSkillFile, issueCounts, looksExecutable, looksLikeArchive, scanSecrets, validateFileContent, validateSkillPackage, validateSkillPath } from "./package-validate.ts";

const enc = (text: string) => new TextEncoder().encode(text);
const codes = (path: string) => validateSkillPath(path)?.code ?? null;

test("clean paths are accepted", () => {
  for (const path of ["rules/style.md", "references/guide.pdf", "examples/a-b_c.txt", "tools/manifest.json", "scripts/run.sh", "README.md", "a/b/c/d/e/f.md"]) {
    assert.equal(codes(path), null, path);
  }
});

test("path traversal, absolute, backslash, NUL, hidden and empty paths are rejected with specific codes", () => {
  assert.equal(codes(""), "path_empty");
  assert.equal(codes("a\0b.md"), "path_nul");
  assert.equal(codes("rules\\x.md"), "path_backslash");
  assert.equal(codes("/etc/passwd.md"), "path_absolute");
  assert.equal(codes("C:/Windows/x.md"), "path_absolute");
  assert.equal(codes("../evil.md"), "path_traversal");
  assert.equal(codes("rules/../../evil.md"), "path_traversal");
  assert.equal(codes(".env.md"), "path_hidden");
  assert.equal(codes(".git/config.md"), "path_hidden");
  assert.equal(codes("rules/./x.md"), "path_hidden");
  assert.equal(codes("rules//x.md"), "path_chars");
  assert.equal(codes("rules/ spaced.md"), "path_chars");
  assert.equal(codes("rules/çay.md"), "path_chars");
  assert.equal(codes(`${"a".repeat(201)}.md`), "path_too_long");
  assert.equal(codes("a/b/c/d/e/f/g.md"), "path_too_deep");
});

test("reserved root files are rejected in any case; the same name in a folder is fine", () => {
  assert.equal(codes("SKILL.md"), "path_reserved");
  assert.equal(codes("skill.MD"), "path_reserved");
  assert.equal(codes("metadata.json"), "path_reserved");
  assert.equal(codes("references/skill.md"), null);
});

test("extensions: only the allow-list; known executables get their own code", () => {
  assert.equal(codes("tools/run.exe"), "binary_executable");
  assert.equal(codes("tools/x.so"), "binary_executable");
  assert.equal(codes("tools/x.dll"), "binary_executable");
  assert.equal(codes("rules/x.docx"), "ext_not_allowed");
  assert.equal(codes("rules/LICENSE"), "ext_not_allowed");
  assert.equal(codes("rules/x.md.exe"), "binary_executable");
});

test("kind and script flag derive from the path exactly like the DB CHECKs", () => {
  assert.deepEqual(describeSkillFile("rules/a.md"), { kind: "rule", isScript: false, textual: true });
  assert.deepEqual(describeSkillFile("references/a.pdf"), { kind: "reference", isScript: false, textual: false });
  assert.deepEqual(describeSkillFile("examples/a.md").kind, "example");
  assert.deepEqual(describeSkillFile("scripts/a.PY"), { kind: "script", isScript: true, textual: true });
  assert.deepEqual(describeSkillFile("tools/manifest.json").kind, "tool");
  assert.deepEqual(describeSkillFile("notes.md").kind, "other");
  assert.equal(describeSkillFile("rules/a.sh").isScript, true);
});

test("executables are caught by signature regardless of the extension", () => {
  assert.equal(looksExecutable(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])), true);
  assert.equal(looksExecutable(Uint8Array.from([0xcf, 0xfa, 0xed, 0xfe, 7, 0, 0, 1])), true);
  const pe = new Uint8Array(0x100);
  pe.set([0x4d, 0x5a]);
  pe[0x3c] = 0x80;
  pe.set([0x50, 0x45, 0, 0], 0x80);
  assert.equal(looksExecutable(pe), true);
  const notPe = new Uint8Array(0x100);
  notPe.set([0x4d, 0x5a]);
  assert.equal(looksExecutable(notPe), false, "MZ without a PE header is just text");
  assert.equal(looksExecutable(enc("MZ plain text file")), false);
  assert.deepEqual(validateFileContent("rules/x.md", Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0, 0])).map((i) => i.code), ["binary_executable"]);
});

test("nested archives are rejected", () => {
  assert.equal(looksLikeArchive(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), true);
  assert.equal(looksLikeArchive(Uint8Array.from([0x1f, 0x8b, 8])), true);
  assert.equal(looksLikeArchive(enc("# hello")), false);
  assert.deepEqual(validateFileContent("references/a.md", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0])).map((i) => i.code), ["nested_archive"]);
});

test("binary extensions must match their signature", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.deepEqual(validateFileContent("references/a.png", png), []);
  assert.equal(validateFileContent("references/a.jpg", png)[0].code, "content_mismatch");
  assert.deepEqual(validateFileContent("references/a.jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), []);
  assert.deepEqual(validateFileContent("references/a.pdf", enc("%PDF-1.7\n...")), []);
  assert.equal(validateFileContent("references/a.pdf", enc("not a pdf")).length, 1);
  const webp = new Uint8Array(16);
  webp.set(enc("RIFF"), 0);
  webp.set(enc("WEBP"), 8);
  assert.deepEqual(validateFileContent("references/a.webp", webp), []);
});

test("text files must be valid UTF-8 without NUL; JSON must parse", () => {
  assert.equal(decodeUtf8(enc("çay ☕")), "çay ☕");
  assert.equal(decodeUtf8(Uint8Array.from([0xff, 0xfe, 0x41])), null);
  assert.equal(decodeUtf8(Uint8Array.from([0x41, 0x00, 0x42])), null);
  assert.equal(decodeUtf8(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])), "A", "BOM is tolerated and stripped");
  assert.equal(validateFileContent("rules/a.md", Uint8Array.from([0xff, 0xfe, 0x41]))[0].code, "not_utf8");
  assert.equal(validateFileContent("tools/manifest.json", enc("{not json")).at(0)?.code, "invalid_json");
  assert.deepEqual(validateFileContent("tools/manifest.json", enc('{"ok": true}')), []);
});

test("secrets: private keys and JWTs block, provider keys warn, values never leak into the report", () => {
  const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
  assert.equal(scanSecrets(key, "a.md")[0].code, "secret_private_key");
  assert.equal(scanSecrets(key, "a.md")[0].severity, "error");
  const jwt = "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(scanSecrets(jwt, "a.md")[0].code, "secret_jwt");
  const aws = scanSecrets("AKIAIOSFODNN7EXAMPLE", "a.md");
  assert.equal(aws[0].severity, "warning");
  assert.equal(aws[0].detail, "AWS access key");
  assert.equal(scanSecrets("ghp_" + "a".repeat(36), "a.md")[0].severity, "warning");
  assert.equal(scanSecrets("sk-ant-" + "a".repeat(30), "a.md")[0].severity, "warning");
  assert.equal(scanSecrets('API_KEY = "abcdefghijklmnopqrstuvwxyz012345"', "a.md")[0].severity, "warning");
  assert.deepEqual(scanSecrets("Normal talimat metni. Anahtar yok.", "a.md"), []);
  assert.deepEqual(scanSecrets("api_key placeholder", "a.md"), []);
  for (const issue of [...scanSecrets(key, "a.md"), ...scanSecrets("AKIAIOSFODNN7EXAMPLE", "a.md")]) {
    assert.ok(!JSON.stringify(issue).includes("AKIAIOSFODNN7EXAMPLE") && !JSON.stringify(issue).includes("MIIE"));
  }
});

test("package-level limits: file count, per-file size, total size, case-insensitive duplicates", () => {
  const many = Array.from({ length: SKILL_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `references/f${i}.md`, bytes: enc("x") }));
  assert.ok(validateSkillPackage(many).issues.some((i) => i.code === "too_many_files"));
  assert.equal(validateSkillPackage(many.slice(0, SKILL_LIMITS.maxFiles)).ok, true);

  const big = new Uint8Array(SKILL_LIMITS.maxFileBytes + 1).fill(0x61);
  assert.ok(validateSkillPackage([{ path: "references/big.md", bytes: big }]).issues.some((i) => i.code === "file_too_large"));

  const nearLimit = new Uint8Array(SKILL_LIMITS.maxFileBytes).fill(0x61);
  const files = Array.from({ length: 9 }, (_, i) => ({ path: `references/p${i}.md`, bytes: nearLimit }));
  assert.ok(validateSkillPackage(files).issues.some((i) => i.code === "total_too_large"));
  assert.equal(validateSkillPackage(files.slice(0, 8)).ok, true, "8 x 5 MB = exactly the 40 MB limit");

  const dup = validateSkillPackage([{ path: "rules/A.md", bytes: enc("a") }, { path: "rules/a.md", bytes: enc("b") }]);
  assert.ok(dup.issues.some((i) => i.code === "path_duplicate"));
  assert.equal(dup.ok, false);
});

test("a package with only warnings is ok but reports them; extra texts are scanned too", () => {
  const report = validateSkillPackage([{ path: "rules/a.md", bytes: enc("key AKIAIOSFODNN7EXAMPLE here") }], [{ path: "SKILL.md", text: "ghp_" + "b".repeat(36) }]);
  assert.equal(report.ok, true);
  assert.deepEqual(issueCounts(report.issues), { errors: 0, warnings: 2 });
  assert.ok(report.issues.some((i) => i.path === "SKILL.md"));
});

// ---- Betik risk taraması (docs/history/397-*) ----
import { scanScriptRisks, SCRIPT_RISK_CODES } from "./package-validate.ts";

test("risk taraması: her kural kendi kalıbını işaretler, zararsız betik temiz çıkar", () => {
  assert.deepEqual(scanScriptRisks("echo merhaba\nls -la\n"), []);
  assert.deepEqual(scanScriptRisks("curl -fsSL https://x.test/i.sh | bash"), ["pipe_to_shell", "network"]);
  assert.ok(scanScriptRisks("rm -rf /").includes("destructive_delete"));
  assert.ok(scanScriptRisks("rm -rf ~/").includes("destructive_delete"));
  assert.ok(!scanScriptRisks("rm -rf ./build").includes("destructive_delete"), "yerel build klasörü silmek işaretlenmez");
  assert.ok(scanScriptRisks("eval \"$X\"").includes("dynamic_eval"));
  assert.ok(scanScriptRisks("subprocess.run(cmd, shell=True)").includes("dynamic_eval"));
  assert.ok(scanScriptRisks("sudo apt install x").includes("privilege"));
  assert.ok(scanScriptRisks("cat ~/.ssh/id_rsa").includes("credential_paths"));
  assert.ok(scanScriptRisks("echo aGk= | base64 -d | sh").includes("obfuscation"));
  assert.ok(scanScriptRisks("const r = await fetch(url)").includes("network"));
});

test("risk kodları sabit listedir (çeviri anahtarlarıyla aynı)", () => {
  assert.deepEqual([...SCRIPT_RISK_CODES], ["pipe_to_shell", "network", "destructive_delete", "dynamic_eval", "privilege", "credential_paths", "obfuscation"]);
});
