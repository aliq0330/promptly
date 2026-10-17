import test from "node:test";
import assert from "node:assert/strict";
import {
  assignableRoles,
  can,
  canSeeSettingsTab,
  canSeeChatSettings,
  capabilitiesFor,
  DEFAULT_ROLE_PERMISSIONS,
  normalizeRolePermissions,
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
  assert.equal(url, `https://aliq0330.github.io/promptly/communities/join#${TOKEN}`);
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

test("yetki varsayılanları bugünkü matrisle aynı; owner her zaman, üye hiçbir zaman", () => {
  assert.equal(can("owner", "delete_messages"), true);
  assert.equal(can("admin", "change_visibility"), true);
  assert.equal(can("moderator", "edit_settings"), false);
  assert.equal(can("moderator", "manage_requests"), true);
  assert.equal(can("moderator", "ban_members"), false);
  assert.equal(can("member", "manage_requests"), false);
  assert.equal(can(null, "manage_requests"), false);
});

test("owner yetkiyi verince/alınca yardımcılar buna uyar; owner kısıtlanamaz", () => {
  const perms = normalizeRolePermissions({ admin: { ban_members: false, manage_roles: false }, moderator: { edit_settings: true, ban_members: true } });
  assert.equal(can("admin", "ban_members", perms), false);
  assert.equal(can("moderator", "edit_settings", perms), true);
  assert.equal(canBanMember("admin", "member", perms), false);
  assert.equal(canBanMember("moderator", "member", perms), true);
  assert.equal(canBanMember("moderator", "admin", perms), false, "rütbe kuralı yetkiden bağımsız");
  assert.deepEqual(assignableRoles("admin", "member", perms), []);
  assert.equal(canRemoveMember("owner", "admin", perms), true);
  const noRemove = normalizeRolePermissions({ moderator: { remove_members: false, delete_messages: false } });
  assert.equal(canRemoveMember("moderator", "member", noRemove), false);
  assert.equal(canModerateMessage("moderator", "member", noRemove), false);
  assert.equal(canModerateMessage("owner", "admin", noRemove), true);
});

test("ayarlar sekmesi: owner her zaman, diğerleri ayar/görünürlük yetkisiyle", () => {
  assert.equal(canSeeSettingsTab("owner"), true);
  assert.equal(canSeeSettingsTab("admin"), true);
  assert.equal(canSeeSettingsTab("moderator"), false);
  assert.equal(canSeeSettingsTab("moderator", normalizeRolePermissions({ moderator: { change_visibility: true } })), true);
  assert.equal(canSeeSettingsTab("member"), false);
});

test("saklı yetkiler normalize edilir: eksik/bozuk anahtar → varsayılan; moderatöre manage_roles listelenmez", () => {
  assert.deepEqual(normalizeRolePermissions(null), DEFAULT_ROLE_PERMISSIONS);
  assert.deepEqual(normalizeRolePermissions({ admin: "x", moderator: { edit_settings: "evet" } }), DEFAULT_ROLE_PERMISSIONS);
  assert.equal(normalizeRolePermissions({ admin: { edit_settings: false } }).admin.edit_settings, false);
  assert.equal(capabilitiesFor("moderator").includes("manage_roles"), false);
  assert.equal(capabilitiesFor("admin").includes("manage_roles"), true);
  assert.equal(capabilitiesFor("admin").length, 15);
  // Eski gruplarda `pin_messages` anahtarı yoktur: varsayılan (admin + moderatör) geçerli olur.
  assert.equal(normalizeRolePermissions({ moderator: { edit_settings: true } }).moderator.pin_messages, true);
  assert.equal(normalizeRolePermissions({ moderator: { pin_messages: false } }).moderator.pin_messages, false);
});

test("sohbet ayarları: owner her zaman, diğerleri yalnız edit_settings ile (görünürlük yetkisi sohbet ayarı vermez)", () => {
  assert.equal(canSeeChatSettings("owner"), true);
  assert.equal(canSeeChatSettings("admin"), true);
  assert.equal(canSeeChatSettings("moderator"), false);
  assert.equal(canSeeChatSettings("moderator", normalizeRolePermissions({ moderator: { change_visibility: true } })), false);
  assert.equal(canSeeChatSettings("moderator", normalizeRolePermissions({ moderator: { edit_settings: true } })), true);
  assert.equal(canSeeChatSettings("member"), false);
  assert.equal(canSeeChatSettings(null), false);
});
