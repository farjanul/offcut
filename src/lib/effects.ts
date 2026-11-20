import { Clip, FilterSet, DEFAULT_FILTER } from "./types";

export const prevAdjacent = (clips: Clip[], c: Clip) =>
  clips.find((o) => o.id !== c.id && o.trackId === c.trackId && Math.abs(o.start + o.duration - c.start) < 0.05);

export const FILTER_PRESETS: { name: string; f: Partial<FilterSet>; vignette?: number }[] = [
  { name: "Original", f: {} },
  { name: "Vivid", f: { saturate: 150, contrast: 110 } },
  { name: "Warm", f: { sepia: 25, saturate: 120, brightness: 105 } },
  { name: "Cool", f: { hue: 190, saturate: 90, brightness: 105, sepia: 10 } },
  { name: "B&W", f: { grayscale: 100, contrast: 115 } },
  { name: "Noir", f: { grayscale: 100, contrast: 150, brightness: 85 }, vignette: 55 },
  { name: "Vintage", f: { sepia: 60, contrast: 90, saturate: 85, brightness: 105 }, vignette: 35 },
  { name: "Fade", f: { contrast: 80, brightness: 115, saturate: 80 } },
  { name: "Dramatic", f: { contrast: 140, saturate: 120, brightness: 90 }, vignette: 40 },
  { name: "Dreamy", f: { blur: 2, brightness: 115, saturate: 125, contrast: 90 } },
  { name: "Sunset", f: { sepia: 40, hue: -20, saturate: 160, contrast: 105 } },
  { name: "Matrix", f: { hue: 90, saturate: 160, contrast: 120, brightness: 90 } },
];

export const filterCss = (f: Clip["filter"]) => {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  return parts.length ? parts.join(" ") : "none";
};
export const presetFilter = (p: Partial<FilterSet>): FilterSet => ({ ...DEFAULT_FILTER, ...p });

export const ANIMS = [
  { id: "none", name: "None" }, { id: "fade", name: "Fade" }, { id: "slide-left", name: "Slide from left" },
  { id: "slide-right", name: "Slide from right" }, { id: "slide-up", name: "Slide from top" }, { id: "slide-down", name: "Slide from bottom" },
  { id: "zoom-in", name: "Zoom in" }, { id: "zoom-out", name: "Zoom out" }, { id: "spin", name: "Spin" }, { id: "pop", name: "Pop" },
];

export const BLENDS = [
  ["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"],
  ["darken", "Darken"], ["lighten", "Lighten"], ["color-dodge", "Color dodge"], ["difference", "Difference"], ["soft-light", "Soft light"],
] as const;

export interface AnimState { alpha: number; dx: number; dy: number; scale: number; rot: number }
const ease = (x: number) => x * x * (3 - 2 * x);
const back = (x: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** q: 0 = hidden/start state, 1 = fully shown. dx/dy are fractions of canvas width/height. */
export function animState(type: string, qRaw: number): AnimState {
  const q = ease(Math.max(0, Math.min(1, qRaw)));
  const r: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 };
  switch (type) {
    case "fade": r.alpha = q; break;
    case "slide-left": r.dx = -(1 - q); break;
    case "slide-right": r.dx = 1 - q; break;
    case "slide-up": r.dy = -(1 - q); break;
    case "slide-down": r.dy = 1 - q; break;
    case "zoom-in": r.scale = 0.3 + 0.7 * q; r.alpha = q; break;
    case "zoom-out": r.scale = 1 + (1 - q) * 0.8; r.alpha = q; break;
    case "spin": r.rot = (1 - q) * Math.PI; r.scale = q; r.alpha = q; break;
    case "pop": r.scale = Math.max(0, back(Math.max(0, Math.min(1, qRaw)))); r.alpha = Math.min(1, qRaw * 3); break;
  }
  return r;
}

export function combinedAnim(c: Clip, t: number): AnimState {
  const out: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 };
  const d = Math.max(0.05, Math.min(c.animDur, c.duration / 2));
  const merge = (a: AnimState) => {
    out.alpha *= a.alpha; out.dx += a.dx; out.dy += a.dy; out.scale *= a.scale; out.rot += a.rot;
  };
  const tin = t - c.start, tout = c.start + c.duration - t;
  if (c.animIn !== "none" && tin < d) merge(animState(c.animIn, tin / d));
  if (c.animOut !== "none" && tout < d) merge(animState(c.animOut, tout / d));
  return out;
}

