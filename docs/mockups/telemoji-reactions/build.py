#!/usr/bin/env python3
"""Telemoji tepki mockup'ını tek dosyaya derler.

Kullanım: build.py <telemoji-deposu> <lottie_light.min.js> <çıktı-klasörü>
  <çıktı>/index.html     bağımsız sayfa (doctype'lı; tarayıcıda/codeshack'te açılır)
  <çıktı>/artifact.html  Artifact iskeleti için gövde parçası
Varlıklar (TGS = gzip'li Lottie) base64 olarak gömülür; sayfada DecompressionStream açar.
"""
import base64, json, re, sys
from pathlib import Path

repo, lottie_js, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
here = Path(__file__).parent

# tepki -> (hareketli emoji, efekt). Efektler tgs/reactions/ altındadır; adları anlamsızdır
# (U+0031_U+20E3_<n>), eşleşme render edilip gözle doğrulanmıştır.
EMOJI = {"love": "U+2764_1", "fire": "U+1F525_1", "wow": "U+1F92F_1",
         "clap": "U+1F44F_1", "haha": "U+1F602_1", "idea": "U+1F4A1_1"}
EFFECT = {"love": 4, "fire": 14, "wow": 21, "clap": 22, "haha": 11, "idea": 16}

def b64(p: Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()

assets = {k: {"e": b64(repo / "tgs/animated" / f"{EMOJI[k]}.tgs"),
              "f": b64(repo / "tgs/reactions" / f"U+0031_U+20E3_{EFFECT[k]}.tgs")} for k in EMOJI}

lottie = lottie_js.read_text(encoding="utf-8")
assert "</script" not in lottie.lower()
tpl = (here / "template.html").read_text(encoding="utf-8")
frag = tpl.replace("/*__LOTTIE__*/", lottie).replace("__ASSETS__", json.dumps(assets, separators=(",", ":")))

out.mkdir(parents=True, exist_ok=True)
(out / "artifact.html").write_text(frag, encoding="utf-8")

head = "".join(re.findall(r"<title>.*?</title>|<meta name=\"claude[^>]*>|<style>.*?</style>", frag, re.S))
body = re.sub(r"<title>.*?</title>|<meta name=\"claude[^>]*>|<style>.*?</style>", "", frag, flags=re.S)
page = ('<!doctype html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
(out / "index.html").write_text(page, encoding="utf-8")
print({p.name: p.stat().st_size for p in out.iterdir()})
