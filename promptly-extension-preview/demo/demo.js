// Deneme sayfası: uzantı katmanını (content/overlay.js) kendi sayfasında çalıştırır; gerçek sitelerde aynı kod
// sağ tık / kısayolla enjekte edilir.
const $ = (id) => document.getElementById(id);
const t = PUI.t;

function forestSvg() {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 260'>
  <rect width='420' height='260' fill='#dfe6fb'/><circle cx='330' cy='60' r='34' fill='#fbe3d3'/>
  <path d='M0 170 L70 110 L130 150 L200 90 L280 150 L350 115 L420 160 V260 H0Z' fill='#b9c6f3'/>
  <g fill='#5a6fc4' opacity='.85'><path d='M40 230 L60 150 L80 230Z'/><path d='M95 230 L120 120 L145 230Z'/><path d='M170 230 L192 140 L214 230Z'/><path d='M245 230 L275 110 L305 230Z'/><path d='M330 230 L352 145 L374 230Z'/></g>
  <rect y='215' width='420' height='45' fill='#3b5be2' opacity='.35'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(s);
}

function paint() {
  PUI.applyLang();
  PUI.writePrompt($("prompt"), t("demoBlogPrompt"));
  $("lang").textContent = PI.getLang() === "tr" ? "EN" : "TR";
  $("capImg").textContent = t("menuSaveImage");
  $("pal").textContent = t("demoPaletteBtn");
}
$("cap").addEventListener("click", () => {
  const sel = String(window.getSelection() || "").trim();
  __plyOverlay.openCapture({ text: sel || t("demoBlogPrompt"), pageUrl: "https://ornek-prompt-blogu.example/orman-promptlari", pageTitle: t("demoBlogH") });
});
$("capImg").addEventListener("click", () => __plyOverlay.openCapture({ text: "", imageUrl: $("pic").src, pageUrl: "https://ornek-prompt-blogu.example/orman-promptlari", pageTitle: t("demoBlogH") }));
$("pal").addEventListener("click", () => { $("chat").focus(); __plyOverlay.openPalette(); });
$("lang").addEventListener("click", async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); paint(); });

(async () => {
  await PI.init(); await PStore.seed();
  $("brand").innerHTML = PUI.brand(24);
  $("pic").src = forestSvg();
  paint();
})();
