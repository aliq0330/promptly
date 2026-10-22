// Spaces ekran görüntüleri (gözle tasarım kontrolü; test değil). SHOTS=<klasör> node shots-spaces.mjs
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupSpaces, SID } from "./mock-spaces.mjs";
import { svg } from "./detail-fixtures.mjs";

const PORT = 4195;
const BASE = `http://localhost:${PORT}/promptly`;
const OUT = process.env.SHOTS ?? "/tmp";
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });

function seed(db) {
  setupSpaces(db);
  db.addSpace(1, { title: "Neon şehir karakterleri", kind: "character", description: "Gece, yağmur ve neon tabelalar arasında yaşayan dört karakterin tasarım dosyası.", visibility: "link", members: [[U.bob, "editor"], [U.carol, "viewer"]] });
  db.addSpace(2, { title: "Kahve markası kimliği", kind: "brand", visibility: "private" });
  db.addSpace(3, { title: "Orman kulübesi iç mekân", kind: "interior", visibility: "public" });
  db.spaceGroups.push({ id: "g1", space_id: SID(1), name: "Karakterler", color: "primary", position: 0, created_at: "2026-09-20T10:00:00Z" });
  db.spaceGroups.push({ id: "g2", space_id: SID(1), name: "Mekânlar", color: "secondary", position: 1, created_at: "2026-09-20T10:00:00Z" });
  const colors = [["#6d5bd0", "#f2b8e8"], ["#1b2a49", "#e86a3c"], ["#2a6f6a", "#e9d8a6"], ["#7a3e2e", "#f2d6b3"], ["#203a43", "#2c5364"]];
  colors.forEach(([a, b], i) => db.addItem(SID(1), { kind: "image", media_url: svg(a, b, 900, 1200), media_width: 900, media_height: 1200, title: `Karakter ${i + 1}`, x: i * 200, y: 0, w: 180, h: 240, z: i, group_id: i < 3 ? "g1" : "g2" }));
  db.addItem(SID(1), { kind: "prompt", is_draft: true, title: "Neon sokak", body: "cinematic rainy neon street at night, {character}, volumetric fog, 35mm", x: 0, y: 300, w: 280, h: 200, z: 6 });
  db.addItem(SID(1), { kind: "note", title: "Renk kararı", body: "Mor + turuncu ana kontrast. Yeşil yalnız tabelalarda.", color: "warning", x: 320, y: 300, w: 220, h: 180, z: 7 });
  db.addItem(SID(1), { kind: "note", title: "Gizli plan", body: "Ekip içi", color: "danger", is_private: true, x: 580, y: 300, w: 200, h: 150, z: 8 });
  db.spacePalettes.push({ id: "p1", space_id: SID(1), name: "Gece paleti", description: "Ana renkler", colors: ["#2b1055", "#7597de", "#ff7a1a", "#f2e9e4", "#22223b"], source: "manual", source_item_id: null, position: 0, created_by: null, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-21T10:00:00Z" });
  db.addItem(SID(1), { kind: "palette", palette_id: "p1", x: 820, y: 300, w: 280, h: 150, z: 9 });
  db.addItem(SID(3), { kind: "image", media_url: svg("#2a6f6a", "#e9d8a6"), title: "Şömine" });
  db.spaceState.push({ space_id: SID(1), user_id: U.alice.id, favorite: true, last_opened_at: "2026-10-20T10:00:00Z" });
  db.spaceActivity.push({ id: "a1", space_id: SID(1), actor_id: U.bob.id, action: "image_added", label: null, count: 3, created_at: "2026-10-20T09:00:00Z" });
}

for (const [name, viewport, path] of [
  ["home-desktop", { width: 1280, height: 900 }, "/spaces"],
  ["home-phone", { width: 390, height: 844 }, "/spaces"],
  ["overview-desktop", { width: 1280, height: 900 }, `/spaces/local?id=${SID(1)}`],
  ["board-desktop", { width: 1280, height: 900 }, `/spaces/local?id=${SID(1)}&tab=board`],
  ["board-phone", { width: 390, height: 844 }, `/spaces/local?id=${SID(1)}&tab=board`],
  ["palette-desktop", { width: 1280, height: 900 }, `/spaces/local?id=${SID(1)}&tab=palette`],
  ["images-phone", { width: 390, height: 844 }, `/spaces/local?id=${SID(1)}&tab=images`],
  ["home-dark", { width: 1280, height: 900 }, "/spaces"],
]) {
  const db = createDb();
  seed(db);
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  if (name.endsWith("dark")) await context.addInitScript(() => { try { localStorage.setItem("promptly-theme", "dark"); } catch {} });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(1800);
  if (name === "board-desktop") {
    await page.locator("[data-board-item]").first().click();
    await page.keyboard.down("Shift");
    await page.locator("[data-board-item]").nth(1).click();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/spaces-${name}.png`, fullPage: !name.startsWith("board") });
  await context.close();
}
await browser.close();
server.close();
console.log("ok");