export function fadeFactor(c: Clip, t: number) {
  let f = 1;
  if (c.fadeIn > 0) f = Math.min(f, (t - c.start) / c.fadeIn);
  if (c.fadeOut > 0) f = Math.min(f, (c.start + c.duration - t) / c.fadeOut);
  return Math.max(0, Math.min(1, f));
}

export const FONTS = [
  "Inter, system-ui, sans-serif", "Georgia, serif", "'Courier New', monospace", "Impact, 'Arial Black', sans-serif", "'Comic Sans MS', 'Comic Neue', cursive", "'Brush Script MT', 'Segoe Script', cursive",
  "'Trebuchet MS', Verdana, sans-serif", "Palatino, 'Palatino Linotype', 'Book Antiqua', serif", "'Arial Black', Gadget, sans-serif", "Didot, 'Bodoni MT', 'Playfair Display', serif",
  "'Gill Sans', Calibri, 'Helvetica Neue', sans-serif", "Copperplate, 'Copperplate Gothic Light', fantasy", "'Lucida Console', Monaco, monospace", "'Snell Roundhand', 'Lucida Handwriting', cursive",
];
export const FONT_LABELS = ["Sans", "Serif", "Mono", "Impact", "Comic", "Script", "Trebuchet", "Palatino", "Arial Black", "Didot", "Gill Sans", "Copperplate", "Console", "Calligraphy"];

