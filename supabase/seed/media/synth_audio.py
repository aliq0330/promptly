#!/usr/bin/env python3
"""
Promptly demo ses sentezleyicisi — 14 ses promptu için GERÇEKTEN çalınabilen
kısa örnek çıktılar üretir (numpy ile saf sentez, dış örnek/dosya yok).

Bunlar yapay zekâ modeli çıktısı DEĞİL; her prompt'un tarif ettiği türü
(tempo, enstrüman, atmosfer) yaklaşık olarak yansıtan, elle programlanmış
sentezlenmiş demo parçalardır. Sitede "örnek çıktı" olarak oynatılırlar.

Kullanım: python3 synth_audio.py <çıktı_klasörü>   → a-<id>.wav dosyaları
"""
import sys
import os
import wave
import numpy as np

SR = 32000
RNG = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def mix(buf, t0, sig, gain=1.0):
    i = int(t0 * SR)
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def env(n, a=0.01, d=0.0, s=1.0, r=0.05, sr=SR):
    """ADSR-benzeri zarf (d>0 ise s seviyesine düşer)."""
    e = np.ones(n)
    na = max(1, int(a * sr))
    nr = max(1, int(r * sr))
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na)
    if d > 0:
        nd = min(n - na, int(d * sr))
        if nd > 0:
            e[na:na + nd] = np.linspace(1, s, nd)
            e[na + nd:] = s
    nr = min(nr, n)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(freq, dur, wave_="sine", vib=0.0, vib_rate=5.0, harm=None, detune=0.0, a=0.01, d=0.0, s=1.0, r=0.05):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + vib * np.sin(2 * np.pi * vib_rate * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if wave_ == "sine":
        x = np.sin(ph)
    elif wave_ == "saw":
        x = 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    elif wave_ == "square":
        x = np.sign(np.sin(ph))
    elif wave_ == "tri":
        x = 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1.0) - 1) - 1
    elif wave_ == "odd":  # klarnet/armonika benzeri tek harmonikler
        x = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7, 9))
        x /= 1.6
    elif wave_ == "add" and harm:
        x = sum(h * np.sin((i + 1) * ph) for i, h in enumerate(harm))
        x /= max(1e-6, sum(harm))
    else:
        x = np.sin(ph)
    if detune:
        ph2 = 2 * np.pi * np.cumsum(f * (1 + detune)) / SR
        x = 0.5 * (x + (2 * ((ph2 / (2 * np.pi)) % 1.0) - 1 if wave_ == "saw" else np.sin(ph2)))
    return x * env(n, a, d, s, r)


