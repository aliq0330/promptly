import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAUDE_CODE_ADAPTER, SKILL_ADAPTERS, isInstallableSlug, verifiedAdaptersFor } from "./index.ts";

test("claude-code: personal and project install commands (golden)", () => {
  const steps = CLAUDE_CODE_ADAPTER.steps({ slug: "kod-gozden-gecirici", zipFileName: "kod-gozden-gecirici-1.1.0.zip" });
  assert.deepEqual(
    steps.map((step) => step.command),
    [
      "mkdir -p ~/.claude/skills/kod-gozden-gecirici && unzip -o kod-gozden-gecirici-1.1.0.zip -d ~/.claude/skills/kod-gozden-gecirici",
      "mkdir -p .claude/skills/kod-gozden-gecirici && unzip -o kod-gozden-gecirici-1.1.0.zip -d .claude/skills/kod-gozden-gecirici",
    ],
  );
  assert.deepEqual(steps.map((step) => step.noteKey), ["skill.install.personal", "skill.install.project"]);
});

test("claude-code: a Skill without a package is installed from the downloaded SKILL.md", () => {
  const [personal] = CLAUDE_CODE_ADAPTER.steps({ slug: "a", zipFileName: null });
  assert.equal(personal.command, "mkdir -p ~/.claude/skills/a && mv SKILL.md ~/.claude/skills/a/SKILL.md");
});

test("a slug or file name that could break out of the shell command yields NO command", () => {
  for (const slug of ["a; rm -rf ~", "../x", "A", "a b", "", "a".repeat(65), "-a"]) {
    assert.equal(isInstallableSlug(slug), false, slug);
    assert.deepEqual(CLAUDE_CODE_ADAPTER.steps({ slug, zipFileName: "x.zip" }), [], slug);
  }
  const [step] = CLAUDE_CODE_ADAPTER.steps({ slug: "ok", zipFileName: "x; rm -rf ~.zip" });
  assert.ok(!step.command.includes("rm -rf"), "an unsafe file name falls back to the SKILL.md path");
});

test("only verified adapters are offered; unverified ones carry no steps or docs", () => {
  assert.deepEqual(verifiedAdaptersFor(["claude-code", "codex", "cursor"]).map((a) => a.id), ["claude-code"]);
  assert.deepEqual(verifiedAdaptersFor([]).map((a) => a.id), ["claude-code"]);
  assert.deepEqual(verifiedAdaptersFor(["cursor"]), []);
  for (const adapter of SKILL_ADAPTERS.filter((a) => a.status === "draft")) {
    assert.equal(adapter.docsUrl, null);
    assert.deepEqual(adapter.steps({ slug: "ok", zipFileName: null }), []);
  }
  assert.ok(CLAUDE_CODE_ADAPTER.docsUrl?.startsWith("https://code.claude.com/"));
});