export type TextCat = "Titles" | "Lower thirds" | "Subtitles" | "Fancy" | "Animated";
export const TEXT_CATS: TextCat[] = ["Titles", "Lower thirds", "Subtitles", "Fancy", "Animated"];
const F = (i: number) => FONTS[i];
// every preset has up to two lines: line 1 = main text, line 2 = smaller sub-line (styled with line2*)
export const TEXT_PRESETS: { name: string; cat: TextCat; p: Partial<Clip> }[] = [
  // ----- Titles
  { name: "Clean title", cat: "Titles", p: { text: "Your Title\nA short subtitle goes here", fontSize: 130, line2Scale: 0.38, bold: true, color: "#ffffff", line2Color: "#d0d5dd", line2Bold: false, y: -0.05 } },
  { name: "Cinematic", cat: "Titles", p: { text: "THE LAST DAWN\na film by you", fontSize: 110, line2Scale: 0.3, fontFamily: F(10), bold: false, color: "#f5f1e8", line2Color: "#b8b2a3", spacing: 16, upper: true, y: 0 } },
  { name: "Bold impact", cat: "Titles", p: { text: "BIG NEWS\nthis changes everything", fontSize: 170, line2Scale: 0.3, fontFamily: F(3), color: "#ffffff", stroke: "#000000", strokeW: 10, line2Color: "#ffd60a", upper: true } },
  { name: "Elegant serif", cat: "Titles", p: { text: "Elegance\nAND GRACE", fontSize: 150, line2Scale: 0.28, fontFamily: F(9), bold: false, italic: true, color: "#f6e3b4", color2: "#c9a24b", line2Color: "#e8d9b5", line2Bold: false, spacing: 2 } },
  { name: "Gold luxury", cat: "Titles", p: { text: "LUXURY\nCOLLECTION 2026", fontSize: 140, line2Scale: 0.28, fontFamily: F(9), color: "#fff1b8", color2: "#c28a1d", glow: "#f5c04299", line2Color: "#f5d78a", line2Bold: false, spacing: 10, upper: true } },
  { name: "Minimal box", cat: "Titles", p: { text: "Minimal\nclean & simple", fontSize: 110, line2Scale: 0.4, color: "#111111", bg: "#ffffff", line2Color: "#555555", line2Bold: false } },
  { name: "Quote", cat: "Titles", p: { text: "“Stay hungry,\nstay foolish.”", fontSize: 110, line2Scale: 0.9, fontFamily: F(7), italic: true, bold: false, color: "#ffffff", line2Color: "#ffffff", y: 0 } },
  { name: "Big number", cat: "Titles", p: { text: "01\nCHAPTER ONE", fontSize: 260, line2Scale: 0.22, fontFamily: F(8), color: "#ffffff", color2: "#7c7c7c", line2Color: "#22d3c5", spacing: 8 } },
  { name: "Date stamp", cat: "Titles", p: { text: "2026-11-20\nDhaka, Bangladesh", fontSize: 76, line2Scale: 0.7, fontFamily: F(12), bold: false, color: "#ff9f0a", line2Color: "#ffcf7d", glow: "#ff9f0a66", x: -0.35, y: 0.8 } },
  // ----- Lower thirds
  { name: "Name & role", cat: "Lower thirds", p: { text: "John Smith\nSenior Producer", fontSize: 70, line2Scale: 0.62, color: "#ffffff", bg: "#0a84ffe6", line2Color: "#dbeafe", line2Bold: false, x: -0.45, y: 0.72 } },
  { name: "Dark bar", cat: "Lower thirds", p: { text: "Sarah Khan\nLead Designer", fontSize: 66, line2Scale: 0.6, color: "#ffffff", bg: "#000000b3", line2Color: "#22d3c5", line2Bold: false, x: -0.45, y: 0.74 } },
  { name: "Yellow tag", cat: "Lower thirds", p: { text: "BREAKING\nBig story unfolding live", fontSize: 64, line2Scale: 0.6, color: "#111111", bg: "#ffd60a", line2Color: "#111111", line2Bold: false, upper: true, spacing: 3, x: -0.4, y: 0.74 } },
  { name: "Breaking news", cat: "Lower thirds", p: { text: "BREAKING NEWS\nLive coverage from the scene", fontSize: 62, line2Scale: 0.62, color: "#ffffff", bg: "#d70015f0", line2Color: "#ffffff", line2Bold: false, spacing: 2, x: 0, y: 0.78 } },
  { name: "Soft glass", cat: "Lower thirds", p: { text: "Place Name\nCity · Country", fontSize: 62, line2Scale: 0.6, color: "#ffffff", bg: "#ffffff33", line2Color: "#f1f5f9", line2Bold: false, x: -0.42, y: 0.76 } },
  { name: "Location", cat: "Lower thirds", p: { text: "📍 Cox's Bazar\nWorld's longest beach", fontSize: 60, line2Scale: 0.6, color: "#ffffff", bg: "#00000099", line2Color: "#a7f3d0", line2Bold: false, x: -0.4, y: 0.78 } },
  { name: "Social handle", cat: "Lower thirds", p: { text: "@yourname\nFollow for more", fontSize: 58, line2Scale: 0.62, color: "#ffffff", color2: "#ff2d92", bg: "#000000aa", line2Color: "#e5e7eb", line2Bold: false, x: 0.35, y: 0.82 } },
  // ----- Subtitles
  { name: "Classic subtitle", cat: "Subtitles", p: { text: "First line of the subtitle\nSecond line goes here", fontSize: 56, line2Scale: 1, bold: false, color: "#ffffff", bg: "#000000b3", y: 0.78 } },
  { name: "Yellow subtitle", cat: "Subtitles", p: { text: "Yellow outlined caption\nsecond line here", fontSize: 58, line2Scale: 1, color: "#ffe14d", stroke: "#000000", strokeW: 7, y: 0.78 } },
  { name: "White outline", cat: "Subtitles", p: { text: "Clean white caption\nwith black outline", fontSize: 58, line2Scale: 1, color: "#ffffff", stroke: "#000000", strokeW: 8, y: 0.78 } },
  { name: "Karaoke", cat: "Subtitles", p: { text: "Sing along with the words\nsecond line follows", fontSize: 60, line2Scale: 1, color: "#22d3c5", stroke: "#003b36", strokeW: 6, glow: "#22d3c5aa", y: 0.78 } },
  { name: "Boxed caption", cat: "Subtitles", p: { text: "Short caption goes here\nand a second line", fontSize: 54, line2Scale: 0.9, color: "#111111", bg: "#ffffffee", y: 0.78 } },
  // ----- Fancy
  { name: "Neon sign", cat: "Fancy", p: { text: "OPEN 24/7\nwelcome in", fontSize: 140, line2Scale: 0.4, fontFamily: F(10), color: "#ffe0ff", glow: "#ff2bd6", line2Color: "#9ff3ff", spacing: 6, upper: true } },
  { name: "Neon cyan", cat: "Fancy", p: { text: "NIGHT CITY\nafter dark", fontSize: 140, line2Scale: 0.4, fontFamily: F(3), color: "#d9ffff", glow: "#00e5ff", line2Color: "#ffffff", spacing: 4, upper: true } },
  { name: "Retro 80s", cat: "Fancy", p: { text: "RETRO WAVE\nsynth & chill", fontSize: 150, line2Scale: 0.36, fontFamily: F(8), color: "#ffe66d", color2: "#ff2e93", stroke: "#3a0ca3", strokeW: 8, line2Color: "#7df9ff", spacing: 4, italic: true } },
  { name: "Sunset", cat: "Fancy", p: { text: "Golden Hour\nchasing the light", fontSize: 140, line2Scale: 0.38, color: "#ffd166", color2: "#ef476f", line2Color: "#ffe4d6", line2Bold: false } },
  { name: "Ocean", cat: "Fancy", p: { text: "Deep Blue\ndive into the sea", fontSize: 140, line2Scale: 0.38, color: "#a8edea", color2: "#1d4ed8", line2Color: "#bae6fd", line2Bold: false } },
  { name: "Fire", cat: "Fancy", p: { text: "ON FIRE\nhottest of the year", fontSize: 160, line2Scale: 0.32, fontFamily: F(3), color: "#fff3b0", color2: "#ff3d00", glow: "#ff6a0099", line2Color: "#ffb703", upper: true } },
  { name: "Ice", cat: "Fancy", p: { text: "FROZEN\nstay cool", fontSize: 150, line2Scale: 0.36, fontFamily: F(8), color: "#ffffff", color2: "#7dd3fc", glow: "#7dd3fcaa", line2Color: "#e0f2fe", spacing: 6, upper: true } },
  { name: "Comic pop", cat: "Fancy", p: { text: "WOW!\nsuper duper fun", fontSize: 170, line2Scale: 0.34, fontFamily: F(4), color: "#ffe14d", stroke: "#e11d48", strokeW: 12, line2Color: "#ffffff", upper: true } },
  { name: "Handwritten", cat: "Fancy", p: { text: "With love\nfrom me to you", fontSize: 150, line2Scale: 0.42, fontFamily: F(5), italic: true, color: "#ffffff", line2Color: "#fde68a", line2Bold: false } },
  { name: "Wedding", cat: "Fancy", p: { text: "Anna & James\nSAVE THE DATE", fontSize: 140, line2Scale: 0.26, fontFamily: F(13), italic: true, bold: false, color: "#fff7ed", color2: "#e8b4b8", line2Color: "#f5d0d3", spacing: 2 } },
  { name: "Tech HUD", cat: "Fancy", p: { text: "SYSTEM ONLINE\n> all checks passed", fontSize: 90, line2Scale: 0.55, fontFamily: F(12), bold: false, color: "#7cff9b", glow: "#00ff6a99", line2Color: "#b6ffd0", bg: "#00140a99", upper: true, spacing: 3 } },
  { name: "Horror", cat: "Fancy", p: { text: "DON'T LOOK\nbehind you", fontSize: 150, line2Scale: 0.34, fontFamily: F(3), color: "#ff1e1e", glow: "#8b0000", stroke: "#240000", strokeW: 6, line2Color: "#d4d4d8", upper: true } },
  { name: "Typewriter", cat: "Fancy", p: { text: "Once upon a time\nin a small village…", fontSize: 80, line2Scale: 0.85, fontFamily: F(2), bold: false, color: "#f8f1e5", bg: "#000000b3", animIn: "typewriter", animDur: 1.5 } },
  // ----- Animated
  { name: "Pop title", cat: "Animated", p: { text: "POP!\nletters bounce in", fontSize: 170, line2Scale: 0.3, color: "#ffffff", stroke: "#0a84ff", strokeW: 8, line2Color: "#ffe14d", animIn: "letter-pop", animDur: 1.2 } },
  { name: "Rise title", cat: "Animated", p: { text: "Rising Up\nletter by letter", fontSize: 140, line2Scale: 0.36, color: "#ffffff", line2Color: "#22d3c5", animIn: "letter-up", animDur: 1.2 } },
  { name: "Drop title", cat: "Animated", p: { text: "Drop In\nfrom above", fontSize: 140, line2Scale: 0.36, color: "#fde68a", line2Color: "#ffffff", animIn: "letter-drop", animDur: 1.2 } },
  { name: "Wave", cat: "Animated", p: { text: "Make Waves\nup and down", fontSize: 140, line2Scale: 0.36, color: "#7dd3fc", line2Color: "#ffffff", textLoop: "wave" } },
  { name: "Rainbow", cat: "Animated", p: { text: "RAINBOW\ncolours everywhere", fontSize: 150, line2Scale: 0.34, color: "#ffffff", stroke: "#000000", strokeW: 6, textLoop: "rainbow", upper: true } },
  { name: "Blur reveal", cat: "Animated", p: { text: "Reveal\nfrom the blur", fontSize: 140, line2Scale: 0.36, color: "#ffffff", line2Color: "#d4d4d8", animIn: "blur-in", animDur: 1.2 } },
  { name: "Word by word", cat: "Animated", p: { text: "One word at a time\nslowly appearing", fontSize: 110, line2Scale: 0.5, color: "#ffffff", line2Color: "#fca5a5", animIn: "word-up", animDur: 1.5 } },
  { name: "Glitch", cat: "Animated", p: { text: "GLITCH\nsignal lost", fontSize: 150, line2Scale: 0.36, fontFamily: F(12), color: "#ffffff", glow: "#ff00c8", stroke: "#00e5ff", strokeW: 3, textLoop: "glitch", upper: true } },
  { name: "Pulse", cat: "Animated", p: { text: "SUBSCRIBE\nand hit the bell", fontSize: 140, line2Scale: 0.34, color: "#ffffff", bg: "#ff0000", line2Color: "#ffffff", textLoop: "pulse", upper: true } },
  { name: "Blink alert", cat: "Animated", p: { text: "⚠ WARNING\nplease read carefully", fontSize: 120, line2Scale: 0.4, color: "#ffd60a", stroke: "#000", strokeW: 6, line2Color: "#ffffff", textLoop: "blink", upper: true } },
];

