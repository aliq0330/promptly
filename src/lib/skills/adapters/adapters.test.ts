import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAUDE_CODE_ADAPTER, CODEX_ADAPTER, CURSOR_ADAPTER, SKILL_ADAPTERS, isInstallableSlug, verifiedAdaptersFor } from "./index.ts";

test("claude-code: personal and project install commands (golden)", () => {
  const steps = CLAUDE_CODE_ADAPTER.steps({ slug: "kod-gozden-gecirici", zipFileName: "kod-gozden-gecirici-1.1.0.zip" });
  assert.deepEqual(
    steps.map((step) => step.command),
    [
      "mkdir -p ~/.claude/skills && unzip -o kod-gozden-gecirici-1.1.0.zip -d ~/.claude/skills",
      "mkdir -p .claude/skills && unzip -o kod-gozden-gecirici-1.1.0.zip -d .claude/skills",
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

test("all three adapters are verified, filtered by the skill's compatible tools", () => {
  assert.deepEqual(verifiedAdaptersFor(["claude-code", "codex", "cursor"]).map((a) => a.id), ["claude-code", "codex", "cursor"]);
  assert.deepEqual(verifiedAdaptersFor([]).map((a) => a.id), ["claude-code", "codex", "cursor"]);
  assert.deepEqual(verifiedAdaptersFor(["cursor"]).map((a) => a.id), ["cursor"]);
  for (const adapter of SKILL_ADAPTERS) assert.ok(adapter.docsUrl?.startsWith("https://"), `${adapter.id} cites its official doc`);
  assert.ok(CLAUDE_CODE_ADAPTER.docsUrl?.startsWith("https://code.claude.com/"));
});

test("Codex and Cursor write to their documented folders and refuse unsafe names", () => {
  assert.deepEqual(CODEX_ADAPTER.steps({ slug: "ok", zipFileName: "ok-1.0.0.zip" }).map((s) => s.command), [
    "mkdir -p ~/.agents/skills && unzip -o ok-1.0.0.zip -d ~/.agents/skills",
    "mkdir -p .agents/skills && unzip -o ok-1.0.0.zip -d .agents/skills",
  ]);
  assert.deepEqual(CURSOR_ADAPTER.steps({ slug: "ok", zipFileName: null }).map((s) => s.command), [
    "mkdir -p ~/.cursor/skills/ok && mv SKILL.md ~/.cursor/skills/ok/SKILL.md",
    "mkdir -p .cursor/skills/ok && mv SKILL.md .cursor/skills/ok/SKILL.md",
  ]);
  for (const adapter of [CODEX_ADAPTER, CURSOR_ADAPTER]) {
    assert.deepEqual(adapter.steps({ slug: "a;b", zipFileName: null }), []);
    assert.ok(!adapter.steps({ slug: "ok", zipFileName: "x; rm -rf ~.zip" })[0].command.includes("rm -rf"));
  }
});
