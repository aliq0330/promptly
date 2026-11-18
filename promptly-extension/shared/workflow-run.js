// Promptly uzantısı — workflow adım adım çalıştırma (saf mantık: DOM/ağ yok). Sitedeki "Adım adım" kipiyle aynı fikir: bir adımın çıktısı sonrakinin girdisi olur.
// Durum yalnız bu cihazda (`PStore` `wf`). Hiçbir adım otomatik gönderilmez: her adım "Çalıştır" ile kullanıcının onayıyla yazılır.
self.PWorkflow = (() => {
  const MAX_STEPS = 50, MAX_CARRY = 20000;
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);

  // API'nin workflow ayrıntısından (`GET /v1/workflows/{id}`) çalıştırma durumu kurar. Prompt'u herkese açık olmayan adım "elle yapılacak" olur.
  function start(detail) {
    const steps = (Array.isArray(detail && detail.steps) ? detail.steps : []).slice(0, MAX_STEPS).map((s, i) => ({
      position: Number(s.position) || i + 1,
      title: str(s.title, 200), description: str(s.description, 2000), instructions: str(s.instructions, 4000),
      promptId: s.prompt && typeof s.prompt.id === "string" ? s.prompt.id : "", promptTitle: s.prompt ? str(s.prompt.title, 200) : "",
    }));
    if (!steps.length) return null;
    return { id: str(detail.id, 64), title: str(detail.title, 200), url: str(detail.url, 500), steps, index: 0, carry: "" };
  }
  // Depodan okunan durumu doğrular (bozuk/eski kayıt → null).
  function clean(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > MAX_STEPS) return null;
    const index = Number.isInteger(raw.index) ? Math.min(Math.max(raw.index, 0), raw.steps.length) : 0;
    return { id: str(raw.id, 64), title: str(raw.title, 200), url: str(raw.url, 500), steps: raw.steps, index, carry: str(raw.carry, MAX_CARRY) };
  }
  const isDone = (st) => st.index >= st.steps.length;
  const current = (st) => (isDone(st) ? null : st.steps[st.index]);
  // Sonraki adıma geç: `output` boş değilse sonraki adımın girdisi olur; boşsa önceki girdi korunur.
  function advance(st, output) {
    const text = str(output, MAX_CARRY).trim();
    return { ...st, index: Math.min(st.index + 1, st.steps.length), carry: text || st.carry };
  }
  const back = (st) => ({ ...st, index: Math.max(st.index - 1, 0) });
  return { MAX_STEPS, start, clean, isDone, current, advance, back };
})();