export const STICKERS = ["😀","😂","😍","🥳","😎","🔥","❤️","💯","👍","👏","🎉","✨","⭐","🌈","🎵","🎬","📷","💥","⚡","🚀","🌟","💎","🏆","🎁","🌸","🍕","🐶","🐱","👑","💡","➡️","✅"];

/* ---------- effects (SVG filters + canvas pixelate) ---------- */
export const EFFECTS = [
  { id: "none", name: "None" }, { id: "rgb", name: "RGB split" }, { id: "glitch", name: "Glitch" }, { id: "grain", name: "Film grain" },
  { id: "sharpen", name: "Sharpen" }, { id: "emboss", name: "Emboss" }, { id: "edge", name: "Edge detect" },
  { id: "poster", name: "Posterize" }, { id: "duotone", name: "Duotone" }, { id: "invert", name: "Invert" },
  { id: "glow", name: "Glow" }, { id: "flare", name: "Lens flare" },
];

/* ---------- keyframes ---------- */
export const KEY_PROPS = ["x", "y", "scale", "rotation", "opacity", "volume"] as const;
export type KeyProp = (typeof KEY_PROPS)[number];

export function valueAt(c: Clip, prop: KeyProp, t: number): number {
  const ks = c.keys?.[prop];
  if (!ks || !ks.length) return c[prop] as number;
  const tl = t - c.start;
  if (tl <= ks[0].t) return ks[0].v;
  const last = ks[ks.length - 1];
  if (tl >= last.t) return last.v;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (tl >= a.t && tl <= b.t) {
      if (a.hold) return a.v;
      const p = (tl - a.t) / Math.max(1e-6, b.t - a.t);
      return a.v + (b.v - a.v) * ease(p);
    }
  }
  return last.v;
}

