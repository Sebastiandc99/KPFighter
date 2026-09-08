"""Reproducible arcade schedule effects; requires ffmpeg, no external recordings."""
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 44100
ROOT = Path(__file__).resolve().parents[1]

def build(name, duration):
    rng = random.Random(21)
    samples = []
    filtered = 0
    for i in range(round(duration * RATE)):
        t = i / RATE
        filtered = .88 * filtered + .12 * rng.uniform(-1, 1)
        if name == 'critical':
            # Quick digital clock ticks rising into a smooth red energy sweep.
            pulse = (t % .065) / .065
            ticks = .16 * math.sin(2 * math.pi * 1150 * t) * math.exp(-pulse * 9) * math.exp(-t * 5)
            beam = .27 * math.sin(2 * math.pi * (260*t + 850*t*t)) * math.exp(-t * 4)
            v = ticks + beam + filtered * .38 * math.exp(-t * 3)
        else:
            v = .16 * math.sin(2 * math.pi * (640*t - 145*t*t)) * math.exp(-t * 3)
            for start in [.87, 1.00, 1.13, 1.26]:
                u = t - start
                if u >= 0:
                    v += .25 * math.sin(2 * math.pi * (85*u + 2*(1-math.exp(-u*28)))) * math.exp(-u*15)
                    v += filtered * .55 * math.exp(-u*19)
        envelope = min(1, t/.012, (duration-t)/.12)
        samples.append(v * max(0, envelope))
    peak = max(abs(v) for v in samples)
    with tempfile.TemporaryDirectory() as temp:
        source = Path(temp) / 'effect.wav'
        with wave.open(str(source), 'wb') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(b''.join(struct.pack('<h', round(v/peak*.65*32767)) for v in samples))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(source), '-codec:a', 'libmp3lame',
                        '-b:a', '128k', str(ROOT / f'assets/jairo-{name}-v1.mp3')], check=True)

build('critical', .95)
build('crash', 1.8)
