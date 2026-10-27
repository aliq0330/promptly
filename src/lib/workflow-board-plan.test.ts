import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasStepIo,
  MAX_IMAGES,
  parseStepBody,
  planWorkflowImport,
  planWorkflowSync,
  stepBody,
  type BoardConnection,
  type BoardObject,
  type BoardStepItem,
  type ExistingBoard,
  type PlanOptions,
  type PlanStep,
  type PlannedItem,
  type WorkflowImportPlan,
} from "./workflow-board-plan.ts";

const ALL: PlanOptions = { io: true, prompts: true, images: true, relations: true };
const NONE_EXISTING: ExistingBoard = { promptItems: new Map(), imageItems: new Map() };
const labels = { relation: (type: string) => (type === "similar" ? "Benzer" : type) };

function counter() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

function step(n: number, over: Partial<PlanStep> = {}): PlanStep {
  return {
    id: `s${n}`,
    title: `Adım ${n}`,
    inputs: n === 1 ? [{ label: "{ürün}", from: null }] : [{ label: `girdi ${n}`, from: { stepId: `s${n - 1}`, outputId: `o${n - 1}` } }],
    outputs: [{ id: `o${n}`, label: `çıktı ${n}` }],
    content: { type: "prompt", id: `p${n}`, title: `Prompt ${n}` },
    images: [
      { url: `https://x/p${n}-a.jpg`, width: 800, height: 600 },
      { url: `https://x/p${n}-b.jpg`, width: 800, height: 600 },
    ],
    ...over,
  };
}
const steps3 = [step(1), step(2), step(3)];

