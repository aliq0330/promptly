import test from "node:test";
import assert from "node:assert/strict";
import { teamWording } from "./team-wording.ts";

test("Türkçe: topluluk sözcüğü ek uyumuyla ekibe çevrilir (docs/history/351-*)", () => {
  const cases: [string, string][] = [
    ["Topluluk", "Ekip"],
    ["Topluluğu sil", "Ekibi sil"],
    ["Topluluğa katıl", "Ekibe katıl"],
    ["Topluluğun adı", "Ekibin adı"],
    ["toplulukta paylaşıldı", "ekipte paylaşıldı"],
    ["topluluktan ayrıl", "ekipten ayrıl"],
    ["Topluluğunda yeni etkinlik", "Ekibinde yeni etkinlik"],
    ["topluluğundaki paylaşım", "ekibindeki paylaşım"],
    ["Toplulukları yönet", "Ekipleri yönet"],
    ["topluluklar", "ekipler"],
    ["toplulukların", "ekiplerin"],
    ["Topluluğumuz", "Ekibimiz"],
    ["Topluluğunuzu davet edin", "Ekibinizi davet edin"],
    ["Topluluğa özel içerik; topluluğun üyeleri görür.", "Ekibe özel içerik; ekibin üyeleri görür."],
  ];
  for (const [input, expected] of cases) assert.equal(teamWording(input, "tr"), expected, input);
});

test("Türkçe: topluluk içermeyen metin ve başka sözcükler değişmez", () => {
  for (const text of ["Üyeler", "Etkinlikler", "Sohbeti aç", "Kuralları kabul et", "Çok toplu iş"]) assert.equal(teamWording(text, "tr"), text);
});

test("İngilizce: community → team (çoğul, büyük harf, iyelik)", () => {
  assert.equal(teamWording("Leave the community", "en"), "Leave the team");
  assert.equal(teamWording("Community rules", "en"), "Team rules");
  assert.equal(teamWording("Your communities", "en"), "Your teams");
  assert.equal(teamWording("the community's members", "en"), "the team's members");
  assert.equal(teamWording("Communities", "en"), "Teams");
  assert.equal(teamWording("opportunity unity", "en"), "opportunity unity");
});

test("kullanıcı içeriği şablon doldurulduktan SONRA girer: ad değişmez (çağıran şablonu çevirir, ad sonradan)", () => {
  const template = teamWording("{{name}} topluluğundan ayrıldın.", "tr");
  assert.equal(template, "{{name}} ekibinden ayrıldın.");
  assert.equal(template.replace("{{name}}", "Topluluk Ekibi"), "Topluluk Ekibi ekibinden ayrıldın.");
});
