#!/usr/bin/env python3
"""
Promptly demo medya üreticisi — 17 video + 14 ses promptu için GERÇEKTEN
oynatılabilir örnek çıktılar üretir ve public/viral-seed/media/ altına yazar.

  python3 supabase/seed/media/build-media.py

Gereksinim: ffmpeg (libx264, libmp3lame, drawtext, gradients), python3 + numpy +
scipy. Ses sentezi synth_audio.py'dedir. Çıktı deterministik değil (gürültü
tohumu sabit ama ffmpeg sürümüne bağlı) — yeniden üretmek gerekmez, dosyalar
repoda durur.

Bunlar yapay zekâ çıktısı DEĞİL: promptun tarif ettiği atmosferi (renk
paleti, hareket, tür/tempo) yansıtan, sentezlenmiş demo medyadır. Sitede
"örnek çıktı" olarak oynatılırlar.
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "viral-seed", "media")
FONT = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

# id sonekleri (5eed0001-0000-4000-8000-00000000XXXX)
# (id, başlık, boyut, [renkler], ışık hızı, etiket)
VIDEOS = [
    ("2000", "Soğuk demleme kahve", "L", ["0x15181c", "0x3a2a1a", "0xc98a3c"], 1.0),
    ("2001", "Ramen buharı", "L", ["0x120808", "0x5a1a12", "0xe0572f"], 0.8),
    ("2002", "Tostta bal", "L", ["0x2a1c0a", "0x8a5a14", "0xf0b840"], 0.9),
    ("2003", "Sneaker 360°", "L", ["0x101216", "0x2a3038", "0x30c0d8"], 1.4),
    ("2004", "Islak beton", "L", ["0x0c1220", "0x2a3850", "0xe07a30"], 1.1),
    ("2005", "Işık izleri", "L", ["0x060606", "0x601a50", "0x18d0e0"], 1.8),
    ("2006", "Banyo aynası", "P", ["0xe9c9d2", "0xf6e3e0", "0xd9a3b8"], 0.7),
    ("2007", "POV sabah", "P", ["0xf6d8b0", "0xfbe9d0", "0xf0a870"], 0.8),
    ("2008", "Glow-up", "P", ["0x3a3a40", "0xd0b0c0", "0xffd6a0"], 1.6),
    ("2009", "Yağmurlu koşu", "L", ["0x0a1428", "0x203a66", "0x6aa0e0"], 1.3),
    ("200a", "Mum ve plak", "L", ["0x1c1208", "0x6a3c10", "0xf0a030"], 0.6),
    ("200b", "Espresso", "L", ["0x1a1008", "0x5a3418", "0xd8b080"], 1.0),
    ("200c", "Siyah serum", "L", ["0x050505", "0x2a2a2e", "0xd8d8e0"], 0.7),
    ("200d", "Gece kütüphanesi", "L", ["0x120c06", "0x3a2410", "0xd0902c"], 0.6),
    ("200e", "Akıllı kupa", "L", ["0xeaf2f2", "0xb8dcdc", "0x30a8a8"], 1.0),
    ("200f", "Kulaklık", "L", ["0x060c1e", "0x142a60", "0x3a80f0"], 1.2),
    ("2010", "X-ray enerji", "L", ["0x040806", "0x0a3a20", "0x40ff90"], 1.7),
]

# id → (başlık, kapak gradyan renkleri)
AUDIO = {
    "3000": ["0x3a1a6a", "0xe0508a"], "3001": ["0x0a0a10", "0x6a1a1a"],
    "3002": ["0x2a0a0a", "0xd08020"], "3003": ["0x101a30", "0xc0a050"],
    "3004": ["0x14243a", "0x4aa0a0"], "3005": ["0x0c1a24", "0x2a6a7a"],
    "3006": ["0x3a2a14", "0xc08a4a"], "3007": ["0x2a0a5a", "0x20d0e0"],
    "3008": ["0x2a2038", "0xc0a0d0"], "3009": ["0x080808", "0x704040"],
    "300a": ["0x1a1038", "0x8a70d0"], "300b": ["0x0a1428", "0x40607a"],
    "300c": ["0x0a0a0a", "0x7a1020"], "300d": ["0x401a50", "0xff8a60"],
}

AUDIO_TITLES = {
    "3000": "Synth-pop marşı", "3001": "Karanlık trap", "3002": "Stadyum rock'ı",
    "3003": "Orkestral film müziği", "3004": "Caz füzyon", "3005": "Ambient elektronik",
    "3006": "Akustik halk baladı", "3007": "Festival dansı", "3008": "Lo-fi hip hop",
    "3009": "Sinematik darbe", "300a": "Etereal ambient pad", "300b": "Yağmurlu gece baladı",
    "300c": "Drift phonk", "300d": "City pop",
}

DUR = 6


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(" ".join(cmd))
        print(r.stderr[-1500:])
        sys.exit(1)


def make_video(vid, title, shape, cols, speed):
    w, h = (640, 360) if shape == "L" else (360, 640)
    mp4 = os.path.join(OUT, f"v-{vid}.mp4")
    jpg = os.path.join(OUT, f"v-{vid}.jpg")
    light = vid in ("2006", "2007", "200e")
    ink = "0x20202a" if light else "white"
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
        tf.write(title)
        tpath = tf.name
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
        tf.write("Promptly · örnek çıktı")
        spath = tf.name
    # hareketli ışık süpürmesi: geq ile yatay kayan yumuşak parlaklık lekesi
    sx = f"(0.15+0.7*T/{DUR})"
    glow = (
        f"geq=lum='clip(lum(X,Y)+{42 if not light else 26}*exp(-((X-W*{sx}*{speed})^2+(Y-H*(0.5+0.18*sin(T*1.7)))^2)"
        f"/(2*(H*0.28)^2)),0,255)':cb='cb(X,Y)':cr='cr(X,Y)'"
    )
    fx = (
        f"gradients=s={w}x{h}:c0={cols[0]}:c1={cols[1]}:c2={cols[2]}:nb_colors=3:"
        f"speed={0.012 * speed + 0.004}:rate=24:d={DUR},format=yuv420p,{glow},"
        f"noise=alls=6:allf=t,vignette=PI/5.5,"
        f"drawtext=fontfile={FONT}:textfile={tpath}:fontcolor={ink}:fontsize={h // 14 if shape == 'L' else h // 20}:"
        f"x=(w*0.06):y=h-text_h-h*0.1:alpha='min(1,max(0,(t-0.4)/0.8))',"
        f"drawtext=fontfile={FONT}:textfile={spath}:fontcolor={ink}@0.7:fontsize={h // 28 if shape == 'L' else h // 40}:"
        f"x=(w*0.06):y=h-text_h-h*0.045:alpha='min(1,max(0,(t-0.9)/0.8))',"
        f"fade=t=in:st=0:d=0.5,fade=t=out:st={DUR - 0.5}:d=0.5"
    )
    run([
        "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", fx, "-t", str(DUR),
        "-c:v", "libx264", "-preset", "medium", "-crf", "30", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-an", mp4,
    ])
    run(["ffmpeg", "-y", "-v", "error", "-ss", "2.8", "-i", mp4, "-frames:v", "1", "-q:v", "4", jpg])
    os.unlink(tpath)
    os.unlink(spath)


def make_audio(aid, wav_dir):
    wav = os.path.join(wav_dir, f"a-{aid}.wav")
    mp3 = os.path.join(OUT, f"a-{aid}.mp3")
    jpg = os.path.join(OUT, f"a-{aid}.jpg")
    run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", "72k", "-ar", "32000", "-ac", "1", mp3])
    c0, c1 = AUDIO[aid]
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
        tf.write(AUDIO_TITLES[aid])
        tpath = tf.name
    graph = (
        f"gradients=s=480x480:c0={c0}:c1={c1}:nb_colors=2:x0=0:y0=0:x1=480:y1=480:d=1[bg];"
        f"[0:a]aformat=channel_layouts=mono,showwavespic=s=432x180:colors=white:filter=peak[w];"
        f"[bg][w]overlay=24:150,"
        f"drawtext=fontfile={FONT}:textfile={tpath}:fontcolor=white:fontsize=30:x=24:y=48,"
        f"drawtext=fontfile={FONT}:text='örnek çıktı':fontcolor=white@0.7:fontsize=18:x=24:y=92"
    )
    run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-filter_complex", graph, "-frames:v", "1", "-q:v", "4", jpg])
    os.unlink(tpath)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[2:]) if len(sys.argv) > 2 else None
    wav_dir = sys.argv[1]
    for v in VIDEOS:
        if only and v[0] not in only:
            continue
        make_video(*v)
        print("video", v[0], flush=True)
    for aid in AUDIO:
        if only and aid not in only:
            continue
        make_audio(aid, wav_dir)
        print("audio", aid, flush=True)