export function upsertKey(c: Clip, prop: KeyProp, tl: number, v: number): Clip["keys"] {
  const ks = [...(c.keys?.[prop] ?? [])];
  const i = ks.findIndex((k) => Math.abs(k.t - tl) < 0.02);
  if (i >= 0) ks[i] = { ...ks[i], v };
  else ks.push({ t: tl, v });
  ks.sort((a, b) => a.t - b.t);
  return { ...c.keys, [prop]: ks };
}
export function removeKey(c: Clip, prop: KeyProp, tl: number): Clip["keys"] {
  const ks = (c.keys?.[prop] ?? []).filter((k) => Math.abs(k.t - tl) >= 0.02);
  const keys = { ...c.keys };
  if (ks.length) keys[prop] = ks; else delete keys[prop];
  return keys;
}
export const hasKeyAt = (c: Clip, prop: KeyProp, tl: number) => !!c.keys?.[prop]?.some((k) => Math.abs(k.t - tl) < 0.02);

/* ---------- transitions between adjacent clips ---------- */
export interface Extra extends AnimState { blur: number; visible?: boolean; clip?: (g: CanvasRenderingContext2D, W: number, H: number) => void }
export interface TransState { a: Extra; b: Extra; overlay?: { color: string; alpha: number } }
export const baseExtra = (): Extra => ({ alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0 });

