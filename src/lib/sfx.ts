// Built-in sound-effect library: every sound is synthesised locally with WebAudio (no files, no network).
export interface Sfx { id: string; name: string; cat: string; dur: number; build: (c: OfflineAudioContext) => void }

const SR = 44100;

function noise(c: BaseAudioContext, seconds: number) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b;
  return s;
}
/** gain envelope: attack to peak, exponential decay to ~0 */
function env(c: BaseAudioContext, t0: number, attack: number, decay: number, peak = 1) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(c.destination);
  return g;
}
function tone(c: BaseAudioContext, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak = 0.6, attack = 0.005) {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  o.connect(env(c, t0, attack, dur, peak));
  o.start(t0); o.stop(t0 + dur + attack + 0.05);
}
function burst(c: BaseAudioContext, t0: number, dur: number, type: BiquadFilterType, f: number, q = 1, peak = 0.6, f1?: number) {
  const n = noise(c, dur + 0.1);
  const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  n.connect(flt); flt.connect(env(c, t0, 0.003, dur, peak));
  n.start(t0); n.stop(t0 + dur + 0.1);
}
function swell(c: BaseAudioContext, dur: number, f0: number, f1: number, peakAt: number, q = 1.5, peak = 0.7) {
  const n = noise(c, dur);
  const flt = c.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, 0); flt.frequency.exponentialRampToValueAtTime(f1, dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(peak, dur * peakAt);
  g.gain.linearRampToValueAtTime(0.0001, dur);
  n.connect(flt); flt.connect(g); g.connect(c.destination);
  n.start(0);
}
const bellPartials = [1, 2.76, 5.4, 8.93];

