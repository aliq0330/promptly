import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync } from "fflate";
import { sha256Hex } from "./package-build.ts";
import { PublishError, publishSkillPackage, type BeginResult, type PublishDeps, type PublishedVersionRow } from "./package-publish.ts";
import type { ZipSync } from "./package-zip.ts";

const enc = (text: string) => new TextEncoder().encode(text);
const SKILL_ID = "52000000-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "53000000-0000-4000-8000-000000000001";

async function fileRow(path: string, text: string) {
  const bytes = enc(text);
  return { bytes, row: { path, kind: "rule", size: bytes.length, sha256: await sha256Hex(bytes), storage_path: `${SKILL_ID}/draft/${path.replace(/\W/g, "")}.md`, is_script: false } };
}

async function setup(overrides: { files?: { path: string; text: string }[]; skill?: Partial<NonNullable<BeginResult["skill"]>>; mutate?: (storage: Map<string, Uint8Array>) => void; already?: PublishedVersionRow } = {}) {
  const storage = new Map<string, Uint8Array>();
  const rows = [];
  for (const file of overrides.files ?? [{ path: "rules/style.md", text: "Use small functions." }]) {
    const made = await fileRow(file.path, file.text);
    storage.set(made.row.storage_path, made.bytes);
    rows.push(made.row);
  }
  overrides.mutate?.(storage);
  const calls: string[] = [];
  const written = new Map<string, Uint8Array>();
  const begin: BeginResult = overrides.already
    ? { already: true, version: overrides.already }
    : { already: false, skill: { id: SKILL_ID, slug: "code-reviewer", title: "Code Reviewer", summary: "Reviews code", instructions: "# Role\nReview.", category: "software", compat: ["claude-code"], license: "mit", visibility: "public", author_username: "alice", ...overrides.skill }, files: rows, tags: ["review"] };
  const deps: PublishDeps = {
    async begin() { calls.push("begin"); return begin; },
    async readFile(path) { calls.push("read"); const bytes = storage.get(path); if (!bytes) throw new Error("missing"); return bytes; },
    async writePackage(path, bytes) { calls.push("write"); written.set(path, bytes); },
    async commit(args) {
      calls.push("commit");
      const row: PublishedVersionRow = { id: "v1", skill_id: args.skillId, version: args.version, changelog: args.changelog, package_path: `${args.skillId}/packages/${args.version}-${args.sha256.slice(0, 16)}.zip`, package_sha256: args.sha256, package_size: args.size, file_count: args.fileCount, manifest: args.manifest, created_at: "now", deprecated_at: null };
      return row;
    },
    zipSync: zipSync as unknown as ZipSync,
    sourceUrl: (id) => `https://example.test/skills/local?id=${id}`,
  };
  return { deps, calls, written };
}
const request = { user: USER, skillId: SKILL_ID, version: "1.0.0", changelog: "", clientToken: TOKEN, acknowledgeWarnings: false };

test("a clean publish writes one content-addressed ZIP and commits it", async () => {
  const { deps, calls, written } = await setup();
  const outcome = await publishSkillPackage(request, deps);
  assert.deepEqual(calls, ["begin", "read", "write", "commit"]);
  assert.equal(outcome.already, false);
  assert.equal(written.size, 1);
  const [path, zip] = [...written][0];
  assert.equal(path, outcome.version.package_path);
  assert.equal(path, `${SKILL_ID}/packages/1.0.0-${(await sha256Hex(zip)).slice(0, 16)}.zip`);
  assert.equal(outcome.version.package_sha256, await sha256Hex(zip));
  assert.equal(outcome.version.package_size, zip.length);
  const names = Object.keys(unzipSync(zip)).sort();
  assert.deepEqual(names, ["code-reviewer/LICENSE", "code-reviewer/SKILL.md", "code-reviewer/metadata.json", "code-reviewer/rules/style.md"]);
});

test("a retried publish with the same token does not rebuild or rewrite anything", async () => {
  const existing = { id: "v1", skill_id: SKILL_ID, version: "1.0.0", changelog: "", package_path: "x", package_sha256: "a".repeat(64), package_size: 10, file_count: 1, manifest: {}, created_at: "t", deprecated_at: null };
  const { deps, calls } = await setup({ already: existing });
  const outcome = await publishSkillPackage(request, deps);
  assert.equal(outcome.already, true);
  assert.deepEqual(calls, ["begin"]);
});

test("a tampered Storage file (hash differs from the registered one) stops the publish before anything is written", async () => {
  const { deps, calls } = await setup({ mutate: (storage) => { for (const key of storage.keys()) storage.set(key, enc("Replaced after registration")); } });
  await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "file_integrity" && error.issues[0].path === "rules/style.md");
  assert.ok(!calls.includes("write") && !calls.includes("commit"));
});

test("a registered file that is missing from Storage is reported", async () => {
  const { deps } = await setup({ mutate: (storage) => storage.clear() });
  await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "file_missing");
});

test("an invalid package is re-validated on the server and never committed (even if the client let it through)", async () => {
  const elf = String.fromCharCode(0x7f) + "ELF-binary";
  const { deps, calls } = await setup({ files: [{ path: "references/tool.md", text: elf }] });
  await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "package_invalid" && error.issues.some((i) => i.code === "binary_executable"));
  assert.ok(!calls.includes("write") && !calls.includes("commit"));
});

test("a private key in the instructions blocks the publish", async () => {
  const { deps } = await setup({ skill: { instructions: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" } });
  await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "package_invalid" && error.issues.some((i) => i.code === "secret_private_key" && i.path === "SKILL.md"));
});

test("provider-key warnings need an explicit acknowledgement, then pass", async () => {
  const files = [{ path: "references/notes.md", text: "example AKIAIOSFODNN7EXAMPLE only" }];
  const first = await setup({ files });
  await assert.rejects(publishSkillPackage(request, first.deps), (error: unknown) => error instanceof PublishError && error.code === "warnings_unacknowledged" && error.issues.length === 1);
  assert.ok(!first.calls.includes("write"));
  const second = await setup({ files });
  const outcome = await publishSkillPackage({ ...request, acknowledgeWarnings: true }, second.deps);
  assert.equal(outcome.warnings.length, 1);
  assert.equal(outcome.warnings[0].detail, "AWS access key");
  assert.ok(!JSON.stringify(outcome.warnings).includes("AKIAIOSFODNN7EXAMPLE"), "the secret value never leaves the validator");
});

test("an incomplete skill (no instructions, summary or title) cannot be published", async () => {
  for (const skill of [{ instructions: "  " }, { summary: "" }, { title: " " }]) {
    const { deps } = await setup({ skill });
    await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "skill_incomplete");
  }
});

test("a skill with no extra files still publishes (SKILL.md + metadata + LICENSE)", async () => {
  const { deps, written } = await setup({ files: [] });
  const outcome = await publishSkillPackage(request, deps);
  assert.equal(outcome.version.file_count, 0);
  assert.equal(Object.keys(unzipSync([...written][0][1])).length, 3);
});

test("a ZIP larger than the limit is a typed failure", async () => {
  const { deps } = await setup();
  deps.zipSync = (() => new Uint8Array(10 * 1024 * 1024 + 1)) as ZipSync;
  await assert.rejects(publishSkillPackage(request, deps), (error: unknown) => error instanceof PublishError && error.code === "package_too_large");
});

test("a database rule error from begin (version exists / not newer / changelog) passes through untouched", async () => {
  const { deps } = await setup();
  deps.begin = async () => { throw new Error("skill_version_not_newer"); };
  await assert.rejects(publishSkillPackage(request, deps), /skill_version_not_newer/);
});