def fm_key(freq, dur, index=1.6, decay=1.5, a=0.004):
    """Rhodes/elektrik piyano benzeri FM tonu."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = index * np.exp(-t * decay)
    x = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * t))
    x += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 3)
    return x * env(n, a, 0, 1, 0.12) * np.exp(-t * 0.9)


def piano(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 2.5)
         + 0.25 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 4) + 0.12 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t * 6))
    return x * env(n, 0.003, 0, 1, 0.2) * np.exp(-t * 1.1)


def pluck(freq, dur, damp=0.996):
    """Karplus-Strong kopuk tel."""
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    ring = RNG.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        j = i % p
        out[i] = ring[j]
        ring[j] = damp * 0.5 * (ring[j] + ring[(j + 1) % p])
    return out * env(n, 0.002, 0, 1, 0.08)


def lowpass(x, cutoff):
    from scipy.signal import lfilter
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def noise(n):
    return RNG.uniform(-1, 1, n)


def kick(dur=0.35, f0=130, f1=42, punch=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 9)
    x += 0.4 * punch * noise(n) * np.exp(-t * 90)
    return np.tanh(x * 1.6)


def snare(dur=0.25, tone_f=190, nz=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * tone_f * t) * np.exp(-t * 28) * 0.5
    x += highpass(noise(n), 1800) * np.exp(-t * 20) * nz
    return x


def clap(dur=0.28):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = highpass(noise(n), 900)
    bursts = np.zeros(n)
    for off in (0.0, 0.012, 0.025):
        k = int(off * SR)
        bursts[k:] += np.exp(-t[: n - k] * 160)
    return x * (bursts * 0.5 + np.exp(-t * 22) * 0.6)


def hat(open_=False, dur=None):
    d = dur or (0.22 if open_ else 0.05)
    n = int(d * SR)
    t = np.arange(n) / SR
    return highpass(noise(n), 6500) * np.exp(-t * (14 if open_ else 80)) * 0.5


def bass808(freq, dur, glide_to=None, drive=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.full(n, float(freq))
    if glide_to:
        k = int(min(n, 0.25 * SR))
        f[:k] = np.linspace(freq, glide_to, k)
        f[k:] = glide_to
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * env(n, 0.003, 0, 1, 0.08) * np.exp(-t * 0.9)
    return np.tanh(x * drive)


def cowbell(dur=0.28):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sign(np.sin(2 * np.pi * 560 * t)) + np.sign(np.sin(2 * np.pi * 845 * t))
    x = highpass(x, 400) * np.exp(-t * 14)
    return x * 0.35


def reverb(x, mix_=0.25, size=1.0):
    delays = [0.0297, 0.0371, 0.0411, 0.0437, 0.0561, 0.0683]
    wet = np.zeros_like(x)
    for d in delays:
        k = int(d * size * SR)
        y = np.zeros_like(x)
        fb = 0.0
        # basit geri beslemeli tarak filtresi (vektörel olmayan ama kısa kaydırmalı)
        buf = x.copy()
        for rep in range(1, 7):
            shifted = np.zeros_like(x)
            if k * rep < len(x):
                shifted[k * rep:] = x[: len(x) - k * rep]
            y += shifted * (0.62 ** rep)
        wet += y / len(delays)
    wet = lowpass(wet, 4500)
    return x * (1 - mix_ * 0.5) + wet * mix_


def sweep(dur, f0, f1, vol=0.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(f0, f1, n)
    x = lowpass(noise(n), 1)  # placeholder, replaced below
    x = noise(n)
    # bant geçiren gibi: basit değişken kesim yerine gürültü * yükselen genlik
    x = highpass(x, 700)
    return x * np.linspace(0, 1, n) ** 2 * vol


def master(x, fade_out=0.6, target=0.82):
    n = len(x)
    fi = int(0.03 * SR)
    x[:fi] *= np.linspace(0, 1, fi)
    fo = int(fade_out * SR)
    x[-fo:] *= np.linspace(1, 0, fo)
    x = lowpass(lowpass(x, 6500), 9000)
    x = np.tanh(x * 1.2)
    peak = np.max(np.abs(x)) or 1
    return x / peak * target


def save(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def newbuf(sec):
    return np.zeros(int(sec * SR))


def chord(buf, t0, notes, dur, gain, wave_="sine", **kw):
    for n_ in notes:
        mix(buf, t0, tone(midi(n_), dur, wave_, **kw), gain)


# ---------------------------------------------------------------- parçalar --


def t_synthpop():
    bpm = 118
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    prog = [([57, 60, 64], 45), ([53, 57, 60], 41), ([48, 52, 55], 36), ([55, 59, 62], 43)]
    k, s_, h = kick(), clap(), hat()
    for bar in range(int(L / (4 * b)) + 1):
        root = prog[bar % 4]
        t0 = bar * 4 * b
        chord(buf, t0, [x + 12 for x in root[0]], 4 * b, 0.07, "saw", detune=0.004, a=0.05, r=0.3)
        for beat in range(4):
            tb = t0 + beat * b
            mix(buf, tb, k, 0.9)
            if beat in (1, 3):
                mix(buf, tb, s_, 0.55)
            for sub in range(2):
                mix(buf, tb + sub * b / 2, h, 0.22 if sub else 0.12)
            for sixteenth in range(4):
                note = root[0][sixteenth % 3] + 24
                mix(buf, tb + sixteenth * b / 4, tone(midi(note), b / 4 * 0.9, "saw", a=0.004, r=0.04), 0.07)
        for eighth in range(8):
            mix(buf, t0 + eighth * b / 2, bass808(midi(root[1]), b / 2 * 0.9, drive=1.2), 0.45)
    return master(reverb(buf, 0.2))


def t_trap():
    bpm = 70
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    h, sn = hat(), snare(0.3, 170)
    roots = [36, 36, 32, 34]
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        r = roots[bar % 4]
        mix(buf, t0, bass808(midi(r), 1.6 * b, glide_to=midi(r) * 0.8, drive=3.0), 0.8)
        mix(buf, t0 + 2.5 * b, bass808(midi(r + 7), 0.8 * b, drive=3.0), 0.7)
        mix(buf, t0 + 2 * b, sn, 0.7)
        mix(buf, t0 + 2 * b, clap(), 0.35)
        for i in range(16):
            mix(buf, t0 + i * b / 4, h, 0.2 if i % 2 else 0.12)
        for i in range(6):  # hi-hat rulosu
            mix(buf, t0 + 3.25 * b + i * b / 12, h, 0.15 + i * 0.03)
        chord(buf, t0, [r + 24, r + 27, r + 31], 4 * b, 0.05, "sine", a=0.3, r=0.6)
        mix(buf, t0 + 1.5 * b, tone(midi(r + 36), 0.9 * b, "sine", a=0.01, r=0.4), 0.06)
    return master(reverb(buf, 0.3))


def t_rock():
    bpm = 128
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    k, sn, h = kick(0.3, 110, 50), snare(0.25, 200, 1.0), hat()
    chords = [(40, 47), (43, 50), (45, 52), (43, 50)]
    mix(buf, 0, highpass(noise(int(1.4 * SR)), 3000) * np.exp(-np.arange(int(1.4 * SR)) / SR * 3) * 0.5, 0.5)
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        rt, fifth = chords[bar % 4]
        for beat in range(4):
            tb = t0 + beat * b
            gtr = np.tanh(3.5 * (tone(midi(rt + 12), b, "saw", a=0.003, r=0.04) + tone(midi(fifth + 12), b, "saw", a=0.003, r=0.04)
                                 + tone(midi(rt + 24), b, "saw", a=0.003, r=0.04))) * 0.2
            mix(buf, tb, gtr, 0.55)
            mix(buf, tb, k, 0.85 if beat in (0, 2) else 0.5)
            if beat in (1, 3):
                mix(buf, tb, sn, 0.7)
            for sub in range(2):
                mix(buf, tb + sub * b / 2, h, 0.25)
        mix(buf, t0, tone(midi(rt - 12), 4 * b, "sine", a=0.01, r=0.1), 0.35)
    return master(reverb(buf, 0.15))


def t_orchestral():
    bpm = 72
    b = 60 / bpm
    L = 17
    buf = newbuf(L)
    prog = [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [45, 49, 52, 57]]
    tim = kick(0.9, 90, 55) * 0.8
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        notes = prog[bar % 4]
        swell = np.concatenate([np.linspace(0.2, 1.0, int(2.6 * b * SR)), np.linspace(1.0, 0.6, int(1.4 * b * SR))])
        for n_ in notes:
            for dt in (-0.004, 0.0, 0.005):
                x = tone(midi(n_) * (1 + dt), 4 * b, "saw", vib=0.002, a=0.9, r=0.6)
                m = min(len(x), len(swell))
                x[:m] *= swell[:m]
                mix(buf, t0, lowpass(x, 2200), 0.05)
        mix(buf, t0, tone(midi(notes[0] - 12), 4 * b, "sine", a=0.6, r=0.6), 0.25)
        for beat in range(4):
            if beat in (0, 2):
                mix(buf, t0 + beat * b, tim, 0.6)
        if bar >= 2:  # koro/boru nefesi
            for n_ in notes[1:3]:
                mix(buf, t0 + 2 * b, lowpass(tone(midi(n_ + 12), 2 * b, "saw", a=0.7, r=0.5), 1400), 0.05)
    return master(reverb(buf, 0.45, 1.6), 1.2)


def t_jazz():
    bpm = 104
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    prog = [([50, 53, 57, 60, 64], 38), ([55, 59, 62, 65, 69], 43), ([48, 52, 55, 59, 62], 36), ([57, 61, 64, 67, 70], 45)]
    ride = hat(True, 0.18) * 0.6
    rim = highpass(noise(int(0.04 * SR)), 2500) * np.exp(-np.arange(int(0.04 * SR)) / SR * 90)
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch, r = prog[bar % 4]
        for off in (0.0, 1.5, 2.5):
            for n_ in ch:
                mix(buf, t0 + off * b, fm_key(midi(n_), 1.1 * b), 0.12)
        walk = [r, r + 3, r + 7, r + 5]
        for beat in range(4):
            mix(buf, t0 + beat * b, tone(midi(walk[beat]), b * 0.9, "tri", a=0.005, r=0.08), 0.5)
            mix(buf, t0 + beat * b, ride, 0.5)
            swing = beat * b + b * 0.66
            mix(buf, t0 + swing, ride, 0.35)
            if beat in (1, 3):
                mix(buf, t0 + beat * b, rim, 0.7)
        mix(buf, t0 + 1.5 * b, tone(midi(ch[-1] + 12), 0.4, "tri", a=0.01, r=0.1), 0.1)
    return master(reverb(buf, 0.2))


def t_ambient_elec():
    L = 17
    buf = newbuf(L)
    for n_, g in ((29, 0.35), (36, 0.22), (41, 0.14)):
        mix(buf, 0, tone(midi(n_), L, "sine", vib=0.0015, vib_rate=0.2, a=2.5, r=3), g)
    for n_ in (60, 64, 67, 71):
        mix(buf, 1.5, lowpass(tone(midi(n_), L - 2, "saw", detune=0.003, a=4, r=4), 900), 0.045)
    # yağmur
    nz = highpass(noise(len(buf)), 3500) * 0.018
    drops = (RNG.random(len(buf)) > 0.9985).astype(float)
    nz += lowpass(drops, 4000) * 0.3
    buf += lowpass(nz, 7000)
    for _ in range(26):  # granüler tanecikler
        t0 = RNG.uniform(0.5, L - 1.5)
        f = midi(RNG.choice([72, 76, 79, 83, 88]))
        mix(buf, t0, tone(f, 0.35, "sine", a=0.08, r=0.25), RNG.uniform(0.03, 0.07))
    return master(reverb(buf, 0.5, 1.8), 2.5)


def t_folk():
    bpm = 84
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    prog = [[43, 47, 50, 55], [48, 52, 55, 60], [50, 54, 57, 62], [40, 47, 52, 55]]
    br = highpass(noise(int(0.3 * SR)), 2500) * np.exp(-np.arange(int(0.3 * SR)) / SR * 14) * 0.5
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch = prog[bar % 4]
        pattern = [0, 1, 2, 3, 2, 1, 2, 1]
        for i, idx in enumerate(pattern):
            mix(buf, t0 + i * b / 2, pluck(midi(ch[idx]), 1.2, 0.997), 0.55)
        if bar % 2 == 1:
            mix(buf, t0 + 2 * b, tone(midi(ch[2] + 12), 1.8 * b, "odd", vib=0.004, a=0.12, r=0.5), 0.12)
        for beat in (1, 3):
            mix(buf, t0 + beat * b, br, 0.18)
    return master(reverb(buf, 0.25))


def t_festival():
    bpm = 128
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    k, h, cl = kick(), hat(), clap()
    prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    kick_env = np.ones(len(buf))
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch = prog[bar % 4]
        for beat in range(4):
            tb = t0 + beat * b
            mix(buf, tb, k, 0.95)
            mix(buf, tb + b / 2, h, 0.3)
            mix(buf, tb + b / 2, tone(midi(ch[0] - 12), b / 2 * 0.85, "saw", a=0.005, r=0.05), 0.28)
            if beat in (1, 3):
                mix(buf, tb, cl, 0.5)
            i0 = int(tb * SR)
            i1 = min(len(buf), i0 + int(0.22 * SR))
            if i1 > i0:
                kick_env[i0:i1] = np.minimum(kick_env[i0:i1], np.linspace(0.45, 1.0, i1 - i0))
        lead = np.zeros(int(4 * b * SR))
        for st in range(16):
            n_ = ch[st % 3] + 24 + (12 if st % 8 > 4 else 0)
            tt = tone(midi(n_), b / 4 * 0.95, "saw", detune=0.006, a=0.003, r=0.03)
            tt = tt + tone(midi(n_) * 1.006, b / 4 * 0.95, "saw", a=0.003, r=0.03)
            i = int(st * b / 4 * SR)
            lead[i:i + len(tt)] += tt[: len(lead) - i] * 0.07
        mix(buf, t0, lead, 1.0)
    buf *= kick_env
    # son 4 sn: yükselen snare rulosu + süpürme
    roll_start = L - 4
    sn = snare(0.12, 220)
    for i in range(32):
        t_ = roll_start + i * (4 / 32)
        mix(buf, t_, sn, 0.15 + 0.5 * i / 32)
    mix(buf, roll_start, sweep(4, 400, 8000, 0.5), 0.5)
    return master(reverb(buf, 0.18))


def t_lofi():
    bpm = 78
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    prog = [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]]
    k, sn = kick(0.3, 100, 50), snare(0.25, 180, 0.7)
    h = hat() * 0.8
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch = prog[bar % 4]
        for off in (0.0, 2.0):
            for n_ in ch:
                x = fm_key(midi(n_), 2 * b, 1.1, 1.2)
                mix(buf, t0 + off * b, lowpass(x, 2500), 0.15)
        mix(buf, t0, k, 0.8)
        mix(buf, t0 + 2.5 * b, k, 0.65)
        mix(buf, t0 + 1 * b, sn, 0.55)
        mix(buf, t0 + 3 * b, sn, 0.55)
        for i in range(8):
            mix(buf, t0 + i * b / 2 + (b * 0.1 if i % 2 else 0), h, 0.18)
        mix(buf, t0, tone(midi(ch[0] - 12), 2 * b, "sine", a=0.02, r=0.2), 0.4)
    # vinil çıtırtısı
    clicks = (RNG.random(len(buf)) > 0.9993).astype(float) * RNG.uniform(0.2, 0.8, len(buf))
    buf += lowpass(clicks, 7000) * 0.6
    buf += highpass(noise(len(buf)), 5000) * 0.006
    return master(lowpass(reverb(buf, 0.25), 6500))


def t_impact():
    L = 5
    buf = newbuf(L)
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    f = 28 + 90 * np.exp(-t * 3.2)
    drop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.5)
    mix(buf, 0.35, np.tanh(drop * 2.5), 0.9)
    mix(buf, 0.0, sweep(0.35, 300, 6000, 0.6), 0.6)
    bn = int(0.5 * SR)
    mix(buf, 0.35, lowpass(noise(bn), 3500) * np.exp(-np.arange(bn) / SR * 7), 0.7)
    for f_, g in ((523, 0.3), (1347, 0.22), (2210, 0.15), (3150, 0.1), (4400, 0.06)):
        cn = int(2.5 * SR)
        tt = np.arange(cn) / SR
        mix(buf, 0.36, np.sin(2 * np.pi * f_ * tt) * np.exp(-tt * 3.2), g)
    return master(reverb(buf, 0.55, 2.2), 1.4)


def t_ethereal_pad():
    L = 17
    buf = newbuf(L)
    chords = [[57, 64, 71, 74], [53, 60, 67, 72], [55, 62, 69, 74]]
    seg = L / len(chords)
    for i, ch in enumerate(chords):
        for n_ in ch:
            for dt in (-0.003, 0.0, 0.004):
                x = tone(midi(n_) * (1 + dt), seg + 2.5, "sine", vib=0.002, vib_rate=0.3 + 0.1 * i, a=2.2, r=2.2)
                mix(buf, i * seg - 0.5 if i else 0, x, 0.05)
        mix(buf, i * seg, tone(midi(ch[0] + 24), seg + 1, "sine", a=2.5, r=2.5), 0.025)
    sh = lowpass(highpass(noise(len(buf)), 4000), 9000) * 0.008
    buf += sh * (0.5 + 0.5 * np.sin(np.arange(len(buf)) / SR * 0.5))
    return master(reverb(buf, 0.65, 2.0), 2.5)


def t_rainy_ballad():
    bpm = 66
    b = 60 / bpm
    L = 17
    buf = newbuf(L)
    prog = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch = prog[bar % 4]
        seq = [0, 1, 2, 3, 2, 1, 2, 1]
        for i, idx in enumerate(seq):
            mix(buf, t0 + i * b / 2, piano(midi(ch[idx]), 2.0), 0.28)
        mix(buf, t0, piano(midi(ch[0] - 12), 3.5), 0.35)
        if bar % 2 == 1:
            mix(buf, t0 + 1.5 * b, piano(midi(ch[3] + 7), 2.5), 0.2)
    rain = highpass(noise(len(buf)), 2500) * 0.035
    rain += lowpass((RNG.random(len(buf)) > 0.9988).astype(float), 5000) * 0.5
    buf += lowpass(rain, 8000)
    return master(reverb(buf, 0.45, 1.5), 1.5)


def t_phonk():
    bpm = 132
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    cb, sn, h = cowbell(), snare(0.2, 200, 1.0), hat()
    mel = [67, 67, 70, 67, 65, 63, 65, 63]
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        for i, n_ in enumerate(mel):
            cbn = cowbell() if True else cb
            mix(buf, t0 + i * b / 2, cbn, 0.55)
            mix(buf, t0 + i * b / 2, lowpass(tone(midi(n_ - 12), b / 2, "saw", a=0.005, r=0.1), 1500), 0.08)
        mix(buf, t0, bass808(midi(31), 1.4 * b, glide_to=midi(29), drive=4.5), 0.9)
        mix(buf, t0 + 2 * b, bass808(midi(31), 1.0 * b, glide_to=midi(34), drive=4.5), 0.8)
        mix(buf, t0 + 3.25 * b, bass808(midi(29), 0.6 * b, drive=4.5), 0.7)
        mix(buf, t0 + b, sn, 0.7)
        mix(buf, t0 + 3 * b, sn, 0.7)
        for i in range(12):
            mix(buf, t0 + i * b / 3, h, 0.2)
    return master(reverb(buf, 0.22))


def t_citypop():
    bpm = 108
    b = 60 / bpm
    L = 16
    buf = newbuf(L)
    prog = [([57, 61, 64, 68], 33), ([54, 59, 62, 66], 30), ([52, 56, 59, 63], 28), ([56, 59, 63, 66], 32)]
    k, sn, h, oh = kick(), snare(0.22, 210, 0.7), hat(), hat(True, 0.18)
    for bar in range(int(L / (4 * b)) + 1):
        t0 = bar * 4 * b
        ch, r = prog[bar % 4]
        for beat in range(4):
            tb = t0 + beat * b
            mix(buf, tb, k if beat in (0, 2) else k * 0.0, 0.8)
            if beat in (1, 3):
                mix(buf, tb, sn, 0.5)
            mix(buf, tb, h, 0.2)
            mix(buf, tb + b / 2, oh if beat % 2 else h, 0.22)
            # slap bas
            mix(buf, tb, pluck(midi(r + 12 * (beat % 2)), 0.5, 0.99) * 0.7, 0.55)
            mix(buf, tb + b * 0.75, pluck(midi(r + 12), 0.3, 0.99) * 0.6, 0.35)
        for off in (0.5, 1.5, 2.5, 3.5):  # pirinç vuruşları
            for n_ in ch[1:]:
                mix(buf, t0 + off * b, tone(midi(n_ + 12), 0.28 * b * 2, "saw", detune=0.003, a=0.004, r=0.05), 0.07)
        for n_ in ch:
            mix(buf, t0, fm_key(midi(n_), 2 * b), 0.1)
            mix(buf, t0 + 2 * b, fm_key(midi(n_), 2 * b), 0.1)
    return master(reverb(buf, 0.2))


TRACKS = {
    "3000": t_synthpop, "3001": t_trap, "3002": t_rock, "3003": t_orchestral,
    "3004": t_jazz, "3005": t_ambient_elec, "3006": t_folk, "3007": t_festival,
    "3008": t_lofi, "3009": t_impact, "300a": t_ethereal_pad, "300b": t_rainy_ballad,
    "300c": t_phonk, "300d": t_citypop,
}

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for tid, fn in TRACKS.items():
        x = fn()
        save(os.path.join(out, f"a-{tid}.wav"), x)
        print(tid, f"{len(x) / SR:.1f}s", f"peak={np.max(np.abs(x)):.2f}", flush=True)
