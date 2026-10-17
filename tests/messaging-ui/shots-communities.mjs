// Topluluk arayüzü ekran görüntüsü üreticisi (ağ taklitli). Kullanım: OUT=/yol CHROMIUM_PATH=… node tests/messaging-ui/shots-communities.mjs
// Doğrulama değil, GÖRSEL inceleme içindir; çıktı klasörüne sayfa × genişlik PNG'leri yazar.
import { chromium } from "playwright";
import fs from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const OUT = process.env.OUT ?? "/tmp/community-shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4177/promptly";
const server = await serve(4177);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const world = (db) => {
  db.addCommunity(id(1), { name: "Portre ve Karakter Tasarımı", description: "Gerçekçi portreler, ilüstrasyon karakterleri ve karakter tutarlılığı üzerine prompt paylaşımları ve eleştiriler.", visibility: "public", myRole: "owner", members: [[U.bob, "owner"]] });
  db.addCommunity(id(2), { name: "Haftalık Prompt Yarışması", description: "Her hafta yeni tema, yarışma havası.", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] });
  for (let i = 0; i < 8; i += 1) db.addCommunity(id(10 + i), { name: `Öneri Topluluğu ${i + 1}`, description: "Kısa bir topluluk açıklaması burada yer alır.", visibility: i % 3 ? "public" : "restricted", myRole: "none", members: [[U.bob, "owner"]] });
  for (let i = 0; i < 6; i += 1) {
    db.addPost(id(1 + (i % 2)), { title: `Edebi anlatım tonu ${i + 1}`, note: i % 2 ? "Kısa bir not: bu başvuruda neden paylaştığımı anlatıyorum." : null, author: i % 2 ? U.carol : U.bob, likeCount: i * 3, commentCount: i });
  }
  db.addPost(id(1), { title: "Topluluğa özgü istek", kind: "native", type: "request", visibility: "private" });
};

const VIEWPORTS = [["desktop-1440", 1440, 1000], ["desktop-1280", 1280, 900], ["lap-1024", 1024, 900], ["tablet-820", 820, 1000], ["tablet-768", 768, 1000], ["mobile-390", 390, 844]];
const PAGES = [
  ["home-posts", "/communities"],
  ["home-discover", "/communities?tab=discover"],
  ["home-invites", "/communities?tab=invites"],
  ["all", "/communities/all"],
  ["detail-feed", `/communities/local?id=${id(1)}`],
  ["detail-members", `/communities/local?id=${id(1)}&tab=members`],
  ["detail-about", `/communities/local?id=${id(1)}&tab=about`],
  ["detail-manage-settings", `/communities/local?id=${id(1)}&tab=manage&section=settings`],
  ["detail-manage-stats", `/communities/local?id=${id(1)}&tab=manage`],
];
const only = process.env.ONLY?.split(",");
const vpOnly = process.env.VP?.split(",");
const theme = process.env.THEME;
for (const [vname, width, height] of VIEWPORTS) {
  if (vpOnly && !vpOnly.includes(vname)) continue;
  for (const [pname, path] of PAGES) {
    if (only && !only.includes(pname)) continue;
    const db = createDb();
    setupCommunities(db);
    world(db);
    const context = await browser.newContext({ viewport: { width, height } });
    await installMock(context, db, {});
    await context.addInitScript((th) => { try { localStorage.setItem("promptly-language", "tr"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, theme);
    const page = await context.newPage();
    await page.goto(BASE + path);
    await page.waitForTimeout(1400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}/${pname}__${vname}.png`, fullPage: process.env.FULL === "1" });
    console.log(`${pname} @ ${vname}: overflow=${overflow}`);
    await context.close();
  }
}
await browser.close(); server.close();