export const TRANSITIONS = [
  { id: "none", name: "None" }, { id: "dissolve", name: "Cross dissolve" }, { id: "dip-black", name: "Dip to black" }, { id: "dip-white", name: "Dip to white" },
  { id: "blur", name: "Blur dissolve" }, { id: "wipe-right", name: "Wipe →" }, { id: "wipe-left", name: "Wipe ←" }, { id: "wipe-down", name: "Wipe ↓" },
  { id: "wipe-up", name: "Wipe ↑" }, { id: "push-left", name: "Push ←" }, { id: "push-right", name: "Push →" }, { id: "slide-left", name: "Slide in ←" },
  { id: "slide-right", name: "Slide in →" }, { id: "zoom", name: "Zoom" }, { id: "spin", name: "Spin" }, { id: "iris", name: "Iris circle" }, { id: "clock", name: "Clock wipe" },
];

export function transState(type: string, pRaw: number): TransState {
  const p = ease(Math.max(0, Math.min(1, pRaw)));
  const a = baseExtra(), b = baseExtra();
  const rectClip = (fn: (W: number, H: number) => [number, number, number, number]): Extra["clip"] => (g, W, H) => {
    const [x, y, w, h] = fn(W, H);
    g.beginPath(); g.rect(x, y, w, h); g.clip();
  };
  switch (type) {
    case "dissolve": b.alpha = p; break;
    case "blur": b.alpha = p; a.blur = b.blur = Math.sin(p * Math.PI) * 24; break;
    case "dip-black": case "dip-white": {
      a.visible = p < 0.5; b.visible = p >= 0.5;
      return { a, b, overlay: { color: type === "dip-black" ? "#000" : "#fff", alpha: 1 - Math.abs(1 - 2 * p) } };
    }
    case "wipe-right": b.clip = rectClip((W, H) => [0, 0, p * W, H]); break;
    case "wipe-left": b.clip = rectClip((W, H) => [(1 - p) * W, 0, p * W, H]); break;
    case "wipe-down": b.clip = rectClip((W, H) => [0, 0, W, p * H]); break;
    case "wipe-up": b.clip = rectClip((W, H) => [0, (1 - p) * H, W, p * H]); break;
    case "push-left": a.dx = -p; b.dx = 1 - p; break;
    case "push-right": a.dx = p; b.dx = -(1 - p); break;
    case "slide-left": b.dx = 1 - p; break;
    case "slide-right": b.dx = -(1 - p); break;
    case "zoom": a.scale = 1 + p * 0.35; b.alpha = p; b.scale = 1.35 - p * 0.35; break;
    case "spin": b.alpha = p; b.rot = -(1 - p) * 0.9; b.scale = 0.4 + 0.6 * p; break;
    case "iris": b.clip = (g, W, H) => { g.beginPath(); g.arc(W / 2, H / 2, p * Math.hypot(W, H) / 2, 0, Math.PI * 2); g.clip(); }; break;
    case "clock": b.clip = (g, W, H) => { g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.closePath(); g.clip(); }; break;
    default: b.alpha = p;
  }
  return { a, b };
}

export const SHAPES = [
  { id: "rect", name: "Rectangle", fill: "#22d3c5", sw: 0.4, sh: 0.25 },
  { id: "ellipse", name: "Ellipse", fill: "#f59e0b", sw: 0.3, sh: 0.3 },
  { id: "bar", name: "Lower third", fill: "#000000bb", sw: 0.8, sh: 0.12, y: 0.75 },
  { id: "frame", name: "Letterbox bar", fill: "#000000", sw: 1, sh: 0.12, y: 0.94 },
];

/* ---------- time mapping (speed, ramp, reverse, freeze) ---------- */
export const speedAt = (c: Clip, tl: number) =>
  c.rampTo ? c.speed + (c.rampTo - c.speed) * Math.max(0, Math.min(1, tl / Math.max(1e-6, c.duration))) : c.speed;
