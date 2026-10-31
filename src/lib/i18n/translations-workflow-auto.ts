/**
 * Workflow'u otomatik çalıştırma (docs/history/296-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...workflowAutoTranslations`).
 * Sağlayıcı/anahtar alanları Studio'nun `generate.*` metinlerini yeniden kullanır; burada yalnız zincire özgü cümleler var.
 */
export const workflowAutoTranslations = {
  "workflow.auto.title": { tr: "Otomatik çalıştır", en: "Run automatically" },
  "workflow.auto.subtitle": { tr: "Metin adımlarını sırayla modele gönder", en: "Send the text steps to a model in order" },
  "workflow.auto.intro": {
    tr: "Adımlar kendi API anahtarınla sırayla çalışır; her adımın çıktısı, ona bağlı sonraki adımın girdisi olur. Anahtar Promptly'ye gönderilmez: çağrılar doğrudan tarayıcından sağlayıcıya gider ve ücret senin hesabından düşer.",
    en: "Steps run in order with your own API key; each step's output becomes the input of the steps wired to it. The key is never sent to Promptly: calls go straight from your browser to the provider and are billed to your own account.",
  },
  "workflow.auto.plan": { tr: "{{n}} model çağrısı yapılacak.", en: "{{n}} model call(s) will be made." },
  "workflow.auto.planNone": { tr: "Otomatik çalışacak adım kalmadı.", en: "No step is left to run automatically." },
  "workflow.auto.stopsAt": {
    tr: "Zincir {{n}}. adımda duracak ({{reason}}). O adımı elle yapıp çıktısını yapıştırırsan kaldığı yerden devam edebilir.",
    en: "The chain will stop at step {{n}} ({{reason}}). Do that step by hand and paste its output, and it can continue from there.",
  },
  "workflow.auto.block.no_content": { tr: "adımın içeriği yok", en: "the step has no content" },
  "workflow.auto.block.not_prompt": { tr: "bu adım bir prompt değil", en: "this step is not a prompt" },
  "workflow.auto.block.unpublished": { tr: "prompt yayında değil", en: "the prompt isn't published" },
  "workflow.auto.block.not_text": { tr: "metin dışı adım otomatik çalışmaz", en: "non-text steps can't run automatically" },
  "workflow.auto.block.no_output": { tr: "adımın çıktısı tanımlı değil", en: "the step has no output defined" },
  "workflow.auto.run": { tr: "Çalıştır", en: "Run" },
  "workflow.auto.resume": { tr: "Devam et", en: "Continue" },
  "workflow.auto.rerun": { tr: "Baştan çalıştır", en: "Run again from the start" },
  "workflow.auto.stop": { tr: "Durdur", en: "Stop" },
  "workflow.auto.status.running": { tr: "Çalışıyor…", en: "Running…" },
  "workflow.auto.status.done": { tr: "Tamam", en: "Done" },
  "workflow.auto.status.kept": { tr: "Hazır (önceki sonuç)", en: "Ready (earlier result)" },
  "workflow.auto.status.blocked": { tr: "Elle yapılmalı", en: "Needs to be done by hand" },
  "workflow.auto.status.error": { tr: "Hata", en: "Error" },
  "workflow.auto.finished": { tr: "Zincir bitti. Sonuçlar adımların çıktı alanlarında.", en: "The chain is done. The results are in each step's output field." },
  "workflow.auto.finishedSummary": { tr: "Özeti aç", en: "Open the summary" },
  "workflow.auto.stopped": { tr: "Durduruldu. Bitenler korundu; Devam et ile sürdürebilirsin.", en: "Stopped. What finished is kept; use Continue to carry on." },
  "workflow.auto.blockedStop": { tr: "{{n}}. adımda durdu: {{reason}}.", en: "Stopped at step {{n}}: {{reason}}." },
  "workflow.auto.err.prompt_load": { tr: "Prompt yüklenemedi.", en: "The prompt couldn't be loaded." },
  "workflow.auto.err.variable": {
    tr: "“{{name}}” değişkeninin varsayılan değeri yok. Bu adımı elle çalıştır.",
    en: "The variable “{{name}}” has no default value. Run this step by hand.",
  },
  "workflow.auto.err.missing_input": {
    tr: "“{{label}}” çıktısı boş. Önce onu üreten adımı çalıştır.",
    en: "The output “{{label}}” is empty. Run the step that produces it first.",
  },
  "workflow.auto.statusListAria": { tr: "Adımların durumu", en: "Step status" },
} as const;
