import test from "node:test";
import assert from "node:assert/strict";
import { localizeNotificationMessage } from "./notification-message.ts";

// `t` taklidi: anahtar + parametreler (JSON), kalıbın doğru anahtara ve doğru parçalara ayrıldığını görmek için.
const fakeT = ((key: string, params?: Record<string, string | number>) => JSON.stringify({ key, params: params ?? {} })) as never;
const run = (message: string, language: "tr" | "en" = "en") => localizeNotificationMessage(message, language, fakeT);

test("milestone sentences (docs/history/295-*) are recognised and the prompt title is passed through untouched", () => {
  assert.deepEqual(JSON.parse(run('Promptun "Neon Tokyo" 100 kopyalamaya ulaştı.')), { key: "notifMsg.milestoneCopies", params: { name: "Neon Tokyo", count: "100" } });
  assert.deepEqual(JSON.parse(run('Promptun "Neon Tokyo" 50 tepkiye ulaştı.')), { key: "notifMsg.milestoneReactions", params: { name: "Neon Tokyo", count: "50" } });
});

test("a title that itself contains quotes still splits at the last quote before the count", () => {
  const parsed = JSON.parse(run('Promptun "Ali\'nin "gizli" tarifi" 10000 kopyalamaya ulaştı.'));
  assert.equal(parsed.key, "notifMsg.milestoneCopies");
  assert.deepEqual(parsed.params, { name: 'Ali\'nin "gizli" tarifi', count: "10000" });
});

test("Turkish is returned exactly as stored; older 'Promptun için …' sentences are not mistaken for milestones", () => {
  const stored = 'Promptun "Neon Tokyo" 100 kopyalamaya ulaştı.';
  assert.equal(run(stored, "tr"), stored);
  assert.equal(JSON.parse(run('Promptun için bir düzenleme önerdi: "x"')).key, "notifMsg.suggestedEdit");
});

test("rol değişikliği cümleleri (docs/history/305-*) topluluk adı çevrilmeden doğru anahtara düşer", () => {
  assert.deepEqual(JSON.parse(run('"Neon Kulübü" topluluğunda rolün yönetici oldu.')), { key: "notifMsg.communityRoleAdmin", params: { name: "Neon Kulübü", preview: "" } });
  assert.deepEqual(JSON.parse(run('"Neon Kulübü" topluluğunda rolün moderatör oldu.')), { key: "notifMsg.communityRoleModerator", params: { name: "Neon Kulübü", preview: "" } });
  assert.deepEqual(JSON.parse(run('"Neon Kulübü" topluluğunda rolün üye olarak değiştirildi.')), { key: "notifMsg.communityRoleMember", params: { name: "Neon Kulübü", preview: "" } });
});
