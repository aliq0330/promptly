import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdown } from "./markdown.ts";
import { containsJwt, scanScriptRisks, scanSecrets } from "./package-validate.ts";

/**
 * Kullanıcı dosyalarını tarayan kalıplar DOĞRUSAL zamanlı olmalı (docs/history/413-*): talimat 60 000, betik/metin dosyası 5 MB'a kadar olabilir; kötü niyetli tek satır
 * eskiden okuyucunun sekmesini (Markdown başlığı) ya da Edge işlevini (betik risk taraması) dakikalarca kilitliyordu. Süre sınırları bolca gevşek: doğrusal kod ms'dir,
 * ikinci/üçüncü dereceden olan saniyeler–dakikalar sürer.
 */
const rep = (seed: string, length: number) => seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
function timed(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const MARKDOWN_ATTACKS: [string, string][] = [
  ["heading + trailing spaces then text", `# a${" ".repeat(60_000)}x`],
  ["heading with many closing-hash tokens", `# a${" #".repeat(30_000)} x`],
  ["fence + spaces + junk", `\`\`\`${" ".repeat(60_000)}!`],
  ["unclosed brackets", "[".repeat(60_000)],
  ["unmatched emphasis", rep("*a ", 60_000)],
  ["unmatched strong", rep("**a ", 60_000)],
  ["unmatched code ticks", rep("`a ", 60_000)],
  ["link openers", rep("[a](", 60_000)],
  ["many list lines", rep("- a\n", 60_000)],
  ["horizontal-rule lookalike", `${rep("- ", 59_000)}x`],
];
for (const [name, source] of MARKDOWN_ATTACKS) {
  test(`markdown stays fast: ${name}`, () => {
    assert.ok(timed(() => parseMarkdown(source)) < 1500);
  });
}

const BIG = 1_000_000;
const SCRIPT_ATTACKS: [string, string][] = [
  ["rm flag soup", `rm -${"r".repeat(BIG)}`],
  ["repeated rm -r", rep("rm -r ", BIG)],
  ["repeated curl without pipe on one line", rep("curl x ", BIG)],
  ["repeated curl with pipes", rep("curl x | ", BIG)],
  ["repeated Remove-Item without -Recurse", rep("Remove-Item a ", BIG)],
  ["repeated subprocess( without close", rep("subprocess.run(", BIG)],
  ["repeated hex escapes", rep("\\x41", BIG)],
  ["repeated eval-like words", rep("eval ", BIG)],
];
for (const [name, text] of SCRIPT_ATTACKS) {
  test(`script risk scan stays fast: ${name}`, () => {
    assert.ok(timed(() => scanScriptRisks(text)) < 2000);
  });
}

const SECRET_ATTACKS: [string, string][] = [
  ["jwt-like separators", rep("eyJ-", BIG)],
  ["jwt-like dots", rep("eyJabcdefghij.", BIG)],
  ["credential keyword + quote", `api_key='${"a".repeat(BIG)}`],
  ["repeated provider prefixes", rep("ghp_ sk- xoxb- AIza AKIA ", BIG)],
];
for (const [name, text] of SECRET_ATTACKS) {
  test(`secret scan stays fast: ${name}`, () => {
    assert.ok(timed(() => scanSecrets(text, "x")) < 2000);
  });
}

// --- Yeniden yazılan kuralların anlamı eskisiyle aynı (hit/miss) ---
const risks = (text: string) => scanScriptRisks(text);

test("pipe_to_shell: a download piped to a shell is flagged, others are not", () => {
  assert.ok(risks("curl -fsSL https://x.sh | sh").includes("pipe_to_shell"));
  assert.ok(risks("wget -qO- https://x | sudo bash").includes("pipe_to_shell"));
  assert.ok(!risks("curl https://x -o file.sh && sh file.sh").includes("pipe_to_shell"));
  assert.ok(!risks("echo hi | sh").includes("pipe_to_shell"));
  assert.ok(!risks("curl x\n| sh").includes("pipe_to_shell"), "a pipe on the next line is another command");
});

test("destructive_delete: recursive rm of root/home, rmtree, Remove-Item -Recurse", () => {
  for (const hit of ["rm -rf /", "rm -fr ~", "rm -r $HOME", "rm -rf *", "rm -rf --no-preserve-root /", "shutil.rmtree(p)", "Remove-Item C:\\x -Recurse -Force", "mkfs.ext4 /dev/sda", "dd if=/dev/zero of=/dev/sda"]) {
    assert.ok(risks(hit).includes("destructive_delete"), hit);
  }
  for (const miss of ["rm -f /tmp/a", "rm file.txt", "rm -rf build", "Remove-Item a.txt"]) assert.ok(!risks(miss).includes("destructive_delete"), miss);
});

test("dynamic_eval: eval/exec/os.system and subprocess with shell=True", () => {
  for (const hit of ["eval $(cmd)", "exec(code)", "os.system('ls')", "subprocess.run(cmd, shell=True)", "subprocess.Popen(['a'], shell = True)", "bash -c 'x'", "new Function('a')"]) {
    assert.ok(risks(hit).includes("dynamic_eval"), hit);
  }
  assert.ok(!risks("subprocess.run(['ls'], check=True)").includes("dynamic_eval"));
  assert.ok(!risks("subprocess.run(['ls'])\nshell = True").includes("dynamic_eval"), "shell=True after the call closes does not count");
});

test("JWT detection keeps its shape: three dot-separated segments, first two start with eyJ", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r";
  assert.ok(containsJwt(jwt));
  assert.ok(containsJwt(`Authorization: Bearer ${jwt}`));
  assert.ok(containsJwt(`token-${jwt}`), "preceded by a hyphen (word boundary)");
  assert.ok(!containsJwt("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0"), "two segments only");
  assert.ok(!containsJwt("eyJshort.eyJshort.abc"), "segments too short");
  assert.ok(!containsJwt("abc.def.ghi-jklmnopqrstuvwxyz"));
  assert.ok(scanSecrets(jwt, "a.md").some((issue) => issue.code === "secret_jwt" && issue.severity === "error"));
});

test("markdown headings: closing hashes are trimmed and an empty heading still parses", () => {
  const [a, b, c] = parseMarkdown("# Title ##\n\n## Sub#\n\n#   \n");
  assert.deepEqual(a, { t: "h", level: 1, c: [{ t: "text", v: "Title" }] });
  assert.deepEqual(b, { t: "h", level: 2, c: [{ t: "text", v: "Sub" }] });
  assert.equal(c?.t, "h");
  assert.deepEqual(parseMarkdown("```js\ncode\n```"), [{ t: "code", lang: "js", v: "code" }]);
  assert.deepEqual(parseMarkdown("```\ncode\n```"), [{ t: "code", lang: "", v: "code" }]);
});
