import test from "node:test";
import assert from "node:assert/strict";
import {
  assignableRoles,
  buildGroupJoinUrl,
  canBanMember,
  canModerateMessage,
  canPostInGroup,
  canRemoveMember,
  clampMemberLimit,
  countSkippedByReason,
  extractGroupErrorCode,
  GROUP_ERROR_CODES,
  isGroupManager,
  isGroupStaff,
  leaveOutcome,
  parseGroupJoinToken,
  parseInviteResult,
  parseVisibilityResult,
  validateGroupDescription,
  validateGroupName,
} from "./chat-groups.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

test("rol grupları: yönetici = owner/admin, kadro = + moderator", () => {
  assert.equal(isGroupManager("owner"), true);
  assert.equal(isGroupManager("admin"), true);
  assert.equal(isGroupManager("moderator"), false);
  assert.equal(isGroupManager("member"), false);
  assert.equal(isGroupManager(null), false);
  assert.equal(isGroupStaff("moderator"), true);
  assert.equal(isGroupStaff("member"), false);
});

test("üye çıkarma: kendinden düşük rütbe; moderatör yalnız üye; üye hiç", () => {
  assert.equal(canRemoveMember("owner", "admin"), true);
  assert.equal(canRemoveMember("owner", "owner"), false);
  assert.equal(canRemoveMember("admin", "moderator"), true);
  assert.equal(canRemoveMember("admin", "admin"), false);
  assert.equal(canRemoveMember("admin", "owner"), false);
  assert.equal(canRemoveMember("moderator", "member"), true);
  assert.equal(canRemoveMember("moderator", "moderator"), false);
  assert.equal(canRemoveMember("moderator", "admin"), false);
  assert.equal(canRemoveMember("member", "member"), false);
  assert.equal(canRemoveMember(null, "member"), false);
});

test("yasaklama yalnız owner/admin'de", () => {
  assert.equal(canBanMember("owner", "member"), true);
  assert.equal(canBanMember("admin", "moderator"), true);
  assert.equal(canBanMember("moderator", "member"), false);
  assert.equal(canBanMember("admin", "admin"), false);
});

test("rol atama: owner üçünü, admin yalnız moderator/member; sahibe ve yöneticiye (admin) dokunulmaz", () => {
  assert.deepEqual(assignableRoles("owner", "member"), ["admin", "moderator"]);
  assert.deepEqual(assignableRoles("owner", "admin"), ["moderator", "member"]);
  assert.deepEqual(assignableRoles("owner", "owner"), []);
  assert.deepEqual(assignableRoles("admin", "member"), ["moderator"]);
  assert.deepEqual(assignableRoles("admin", "moderator"), ["member"]);
  assert.deepEqual(assignableRoles("admin", "admin"), []);
  assert.deepEqual(assignableRoles("admin", "owner"), []);
  assert.deepEqual(assignableRoles("moderator", "member"), []);
  assert.deepEqual(assignableRoles("member", "member"), []);
  assert.deepEqual(assignableRoles(null, "member"), []);
});

test("yönetici mesaj silme: yalnız daha düşük rütbedeki gönderen", () => {
  assert.equal(canModerateMessage("moderator", "member"), true);
  assert.equal(canModerateMessage("moderator", "moderator"), false);
  assert.equal(canModerateMessage("moderator", "admin"), false);
  assert.equal(canModerateMessage("admin", "moderator"), true);
  assert.equal(canModerateMessage("admin", "admin"), false);
  assert.equal(canModerateMessage("owner", "admin"), true);
  assert.equal(canModerateMessage("member", "member"), false);
  assert.equal(canModerateMessage("moderator", null), true, "artık üye olmayan gönderen en düşük rütbe sayılır");
});

test("yazma yetkisi: 'members' herkes, 'admins' yalnız kadro; üye olmayan hiç", () => {
  assert.equal(canPostInGroup("member", "members"), true);
  assert.equal(canPostInGroup("member", "admins"), false);
  assert.equal(canPostInGroup("moderator", "admins"), true);
  assert.equal(canPostInGroup("owner", "admins"), true);
  assert.equal(canPostInGroup(null, "members"), false);
});