function overlaps(a: PlannedItem, b: PlannedItem) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("planWorkflowImport", () => {
  it("her adım için adım kartı + prompt + görseller ayrı nesne; oklar akış / içerik / ilişki", () => {
    const plan = planWorkflowImport(steps3, [{ a: 0, b: 1, type: "similar" }], ALL, NONE_EXISTING, labels, counter());
    assert.deepEqual(plan.counts, { steps: 3, prompts: 3, images: 6, arrows: 2 + 3 + 6 + 1 });
    assert.equal(plan.items.filter((i) => i.kind === "note").length, 3);
    assert.ok(plan.items.filter((i) => i.kind === "note").every((i) => i.sourceRole === "step" && i.sourceStepNo && i.sourceStepId));
    const prompt = plan.items.find((i) => i.kind === "prompt")!;
    assert.equal(prompt.promptId, "p1");
    assert.equal(prompt.sourceRole, "prompt");
    const image = plan.items.find((i) => i.kind === "image")!;
    assert.equal(image.promptId, "p1");
    assert.ok(image.mediaUrl);
    assert.equal(image.sourceRole, "image");
    const flow = plan.connections.filter((c) => c.role === "flow");
    assert.equal(flow.length, 2);
    assert.equal(flow[0].label, "çıktı 1");
    assert.ok(flow.every((c) => c.arrow === "end" && c.lineStyle === "solid" && c.color === "primary"));
    const relation = plan.connections.find((c) => c.role === "relation")!;
    assert.equal(relation.label, "Benzer");
    assert.equal(relation.lineStyle, "dashed");
    assert.equal(relation.arrow, "none");
  });

  it("kimlikler benzersiz; her ok planın (ya da panonun) bir öğesine bağlanır", () => {
    const plan = planWorkflowImport(steps3, [{ a: 0, b: 2, type: "similar" }], ALL, NONE_EXISTING, labels, counter());
    const ids = new Set(plan.items.map((i) => i.id));
    assert.equal(ids.size, plan.items.length);
    assert.equal(new Set(plan.connections.map((c) => c.id)).size, plan.connections.length);
    for (const c of plan.connections) {
      assert.ok(ids.has(c.fromItemId) && ids.has(c.toItemId), `${c.role} oku bilinmeyen öğeye bağlı`);
      assert.notEqual(c.fromItemId, c.toItemId);
    }
  });

  it("nesneler üst üste binmez (4 adım tek satır, 6 adım iki satır)", () => {
    for (const n of [4, 6, 9]) {
      const plan = planWorkflowImport(Array.from({ length: n }, (_, i) => step(i + 1)), [], ALL, NONE_EXISTING, labels, counter());
      for (let i = 0; i < plan.items.length; i += 1) for (let j = i + 1; j < plan.items.length; j += 1) assert.ok(!overlaps(plan.items[i], plan.items[j]), `${n} adım: ${plan.items[i].kind} ↔ ${plan.items[j].kind}`);
    }
    const six = planWorkflowImport(Array.from({ length: 6 }, (_, i) => step(i + 1)), [], ALL, NONE_EXISTING, labels, counter());
    const steps = six.items.filter((i) => i.kind === "note");
    assert.equal(steps[4].x, steps[0].x, "5. adım yeni satırın başında");
    assert.ok(steps[4].y > steps[0].y);
    assert.ok(six.size.h > 0 && six.size.w > 0);
  });

  it("girdi/çıktı kapalıysa kart gövdesi boş ve daha alçak", () => {
    const withIo = planWorkflowImport([step(1)], [], ALL, NONE_EXISTING, labels, counter());
    const without = planWorkflowImport([step(1)], [], { ...ALL, io: false }, NONE_EXISTING, labels, counter());
    assert.ok(withIo.items[0].body.includes(">> {ürün}") && withIo.items[0].body.includes("<< çıktı 1"));
    assert.equal(without.items[0].body, "");
    assert.ok(without.items[0].h < withIo.items[0].h);
  });

  it("prompt kapalıysa yalnız adım kartları + akış okları; görsel kapalıysa görsel yok", () => {
    const noPrompts = planWorkflowImport(steps3, [{ a: 0, b: 1, type: "similar" }], { ...ALL, prompts: false }, NONE_EXISTING, labels, counter());
    assert.equal(noPrompts.items.length, 3);
    assert.deepEqual(noPrompts.connections.map((c) => c.role), ["flow", "flow"]);
    const noImages = planWorkflowImport(steps3, [], { ...ALL, images: false }, NONE_EXISTING, labels, counter());
    assert.equal(noImages.counts.images, 0);
    assert.equal(noImages.counts.prompts, 3);
  });

  it("görsel sayısı sınırlıdır", () => {
    const many = step(1, { images: Array.from({ length: 9 }, (_, i) => ({ url: `https://x/${i}.jpg`, width: 10, height: 10 })) });
    const plan = planWorkflowImport([many], [], ALL, NONE_EXISTING, labels, counter());
    assert.equal(plan.counts.images, MAX_IMAGES);
  });

  it("panoda zaten olan prompt / görsel yeniden açılmaz; oka mevcut öğe bağlanır", () => {
    const existing: ExistingBoard = { promptItems: new Map([["p1", "ex-prompt"]]), imageItems: new Map([["https://x/p1-a.jpg", "ex-image"]]) };
    const plan = planWorkflowImport([step(1)], [], ALL, existing, labels, counter());
    assert.equal(plan.counts.prompts, 0, "yeni prompt öğesi yok");
    assert.equal(plan.counts.images, 0, "prompt var olduğundan görseller de açılmaz");
    const link = plan.connections.find((c) => c.role === "link")!;
    assert.equal(link.toItemId, "ex-prompt");
    assert.equal(plan.reused >= 1, true);
  });

  it("iki adım aynı promptu kullanırsa tek prompt öğesi, iki çizgi", () => {
    const shared = [step(1), step(2, { content: { type: "prompt", id: "p1", title: "Prompt 1" } })];
    const plan = planWorkflowImport(shared, [], ALL, NONE_EXISTING, labels, counter());
    assert.equal(plan.counts.prompts, 1);
    assert.equal(plan.connections.filter((c) => c.role === "link" && c.arrow === "end").length, 2);
  });

  it("ilişki: aynı prompta ya da tekrar eden çifte yay çizilmez", () => {
    const rel = [
      { a: 0, b: 1, type: "similar" },
      { a: 1, b: 0, type: "similar" },
      { a: 0, b: 0, type: "similar" },
    ];
    const plan = planWorkflowImport(steps3, rel, ALL, NONE_EXISTING, labels, counter());
    assert.equal(plan.connections.filter((c) => c.role === "relation").length, 1);
  });

  it("içeriği olmayan adım yalnız kart olur", () => {
    const plan = planWorkflowImport([step(1, { content: null, images: [] })], [], ALL, NONE_EXISTING, labels, counter());
    assert.equal(plan.items.length, 1);
    assert.equal(plan.connections.length, 0);
  });

  it("istek içeriği prompt rolü almaz (içerik öğesi)", () => {
    const plan = planWorkflowImport([step(1, { content: { type: "request", id: "r1", title: "İstek" } })], [], ALL, NONE_EXISTING, labels, counter());
    const item = plan.items.find((i) => i.kind === "content")!;
    assert.equal(item.contentType, "request");
    assert.equal(item.sourceRole, undefined);
  });
});

