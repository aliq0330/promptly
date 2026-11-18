// Promptly uzantısı — yakalama kuyruğu. Her yakalama önce kuyruğa yazılır; "Geri al" için kısa bir bekletme (HOLD_MS) sonunda gönderilir.
// Kalıcı hata veren (geçersiz/reddedilen) öğe `failed` olur ve KUYRUĞU DURDURMAZ (eski sürümde tek hatalı öğe arkadakileri bloke ediyordu);
// geçici hata (ağ yok, hız sınırı, sunucu, oturum) kuyruğu durdurur ve sonra yeniden denenir. Yazmalar arka planda tek sıradan geçer.
self.PQueue = (() => {
  const HOLD_MS = 6000;
  const MAX_QUEUE = 100;
  const MAX_SENT = 20;
  const TRANSIENT = ["offline", "rate_limited", "server", "unauthorized", "insufficient_scope"];

  async function enqueue(draft, now = Date.now()) {
    const queue = await PStore.get("queue");
    if (queue.length >= MAX_QUEUE) throw new PErr("queue_full", "queue_full");
    const item = { id: PStore.uid(), draft, state: "queued", createdAt: new Date(now).toISOString(), holdUntil: now + HOLD_MS, attempts: 0, error: null };
    await PStore.set({ queue: [...queue, item] });
    return item;
  }
  // "Geri al": yalnız henüz gönderilmemiş (kuyrukta) öğe için; gönderilen taslak API'den silinemez.
  async function undo(id) {
    const queue = await PStore.get("queue");
    const hit = queue.find((q) => q.id === id && q.state === "queued");
    if (!hit) return false;
    await PStore.set({ queue: queue.filter((q) => q.id !== id) });
    return true;
  }
  async function remove(id) {
    const queue = await PStore.get("queue");
    await PStore.set({ queue: queue.filter((q) => q.id !== id) });
  }
  async function retry(id) {
    const queue = await PStore.get("queue");
    await PStore.set({ queue: queue.map((q) => (q.id === id ? { ...q, state: "queued", holdUntil: 0, error: null } : q)) });
  }
  async function retryAll() {
    const queue = await PStore.get("queue");
    await PStore.set({ queue: queue.map((q) => (q.state === "failed" ? { ...q, state: "queued", holdUntil: 0, error: null } : q)) });
  }
  const patch = async (id, fields) => {
    const queue = await PStore.get("queue");
    await PStore.set({ queue: queue.map((q) => (q.id === id ? { ...q, ...fields } : q)) });
  };
  async function finish(item, result, now) {
    const [queue, sent] = await Promise.all([PStore.get("queue"), PStore.get("sent")]);
    const entry = { id: item.id, serverId: result.id || null, title: item.draft.title, url: result.editUrl || null, duplicate: Boolean(result.duplicate), imageError: result.imageError || null, at: new Date(now).toISOString() };
    await PStore.set({ queue: queue.filter((q) => q.id !== item.id), sent: [entry, ...sent].slice(0, MAX_SENT) });
  }

  // deps.signedIn(): Promise<boolean>, deps.send(draft): Promise<{id,duplicate,editUrl,imageError}>. Sonuç: { sent, stopped }.
  async function flush(deps, now = Date.now()) {
    if (!(await deps.signedIn())) return { sent: 0, stopped: "signed_out" };
    let sent = 0;
    for (;;) {
      const queue = await PStore.get("queue");
      const item = queue.find((q) => q.state === "queued" && (q.holdUntil || 0) <= now);
      if (!item) break;
      try {
        const result = await deps.send(item.draft);
        await finish(item, result, now);
        sent += 1;
      } catch (err) {
        const code = (err && err.code) || "error";
        const message = (err && err.message) || "";
        if (TRANSIENT.includes(code)) {
          await patch(item.id, { attempts: item.attempts + 1 });
          await PStore.set({ lastError: { code, message, at: new Date(now).toISOString() } });
          return { sent, stopped: code };
        }
        await patch(item.id, { state: "failed", error: { code, message, field: (err && err.field) || "", detail: (err && err.detail) || "" } });
      }
    }
    await PStore.set({ lastError: null }); // döngü geçici hatayla durmadan bitti: eski bir ağ hatası artık geçerli değil
    return { sent, stopped: null };
  }

  // Arayüz durumu (saf): oturum/yetki/ağ hatası/bekleyen sayısı → tek bir etiket.
  function statusOf({ auth, queue, lastError }) {
    if (!auth || !auth.refreshToken) return { kind: "signedOut", n: 0 };
    const waiting = queue.filter((q) => q.state === "queued").length;
    const failed = queue.filter((q) => q.state === "failed").length;
    if (!PAuth.canWrite(auth)) return { kind: "needsWrite", n: waiting };
    if (lastError && lastError.code === "unauthorized") return { kind: "signedOut", n: waiting };
    if (lastError && lastError.code === "insufficient_scope") return { kind: "needsWrite", n: waiting };
    if (lastError && lastError.code === "offline") return { kind: "offline", n: waiting };
    if (lastError) return { kind: "error", n: waiting, code: lastError.code };
    if (failed) return { kind: "error", n: waiting, code: "failed" };
    if (waiting) return { kind: "pending", n: waiting };
    return { kind: "ok", n: 0 };
  }

  return { HOLD_MS, MAX_QUEUE, MAX_SENT, enqueue, undo, remove, retry, retryAll, flush, statusOf };
})();
