import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canAddToArea,
  canDeleteItem,
  canEditItemContent,
  canProposeChange,
  canReview,
  canSubmitItem,
  canWithdrawItem,
  clampProjectRoleForGuest,
  effectiveVariables,
  fillProjectVariables,
  isProjectRole,
  isReviewState,
  projectLink,
  projectRoleAtLeast,
  projectRoleRank,
  PROJECT_ROLES,
  type ReviewState,
} from "./team-projects.ts";

const ME = "u-me";
const OTHER = "u-other";
const item = (state: ReviewState, createdBy: string | null = ME) => ({ state, createdBy });

test("roller: sıra ve karşılaştırma (SQL _team_project_rank aynası)", () => {
  assert.deepEqual(PROJECT_ROLES, ["lead", "edit", "view"]);
  assert.equal(projectRoleRank("lead"), 3);
  assert.equal(projectRoleRank("edit"), 2);
  assert.equal(projectRoleRank("view"), 1);
  assert.equal(projectRoleRank(null), 0);
  assert.ok(projectRoleAtLeast("lead", "edit"));
  assert.ok(projectRoleAtLeast("edit", "edit"));
  assert.ok(!projectRoleAtLeast("view", "edit"));
  assert.ok(!projectRoleAtLeast(null, "view"));
  assert.ok(isProjectRole("lead") && !isProjectRole("manage") && !isProjectRole(null));
  assert.ok(isReviewState("pending") && !isReviewState("rejected"));
});

test("konuk lider olamaz (SQL: konuk en çok edit)", () => {
  assert.equal(clampProjectRoleForGuest("lead"), "edit");
  assert.equal(clampProjectRoleForGuest("edit"), "edit");
  assert.equal(clampProjectRoleForGuest("view"), "view");
});

test("ekleme/karar yetkisi: görüntüleyici ekleyemez, yalnız lider karar verir", () => {
  assert.ok(canAddToArea("edit") && canAddToArea("lead") && !canAddToArea("view") && !canAddToArea(null));
  assert.ok(canReview("lead") && !canReview("edit") && !canReview("view"));
});

test("içerik düzenleme/silme: lider her zaman; düzenleyici yalnız kendi taslağı ya da değişiklik istenen (SQL tetikleyicisi aynası)", () => {
  for (const state of ["draft", "pending", "approved", "changes"] as ReviewState[]) {
    assert.ok(canEditItemContent("lead", item(state, OTHER), ME), `lider ${state}`);
    assert.ok(canDeleteItem("lead", item(state, OTHER), ME), `lider siler ${state}`);
  }
  assert.ok(canEditItemContent("edit", item("draft"), ME));
  assert.ok(canEditItemContent("edit", item("changes"), ME));
  assert.ok(!canEditItemContent("edit", item("pending"), ME), "bekleyen kilitli");
  assert.ok(!canEditItemContent("edit", item("approved"), ME), "onaylı kilitli");
  assert.ok(!canEditItemContent("edit", item("draft", OTHER), ME), "başkasının taslağı");
  assert.ok(!canEditItemContent("view", item("draft"), ME));
  assert.ok(!canEditItemContent("edit", item("draft", null), ME));
  assert.ok(canDeleteItem("edit", item("draft"), ME) && !canDeleteItem("edit", item("approved"), ME));
});

test("onaya gönder / geri çek / öner", () => {
  assert.ok(canSubmitItem("edit", item("draft"), ME));
  assert.ok(canSubmitItem("edit", item("changes"), ME));
  assert.ok(!canSubmitItem("edit", item("pending"), ME));
  assert.ok(!canSubmitItem("edit", item("draft", OTHER), ME));
  assert.ok(!canSubmitItem("lead", item("draft"), ME), "liderin öğeleri onaylı başlar");
  assert.ok(!canSubmitItem("view", item("draft"), ME));
  assert.ok(canWithdrawItem("edit", item("pending"), ME));
  assert.ok(!canWithdrawItem("edit", item("pending", OTHER), ME));
  assert.ok(!canWithdrawItem("edit", item("draft"), ME));
  assert.ok(canProposeChange("edit", item("approved")));
  assert.ok(!canProposeChange("lead", item("approved")), "lider doğrudan düzenler");
  assert.ok(!canProposeChange("edit", item("pending")));
});