describe("adım gövdesi", () => {
  it("yaz / oku", () => {
    const body = stepBody(step(2));
    assert.equal(body, ">> girdi 2\n<< çıktı 2");
    assert.deepEqual(parseStepBody(body), { inputs: ["girdi 2"], outputs: ["çıktı 2"], text: "" });
    assert.deepEqual(parseStepBody(">> a\nserbest not\n<< b"), { inputs: ["a"], outputs: ["b"], text: "serbest not" });
    assert.ok(hasStepIo(body));
    assert.ok(!hasStepIo("sadece not"));
    assert.equal(stepBody({ inputs: [{ label: "  ", from: null }], outputs: [] }), "");
  });
});

// ---- Güncelle ----
function boardFrom(plan: WorkflowImportPlan) {
  const stepItems: BoardStepItem[] = plan.items.filter((i) => i.sourceRole === "step").map((i) => ({ id: i.id, stepId: i.sourceStepId!, title: i.title, body: i.body, x: i.x, y: i.y, w: i.w, h: i.h }));
  const objects: BoardObject[] = plan.items
    .filter((i) => i.sourceRole === "prompt" || i.sourceRole === "image")
    .map((i) => ({ id: i.id, role: i.sourceRole as "prompt" | "image", stepId: i.sourceStepId ?? null, promptId: i.promptId ?? null, mediaUrl: i.mediaUrl ?? null, x: i.x, y: i.y, w: i.w, h: i.h }));
  const connections: BoardConnection[] = plan.connections.map((c) => ({ id: c.id, fromItemId: c.fromItemId, toItemId: c.toItemId, role: c.role, ownedByWorkflow: true }));
  return { stepItems, objects, connections, existing: NONE_EXISTING };
}
const imported = () => boardFrom(planWorkflowImport(steps3, [], ALL, NONE_EXISTING, labels, counter()));

