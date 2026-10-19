"""Bande son : voix off + musique d'ambiance (synthétisée, libre de droits) + effets sonores, puis assemblage MP4.

Usage : python3 tools/video/mix.py 16x9
Entrées : build/<fmt>/timing.json, voix-*.wav, events.json, video-muet.mp4
Sortie  : build/<fmt>/TopoMaroc-GIS-<fmt>.mp4
"""
import json, os, subprocess, sys, wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FMT = sys.argv[1] if len(sys.argv) > 1 else "16x9"
B = os.path.join(ROOT, "tools/video/build", FMT)
SR = 48000
tim = json.load(open(os.path.join(B, "timing.json"), encoding="utf-8"))
ev = json.load(open(os.path.join(B, "events.json"), encoding="utf-8"))
T = max(tim["total"], ev["total"])
N = int(T * SR) + SR
rng = np.random.default_rng(42)


def read_wav(p):
    with wave.open(p) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return a


def write_wav(p, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    with wave.open(p, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


# ---------------------------------------------------------------- voix
voice = np.zeros(N, np.float32)
for s in tim["scenes"]:
    a = read_wav(os.path.join(B, f"voix-{s['id']}.wav"))
    i = int(s["voice"] * SR)
    voice[i:i + len(a)] += a[: max(0, N - i)]
write_wav(os.path.join(B, "voix.wav"), voice)

# ---------------------------------------------------------------- musique (nappe + arpège + pulsation douce)
t = np.arange(N) / SR
bpm = 100; beat = 60 / bpm; bar = 4 * beat
chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 52, 55, 59, 64], [55, 59, 62, 64, 67]]  # Am9, Fmaj7, Cmaj7, G6
f = lambda m: 440 * 2 ** ((m - 69) / 12)
music = np.zeros((N, 2), np.float32)
chord_len = 2 * bar
for c in range(int(T / chord_len) + 2):
    notes = chords[c % 4]
    a0, a1 = c * chord_len, (c + 1) * chord_len
    i0, i1 = int(max(0, a0 - 1.5) * SR), min(N, int((a1 + 1.5) * SR))
    if i0 >= N:
        break
    tt = t[i0:i1]
    env = np.clip((tt - (a0 - 1.5)) / 1.8, 0, 1) * np.clip(((a1 + 1.5) - tt) / 1.8, 0, 1)
    for k, m in enumerate(notes):
        for det, pan in ((-0.0025, 0.3), (0.0025, 0.7)):
            fr = f(m) * (1 + det)
            sig = (np.sin(2 * np.pi * fr * tt) + 0.25 * np.sin(4 * np.pi * fr * tt + .3)) * env * 0.035
            music[i0:i1, 0] += sig * (1 - pan); music[i0:i1, 1] += sig * pan
    # basse
    fr = f(notes[0] - 12)
    music[i0:i1] += (np.sin(2 * np.pi * fr * tt) * env * 0.06)[:, None]
    # arpège (croches)
    for j in range(16):
        st = a0 + j * beat / 2
        if st >= T:
            break
        m = notes[[0, 2, 4, 3, 1, 3, 2, 4][j % 8]] + 12
        k0, k1 = int(st * SR), min(N, int((st + 1.2) * SR))
        tt2 = t[k0:k1] - st
        pl = np.sin(2 * np.pi * f(m) * tt2) * np.exp(-tt2 * 5.5) * 0.045
        pan = 0.35 if j % 2 else 0.65
        music[k0:k1, 0] += pl * (1 - pan); music[k0:k1, 1] += pl * pan
# pulsation grave sur les temps 1 et 3, après l'introduction
for b in np.arange(4 * beat, T - 3, 2 * beat):
    k0, k1 = int(b * SR), min(N, int((b + .35) * SR))
    tt2 = t[k0:k1] - b
    music[k0:k1] += (np.sin(2 * np.pi * (52 + 40 * np.exp(-tt2 * 25)) * tt2) * np.exp(-tt2 * 9) * 0.12)[:, None]
# fondu d'entrée / sortie
fade = np.clip(t / 2.5, 0, 1) * np.clip((T - t) / 3.0, 0, 1)
music *= fade[:, None]
write_wav(os.path.join(B, "musique-brute.wav"), music)

# ---------------------------------------------------------------- effets sonores
sfx = np.zeros((N, 2), np.float32)
def place(x, at, gain=1.0, pan=0.5):
    i = int(at * SR)
    if i < 0 or i >= N:
        return
    x = x[: N - i] * gain
    sfx[i:i + len(x), 0] += x * (1 - pan) * 2 * 0.5
    sfx[i:i + len(x), 1] += x * pan * 2 * 0.5
def smooth(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")
def whoosh(d=0.75):
    n = int(d * SR); tt = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    lo = smooth(noise, 40); hi = noise - smooth(noise, 6)
    mixk = np.clip(tt / d, 0, 1)
    env = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 2
    return (lo * (1 - mixk) * 2.5 + hi * mixk * .35) * env * 0.22
def click():
    n = int(0.09 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2300 * tt) * np.exp(-tt * 70) * 0.18 + np.sin(2 * np.pi * 1150 * tt) * np.exp(-tt * 45) * 0.12)
def chime():
    n = int(1.6 * SR); tt = np.arange(n) / SR; x = np.zeros(n)
    for k, fr in enumerate((1318.5, 1760.0, 2637.0)):
        st = int(k * 0.09 * SR)
        x[st:] += np.sin(2 * np.pi * fr * tt[: n - st]) * np.exp(-tt[: n - st] * 3.2) * 0.12
    return x
def rise(d=1.4):
    n = int(d * SR); tt = np.arange(n) / SR
    return smooth(rng.standard_normal(n), 12) * (tt / d) ** 2 * np.exp(-np.clip(tt - d * .85, 0, None) * 30) * 0.5
for e in ev["events"]:
    if e["type"] == "whoosh": place(whoosh(), e["t"] - 0.2, 1.0, 0.5)
    elif e["type"] == "swish": place(whoosh(0.45), e["t"], 0.55, 0.62)
    elif e["type"] == "click": place(click(), e["t"], 1.0, 0.4)
    elif e["type"] == "chime": place(chime(), e["t"], 1.0, 0.5)
    elif e["type"] == "rise": place(rise(), e["t"] - 1.3, 0.8, 0.5)
write_wav(os.path.join(B, "effets.wav"), sfx)

# ---------------------------------------------------------------- mixage (musique atténuée sous la voix) et assemblage
mix = os.path.join(B, "bande-son.wav")
subprocess.run(["ffmpeg", "-y", "-v", "error",
    "-i", os.path.join(B, "voix.wav"), "-i", os.path.join(B, "musique-brute.wav"), "-i", os.path.join(B, "effets.wav"),
    "-filter_complex",
    "[1:a]lowpass=f=5200,aecho=0.8:0.6:90|170:0.25|0.15,volume=0.9[m];"
    "[0:a]asplit=2[v][vsc];"
    "[m][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=450:makeup=1[md];"
    "[v]highpass=f=70,acompressor=threshold=0.1:ratio=3:attack=5:release=120,volume=1.35[vc];"
    "[vc][md][2:a]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11[out]",
    "-map", "[out]", "-ar", "48000", mix], check=True)
out = os.path.join(B, f"TopoMaroc-GIS-{FMT}.mp4")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(B, "video-muet.mp4"), "-i", mix,
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
print("vidéo finale :", out)
