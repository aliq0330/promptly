import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TOOLS } from "./ai-tool-catalog.ts";
import { COLOR_TOOL_LOGOS, MONO_TOOL_LOGOS, toolLogo } from "./ai-tool-logos.ts";

test("every catalog tool has a brand logo file and the mono flag matches the file", () => {
  for (const tool of AI_TOOLS) {
    const logo = toolLogo(tool.id);
    assert.ok(logo, `${tool.id} has no logo`);
    const svg = readFileSync(new URL(`../../public${logo.path}`, import.meta.url), "utf8");
    assert.ok(svg.startsWith("<svg") && svg.includes("viewBox"), `${tool.id}: not an SVG with a viewBox`);
    assert.doesNotMatch(svg, /<script|onload=|<foreignObject/i, `${tool.id}: unsafe SVG content`);
    assert.equal(svg.includes("currentColor"), logo.mono, `${tool.id}: mono flag does not match the file`);
  }
});

test("no tool is both mono and colour, and no logo is listed for a tool that does not exist", () => {
  const ids = new Set(AI_TOOLS.map((tool) => tool.id));
  for (const id of MONO_TOOL_LOGOS) {
    assert.equal(COLOR_TOOL_LOGOS.has(id), false, id);
    assert.ok(ids.has(id), `${id} is not in the catalog`);
  }
  for (const id of COLOR_TOOL_LOGOS) assert.ok(ids.has(id), `${id} is not in the catalog`);
  assert.equal(toolLogo("not-a-tool"), null);
});