describe("planWorkflowSync", () => {
  it("değişiklik yoksa boş", () => {
    const sync = planWorkflowSync(steps3, imported(), counter());
    assert.ok(sync.isEmpty, JSON.stringify(sync.counts));
    assert.deepEqual(sync.counts, { added: 0, removed: 0, changed: 0 });
  });

  it("başlık ve girdi/çıktı değişince yalnız o kart güncellenir (konum korunur)", () => {
    const board = imported();
    const changed = [step(1, { title: "Yeni ad" }), step(2, { outputs: [{ id: "o2", label: "başka çıktı" }] }), step(3)];
    const sync = planWorkflowSync(changed, board, counter());
    assert.equal(sync.patchItems.length, 2);
    assert.equal(sync.patchItems.find((p) => p.title === "Yeni ad")!.id, board.stepItems[0].id);
    assert.ok(sync.patchItems.find((p) => p.body?.includes("başka çıktı")));
    assert.equal(sync.addItems.length, 0);
    assert.equal(sync.removeItemIds.length, 0);
    assert.deepEqual(sync.counts, { added: 0, removed: 0, changed: 2 });
  });

  it("yeni adım: kart + prompt + görseller eklenir, son adımdan yeni karta ok çekilir, mevcut nesnelerin altına yerleşir", () => {
    const board = imported();
    const maxY = Math.max(...[...board.stepItems, ...board.objects].map((o) => o.y + o.h));
    const sync = planWorkflowSync([...steps3, step(4)], board, counter());
    assert.deepEqual(sync.counts, { added: 1, removed: 0, changed: 0 });
    const newStep = sync.addItems.find((i) => i.sourceRole === "step")!;
    assert.equal(newStep.sourceStepNo, 4);
    assert.ok(newStep.y > maxY, "mevcutların altında");
    assert.equal(sync.addItems.filter((i) => i.kind === "image").length, 2);
    const flow = sync.addConnections.find((c) => c.role === "flow")!;
    assert.equal(flow.fromItemId, board.stepItems[2].id);
    assert.equal(flow.toItemId, newStep.id);
  });

  it("kaldırılan adım: kartı + o adım için açılan nesneler + akış okları gider; kalanlar arası ok kurulur", () => {
    const board = imported();
    const remaining = [steps3[0], steps3[2]];
    const sync = planWorkflowSync(remaining, board, counter());
    assert.deepEqual(sync.counts, { added: 0, removed: 1, changed: 0 });
    const middle = board.stepItems[1];
    assert.ok(sync.removeItemIds.includes(middle.id));
    const owned = board.objects.filter((o) => o.stepId === "s2").map((o) => o.id);
    assert.equal(owned.length, 3);
    assert.ok(owned.every((id) => sync.removeItemIds.includes(id)));
    const flowRemoved = board.connections.filter((c) => c.role === "flow" && (c.fromItemId === middle.id || c.toItemId === middle.id)).map((c) => c.id);
    assert.ok(flowRemoved.every((id) => sync.removeConnectionIds.includes(id)));
    const bridge = sync.addConnections.find((c) => c.role === "flow")!;
    assert.equal(bridge.fromItemId, board.stepItems[0].id);
    assert.equal(bridge.toItemId, board.stepItems[2].id);
  });

  it("prompt değişince eski prompt + görseller kalkar, yenisi adım kartının altına gelir", () => {
    const board = imported();
    const swapped = [steps3[0], step(2, { content: { type: "prompt", id: "pX", title: "Yeni" }, images: [{ url: "https://x/new.jpg", width: 1, height: 1 }] }), steps3[2]];
    const sync = planWorkflowSync(swapped, board, counter());
    assert.deepEqual(sync.counts, { added: 0, removed: 0, changed: 1 });
    const oldIds = board.objects.filter((o) => o.stepId === "s2").map((o) => o.id);
    assert.ok(oldIds.every((id) => sync.removeItemIds.includes(id)));
    const newPrompt = sync.addItems.find((i) => i.kind === "prompt")!;
    assert.equal(newPrompt.promptId, "pX");
    const link = sync.addConnections.find((c) => c.role === "link" && c.toItemId === newPrompt.id)!;
    assert.equal(link.fromItemId, board.stepItems[1].id, "bağ mevcut adım kartından");
    assert.ok(sync.addItems.every((i) => i.sourceRole !== "step"), "adım kartı yeniden açılmaz");
  });

  it("adım sırası değişince akış okları yeni sıraya göre kurulur", () => {
    const board = imported();
    const sync = planWorkflowSync([steps3[1], steps3[0], steps3[2]], board, counter());
    assert.ok(sync.addConnections.some((c) => c.role === "flow"));
    assert.ok(sync.removeConnectionIds.length > 0);
  });

  it("elle eklenmiş (kaynaksız) ok ve nesnelere dokunulmaz", () => {
    const board = imported();
    board.connections.push({ id: "manual", fromItemId: board.stepItems[0].id, toItemId: board.stepItems[2].id, role: null, ownedByWorkflow: false });
    const sync = planWorkflowSync(steps3, board, counter());
    assert.ok(!sync.removeConnectionIds.includes("manual"));
  });
});
