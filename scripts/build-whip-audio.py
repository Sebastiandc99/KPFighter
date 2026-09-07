"""Deterministic layered whip sweep, dry crack and short metallic tail."""
import math,random,struct,wave
random.seed(42)
rate=44100;frames=[];low=0;previous=0
for n in range(round(rate*.56)):
 t=n/rate;noise=random.uniform(-1,1);low=.82*low+.18*noise
 high=noise-previous;previous=noise
 sweep=(.35*low+.055*noise)*(math.sin(math.pi*t/.195)**2) if t<.195 else 0
 age=t-.19
 crack=(.82*high*math.exp(-age*125)+.34*noise*math.exp(-age*46)) if age>=0 else 0
 snap=.35*math.sin(2*math.pi*(220*age-240*age*age))*math.exp(-age*37) if age>=0 else 0
 metal=sum(math.sin(2*math.pi*f*age) for f in (1850,2710,3420))*.033*math.exp(-age*20) if age>=0 else 0
 value=math.tanh((sweep+crack+snap+metal)*1.35)*.91
 frames.append(struct.pack('<h',round(value*32767)))
with wave.open('assets/whip-v2.wav','wb') as w:
 w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(b''.join(frames))
