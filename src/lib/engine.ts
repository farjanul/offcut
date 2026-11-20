// Playback / compositing / export engine. Everything runs locally in the browser.
import { useEditor } from "./store";
import { Clip, projectDuration } from "./types";
import {
  Extra, TEXT_ANIM_IDS, backOut, baseExtra, combinedAnim, composeCurves, fadeFactor, filterCss, fwd, maskPath, prevAdjacent, speedAt, srcAt, transState, valueAt, wheelParams,
} from "./effects";
import { applyLut } from "./lut";

type El = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
export interface Bounds { cx: number; cy: number; w: number; h: number; rot: number }
export interface Chain {
  gain: GainNode; bass: BiquadFilterNode; mid: BiquadFilterNode; treble: BiquadFilterNode; deess: BiquadFilterNode;
  comp: DynamicsCompressorNode; pan: StereoPannerNode; wet: GainNode; conv: ConvolverNode; an: AnalyserNode; gate: number;
}

/** builds the per-clip audio processing chain (shared by live playback and offline export) */
export function buildChain(ctx: BaseAudioContext, src: AudioNode, outputs: AudioNode[], impulse: AudioBuffer, analyse = false): Chain {
  const bass = ctx.createBiquadFilter(); bass.type = "lowshelf"; bass.frequency.value = 200;
  const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.Q.value = 1;
  const treble = ctx.createBiquadFilter(); treble.type = "highshelf"; treble.frequency.value = 4000;
  const deess = ctx.createBiquadFilter(); deess.type = "peaking"; deess.frequency.value = 6500; deess.Q.value = 3;
  const comp = ctx.createDynamicsCompressor(); comp.knee.value = 20; comp.attack.value = 0.005; comp.release.value = 0.2;
  const pan = ctx.createStereoPanner();
  const gain = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = impulse;
  const wet = ctx.createGain(); wet.gain.value = 0;
  const an = ctx.createAnalyser(); an.fftSize = 512;
  if (analyse) src.connect(an);
  src.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(deess); deess.connect(comp); comp.connect(pan); pan.connect(gain);
  pan.connect(conv); conv.connect(wet);
  for (const o of outputs) { gain.connect(o); wet.connect(o); }
  return { gain, bass, mid, treble, deess, comp, pan, wet, conv, an, gate: 1 };
}

export function applyChainParams(ch: Chain, c: Clip, vol: number) {
  ch.pan.pan.value = Math.max(-1, Math.min(1, c.pan / 100));
  ch.bass.gain.value = c.bass;
  ch.treble.gain.value = c.treble;
  ch.mid.frequency.value = c.eqFreq;
  ch.mid.gain.value = c.eqGain;
  ch.deess.gain.value = -c.deess * 0.18;
  ch.comp.threshold.value = -6 - c.comp * 0.4;
  ch.comp.ratio.value = 1 + c.comp * 0.11;
  ch.wet.gain.value = (c.reverb / 100) * 0.8 * vol;
}

