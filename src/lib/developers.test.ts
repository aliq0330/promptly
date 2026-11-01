import { test } from "node:test";
import assert from "node:assert/strict";
import { developerEndpoints, developerSnippets } from "./developers.ts";

test("endpoints are derived from the Supabase URL (trailing slashes ignored)", () => {
  const endpoints = developerEndpoints("https://abc.supabase.co//");
  assert.deepEqual(endpoints, {
    mcpUrl: "https://abc.supabase.co/functions/v1/mcp",
    mcpMeUrl: "https://abc.supabase.co/functions/v1/mcp/me",
    apiBase: "https://abc.supabase.co/functions/v1/api/v1",
    openApiUrl: "https://abc.supabase.co/functions/v1/api/v1/openapi.json",
  });
});

test("a missing, non-https or path-carrying URL yields no endpoints (the page shows no made-up address)", () => {
  assert.equal(developerEndpoints(undefined), null);
  assert.equal(developerEndpoints(""), null);
  assert.equal(developerEndpoints("http://localhost:54321"), null);
  assert.equal(developerEndpoints("https://abc.supabase.co/rest/v1"), null);
});

test("snippets embed the real addresses and the Cursor JSON parses", () => {
  const endpoints = developerEndpoints("https://abc.supabase.co")!;
  const snippets = developerSnippets(endpoints);
  assert.equal(snippets.claudeCode, "claude mcp add --transport http promptly https://abc.supabase.co/functions/v1/mcp");
  assert.deepEqual(JSON.parse(snippets.cursorJson), { mcpServers: { promptly: { url: endpoints.mcpUrl } } });
  assert.ok(snippets.curlSearch.includes(`${endpoints.apiBase}/prompts?q=`));
  assert.ok(snippets.curlFill.includes(`${endpoints.apiBase}/prompts/<id>/fill`));
  assert.ok(snippets.fetchJs.includes(endpoints.apiBase));
});

test("each client gets its own address key (they are NOT interchangeable)", () => {
  const endpoints = developerEndpoints("https://abc.supabase.co")!;
  const snippets = developerSnippets(endpoints);
  assert.deepEqual(JSON.parse(snippets.vscodeJson), { servers: { promptly: { type: "http", url: endpoints.mcpUrl } } });
  assert.deepEqual(JSON.parse(snippets.windsurfJson), { mcpServers: { promptly: { serverUrl: endpoints.mcpUrl } } });
  assert.equal(snippets.geminiCli, `gemini mcp add --transport http --scope user promptly ${endpoints.mcpUrl}`);
  assert.equal(snippets.codexToml, `[mcp_servers.promptly]\nurl = "${endpoints.mcpUrl}"`);
  assert.deepEqual(JSON.parse(snippets.claudeDesktopJson), { mcpServers: { promptly: { command: "npx", args: ["-y", "promptly-mcp"] } } });
  assert.ok(snippets.pythonRequests.includes(`${endpoints.apiBase}/prompts`));
});

test("personal (key) snippets use the key placeholder, the personal MCP address and never a real secret", () => {
  const endpoints = developerEndpoints("https://abc.supabase.co")!;
  const snippets = developerSnippets(endpoints);
  assert.ok(snippets.curlMe.includes(`${endpoints.apiBase}/me"`) && snippets.curlMe.includes("pmt_YOUR_KEY"));
  assert.ok(snippets.curlMeList.includes(`${endpoints.apiBase}/me/prompts?status=draft`));
  assert.ok(snippets.curlMeSave.includes("-X POST") && snippets.curlMeSave.includes("@promptly-prompts.json"));
  assert.ok(snippets.claudeCodeMe.includes(`${endpoints.mcpUrl}/me`) && snippets.claudeCodeMe.includes('--header "Authorization: Bearer pmt_YOUR_KEY"'));
  assert.deepEqual(JSON.parse(snippets.cursorMeJson), { mcpServers: { "promptly-me": { url: `${endpoints.mcpUrl}/me`, headers: { Authorization: "Bearer pmt_YOUR_KEY" } } } });
  for (const text of [snippets.curlMe, snippets.curlMeList, snippets.curlMeSave, snippets.claudeCodeMe, snippets.cursorMeJson]) assert.ok(!/pmt_[A-Za-z0-9_-]{43}/.test(text), "no real-looking key in any example");
});