test("ayrılma: sahip başka üye varken devretmeli; tek kişiyse grup kapanır", () => {
  assert.equal(leaveOutcome("member", 10), "leave");
  assert.equal(leaveOutcome("admin", 2), "leave");
  assert.equal(leaveOutcome("owner", 5), "must_transfer");
  assert.equal(leaveOutcome("owner", 1), "closes_group");
});

test("ad ve açıklama doğrulama: boş / yalnız boşluk / çok uzun", () => {
  assert.equal(validateGroupName(""), "empty");
  assert.equal(validateGroupName("   \n "), "empty");
  assert.equal(validateGroupName("Prompt Kulübü"), null);
  assert.equal(validateGroupName("x".repeat(60)), null);
  assert.equal(validateGroupName("x".repeat(61)), "too_long");
  assert.equal(validateGroupName(`  ${"x".repeat(60)}  `), null, "kenar boşlukları sayılmaz");
  assert.equal(validateGroupDescription("a".repeat(500)), null);
  assert.equal(validateGroupDescription("a".repeat(501)), "too_long");
});

test("üye sınırı sınırlanır", () => {
  assert.equal(clampMemberLimit(1), 2);
  assert.equal(clampMemberLimit(5000), 1000);
  assert.equal(clampMemberLimit(10.4), 10);
  assert.equal(clampMemberLimit(Number.NaN), 256);
});

test("davet bağlantısı: tam URL, yalnız token ve kötü girdi", () => {
  const url = buildGroupJoinUrl("https://aliq0330.github.io", "/promptly", TOKEN);
  assert.equal(url, `https://aliq0330.github.io/promptly/groups/join#${TOKEN}`);
  assert.equal(parseGroupJoinToken(url), TOKEN);
  assert.equal(parseGroupJoinToken(TOKEN), TOKEN);
  assert.equal(parseGroupJoinToken(`  ${url}  `), TOKEN);
  assert.equal(parseGroupJoinToken(""), null);
  assert.equal(parseGroupJoinToken("kisa"), null);
  assert.equal(parseGroupJoinToken("https://x.test/groups/join#kisa"), null);
  assert.equal(parseGroupJoinToken(`${TOKEN}<script>`), null);
});

test("hata kodu: bilinen kodlar çıkarılır, en uzun eşleşme kazanır, bilinmeyen null", () => {
  for (const code of GROUP_ERROR_CODES) assert.equal(extractGroupErrorCode(`PostgrestError: ${code}`), code);
  assert.equal(extractGroupErrorCode("member_limit_below_count"), "member_limit_below_count");
  assert.equal(extractGroupErrorCode("Bilinmeyen bir hata"), null);
  assert.equal(extractGroupErrorCode(null), null);
});

test("görünürlük sonucu: ayrıştırma, atlananların neden sayımı, bozuk girdi", () => {
  const result = parseVisibilityResult({
    changed: true,
    visibility: "public",
    accepted_count: 2,
    already_member_count: 1,
    skipped_count: 3,
    skipped: [
      { request_id: "r1", user_id: "u1", reason: "blocked" },
      { request_id: "r2", user_id: "u2", reason: "member_limit" },
      { request_id: "r3", user_id: "u3", reason: "member_limit" },
      { request_id: "r4", user_id: "u4", reason: "bilinmeyen" },
    ],
    pending_remaining: 3,
    member_count: 5,
  });
  assert.ok(result);
  assert.equal(result.acceptedCount, 2);
  assert.equal(result.alreadyMemberCount, 1);
  assert.equal(result.skipped.length, 3, "bilinmeyen neden atılır");
  assert.deepEqual(countSkippedByReason(result), { blocked: 1, banned: 0, member_limit: 2 });
  assert.equal(parseVisibilityResult(null), null);
  assert.equal(parseVisibilityResult({ visibility: "gizli" }), null);
});

test("davet sonucu ayrıştırma", () => {
  const result = parseInviteResult({
    invited_count: 2,
    skipped: [
      { user_id: "u1", reason: "already_member" },
      { user_id: "u2", reason: "uydurma" },
    ],
  });
  assert.equal(result.invitedCount, 2);
  assert.deepEqual(result.skipped, [{ userId: "u1", reason: "already_member" }]);
  assert.deepEqual(parseInviteResult(undefined), { invitedCount: 0, skipped: [] });
});