export function makeImpulse(ctx: BaseAudioContext, seconds = 2.2, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const SVG_FX = `
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;pointer-events:none" aria-hidden="true">
 <defs>
  <filter id="fx-rgb" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
   <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
   <feOffset in="r" dx="8" dy="0" result="ro" id="fx-rgb-r"/>
   <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
   <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
   <feOffset in="b" dx="-8" dy="0" result="bo" id="fx-rgb-b"/>
   <feBlend in="ro" in2="g" mode="screen" result="rg"/>
   <feBlend in="rg" in2="bo" mode="screen"/>
  </filter>
  <filter id="fx-glitch" x="-5%" y="-5%" width="110%" height="110%">
   <feTurbulence type="fractalNoise" baseFrequency="0.0 0.04" numOctaves="1" seed="1" result="n" id="fx-glitch-n"/>
   <feDisplacementMap in="SourceGraphic" in2="n" scale="40" xChannelSelector="R" yChannelSelector="G" id="fx-glitch-d"/>
  </filter>
  <filter id="fx-grain" x="0" y="0" width="100%" height="100%">
   <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1" result="n" id="fx-grain-n"/>
   <feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="gn"/>
   <feBlend in="SourceGraphic" in2="gn" mode="overlay" result="bl"/>
   <feComposite in="bl" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.3" k3="0.7" k4="0" id="fx-grain-c"/>
  </filter>
  <filter id="fx-sharpen"><feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" preserveAlpha="true"/></filter>
  <filter id="fx-emboss"><feConvolveMatrix order="3" kernelMatrix="-2 -1 0 -1 1 1 0 1 2" preserveAlpha="true" bias="0.5"/></filter>
  <filter id="fx-edge"><feConvolveMatrix order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true"/></filter>
  <filter id="fx-poster" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="discrete" tableValues="0 0.33 0.66 1"/><feFuncG type="discrete" tableValues="0 0.33 0.66 1"/><feFuncB type="discrete" tableValues="0 0.33 0.66 1"/></feComponentTransfer></filter>
  <filter id="fx-duotone" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="table" tableValues="0.1 1"/><feFuncG type="table" tableValues="0.05 0.65"/><feFuncB type="table" tableValues="0.4 0.35"/></feComponentTransfer></filter>
  <filter id="fx-temp" color-interpolation-filters="sRGB"><feColorMatrix id="fx-temp-m" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>
  <filter id="fx-chroma" color-interpolation-filters="sRGB"><feColorMatrix id="fx-chroma-m" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  3 -6 3 0 1"/></filter>
  <filter id="fx-luma" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha"/></filter>
  <filter id="fx-curves" color-interpolation-filters="sRGB"><feComponentTransfer>
    <feFuncR id="fx-curves-r" type="table" tableValues="0 1"/><feFuncG id="fx-curves-g" type="table" tableValues="0 1"/><feFuncB id="fx-curves-b" type="table" tableValues="0 1"/>
  </feComponentTransfer></filter>
  <filter id="fx-wheels" color-interpolation-filters="sRGB"><feComponentTransfer>
    <feFuncR id="fx-wheels-r" type="gamma" amplitude="1" exponent="1" offset="0"/><feFuncG id="fx-wheels-g" type="gamma" amplitude="1" exponent="1" offset="0"/><feFuncB id="fx-wheels-b" type="gamma" amplitude="1" exponent="1" offset="0"/>
  </feComponentTransfer></filter>
 </defs>
</svg>`;

class Engine {
  canvas: HTMLCanvasElement | null = null;
  private els = new Map<string, { el: El; url: string }>();
  actx: AudioContext | null = null;
  private chains = new Map<string, Chain>();
  private exportDest: MediaStreamAudioDestinationNode | null = null;
  private master: AnalyserNode | null = null;
  private impulse: AudioBuffer | null = null;
  private raf = 0;
  private last = 0;
  private onEnd: (() => void) | null = null;
  private work = new Map<string, HTMLCanvasElement>();
  private fxReady = false;
  private duckGain = 1;
  exporting = false;
  exportScale = 1;
  rate = 1; // J/K/L shuttle speed (negative = backwards)
  bounds = new Map<string, Bounds>();

  attach(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    cancelAnimationFrame(this.raf);
    if (canvas) {
      this.ensureFx();
      this.last = performance.now();
      const loop = (ts: number) => {
        this.tick(ts);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  private ensureFx() {
    if (this.fxReady || typeof document === "undefined") return;
    const d = document.createElement("div");
    d.innerHTML = SVG_FX;
    document.body.appendChild(d);
    this.fxReady = true;
  }
  private attr(id: string, name: string, v: string | number) {
    document.getElementById(id)?.setAttribute(name, String(v));
  }

  /* ---------- audio graph ---------- */
  private ensureAudio() {
    if (!this.actx) {
      this.actx = new AudioContext();
      this.exportDest = this.actx.createMediaStreamDestination();
      this.master = this.actx.createAnalyser();
      this.master.fftSize = 1024;
      this.master.connect(this.actx.destination);
      this.impulse = makeImpulse(this.actx);
    }
    if (this.actx.state === "suspended") void this.actx.resume();
    for (const [id, { el }] of this.els) this.connect(id, el);
  }

  private connect(id: string, el: El) {
    const ctx = this.actx;
    if (!ctx || this.chains.has(id) || el instanceof HTMLImageElement) return;
    const src = ctx.createMediaElementSource(el);
    this.chains.set(id, buildChain(ctx, src, [this.master!, this.exportDest!], this.impulse!, true));
  }

  /** master output level 0..1 (for the VU meter) */
  level(): number {
    if (!this.master) return 0;
    const d = new Uint8Array(this.master.fftSize);
    this.master.getByteTimeDomainData(d);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v - 128) / 128);
    return Math.min(1, peak);
  }
  private rms(an: AnalyserNode) {
    const d = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(d);
    let s = 0;
    for (const v of d) { const x = (v - 128) / 128; s += x * x; }
    return Math.sqrt(s / d.length);
  }

  /* ---------- element pool ---------- */
  private getEl(clip: Clip): El | null {
    if (!clip.mediaId) return null;
    const url = useEditor.getState().urls[clip.mediaId];
    if (!url) return null;
    const cur = this.els.get(clip.id);
    if (cur && cur.url === url) return cur.el;
    if (cur) this.dispose(clip.id);
    let el: El;
    if (clip.type === "image") {
      el = new Image();
      el.src = url;
    } else {
      el = document.createElement(clip.type === "video" ? "video" : "audio");
      el.preload = "auto";
      (el as HTMLVideoElement).playsInline = true;
      el.src = url;
    }
    this.els.set(clip.id, { el, url });
    if (this.actx) this.connect(clip.id, el);
    return el;
  }

  private dispose(id: string) {
    const e = this.els.get(id);
    if (!e) return;
    if (!(e.el instanceof HTMLImageElement)) e.el.pause();
    const ch = this.chains.get(id);
    if (ch) for (const n of [ch.gain, ch.wet, ch.pan, ch.comp, ch.deess, ch.treble, ch.mid, ch.bass, ch.conv, ch.an]) n.disconnect();
    this.chains.delete(id);
    e.el.removeAttribute("src");
    this.els.delete(id);
  }

  /* ---------- main loop ---------- */
  private tick(ts: number) {
    const st = useEditor.getState();
    const dt = Math.min(0.25, (ts - this.last) / 1000);
    this.last = ts;
    const dur = projectDuration(st.project);
    let t = st.time;
    const fwdPlay = st.playing && this.rate > 0;

    if (st.playing) {
      t += dt * this.rate;
      if (t <= 0 && this.rate < 0) { t = 0; this.rate = 1; useEditor.setState({ time: 0, playing: false }); }
      else if (t >= dur) {
        if (st.loop && !this.exporting && dur > 0) {
          t = 0;
          useEditor.setState({ time: 0 });
        } else {
          t = dur;
          this.rate = 1;
          useEditor.setState({ time: t, playing: false });
          this.sync(t, false);
          this.draw(t);
          const cb = this.onEnd;
          this.onEnd = null;
          cb?.();
          return;
        }
      } else useEditor.setState({ time: t });
    }
    if (!st.playing) this.rate = 1;
    this.sync(t, fwdPlay);
    this.draw(t);
  }

  private sync(t: number, playing: boolean) {
    const { project } = useEditor.getState();
    const live = new Set(project.clips.map((c) => c.id));
    for (const id of [...this.els.keys()]) if (!live.has(id)) this.dispose(id);

    // a clip followed by a transition keeps running a little past its end
    const ext = new Map<string, number>();
    for (const c of project.clips) {
      if (c.transIn !== "none") {
        const p = prevAdjacent(project.clips, c);
        if (p) ext.set(p.id, c.transDur);
      }
    }

    // speech level → music ducking
    let voice = 0;
    for (const c of project.clips) {
      const tr = project.tracks.find((x) => x.id === c.trackId);
      if (tr?.duck || tr?.muted || (c.type !== "audio" && c.type !== "video")) continue;
      const ch = this.chains.get(c.id);
      if (ch && t >= c.start && t < c.start + c.duration) voice = Math.max(voice, this.rms(ch.an));
    }
    this.duckGain += ((voice > 0.02 ? 0.25 : 1) - this.duckGain) * (voice > 0.02 ? 0.25 : 0.05);

    const rateAbs = Math.abs(this.rate);
    for (const c of project.clips) {
      if (c.type !== "video" && c.type !== "audio") continue;
      const el = this.getEl(c) as HTMLMediaElement | null;
      if (!el) continue;
      const tr = project.tracks.find((x) => x.id === c.trackId);
      const end = c.start + c.duration;
      const active = t >= c.start && t < end + (ext.get(c.id) ?? 0);
      const tl = t - c.start;
      const maxT = Number.isFinite(el.duration) && el.duration > 0 ? el.duration - 0.05 : Infinity;
      // past the clip end the source keeps running (transition handle) unless reversed/frozen
      const raw = c.reverse || c.freeze ? srcAt(c, tl) : c.offset + fwd(c, Math.max(0, tl));
      const target = Math.min(raw, maxT);
      const seekOnly = c.reverse || c.freeze;

      // crossfade: previous clip fades out while the next one fades in
      let xf = 1;
      const e = ext.get(c.id);
      if (e && t >= end) xf = Math.max(0, 1 - (t - end) / e);
      if (c.transIn !== "none" && tl >= 0 && tl < c.transDur && prevAdjacent(project.clips, c)) xf = Math.min(xf, tl / c.transDur);
      const outside = t >= end && !e;
      let vol = tr?.muted || outside || seekOnly ? 0 : valueAt(c, "volume", t) * fadeFactor(c, Math.min(t, end - 0.001)) * xf * (tr?.vol ?? 1);

      const ch = this.chains.get(c.id);
      if (ch) {
        if (tr?.duck) vol *= this.duckGain;
        if (c.gate > 0) {
          const thr = Math.pow(10, (-70 + c.gate * 0.45) / 20);
          ch.gate += ((this.rms(ch.an) < thr ? 0.04 : 1) - ch.gate) * 0.25;
          vol *= ch.gate;
        }
        ch.gain.gain.value = vol;
        applyChainParams(ch, c, vol);
      } else el.volume = Math.min(1, vol);
      const sp = Math.min(16, Math.max(0.0625, speedAt(c, tl) * rateAbs));
      if (Math.abs(el.playbackRate - sp) > 0.01) { el.preservesPitch = true; el.playbackRate = sp; }

      if (active) {
        if (playing && !seekOnly) {
          if (el.paused) {
            if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
            void el.play().catch(() => {});
          } else if (Math.abs(el.currentTime - target) > 0.3 * Math.max(1, rateAbs)) {
            el.currentTime = target;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.03) el.currentTime = target;
        }
      } else {
        if (!el.paused) el.pause();
        const soon = c.start - t < 1.5 && c.start > t;
        if (soon && Math.abs(el.currentTime - srcAt(c, 0)) > 0.05) el.currentTime = srcAt(c, 0);
      }
    }
  }

  /** resolves once every active video element has finished seeking (used by the offline exporter) */
  async waitSeeks(t: number) {
    const { project } = useEditor.getState();
    const waits: Promise<void>[] = [];
    for (const c of project.clips) {
      if (c.type !== "video" || t < c.start || t >= c.start + c.duration + c.transDur + 1) continue;
      const el = this.els.get(c.id)?.el as HTMLVideoElement | undefined;
      if (el && (el.seeking || el.readyState < 2)) {
        waits.push(new Promise((res) => {
          const done = () => { el.removeEventListener("seeked", done); el.removeEventListener("loadeddata", done); res(); };
          el.addEventListener("seeked", done); el.addEventListener("loadeddata", done);
          setTimeout(done, 2000);
        }));
      }
    }
    await Promise.all(waits);
  }

  /** deterministic single-frame render for the offline exporter */
  async frameAt(t: number, scale: number) {
    this.exporting = true;
    this.exportScale = scale;
    useEditor.setState({ time: t, playing: false });
    this.sync(t, false);
    await this.waitSeeks(t);
    await new Promise((r) => setTimeout(r, 0));
    this.draw(t);
  }

  /** downsampled snapshot of the program monitor (for scopes) */
  sample(w = 192): ImageData | null {
    const cv = this.canvas;
    if (!cv || !cv.width) return null;
    const h = Math.max(1, Math.round((w * cv.height) / cv.width));
    const s = this.canvasOf("scope", w, h);
    const g = s.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(cv, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  /* ---------- render ---------- */
  private canvasOf(key: string, w: number, h: number) {
    let c = this.work.get(key);
    if (!c) { c = document.createElement("canvas"); this.work.set(key, c); }
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }

  /** builds the ctx.filter string for a clip (CSS functions + SVG filters) */
  private filterFor(c: Clip, t: number, extraBlur = 0): string {
    const parts: string[] = [];
    const css = filterCss(c.filter);
    if (css !== "none") parts.push(css);
    if (extraBlur > 0.1) parts.push(`blur(${extraBlur.toFixed(1)}px)`);
    if (c.temp || c.tint) {
      const r = 1 + c.temp / 200, b = 1 - c.temp / 200, g = 1 + c.tint / 200;
      this.attr("fx-temp-m", "values", `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`);
      parts.push("url(#fx-temp)");
    }
    if (c.wheels) {
      const p = wheelParams(c.wheels);
      ["r", "g", "b"].forEach((k, i) => {
        this.attr(`fx-wheels-${k}`, "amplitude", p[i].amplitude.toFixed(3));
        this.attr(`fx-wheels-${k}`, "exponent", p[i].exponent.toFixed(3));
        this.attr(`fx-wheels-${k}`, "offset", p[i].offset.toFixed(3));
      });
      parts.push("url(#fx-wheels)");
    }
    if (c.curves) {
      const tv = composeCurves(c.curves);
      ["r", "g", "b"].forEach((k, i) => this.attr(`fx-curves-${k}`, "tableValues", tv[i]));
      parts.push("url(#fx-curves)");
    }
    const a = c.effectAmt / 100;
    switch (c.effect) {
      case "rgb": this.attr("fx-rgb-r", "dx", 2 + a * 20); this.attr("fx-rgb-b", "dx", -(2 + a * 20)); parts.push("url(#fx-rgb)"); break;
      case "glitch": {
        const seed = Math.floor(t * 12) % 97 + 1;
        this.attr("fx-glitch-n", "seed", seed);
        this.attr("fx-glitch-n", "baseFrequency", `0 ${0.01 + (seed % 7) * 0.01}`);
        this.attr("fx-glitch-d", "scale", 10 + a * 90);
        parts.push("url(#fx-glitch)");
        break;
      }
      case "grain":
        this.attr("fx-grain-n", "seed", Math.floor(t * 24) % 200 + 1);
        this.attr("fx-grain-c", "k2", (a * 0.9).toFixed(2)); this.attr("fx-grain-c", "k3", (1 - a * 0.9).toFixed(2));
        parts.push("url(#fx-grain)");
        break;
      case "sharpen": case "emboss": case "edge": case "poster": case "duotone": parts.push(`url(#fx-${c.effect})`); break;
      case "invert": parts.push("invert(100%)"); break;
    }
    if (c.chroma) {
      const s = 2 + (c.chromaAmt / 100) * 10;
      this.attr("fx-chroma-m", "values", c.chroma === "green"
        ? `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${s / 2} ${-s} ${s / 2} 0 1`
        : `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${s / 2} ${s / 2} ${-s} 0 1`);
      parts.push("url(#fx-chroma)");
    }
    return parts.length ? parts.join(" ") : "none";
  }

  draw(t: number) {
    const cv = this.canvas;
    if (!cv) return;
    const { project, selectedId, guides, previewScale } = useEditor.getState();
    const scale = this.exporting ? this.exportScale : previewScale;
    const ev = (x: number) => Math.max(16, Math.round(x / 2) * 2);
    const W = ev(project.width * scale), H = ev(project.height * scale);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext("2d")!;
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.filter = "none";
    g.fillStyle = project.bg ?? "#000";
    g.fillRect(0, 0, cv.width, cv.height);
    this.bounds.clear();

    const mattes = new Set(project.clips.filter((c) => c.matte).map((c) => c.matte!.id));

    // bottom track first → top track last
    for (let i = project.tracks.length - 1; i >= 0; i--) {
      const tr = project.tracks[i];
      if (tr.kind !== "video" || tr.hidden) continue;
      for (const c of project.clips) {
        if (c.trackId !== tr.id || t < c.start || t >= c.start + c.duration || mattes.has(c.id)) continue;

        const prev = c.transIn !== "none" ? prevAdjacent(project.clips, c) : undefined;
        if (prev && t < c.start + c.transDur) {
          const ts = transState(c.transIn, (t - c.start) / c.transDur);
          if (ts.a.visible !== false) this.drawClip(g, cv, prev, t, Math.min(t, prev.start + prev.duration - 0.001), ts.a);
          if (ts.b.visible !== false) this.drawClip(g, cv, c, t, t, ts.b);
          if (ts.overlay) {
            g.globalAlpha = ts.overlay.alpha;
            g.fillStyle = ts.overlay.color;
            g.fillRect(0, 0, cv.width, cv.height);
            g.globalAlpha = 1;
          }
        } else {
          this.drawClip(g, cv, c, t, t, baseExtra());
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.filter = "none";

    if (this.exporting) return;
    const k = cv.width / 1280;

    // selection outline + handles (never rendered into exports)
    const b = selectedId ? this.bounds.get(selectedId) : null;
    if (b) {
      g.save();
      g.translate(b.cx, b.cy);
      g.rotate(b.rot);
      g.strokeStyle = "#22d3c5";
      g.lineWidth = 2 * k;
      g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.fillStyle = "#fff";
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.fillRect((sx * b.w) / 2 - 5 * k, (sy * b.h) / 2 - 5 * k, 10 * k, 10 * k);
      g.restore();
    }

    // safe margins / thirds guides
    if (guides) {
      const Wd = cv.width, Hd = cv.height;
      g.save();
      g.strokeStyle = "rgba(255,255,255,.55)";
      g.lineWidth = k;
      g.setLineDash([6 * k, 6 * k]);
      g.strokeRect(Wd * 0.05, Hd * 0.05, Wd * 0.9, Hd * 0.9);
      g.strokeRect(Wd * 0.1, Hd * 0.1, Wd * 0.8, Hd * 0.8);
      g.beginPath();
      for (const f of [1 / 3, 2 / 3]) { g.moveTo(Wd * f, 0); g.lineTo(Wd * f, Hd); g.moveTo(0, Hd * f); g.lineTo(Wd, Hd * f); }
      g.moveTo(Wd / 2 - 12 * k, Hd / 2); g.lineTo(Wd / 2 + 12 * k, Hd / 2); g.moveTo(Wd / 2, Hd / 2 - 12 * k); g.lineTo(Wd / 2, Hd / 2 + 12 * k);
      g.stroke();
      g.restore();
    }
  }

  /** draws one clip. t = real time (source sync / keyframes), tAnim = clamped time for fades & animations */
  private drawClip(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, c: Clip, t: number, tAnim: number, x: Extra, depth = 0) {
    const st = useEditor.getState();
    // adjustment layer: filters everything drawn so far
    if (c.type === "adjust") {
      const snap = this.canvasOf("adj", cv.width, cv.height);
      const sg = snap.getContext("2d")!;
      sg.clearRect(0, 0, snap.width, snap.height);
      sg.drawImage(cv, 0, 0);
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, valueAt(c, "opacity", t) * fadeFactor(c, tAnim) * x.alpha));
      g.filter = this.filterFor(c, t, x.blur);
      g.drawImage(snap, 0, 0);
      g.restore();
      return;
    }

    let src: CanvasImageSource | null = null;
    let w = 0, h = 0, sx = 0, sy = 0;
    if (c.type === "video" || c.type === "image") {
      const el = this.getEl(c);
      if (!el) return;
      let fw = 0, fh = 0;
      if (el instanceof HTMLVideoElement) {
        if (el.readyState < 2) return;
        fw = el.videoWidth; fh = el.videoHeight; src = el;
      } else if (el instanceof HTMLImageElement) {
        if (!el.complete || !el.naturalWidth) return;
        fw = el.naturalWidth; fh = el.naturalHeight; src = el;
      } else return;
      const [cl, ct, cr, cb] = c.crop;
      sx = cl * fw; sy = ct * fh; w = Math.max(2, (1 - cl - cr) * fw); h = Math.max(2, (1 - ct - cb) * fh);
    }

    const an = combinedAnim(c, tAnim);
    const alpha = Math.max(0, Math.min(1, valueAt(c, "opacity", t) * fadeFactor(c, tAnim) * an.alpha * x.alpha));
    const kx = valueAt(c, "x", t), ky = valueAt(c, "y", t);
    const cx = cv.width / 2 + (kx * cv.width) / 2 + (an.dx + x.dx) * cv.width;
    const cy = cv.height / 2 + (ky * cv.height) / 2 + (an.dy + x.dy) * cv.height;
    const sc = valueAt(c, "scale", t) * an.scale * x.scale;
    const rot = ((valueAt(c, "rotation", t) || 0) * Math.PI) / 180 + an.rot + x.rot;
    const blend = (c.blend || "source-over") as GlobalCompositeOperation;
    const layered = !!(c.mask || (c.matte && depth === 0));

    // layered clips render to an offscreen canvas first, then get masked / matted
    const layer = layered ? this.canvasOf(`layer${depth}`, cv.width, cv.height) : null;
    const lg = layer ? layer.getContext("2d")! : null;
    if (lg && layer) { lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalAlpha = 1; lg.globalCompositeOperation = "source-over"; lg.filter = "none"; lg.clearRect(0, 0, layer.width, layer.height); }
    const tg = lg ?? g;

    tg.save();
    if (!layered) x.clip?.(tg, cv.width, cv.height);
    tg.globalAlpha = layered ? 1 : alpha;
    tg.globalCompositeOperation = layered ? "source-over" : blend;
    const flt = this.filterFor(c, t, x.blur);
    tg.filter = flt;
    tg.translate(cx, cy);
    tg.rotate(rot);
    tg.scale(c.flipX ? -1 : 1, c.flipY ? -1 : 1);

    let bw = 0, bh = 0, boundDx = 0, boundDy = 0;
    let paint: (() => void) | null = null;
    if (src) {
      const fit = Math.min(cv.width / w, cv.height / h) * sc;
      bw = w * fit; bh = h * fit;
      let drawSrc: CanvasImageSource = src;
      let rx = sx, ry = sy, rw = w, rh = h;
      // 3D LUT (WebGL)
      const lut = c.lut ? st.lutData[c.lut] : undefined;
      if (lut) {
        const k = Math.min(1, 1280 / Math.max(bw, 1));
        const lw = Math.max(2, Math.round(bw * k)), lh = Math.max(2, Math.round(bh * k));
        const lc = this.canvasOf("lutsrc", lw, lh);
        lc.getContext("2d")!.drawImage(src, sx, sy, w, h, 0, 0, lw, lh);
        const res = applyLut(lc, lw, lh, lut, c.lutAmt / 100);
        if (res) { drawSrc = res; rx = 0; ry = 0; rw = res.width; rh = res.height; }
      }
      if (c.pixelate > 0) {
        const px = Math.max(2, c.pixelate * (cv.width / 960));
        const tmp = this.canvasOf("pix", Math.ceil(bw / px), Math.ceil(bh / px));
        tmp.getContext("2d")!.drawImage(drawSrc, rx, ry, rw, rh, 0, 0, tmp.width, tmp.height);
        paint = () => { tg.imageSmoothingEnabled = false; tg.drawImage(tmp, -bw / 2, -bh / 2, bw, bh); tg.imageSmoothingEnabled = true; };
      } else {
        paint = () => tg.drawImage(drawSrc, rx, ry, rw, rh, -bw / 2, -bh / 2, bw, bh);
      }
    } else if (c.type === "shape") {
      bw = (c.sw ?? 0.4) * cv.width * sc; bh = (c.sh ?? 0.25) * cv.height * sc;
      paint = () => {
        tg.fillStyle = c.fill ?? "#fff";
        if (c.shape === "ellipse") { tg.beginPath(); tg.ellipse(0, 0, bw / 2, bh / 2, 0, 0, Math.PI * 2); tg.fill(); }
        else tg.fillRect(-bw / 2, -bh / 2, bw, bh);
      };
    } else if (c.type === "text") {
      [bw, bh] = this.measureText(tg, c, cv, sc);
      paint = () => this.drawText(tg, c, cv, sc, t, tAnim);
    } else if (c.type === "note" && c.note) {
      const nt = c.note, k = cv.height / 1080;
      const pts = nt.pts.map((p) => [p[0] * cv.width * sc, p[1] * cv.height * sc] as [number, number]);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const pad = nt.width * k * sc * 2 + 8;
      bw = Math.max(24, maxX - minX + pad); bh = Math.max(24, maxY - minY + pad);
      boundDx = (minX + maxX) / 2; boundDy = (minY + maxY) / 2;
      const dp = c.animIn === "draw" ? Math.max(0, Math.min(1, (tAnim - c.start) / Math.max(0.1, Math.min(c.animDur, c.duration / 2)))) : 1;
      paint = () => this.drawNote(tg, nt, pts, sc, k, dp, cv, cx, cy);
    }
    paint?.();

    // glow: add a blurred, brightened copy on top
    if (paint && c.effect === "glow") {
      tg.filter = `${flt === "none" ? "" : flt + " "}blur(${(6 + (c.effectAmt / 100) * 24) * (cv.width / 1920)}px) brightness(1.5)`;
      tg.globalCompositeOperation = "screen";
      tg.globalAlpha = (layered ? 1 : alpha) * 0.85;
      paint();
    }
    // lens flare: soft radial highlights
    if (paint && c.effect === "flare" && bw > 0) {
      tg.filter = "none";
      tg.globalCompositeOperation = "screen";
      tg.globalAlpha = (layered ? 1 : alpha) * (0.4 + (c.effectAmt / 100) * 0.6);
      const fx = -bw * 0.25 + Math.sin(t * 0.5) * bw * 0.05, fy = -bh * 0.25;
      const gr = tg.createRadialGradient(fx, fy, 0, fx, fy, bw * 0.35);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,230,160,.7)"); gr.addColorStop(1, "rgba(255,160,60,0)");
      tg.fillStyle = gr; tg.fillRect(-bw / 2, -bh / 2, bw, bh);
      for (const [f, r, col] of [[0.35, 0.06, "rgba(120,200,255,.5)"], [0.6, 0.1, "rgba(255,120,200,.4)"], [0.9, 0.04, "rgba(255,255,160,.6)"]] as const) {
        const ox = fx + (-fx * 2) * f, oy = fy + (-fy * 2) * f;
        const g2 = tg.createRadialGradient(ox, oy, 0, ox, oy, bw * r);
        g2.addColorStop(0, col); g2.addColorStop(1, "rgba(0,0,0,0)");
        tg.fillStyle = g2; tg.beginPath(); tg.arc(ox, oy, bw * r, 0, Math.PI * 2); tg.fill();
      }
    }
    // vignette
    if (src && c.vignette > 0) {
      tg.filter = "none"; tg.globalCompositeOperation = "source-over"; tg.globalAlpha = layered ? 1 : alpha;
      const r = Math.hypot(bw, bh) / 2;
      const grad = tg.createRadialGradient(0, 0, r * 0.25, 0, 0, r * 0.95);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${c.vignette / 100})`);
      tg.fillStyle = grad;
      tg.fillRect(-bw / 2, -bh / 2, bw, bh);
    }
    tg.restore();

    if (bw > 0) this.bounds.set(c.id, { cx: cx + boundDx, cy: cy + boundDy, w: bw, h: bh, rot });

    if (lg && layer) {
      // mask
      if (c.mask && bw > 0) {
        const m = c.mask;
        lg.save();
        lg.globalCompositeOperation = m.invert ? "destination-out" : "destination-in";
        lg.filter = m.feather > 0 ? `blur(${m.feather * (cv.width / 1920)}px)` : "none";
        lg.fillStyle = "#fff";
        maskPath(lg, m.shape, cx + (m.x * bw) / 2, cy + (m.y * bh) / 2, Math.max(2, m.w * bw), Math.max(2, m.h * bh));
        lg.fill();
        lg.restore();
      }
      // track matte
      const mt = c.matte && depth === 0 ? st.project.clips.find((o) => o.id === c.matte!.id) : undefined;
      if (mt) {
        const ml = this.canvasOf("matte", cv.width, cv.height);
        const mg = ml.getContext("2d")!;
        mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalAlpha = 1; mg.filter = "none"; mg.globalCompositeOperation = "source-over";
        mg.clearRect(0, 0, ml.width, ml.height);
        this.drawClip(mg, cv, mt, t, t, baseExtra(), depth + 1);
        lg.save();
        lg.globalCompositeOperation = c.matte!.invert ? "destination-out" : "destination-in";
        lg.filter = c.matte!.mode === "luma" ? "url(#fx-luma)" : "none";
        lg.drawImage(ml, 0, 0);
        lg.restore();
      }
      g.save();
      x.clip?.(g, cv.width, cv.height);
      g.globalAlpha = alpha;
      g.globalCompositeOperation = blend;
      g.drawImage(layer, 0, 0);
      g.restore();
    }
  }

  /** per-line typography: line 1 uses the main style, line 2 can be smaller / recoloured */
  private lineInfo(g: CanvasRenderingContext2D, c: Clip, cv: HTMLCanvasElement, sc: number) {
    const k1 = sc * (cv.height / 1080);
    const base = (c.fontSize ?? 96) * k1;
    const family = c.fontFamily ?? "Inter, system-ui, sans-serif";
    (g as unknown as { letterSpacing: string }).letterSpacing = `${(c.spacing || 0) * k1}px`;
    const raw = c.text ?? "";
    return raw.split("\n").slice(0, 8).map((t0, i) => {
      const t = c.upper ? t0.toUpperCase() : t0;
      const size = base * (i >= 1 ? c.line2Scale || 1 : 1);
      const bold = i >= 1 && c.line2Bold !== undefined ? c.line2Bold : c.bold !== false;
      const font = `${c.italic ? "italic " : ""}${bold ? 700 : 400} ${size}px ${family}`;
      g.font = font;
      return { t, size, font, width: g.measureText(t).width, lh: size * 1.2, color: i >= 1 && c.line2Color ? c.line2Color : c.color ?? "#fff", solid: i >= 1 && !!c.line2Color, base };
    });
  }

  private measureText(g: CanvasRenderingContext2D, c: Clip, cv: HTMLCanvasElement, sc: number): [number, number] {
    g.save();
    const L = this.lineInfo(g, c, cv, sc);
    g.restore();
    const tw = Math.max(1, ...L.map((l) => l.width));
    const th = L.reduce((a, l) => a + l.lh, 0);
    const pad = L[0].base * 0.25;
    return [tw + pad * 2, th + pad];
  }

  private drawText(g: CanvasRenderingContext2D, c: Clip, cv: HTMLCanvasElement, sc: number, t: number, tAnim: number) {
    const L = this.lineInfo(g, c, cv, sc);
    g.textBaseline = "middle";
    const base = L[0].base;
    const tw = Math.max(1, ...L.map((l) => l.width));
    const th = L.reduce((a, l) => a + l.lh, 0);
    const pad = base * 0.25;
    if (c.bg) {
      g.fillStyle = c.bg;
      g.beginPath();
      g.roundRect(-tw / 2 - pad, -th / 2 - pad * 0.5, tw + pad * 2, th + pad, base * 0.15);
      g.fill();
    }
    if (c.glow) { g.shadowColor = c.glow; g.shadowBlur = base * 0.45; }
    else { g.shadowColor = c.bg ? "transparent" : "rgba(0,0,0,.55)"; g.shadowBlur = base * 0.12; }
    g.lineJoin = "round";

    // which text animation is active right now?
    const d = Math.max(0.1, Math.min(c.animDur, c.duration / 2));
    const pIn = Math.max(0, Math.min(1, (tAnim - c.start) / d));
    const qOut = Math.max(0, Math.min(1, (c.start + c.duration - tAnim) / d));
    let mode = "none", p = 1;
    if (TEXT_ANIM_IDS.has(c.animIn) && pIn < 1) { mode = c.animIn; p = pIn; }
    else if (TEXT_ANIM_IDS.has(c.animOut) && qOut < 1) { mode = c.animOut; p = qOut; }
    const loop = c.textLoop || "none";
    const strokeW = (c.strokeW ?? 0) * sc * (cv.height / 1080);
    const hasStroke = !!c.stroke && strokeW > 0;
    const fillFor = (l: (typeof L)[number], yc: number): string | CanvasGradient => {
      if (c.color2 && !l.solid) {
        const gr = g.createLinearGradient(0, yc - l.lh / 2, 0, yc + l.lh / 2);
        gr.addColorStop(0, l.color); gr.addColorStop(1, c.color2);
        return gr;
      }
      return l.color;
    };

    // fast path: static text, drawn line by line
    if (mode === "none" && loop === "none") {
      g.textAlign = "center";
      let yTop = -th / 2;
      for (const l of L) {
        const yc = yTop + l.lh / 2; yTop += l.lh;
        g.font = l.font;
        if (hasStroke) { g.strokeStyle = c.stroke!; g.lineWidth = strokeW; g.strokeText(l.t, 0, yc); }
        g.fillStyle = fillFor(l, yc);
        g.fillText(l.t, 0, yc);
        if (c.glow) g.fillText(l.t, 0, yc); // second pass makes the glow stronger
      }
      g.shadowBlur = 0;
      (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
      return;
    }

    const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    const baseAlpha = g.globalAlpha;
    const total = L.reduce((a, l) => a + l.t.length, 0);
    const nWords = Math.max(1, L.map((l) => l.t).join(" ").split(/\s+/).filter(Boolean).length);
    if (mode === "blur-in") { g.filter = `blur(${(1 - p) * 22 * (cv.height / 1080)}px)`; g.globalAlpha = baseAlpha * p; }
    const jitter = loop === "glitch" && hash(Math.floor(t * 12)) > 0.78 ? (hash(Math.floor(t * 12) + 3) - 0.5) * base * 0.2 : 0;

    g.textAlign = "center";
    let gi = 0, wi = -1, yTop = -th / 2;
    for (const l of L) {
      const y0 = yTop + l.lh / 2; yTop += l.lh;
      g.font = l.font;
      let inWord = false;
      for (let i = 0; i < l.t.length; i++, gi++) {
        const ch = l.t[i];
        if (ch === " " || ch === "\t") { inWord = false; continue; }
        if (!inWord) { wi++; inWord = true; }
        const x0 = g.measureText(l.t.slice(0, i)).width, cw = g.measureText(ch).width;
        const xc = -l.width / 2 + x0 + cw / 2;
        let alpha = 1, dx = 0, dy = 0, scl = 1, fill: string | CanvasGradient = fillFor(l, y0);
        const k = gi / Math.max(1, total - 1), kw = wi / Math.max(1, nWords - 1);
        const lp = (kk: number) => Math.max(0, Math.min(1, (p - kk * 0.6) / 0.4));
        switch (mode) {
          case "typewriter": alpha = gi < Math.floor(total * p) ? 1 : 0; break;
          case "letter-fade": alpha = lp(k); break;
          case "letter-up": alpha = lp(k); dy = (1 - lp(k)) * l.size * 0.7; break;
          case "letter-drop": alpha = lp(k); dy = -(1 - lp(k)) * l.size * 0.9; break;
          case "letter-pop": scl = Math.max(0, backOut(lp(k))); alpha = Math.min(1, lp(k) * 4); break;
          case "spread": alpha = lp(k); dx = xc * (1 - lp(k)) * 1.2; break;
          case "word-up": alpha = lp(kw); dy = (1 - lp(kw)) * l.size * 0.7; break;
          case "word-fade": alpha = lp(kw); break;
        }
        switch (loop) {
          case "wave": dy += Math.sin(t * 5 + gi * 0.6) * l.size * 0.12; break;
          case "float": dy += Math.sin(t * 2 + gi * 0.25) * l.size * 0.06; break;
          case "pulse": scl *= 1 + 0.07 * Math.sin(t * 6); break;
          case "shake": dx += (hash(Math.floor(t * 24) + gi) - 0.5) * l.size * 0.06; dy += (hash(Math.floor(t * 24) + gi + 99) - 0.5) * l.size * 0.06; break;
          case "rainbow": fill = `hsl(${(t * 120 + gi * 28) % 360} 90% 62%)`; break;
          case "blink": alpha *= Math.sin(t * 8) > -0.2 ? 1 : 0.15; break;
          case "glitch": dx += jitter; break;
        }
        if (alpha <= 0.001) continue;
        g.save();
        g.globalAlpha = baseAlpha * (mode === "blur-in" ? p : 1) * alpha;
        g.translate(xc + dx, y0 + dy);
        g.scale(scl, scl);
        (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
        if (hasStroke) { g.strokeStyle = c.stroke!; g.lineWidth = strokeW; g.strokeText(ch, 0, 0); }
        if (typeof fill === "string") g.fillStyle = fill;
        else { const gr = g.createLinearGradient(0, -l.lh / 2, 0, l.lh / 2); gr.addColorStop(0, l.color); gr.addColorStop(1, c.color2); g.fillStyle = gr; }
        g.fillText(ch, 0, 0);
        g.restore();
      }
    }
    g.shadowBlur = 0;
    (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
  }

  /** annotation drawing (arrows, boxes, pen, highlight, spotlight, numbered badges) */
  private drawNote(g: CanvasRenderingContext2D, n: NonNullable<Clip["note"]>, pts: [number, number][], sc: number, k: number, p: number, cv: HTMLCanvasElement, cx: number, cy: number) {
    const lw = Math.max(1, n.width * k * sc);
    g.strokeStyle = n.color; g.fillStyle = n.color; g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
    g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = lw * 0.8;
    const a = pts[0] ?? [0, 0], b = pts[pts.length - 1] ?? a;
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    const dash = (len: number) => { if (p < 1) g.setLineDash([Math.max(0.01, len * p), len + 10]); };
    switch (n.kind) {
      case "line": case "arrow": {
        const e: [number, number] = [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.stroke();
        if (n.kind === "arrow" && p > 0.05) {
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), hl = Math.max(lw * 4.5, 18 * k * sc);
          g.beginPath();
          g.moveTo(e[0], e[1]);
          g.lineTo(e[0] - hl * Math.cos(ang - 0.45), e[1] - hl * Math.sin(ang - 0.45));
          g.lineTo(e[0] - hl * Math.cos(ang + 0.45), e[1] - hl * Math.sin(ang + 0.45));
          g.closePath(); g.fill();
        }
        break;
      }
      case "rect": {
        const r = Math.min(lw * 1.2, Math.min(w, h) / 2);
        if (n.fill > 0) { g.save(); g.globalAlpha *= n.fill / 100; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.restore(); }
        dash(2 * (w + h)); g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke();
        break;
      }
      case "ellipse": {
        const rx = w / 2, ry = h / 2, ecx = x + rx, ecy = y + ry;
        if (n.fill > 0) { g.save(); g.globalAlpha *= n.fill / 100; g.beginPath(); g.ellipse(ecx, ecy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
        dash(Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))));
        g.beginPath(); g.ellipse(ecx, ecy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); g.stroke();
        break;
      }
      case "pen": {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        dash(len);
        g.beginPath();
        pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
        g.stroke();
        break;
      }
      case "highlight": {
        g.save(); g.shadowBlur = 0; g.globalAlpha *= 0.4; g.fillRect(x, y, w * p, h); g.restore();
        break;
      }
      case "spotlight": {
        g.save(); g.shadowBlur = 0;
        g.globalAlpha *= 0.7 * p;
        g.fillStyle = "#000";
        g.beginPath();
        g.rect(-cx, -cy, cv.width, cv.height);
        g.ellipse(x + w / 2, y + h / 2, Math.max(2, w / 2), Math.max(2, h / 2), 0, 0, Math.PI * 2);
        g.fill("evenodd");
        g.restore();
        break;
      }
      case "badge": {
        const r = Math.max(10, lw * 2.6) * Math.max(0, backOut(Math.max(0, Math.min(1, p))));
        g.beginPath(); g.arc(a[0], a[1], r, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = n.color === "#ffffff" || n.color === "#ffcc00" ? "#000" : "#fff";
        g.font = `700 ${r * 1.1}px ui-sans-serif, system-ui, sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(n.label || "1", a[0], a[1] + r * 0.05);
        break;
      }
    }
    g.setLineDash([]);
    g.shadowBlur = 0;
  }

  /** topmost clip under a canvas-space point */
  hitTest(px: number, py: number): string | null {
    const { project } = useEditor.getState();
    for (let i = 0; i < project.tracks.length; i++) {
      const tr = project.tracks[i];
      if (tr.kind !== "video" || tr.hidden || tr.locked) continue;
      for (const c of [...project.clips].reverse()) {
        if (c.trackId !== tr.id) continue;
        const b = this.bounds.get(c.id);
        if (!b) continue;
        const dx = px - b.cx, dy = py - b.cy;
        const cs = Math.cos(-b.rot), sn = Math.sin(-b.rot);
        const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
        if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c.id;
      }
    }
    return null;
  }

  /* ---------- transport ---------- */
  play() {
    const st = useEditor.getState();
    const dur = projectDuration(st.project);
    if (dur <= 0) return;
    this.ensureAudio();
    this.rate = 1;
    if (st.time >= dur - 0.01) useEditor.setState({ time: 0 });
    this.last = performance.now();
    useEditor.setState({ playing: true });
  }
  pause() { this.rate = 1; useEditor.setState({ playing: false }); }
  toggle() { useEditor.getState().playing ? this.pause() : this.play(); }
  seek(t: number) {
    const dur = projectDuration(useEditor.getState().project);
    useEditor.setState({ time: Math.max(0, Math.min(dur, t)) });
  }
  /** J / K / L shuttle: dir = -1 (J), 0 (K), 1 (L) */
  shuttle(dir: -1 | 0 | 1) {
    const st = useEditor.getState();
    if (dir === 0) { this.pause(); return; }
    this.ensureAudio();
    if (!st.playing) { this.rate = dir; this.last = performance.now(); useEditor.setState({ playing: true }); return; }
    if (Math.sign(this.rate) === dir) this.rate = Math.max(-8, Math.min(8, this.rate * 2));
    else this.rate = dir;
  }

  /** audio context for the exporter / recorder */
  get audioContext() { this.ensureAudio(); return this.actx!; }

  /* ---------- real-time export (captures the canvas + mixed audio) ---------- */
  async exportVideo(
    onProgress: (p: number) => void,
    signal?: { cancelled: boolean },
    opts: { bitrate?: number; webmOnly?: boolean; scale?: number; from?: number; to?: number } = {},
    openSink?: (ext: string) => Promise<FileSystemWritableFileStream | null>,
  ): Promise<{ blob?: Blob; ext: string } | null> {
    const cv = this.canvas;
    const st = useEditor.getState();
    const total = projectDuration(st.project);
    const from = opts.from ?? 0, to = Math.min(total, opts.to ?? total);
    const dur = to - from;
    if (!cv || dur <= 0) return null;

    this.ensureAudio();
    this.pause();
    this.exporting = true;
    this.exportScale = opts.scale ?? 1;
    useEditor.setState({ time: from, selectedId: null, selectedIds: [] });
    await new Promise((r) => setTimeout(r, 500)); // let first frames seek

    const stream = cv.captureStream(st.project.fps);
    this.exportDest!.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));

    const candidates = [
      ["video/mp4;codecs=avc1.640028,mp4a.40.2", "mp4"],
      ["video/mp4", "mp4"],
      ["video/webm;codecs=vp9,opus", "webm"],
      ["video/webm;codecs=vp8,opus", "webm"],
      ["video/webm", "webm"],
    ];
    const pick = candidates.filter(([, e]) => !opts.webmOnly || e === "webm").find(([m]) => MediaRecorder.isTypeSupported(m)) ?? candidates[candidates.length - 1];
    const rec = new MediaRecorder(stream, { mimeType: pick[0], videoBitsPerSecond: opts.bitrate ?? 10_000_000, audioBitsPerSecond: 192_000 });
    const chunks: Blob[] = [];
    const sink = (await openSink?.(pick[1])) ?? null;
    let chain: Promise<void> = Promise.resolve();
    // with a sink every chunk goes straight to disk; otherwise (no folder) chunks are kept in memory
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      if (sink) chain = chain.then(() => sink.write(e.data));
      else chunks.push(e.data);
    };
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

    const prog = setInterval(() => onProgress(Math.min(1, (useEditor.getState().time - from) / dur)), 200);
    const ended = new Promise<void>((r) => (this.onEnd = r));
    rec.start(1000);
    this.play();
    const watch = setInterval(() => {
      if (signal?.cancelled || useEditor.getState().time >= to) { this.pause(); const cb = this.onEnd; this.onEnd = null; cb?.(); }
    }, 100);
    await ended;
    clearInterval(watch);
    clearInterval(prog);
    await new Promise((r) => setTimeout(r, 250));
    rec.stop();
    await stopped;
    await chain;
    if (sink) await sink.close();
    this.exporting = false;
    this.exportScale = 1;
    onProgress(1);
    if (signal?.cancelled) return null;
    return { blob: sink ? undefined : new Blob(chunks, { type: pick[0].split(";")[0] }), ext: pick[1] };
  }

  endExport() { this.exporting = false; this.exportScale = 1; }
}

export const engine = new Engine();
