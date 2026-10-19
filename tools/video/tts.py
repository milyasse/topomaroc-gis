"""Voix off (Microsoft Edge TTS, voix neuronale française) et minutage des scènes.

Usage : python3 tools/video/tts.py 16x9
Écrit tools/video/build/<fmt>/ : voix-<scene>.wav, timing.json, sous-titres.srt
"""
import asyncio, json, os, re, subprocess, sys, wave

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FMT = sys.argv[1] if len(sys.argv) > 1 else "16x9"
DATA = json.load(open(os.path.join(ROOT, "tools/video/scenes.json"), encoding="utf-8"))
CFG = DATA["formats"][FMT]
OUT = os.path.join(ROOT, "tools/video/build", FMT)
os.makedirs(OUT, exist_ok=True)
MAXC = 78 if CFG["width"] > CFG["height"] else 52  # caractères par sous-titre (2 lignes)


async def synth(text, mp3):
    com = edge_tts.Communicate(text, DATA["voice"], rate=DATA["rate"], boundary="WordBoundary")
    words = []
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append((ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]))
    return words


def wav_duration(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()


def chunks(text, words):
    """Découpe le texte en sous-titres et les date à partir des limites de mots."""
    # position de chaque mot dans le texte original
    pos, cur, low = [], 0, text.lower()
    for (a, b, w) in words:
        i = low.find(w.lower(), cur)
        if i < 0:
            continue
        pos.append((i, i + len(w), a, b)); cur = i + len(w)
    # points de coupure : fin de phrase/proposition, sinon espace avant MAXC
    out, start = [], 0
    while start < len(text):
        rest = text[start:].strip()
        if len(rest) <= MAXC:
            cut = len(text)
        else:
            seg = text[start:start + MAXC]
            m = [mm.end() for mm in re.finditer(r"[.,;:!?»](?=\s)", seg)]
            good = [c for c in m if c > MAXC * 0.45]
            cut = start + (good[-1] if good else seg.rfind(" "))
        piece = text[start:cut].strip()
        if piece:
            inside = [p for p in pos if p[0] >= start and p[0] < cut]
            if inside:
                out.append([inside[0][2], inside[-1][3], piece])
        start = cut
    return out


async def main():
    t, scenes, srt = 0.6, [], []
    n = 0
    for k, s in enumerate(CFG["scenes"]):
        mp3, wav = os.path.join(OUT, f"voix-{s['id']}.mp3"), os.path.join(OUT, f"voix-{s['id']}.wav")
        # prononciation : « GIS » épelé (sinon lu « jisse ») ; le texte des sous-titres reste inchangé
        spoken = s["text"].replace("TopoMaroc GIS", "Topo-Maroc, G. I. S.")
        words = await synth(spoken, mp3)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav], check=True)
        vd = wav_duration(wav)
        lead = 1.3 if s["layout"] == "hero" else 0.55
        tail = 1.6 if s["layout"] == "outro" else 0.9
        dur = max(lead + vd + tail, 4.5)
        cues = []
        for a, b, txt in chunks(s["text"], words):
            c0, c1 = t + lead + a, t + lead + b + 0.25
            cues.append({"t0": round(c0, 3), "t1": round(c1, 3), "text": txt})
        # pas de chevauchement entre sous-titres successifs
        for i in range(len(cues) - 1):
            cues[i]["t1"] = min(cues[i]["t1"], cues[i + 1]["t0"] - 0.02)
        for c in cues:
            n += 1
            f = lambda x: f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int(round(x % 1 * 1000)) % 1000:03d}"
            srt.append(f"{n}\n{f(c['t0'])} --> {f(c['t1'])}\n{c['text']}\n")
        scenes.append({"id": s["id"], "start": round(t, 3), "dur": round(dur, 3), "voice": round(t + lead, 3), "voiceDur": round(vd, 3), "cues": cues})
        print(f"{s['id']} : début {t:6.2f} s, voix {vd:5.2f} s, scène {dur:5.2f} s, {len(cues)} sous-titres")
        t += dur
    total = round(t + 0.8, 3)
    json.dump({"format": FMT, "voice": DATA["voice"], "total": total, "scenes": scenes}, open(os.path.join(OUT, "timing.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, "sous-titres.srt"), "w", encoding="utf-8").write("\n".join(srt))
    print(f"durée totale {total:.1f} s")


asyncio.run(main())