/** source seconds consumed after `tl` timeline seconds (forward direction) */
export const fwd = (c: Clip, tl: number) =>
  c.rampTo ? c.speed * tl + ((c.rampTo - c.speed) * tl * tl) / (2 * Math.max(1e-6, c.duration)) : c.speed * tl;
export const srcSpan = (c: Clip) => fwd(c, c.duration);
export const srcAt = (c: Clip, tl: number) => {
  if (c.freeze) return c.offset;
  const t = Math.max(0, Math.min(c.duration, tl));
  return c.reverse ? c.offset + srcSpan(c) - fwd(c, t) : c.offset + fwd(c, t);
};

/** split a clip at absolute timeline time `time` (assumes it lies strictly inside the clip) */
export function splitClipAt(c: Clip, time: number, newId: string): [Clip, Clip] {
  const d = time - c.start;
  const sd = c.rampTo ? c.speed + (c.rampTo - c.speed) * (d / c.duration) : c.speed;
  const a: Clip = { ...c, duration: d, fadeOut: 0, animOut: "none" };
  const b: Clip = { ...c, id: newId, start: time, duration: c.duration - d, fadeIn: 0, animIn: "none", transIn: "none" };
  if (c.rampTo) { a.rampTo = sd; b.speed = sd; }
  if (!c.freeze) {
    if (c.reverse) a.offset = c.offset + srcSpan(c) - fwd(c, d);
    else b.offset = c.offset + fwd(c, d);
  }
  return [a, b];
}

/* ---------- curves → SVG table values (monotone cubic) ---------- */
export function curveTable(pts: [number, number][], n = 33): number[] {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return Array.from({ length: n }, (_, i) => i / (n - 1));
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const m = xs.length;
  const dx: number[] = [], dy: number[] = [], sl: number[] = [];
  for (let i = 0; i < m - 1; i++) { dx.push(xs[i + 1] - xs[i] || 1e-6); dy.push(ys[i + 1] - ys[i]); sl.push(dy[i] / dx[i]); }
  const t: number[] = [sl[0]];
  for (let i = 1; i < m - 1; i++) t.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
  t.push(sl[m - 2]);
  for (let i = 0; i < m - 1; i++) {
    if (sl[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / sl[i], b = t[i + 1] / sl[i], h = Math.hypot(a, b);
    if (h > 3) { t[i] = (3 * a * sl[i]) / h; t[i + 1] = (3 * b * sl[i]) / h; }
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    let i = 0;
    while (i < m - 2 && x > xs[i + 1]) i++;
    const h = dx[i], u = Math.max(0, Math.min(1, (x - xs[i]) / h));
    const h00 = (1 + 2 * u) * (1 - u) ** 2, h10 = u * (1 - u) ** 2, h01 = u * u * (3 - 2 * u), h11 = u * u * (u - 1);
    out.push(Math.max(0, Math.min(1, x <= xs[0] ? ys[0] : x >= xs[m - 1] ? ys[m - 1] : h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1])));
  }
  return out;
}

export const MASK_SHAPES = ["rect", "ellipse", "triangle", "star", "hexagon", "heart"] as const;
export function maskPath(g: CanvasRenderingContext2D, shape: string, cx: number, cy: number, w: number, h: number) {
  g.beginPath();
  const poly = (pts: [number, number][]) => { pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * w / 2, cy + y * h / 2) : g.moveTo(cx + x * w / 2, cy + y * h / 2))); g.closePath(); };
  switch (shape) {
    case "ellipse": g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case "triangle": poly([[0, -1], [1, 1], [-1, 1]]); break;
    case "hexagon": poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)] as [number, number])); break;
    case "star": poly(Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.45 : 1; const a = (i * Math.PI) / 5 - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]; })); break;
    case "heart": {
      g.moveTo(cx, cy + h * 0.45);
      g.bezierCurveTo(cx - w * 0.6, cy + h * 0.05, cx - w * 0.45, cy - h * 0.5, cx, cy - h * 0.2);
      g.bezierCurveTo(cx + w * 0.45, cy - h * 0.5, cx + w * 0.6, cy + h * 0.05, cx, cy + h * 0.45);
      g.closePath();
      break;
    }
    default: g.rect(cx - w / 2, cy - h / 2, w, h);
  }
}

