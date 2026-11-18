import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildExtensionZip, EXTENSION_DIR, ZIP_ROOT } from "./build-extension.mjs";

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ply-zip-")), "ext.zip");

test("zip: tek üst klasör, manifest kökte, testler/README yok, manifestin başvurduğu her dosya içinde", () => {
  const r = buildExtensionZip({ out });
  const entries = unzipSync(new Uint8Array(fs.readFileSync(out)));
  const names = Object.keys(entries);
  assert.ok(names.every((n) => n.startsWith(`${ZIP_ROOT}/`)), "tüm dosyalar tek klasörde");
  assert.ok(names.includes(`${ZIP_ROOT}/manifest.json`));
  assert.equal(names.some((n) => /\/tests\//.test(n) || /README\.md$/.test(n)), false);
  const manifest = JSON.parse(new TextDecoder().decode(entries[`${ZIP_ROOT}/manifest.json`]));
  const refs = [manifest.background.service_worker, manifest.action.default_popup, manifest.side_panel.default_path, ...Object.values(manifest.icons), "_locales/tr/messages.json", "_locales/en/messages.json"];
  for (const f of refs) assert.ok(names.includes(`${ZIP_ROOT}/${f}`), `zip'te eksik: ${f}`);
  assert.equal(r.version, manifest.version);
  assert.ok(r.bytes < 1_000_000, `zip büyük: ${r.bytes}`);
});

test("zip kararlı: aynı içerik aynı baytlar", () => {
  const a = path.join(path.dirname(out), "a.zip"); const b = path.join(path.dirname(out), "b.zip");
  buildExtensionZip({ out: a }); buildExtensionZip({ out: b });
  assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)));
});

test("kaynak klasörde gizli anahtar ya da yerel dosya yok", () => {
  const out2 = path.join(path.dirname(out), "c.zip");
  buildExtensionZip({ out: out2 });
  const text = Object.values(unzipSync(new Uint8Array(fs.readFileSync(out2)))).map((d) => new TextDecoder("utf-8", { fatal: false }).decode(d)).join("\n");
  assert.equal(/service_role|BEGIN (RSA|PRIVATE)|eyJhbGciOi/.test(text), false);
  assert.ok(fs.existsSync(EXTENSION_DIR));
});
