// Promptly uzantısı — yapılandırılmış prompt renklendirme (saf: DOM yok): JSON ve YAML biçimli prompt metnini jetonlara böler.
// Yalnız GÖSTERİM içindir: metin değişmez, kopyalanan/yazılan her zaman özgün metindir. Tüm kalıplar doğrusal zamanlıdır (kullanıcı metni).
self.PStructured = (() => {
  const MAX = 20000; // çok uzun metinde renklendirme yapılmaz (arayüzü yormasın)
  const JSON_KEY = /"[^"\\\n]{1,60}"[ \t]*:/g;
  const YAML_LINE = /^[ \t]*(?:- )?[A-Za-z_][\w .-]{0,40}:(?:[ \t]|$)/;

  function detect(text) {
    const t = String(text || "");
    if (t.length < 8 || t.length > MAX) return null;
    const head = t.trimStart()[0];
    if ((head === "{" || head === "[") && (t.match(JSON_KEY) || []).length >= 2) return "json";
    let hits = 0, lines = 0;
    for (const line of t.split("\n", 400)) { if (!line.trim()) continue; lines += 1; if (YAML_LINE.test(line)) hits += 1; }
    return hits >= 2 && hits * 2 >= lines ? "yaml" : null;
  }

  const JSON_TOKEN = /("(?:[^"\\\n]|\\.)*")([ \t]*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w.])|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)|([\s\S])/g;
  function jsonTokens(text) {
    const out = [];
    for (const m of text.matchAll(JSON_TOKEN)) {
      if (m[1] !== undefined) {
        out.push(m[2] !== undefined ? { k: "key", v: m[1] } : { k: "str", v: m[1] });
        if (m[2] !== undefined) out.push({ k: "punct", v: m[2] });
      } else if (m[3] !== undefined) out.push({ k: "num", v: m[3] });
      else if (m[4] !== undefined) out.push({ k: "lit", v: m[4] });
      else if (m[5] !== undefined) out.push({ k: "punct", v: m[5] });
      else out.push({ k: "text", v: m[6] ?? m[7] ?? m[8] });
    }
    return out;
  }

  function yamlTokens(text) {
    const out = [];
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const nl = i < lines.length - 1 ? "\n" : "";
      const hash = line.search(/(^|\s)#/);
      const body = hash >= 0 ? line.slice(0, hash + (line[hash] === "#" ? 0 : 1)) : line;
      const comment = hash >= 0 ? line.slice(body.length) : "";
      const m = /^([ \t]*(?:- )?)([A-Za-z_][\w .-]{0,40})(:)([ \t]|$)(.*)$/.exec(body);
      if (m) {
        if (m[1]) out.push({ k: "punct", v: m[1] });
        out.push({ k: "key", v: m[2] }, { k: "punct", v: m[3] + m[4] });
        if (m[5]) out.push({ k: /^-?\d+(\.\d+)?$/.test(m[5].trim()) ? "num" : /^(true|false|null|~)$/i.test(m[5].trim()) ? "lit" : "str", v: m[5] });
      } else if (/^[ \t]*- /.test(body)) {
        const d = /^([ \t]*- )(.*)$/.exec(body);
        out.push({ k: "punct", v: d[1] }, { k: "str", v: d[2] });
      } else if (body) out.push({ k: "text", v: body });
      if (comment) out.push({ k: "comment", v: comment });
      if (nl) out.push({ k: "text", v: nl });
    });
    return out;
  }

  const tokens = (text, kind) => (kind === "json" ? jsonTokens(String(text)) : kind === "yaml" ? yamlTokens(String(text)) : [{ k: "text", v: String(text) }]);
  // Jetonlar art arda birleştirilince özgün metin AYNEN çıkmalıdır (testle korunur).
  const join = (toks) => toks.map((t) => t.v).join("");
  return { detect, tokens, join };
})();