/* ---------- colour helpers: wheels & curves → SVG attribute values ---------- */
const hueRgb = (h: number): [number, number, number] => {
  const f = (n: number) => { const k = (n + h / 30) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const r = [f(0), f(8), f(4)];
  const m = (r[0] + r[1] + r[2]) / 3;
  return [r[0] - m, r[1] - m, r[2] - m];
};
export function wheelParams(w: { shadows: [number, number]; mids: [number, number]; highs: [number, number] }) {
  const sh = hueRgb(w.shadows[0]), mi = hueRgb(w.mids[0]), hi = hueRgb(w.highs[0]);
  const a = (v: [number, number]) => v[1] / 100;
  return [0, 1, 2].map((i) => ({
    offset: sh[i] * a(w.shadows) * 0.3,
    exponent: Math.max(0.4, Math.min(2, 1 - mi[i] * a(w.mids) * 1.2)),
    amplitude: Math.max(0.2, 1 + hi[i] * a(w.highs) * 1.2),
  }));
}
const lerpTable = (t: number[], x: number) => {
  const p = Math.max(0, Math.min(1, x)) * (t.length - 1), i = Math.floor(p), f = p - i;
  return t[i] + ((t[Math.min(t.length - 1, i + 1)] - t[i]) * f);
};
export function composeCurves(c: { m: [number, number][]; r: [number, number][]; g: [number, number][]; b: [number, number][] }) {
  const m = curveTable(c.m);
  return [c.r, c.g, c.b].map((pts) => { const ch = curveTable(pts); return m.map((v) => lerpTable(ch, v).toFixed(4)).join(" "); });
}

/* ---------- text animations ---------- */
export const TEXT_ANIMS = [
  { id: "typewriter", name: "Typewriter" }, { id: "letter-fade", name: "Letter fade" }, { id: "letter-up", name: "Letter rise" },
  { id: "letter-pop", name: "Letter pop" }, { id: "letter-drop", name: "Letter drop" }, { id: "word-up", name: "Word rise" },
  { id: "word-fade", name: "Word fade" }, { id: "blur-in", name: "Blur in" }, { id: "spread", name: "Spread" },
];
export const TEXT_ANIM_IDS = new Set(TEXT_ANIMS.map((a) => a.id));
export const TEXT_LOOPS = [
  { id: "none", name: "None" }, { id: "wave", name: "Wave" }, { id: "pulse", name: "Pulse" }, { id: "shake", name: "Shake" },
  { id: "rainbow", name: "Rainbow" }, { id: "blink", name: "Blink" }, { id: "float", name: "Float" }, { id: "glitch", name: "Glitch jitter" },
];
export const NOTE_ANIMS = [{ id: "draw", name: "Draw on" }];
export const backOut = (x: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/* ---------- annotation kinds ---------- */
import type { NoteKind } from "./types";
export const NOTE_KINDS: { id: NoteKind; name: string; hint: string }[] = [
  { id: "arrow", name: "Arrow", hint: "drag from tail to head" },
  { id: "line", name: "Line", hint: "drag" },
  { id: "rect", name: "Box", hint: "drag a corner to corner" },
  { id: "ellipse", name: "Circle", hint: "drag the bounding box" },
  { id: "pen", name: "Pen", hint: "draw freely" },
  { id: "highlight", name: "Highlight", hint: "drag over text / area" },
  { id: "spotlight", name: "Spotlight", hint: "dims everything outside" },
  { id: "badge", name: "Number", hint: "click to place a numbered marker" },
];
export const NOTE_COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#22d3c5", "#0a84ff", "#ffffff", "#000000", "#ff2d92"];

/* ---------- crop by aspect ratio ---------- */
export const CROP_RATIOS: [string, number][] = [
  ["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:5", 4 / 5], ["5:4", 5 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3], ["21:9", 21 / 9], ["2.39:1", 2.39],
];
/** crop fractions [l,t,r,b] giving the largest `ratio` window inside a w×h source; pan -1..1 slides it */
export function cropForRatio(w: number, h: number, ratio: number, panX = 0, panY = 0): [number, number, number, number] {
  const src = w / h;
  if (Math.abs(src - ratio) < 1e-3) return [0, 0, 0, 0];
  if (ratio < src) { // window is narrower than the source → trim left/right
    const keep = ratio / src, free = 1 - keep, l = (free / 2) * (1 + panX);
    return [l, 0, free - l, 0];
  }
  const keep = src / ratio, free = 1 - keep, t = (free / 2) * (1 + panY);
  return [0, t, 0, free - t];
}