export const SFX: Sfx[] = [
  // transitions
  { id: "whoosh", name: "Whoosh", cat: "Transitions", dur: 0.9, build: (c) => swell(c, 0.9, 300, 3500, 0.45) },
  { id: "swoosh", name: "Swoosh", cat: "Transitions", dur: 0.5, build: (c) => swell(c, 0.5, 1800, 400, 0.3, 1) },
  { id: "riser", name: "Riser", cat: "Transitions", dur: 2.5, build: (c) => { swell(c, 2.5, 200, 7000, 0.95, 2, 0.6); tone(c, "sawtooth", 80, 900, 0, 2.5, 0.12, 1.5); } },
  { id: "fall", name: "Downer", cat: "Transitions", dur: 1.5, build: (c) => { tone(c, "sawtooth", 1200, 60, 0, 1.4, 0.3); burst(c, 0, 1.4, "lowpass", 2500, 1, 0.25, 100); } },
  // UI
  { id: "click", name: "Click", cat: "UI", dur: 0.12, build: (c) => burst(c, 0, 0.03, "highpass", 2500, 1, 0.7) },
  { id: "pop", name: "Pop", cat: "UI", dur: 0.25, build: (c) => tone(c, "sine", 700, 140, 0, 0.18, 0.9) },
  { id: "ding", name: "Ding", cat: "UI", dur: 1.4, build: (c) => { tone(c, "sine", 1320, 1320, 0, 1.2, 0.5); tone(c, "sine", 2640, 2640, 0, 0.6, 0.15); } },
  { id: "notify", name: "Notification", cat: "UI", dur: 0.9, build: (c) => { tone(c, "sine", 880, 880, 0, 0.35, 0.5); tone(c, "sine", 1320, 1320, 0.15, 0.6, 0.5); } },
  { id: "success", name: "Success", cat: "UI", dur: 1.2, build: (c) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, "triangle", f, f, i * 0.1, 0.5, 0.35)) },
  { id: "error", name: "Error", cat: "UI", dur: 0.6, build: (c) => { tone(c, "sawtooth", 160, 150, 0, 0.18, 0.35); tone(c, "sawtooth", 160, 150, 0.22, 0.28, 0.35); } },
  { id: "coin", name: "Coin", cat: "UI", dur: 0.7, build: (c) => { tone(c, "square", 988, 988, 0, 0.08, 0.25); tone(c, "square", 1319, 1319, 0.08, 0.5, 0.25); } },
  { id: "typing", name: "Typing", cat: "UI", dur: 1.4, build: (c) => { for (let i = 0; i < 12; i++) burst(c, i * 0.1 + Math.random() * 0.04, 0.04, "bandpass", 1800 + Math.random() * 1500, 2, 0.5); } },
  { id: "shutter", name: "Camera shutter", cat: "UI", dur: 0.4, build: (c) => { burst(c, 0, 0.05, "bandpass", 2800, 3, 0.7); burst(c, 0.07, 0.06, "bandpass", 1800, 3, 0.6); } },
  // impacts
  { id: "boom", name: "Explosion", cat: "Impacts", dur: 2.4, build: (c) => { burst(c, 0, 2.2, "lowpass", 900, 0.7, 0.9, 50); tone(c, "sine", 90, 28, 0, 1.6, 0.9); } },
  { id: "impact", name: "Impact hit", cat: "Impacts", dur: 1.0, build: (c) => { tone(c, "sine", 140, 35, 0, 0.7, 1); burst(c, 0, 0.35, "lowpass", 1500, 0.8, 0.6, 120); } },
  { id: "kick", name: "Kick drum", cat: "Impacts", dur: 0.5, build: (c) => { tone(c, "sine", 160, 42, 0, 0.35, 1); burst(c, 0, 0.02, "highpass", 3000, 1, 0.3); } },
  { id: "snare", name: "Snare", cat: "Impacts", dur: 0.4, build: (c) => { burst(c, 0, 0.22, "highpass", 1800, 0.8, 0.7); tone(c, "triangle", 220, 140, 0, 0.12, 0.5); } },
  { id: "clap", name: "Clap", cat: "Impacts", dur: 0.5, build: (c) => { for (const t of [0, 0.012, 0.026]) burst(c, t, 0.05, "bandpass", 1500, 1.2, 0.6); burst(c, 0.03, 0.2, "bandpass", 1300, 1, 0.4); } },
  // fun
  { id: "boing", name: "Boing", cat: "Fun", dur: 0.8, build: (c) => { const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, 0); o.frequency.exponentialRampToValueAtTime(620, 0.12); o.frequency.exponentialRampToValueAtTime(140, 0.7);
      const lfo = c.createOscillator(); lfo.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(env(c, 0, 0.01, 0.7, 0.7)); o.start(0); lfo.start(0); o.stop(0.8); lfo.stop(0.8); } },
  { id: "laser", name: "Laser", cat: "Fun", dur: 0.5, build: (c) => tone(c, "sawtooth", 2400, 160, 0, 0.35, 0.4) },
  { id: "sparkle", name: "Sparkle", cat: "Fun", dur: 1.2, build: (c) => { for (let i = 0; i < 14; i++) tone(c, "sine", 2200 + Math.random() * 4500, 2200 + Math.random() * 4500, Math.random() * 0.8, 0.18, 0.18); } },
  { id: "scratch", name: "Record scratch", cat: "Fun", dur: 0.6, build: (c) => { burst(c, 0, 0.35, "bandpass", 1200, 4, 0.8, 4500); burst(c, 0.35, 0.2, "bandpass", 3500, 4, 0.6, 600); } },
  { id: "glitch", name: "Glitch", cat: "Fun", dur: 0.7, build: (c) => { for (let i = 0; i < 9; i++) tone(c, "square", 100 + Math.random() * 1800, 100 + Math.random() * 1800, i * 0.07, 0.05, 0.25, 0.001); burst(c, 0.1, 0.4, "highpass", 4000, 1, 0.2); } },
  // ambience
  { id: "applause", name: "Applause", cat: "Ambience", dur: 3.0, build: (c) => { const n = noise(c, 3); const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2200; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.7, 0.5); g.gain.setValueAtTime(0.7, 2); g.gain.linearRampToValueAtTime(0.0001, 3);
      const lfo = c.createOscillator(); lfo.frequency.value = 17; const lg = c.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(g.gain);
      n.connect(f); f.connect(g); g.connect(c.destination); n.start(0); lfo.start(0); } },
  { id: "heartbeat", name: "Heartbeat", cat: "Ambience", dur: 2.4, build: (c) => { for (let i = 0; i < 3; i++) { tone(c, "sine", 70, 40, i * 0.8, 0.18, 0.9); tone(c, "sine", 62, 36, i * 0.8 + 0.2, 0.2, 0.7); } } },
  { id: "bell", name: "Bell", cat: "Ambience", dur: 3.0, build: (c) => bellPartials.forEach((m, i) => tone(c, "sine", 440 * m, 440 * m, 0, 2.6 / (i + 1), 0.4 / (i + 1))) },
  { id: "rain", name: "Rain", cat: "Ambience", dur: 4.0, build: (c) => { const n = noise(c, 4); const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 3500; const g = c.createGain(); g.gain.value = 0.25; n.connect(f); f.connect(g); g.connect(c.destination); n.start(0); } },
];

export const SFX_CATS = Array.from(new Set(SFX.map((s) => s.cat)));

export async function renderSfx(s: Sfx): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(1, Math.ceil(SR * s.dur), SR);
  s.build(c);
  return c.startRendering();
}

export function bufferToWav(buf: AudioBuffer): Blob {
  const d = buf.getChannelData(0), n = d.length, out = new ArrayBuffer(44 + n * 4), v = new DataView(out);
  const w = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  // soft limiter so layered synths never clip
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 0.95 ? 0.95 / peak : 1;
  w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, d[i] * k)) * 0x7fff; v.setInt16(44 + i * 4, s, true); v.setInt16(46 + i * 4, s, true); }
  return new Blob([out], { type: "audio/wav" });
}

let previewCtx: AudioContext | null = null;
let previewSrc: AudioBufferSourceNode | null = null;
export async function previewSfx(s: Sfx) {
  previewCtx ??= new AudioContext();
  if (previewCtx.state === "suspended") await previewCtx.resume();
  previewSrc?.stop();
  const buf = await renderSfx(s);
  const src = previewCtx.createBufferSource();
  src.buffer = buf; src.connect(previewCtx.destination); src.start();
  previewSrc = src;
}