test("adres: proje/dosya/pano/onay/sekme parametreleri", () => {
  assert.equal(projectLink("t1"), "/teams/local?id=t1&tab=projects");
  assert.equal(projectLink("t1", "p1"), "/teams/local?id=t1&tab=projects&project=p1");
  assert.equal(projectLink("t1", "p1", { file: "f1", sub: "images" }), "/teams/local?id=t1&tab=projects&project=p1&file=f1&sub=images");
  assert.equal(projectLink("t1", "p1", { board: "b1" }), "/teams/local?id=t1&tab=projects&project=p1&board=b1");
  assert.equal(projectLink("t1", "p1", { review: true }), "/teams/local?id=t1&tab=projects&project=p1&review=1");
});

test("değişkenler: dosya projeyi ezer, ad büyük/küçük harf duyarsız", () => {
  const all = [
    { fileId: null, name: "musteri", value: "Ahmet Bey" },
    { fileId: null, name: "stil", value: "Modern Akdeniz" },
    { fileId: "f1", name: "Stil", value: "Skandinav" },
    { fileId: "f1", name: "tezgah", value: "mermer" },
    { fileId: "f2", name: "tezgah", value: "granit" },
  ];
  const eff = effectiveVariables(all, "f1");
  assert.deepEqual(
    eff.map((v) => [v.name, v.value, v.scope, v.overrides]),
    [
      ["musteri", "Ahmet Bey", "project", false],
      ["Stil", "Skandinav", "file", true],
      ["tezgah", "mermer", "file", false],
    ],
  );
  assert.deepEqual(effectiveVariables(all, null).map((v) => v.name), ["musteri", "stil"]);
});

test("doldurma: kullanıcı > dosya > proje; değeri olmayan jeton AYNEN kalır", () => {
  const all = [
    { fileId: null, name: "musteri", value: "Ahmet Bey" },
    { fileId: "f1", name: "tezgah", value: "mermer" },
  ];
  assert.equal(fillProjectVariables("{musteri} için {tezgah} {renk}", all, "f1"), "Ahmet Bey için mermer {renk}");
  assert.equal(fillProjectVariables("{musteri} için {tezgah}", all, "f1", { tezgah: "granit" }), "Ahmet Bey için granit");
  assert.equal(fillProjectVariables("{MUSTERI}", all, "f1"), "Ahmet Bey");
  assert.equal(fillProjectVariables("{tezgah}", all, null), "{tezgah}", "dosya değişkeni projede yok");
  assert.equal(fillProjectVariables("{1x} {a-b}", all, null), "{1x} {a-b}", "geçersiz jeton dokunulmaz");
  assert.equal(fillProjectVariables("{musteri}", all, "f1", { musteri: "" }), "Ahmet Bey", "boş kullanıcı değeri ezmez");
});

test("SQL aynası: onay durumları ve proje rolleri migration metniyle uyumlu", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261115100000_team_projects_schema.sql", import.meta.url), "utf8");
  for (const state of ["draft", "pending", "approved", "changes"]) assert.ok(sql.includes(`'${state}'`), state);
  assert.ok(sql.includes("role text not null check (role in ('view', 'edit', 'lead'))"));
  const engine = readFileSync(new URL("../../supabase/migrations/20261115110000_team_projects_engine.sql", import.meta.url), "utf8");
  assert.ok(engine.includes("case p_role when 'lead' then 3 when 'edit' then 2 when 'view' then 1"));
  assert.ok(engine.includes("if v_role = 'guest' then v_best := least(v_best, 2); end if;"), "konuk en çok edit");
});
