import test from "node:test";
import assert from "node:assert/strict";
import { localizeNotificationMessage, withoutEmptyPreview } from "./notification-message.ts";

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

test("an attachment-only comment (empty quoted preview, docs/history/308-*) reads naturally in both languages", () => {
  assert.equal(withoutEmptyPreview('Yorumuna yanıt verdi: ""'), "Yorumuna yanıt verdi.");
  assert.equal(withoutEmptyPreview('Yorumuna yanıt verdi: "selam"'), 'Yorumuna yanıt verdi: "selam"');
  assert.equal(run('Yorumuna yanıt verdi: ""', "tr"), "Yorumuna yanıt verdi.");
  assert.equal(JSON.parse(run('Yorumuna yanıt verdi: ""')).key, "notifMsg.repliedCommentNone");
  assert.equal(JSON.parse(run('Workflow\'una yorum yaptı: ""')).key, "notifMsg.commentedWorkflowNone");
  assert.equal(JSON.parse(run('Seni bir yorumda andı: ""')).key, "notifMsg.mentionedCommentNone");
  assert.equal(JSON.parse(JSON.parse(run("Sana bir mesaj gönderdi: bir GIF gönderdi")).params.preview).key, "notifMsg.previewGif");
});

test("haftalık özet (docs/history/307-*): sayılar korunur, etiketler çevrilir; bilinmeyen parça olduğu gibi kalır; Türkçe aynen döner", () => {
  const out = (m: string) => JSON.parse(run(m));
  assert.deepEqual(out("Haftalık özet: 12 kopyalama, 1 tepki."), { key: "notifMsg.weeklyDigest", params: { parts: '{"key":"notifMsg.weeklyCopies","params":{"count":"12"}}, {"key":"notifMsg.weeklyReactions","params":{"count":"1"}}' } });
  assert.deepEqual(out("Haftalık özet: 2 yeni takipçi.").params.parts, '{"key":"notifMsg.weeklyFollowers","params":{"count":"2"}}');
  assert.match(out("Haftalık özet: 3 başka şey.").params.parts, /^3 başka şey$/);
  assert.equal(run("Haftalık özet: 12 kopyalama.", "tr"), "Haftalık özet: 12 kopyalama.");
});

test("the API-key-created sentence (docs/history/314-*) is recognised and the key name is passed through untouched", () => {
  assert.deepEqual(
    JSON.parse(run('Yeni bir API anahtarı oluşturuldu: "Dizüstü" (pmt_Ab3d…). Sen oluşturmadıysan hemen iptal et.')),
    { key: "notifMsg.apiTokenCreated", params: { name: "Dizüstü", prefix: "pmt_Ab3d" } },
  );
});
