// Promptly uzantısı (önizleme) — TR/EN metinler. Tek kaynak; arayüzde sabit metin yok.
// Dil: kayıtlı tercih (`lang`) → yoksa tarayıcı dili. Kullanıcı içeriği ve "Promptly" markası çevrilmez.
self.PI = self.PI || (() => {
  const S = {
    // genel
    signOut: { tr: "Çıkış yap", en: "Sign out" },
    close: { tr: "Kapat", en: "Close" },
    cancel: { tr: "Vazgeç", en: "Cancel" },
    copy: { tr: "Kopyala", en: "Copy" },
    copied: { tr: "Kopyalandı", en: "Copied" },
    remove: { tr: "Kaldır", en: "Remove" },
    language: { tr: "Dil", en: "Language" },
    previewNote: { tr: "Önizleme: örnek veriyle çalışır, ağa bağlanmaz.", en: "Preview: runs on sample data, no network." },
    // giriş
    connectTitle: { tr: "Promptly hesabını bağla", en: "Connect your Promptly account" },
    connectLead: { tr: "Kütüphaneni her sayfada kullan, gördüğün promptları tek dokunuşla taslağa kaydet.", en: "Use your library on any page and save prompts you find as drafts in one tap." },
    connectPt1: { tr: "Google ile kayıt olduysan da girersin.", en: "Works if you signed up with Google too." },
    connectPt2: { tr: "Şifreni uzantı görmez; Promptly'nin kendi giriş sayfası açılır.", en: "The extension never sees your password; Promptly's own sign-in page opens." },
    connectPt3: { tr: "Ayarlar → Bağlı uygulamalar'dan istediğin an iptal edersin.", en: "Revoke any time under Settings → Connected apps." },
    connectBtn: { tr: "Promptly ile bağlan", en: "Connect with Promptly" },
    connecting: { tr: "Bağlanıyor…", en: "Connecting…" },
    connectMock: { tr: "Önizlemede gerçek giriş yok; bu düğme sahte oturum açar.", en: "No real sign-in in the preview; this button fakes a session." },
    // popup
    searchPh: { tr: "Kütüphanende ara…", en: "Search your library…" },
    tabLibrary: { tr: "Kütüphane", en: "Library" },
    tabDrafts: { tr: "Taslaklar", en: "Drafts" },
    tabPending: { tr: "Bekleyen", en: "Pending" },
    tabNow: { tr: "Şimdi", en: "Now" },
    typeAll: { tr: "Tümü", en: "All" },
    typeImage: { tr: "Görsel", en: "Image" },
    typeText: { tr: "Metin", en: "Text" },
    typeAudio: { tr: "Ses", en: "Audio" },
    typeVideo: { tr: "Video", en: "Video" },
    srcOwn: { tr: "senin", en: "yours" },
    srcSaved: { tr: "kaydettiğin", en: "saved" },
    srcPopular: { tr: "popüler", en: "popular" },
    worked: { tr: "%{n} çalıştı", en: "{n}% worked" },
    noResults: { tr: "Eşleşen prompt yok.", en: "No matching prompts." },
    noDrafts: { tr: "Henüz taslak yok. Bir sayfada metin seçip sağ tıkla.", en: "No drafts yet. Select text on a page and right-click." },
    noPending: { tr: "Bekleyen yakalama yok.", en: "Nothing pending." },
    pendingBannerOffline: { tr: "{n} yakalama bekliyor. Bağlantı gelince taslağa gönderilecek.", en: "{n} capture(s) waiting. They will be sent to drafts when you're back online." },
    pendingBannerSignedOut: { tr: "{n} yakalama bekliyor. Giriş yapınca taslağa gönderilecek.", en: "{n} capture(s) waiting. They will be sent once you sign in." },
    sendNow: { tr: "Şimdi gönder", en: "Send now" },
    openOnSite: { tr: "Sitede aç", en: "Open on site" },
    savedAt: { tr: "Taslak · {when}", en: "Draft · {when}" },
    waitingSince: { tr: "Bekliyor · {when}", en: "Waiting · {when}" },
    external: { tr: "başka yerden", en: "from elsewhere" },
    shortcutHint: { tr: "Seçili metni kaydet: sağ tık ya da {k1}. Palet: {k2}.", en: "Save selected text: right-click or {k1}. Palette: {k2}." },
    openSidePanel: { tr: "Yan paneli aç", en: "Open side panel" },
    simOffline: { tr: "Önizleme: çevrimdışı simüle et", en: "Preview: simulate offline" },
    // sağ tık menüsü
    menuSaveText: { tr: "Promptly'ye kaydet", en: "Save to Promptly" },
    menuSaveImage: { tr: "Prompt'a görsel olarak ekle", en: "Add as image to a prompt" },
    // yakalama kartı
    capDraftHint: { tr: "Taslak olarak kaydedilir", en: "Saved as a draft" },
    capTitle: { tr: "Başlık", en: "Title" },
    capPrompt: { tr: "Prompt", en: "Prompt" },
    capVarsFound: { tr: "{n} değişken bulundu", en: "{n} variable(s) found" },
    capVarsNone: { tr: "Değişken yok", en: "No variables" },
    capVarsAuto: { tr: "{list} otomatik değişken yapıldı.", en: "{list} converted to variable(s)." },
    capUndo: { tr: "Geri al", en: "Undo" },
    capType: { tr: "Tür", en: "Type" },
    capTool: { tr: "Araç", en: "Tool" },
    capTags: { tr: "Etiketler", en: "Tags" },
    capTagsPh: { tr: "Etiket yaz, Enter'a bas", en: "Type a tag, press Enter" },
    capWhose: { tr: "Bu prompt kimin?", en: "Whose prompt is this?" },
    capMine: { tr: "Kendi promptum", en: "My own prompt" },
    capElsewhere: { tr: "Başka yerden aldım", en: "I found it elsewhere" },
    capSourceNote: { tr: "Kaynak olarak kaydedilir: {src}", en: "Saved as the source: {src}" },
    capImage: { tr: "Görsel (1)", en: "Image (1)" },
    capImageNote: { tr: "Kayıtta yüklenir (önizlemede yüklenmez).", en: "Uploaded on save (not in the preview)." },
    capSave: { tr: "Taslak olarak kaydet", en: "Save as draft" },
    capNoPublish: { tr: "Uzantı yayınlamaz. Kategori ve açıklamayı sitede tamamlayıp yayınlarsın.", en: "The extension never publishes. Finish category and description on the site, then publish." },
    capEmpty: { tr: "Prompt metni boş. Metni yaz ya da sayfadan seç.", en: "The prompt text is empty. Type it or select it on the page." },
    capSaved: { tr: "Taslağa kaydedildi", en: "Saved to drafts" },
    capQueued: { tr: "Bekleyenlere eklendi", en: "Added to pending" },
    capQueuedWhy: { tr: "Bağlantı ya da oturum yok; gelince taslağa gönderilir.", en: "No connection or session; it will be sent to drafts later." },
    // palet
    palSearchPh: { tr: "Kütüphanende ara…", en: "Search your library…" },
    palPreview: { tr: "Prompt", en: "Prompt" },
    palInsert: { tr: "Metin kutusuna ekle", en: "Insert into text box" },
    palNoField: { tr: "Odakta metin kutusu yok; kopyalandı.", en: "No text box in focus; copied instead." },
    palInserted: { tr: "Metin kutusuna eklendi", en: "Inserted into the text box" },
    palKeys: { tr: "↑↓ seç · Tab değişkene geç · Enter ekle · Esc kapat", en: "↑↓ choose · Tab next variable · Enter insert · Esc close" },
    palEmpty: { tr: "Eşleşen prompt yok.", en: "No matching prompts." },
    palNoVars: { tr: "Bu promptta değişken yok.", en: "This prompt has no variables." },
    // yan panel
    justUsed: { tr: "Az önce kullandığın", en: "You just used" },
    nothingUsed: { tr: "Henüz bir prompt kullanmadın. {k} ile paleti aç ya da Kütüphane'den kopyala.", en: "You haven't used a prompt yet. Open the palette with {k} or copy one from Library." },
    didItWork: { tr: "Sonuç beklediğin gibi geldi mi?", en: "Did the result turn out as expected?" },
    voteYes: { tr: "Çalıştı", en: "Worked" },
    voteNo: { tr: "Çalışmadı", en: "Didn't work" },
    voteThanks: { tr: "Oyun kaydedildi. Prompt şimdi %{n} çalıştı görünüyor.", en: "Vote saved. The prompt now shows {n}% worked." },
    voteHint: { tr: "Oy, promptun sayfasındaki \"Çalıştı\" oranına yansır.", en: "Your vote counts toward the prompt's \"Worked\" rate." },
    shareResult: { tr: "Sonucunu paylaş", en: "Share your result" },
    dropHere: { tr: "Üretilen görseli buraya bırak ya da seç", en: "Drop the generated image here, or choose one" },
    dropTypes: { tr: "PNG, JPEG, WebP", en: "PNG, JPEG, WebP" },
    sendResult: { tr: "Sonuç olarak gönder", en: "Send as result" },
    resultSent: { tr: "Sonuç kaydedildi (önizlemede yalnız bu cihazda).", en: "Result saved (this device only, in the preview)." },
    statusOnline: { tr: "Bağlandı · bekleyen yakalama yok", en: "Connected · nothing pending" },
    statusPending: { tr: "Bağlandı · {n} yakalama bekliyor", en: "Connected · {n} capture(s) pending" },
    statusOffline: { tr: "Çevrimdışı · yakalamalar bekletilir", en: "Offline · captures are kept pending" },
    statusSignedOut: { tr: "Oturum yok · yakalamalar bekletilir", en: "Signed out · captures are kept pending" },
    // demo
    demoTitle: { tr: "Önizleme deneme sayfası", en: "Preview playground" },
    demoLead: { tr: "Aşağıdaki metni seçip yakalamayı, sohbet kutusunda da paleti dene.", en: "Select the text below to try capture, and use the palette in the chat box." },
    demoSaveBtn: { tr: "Seçili metni yakala", en: "Capture selection" },
    demoPaletteBtn: { tr: "Paleti aç", en: "Open palette" },
    demoChatLabel: { tr: "Bir yapay zekâ sohbet sitesindeki metin kutusu gibi:", en: "Like the text box on an AI chat site:" },
    demoChatPh: { tr: "Buraya yaz; paleti açınca seçtiğin prompt buraya eklenir…", en: "Type here; the prompt you pick is inserted here…" },
    demoBlogH: { tr: "Orman promptları: sinematik sabah ışığı", en: "Forest prompts: cinematic morning light" },
    demoBlogP1: { tr: "Bir görsel üretim aracında sisli bir orman istiyorsan işe şu cümleyle başlayabilirsin:", en: "If you want a misty forest in an image generator, you can start with this sentence:" },
    demoBlogPrompt: { tr: "Sisli bir sabah ormanında yürüyen kırmızı pelerinli bir kız, sinematik ışık, [mekan] atmosferi, 35mm, düşük kontrast", en: "A girl in a red cape walking through a misty morning forest, cinematic light, [place] atmosphere, 35mm, low contrast" },
    demoBlogP2: { tr: "Köşeli ayraçtaki kısmı kendi sahnene göre değiştirebilirsin. Aşağıdaki görsele sağ tıklayıp \"Prompt'a görsel olarak ekle\" seçeneğini de deneyebilirsin.", en: "Swap the bracketed part for your own scene. You can also right-click the image below and choose \"Add as image to a prompt\"." },
    demoSourceNote: { tr: "Bu sayfa yalnızca uzantı önizlemesini denemek içindir.", en: "This page only exists to try the extension preview." },
  };
  const TOOLS = ["Midjourney", "GPT Image", "ChatGPT", "Claude", "Gemini", "Suno", "Sora"];
  let lang = "tr";
  const detect = () => ((chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
  async function init() {
    const stored = (await chrome.storage.local.get("lang")).lang;
    lang = stored === "tr" || stored === "en" ? stored : detect();
    return lang;
  }
  async function setLang(next) { lang = next === "en" ? "en" : "tr"; await chrome.storage.local.set({ lang }); }
  function t(key, params) {
    const e = S[key];
    let s = e ? e[lang] : key;
    if (params) for (const k of Object.keys(params)) s = s.split("{" + k + "}").join(params[k]);
    return s;
  }
  function when(iso) {
    return new Date(iso).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  return { init, setLang, t, when, getLang: () => lang, TOOLS, _S: S };
})();
