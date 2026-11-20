export type MediaKind = "video" | "audio" | "image";
export type ClipType = MediaKind | "text" | "adjust" | "shape" | "note";
export type TrackKind = "video" | "audio";

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number; // seconds (images: default 5)
  width: number;
  height: number;
  size: number;
  path?: string; // relative path inside the project folder
  bin?: string; // project-panel folder
}

export type Pt = [number, number];
export interface Mask {
  shape: "rect" | "ellipse" | "triangle" | "star" | "hexagon" | "heart";
  x: number; y: number; // centre offset, -1..1 of the clip box
  w: number; h: number; // size, 0..1 of the clip box
  feather: number; // px
  invert: boolean;
}
export interface Wheels { shadows: Pt; mids: Pt; highs: Pt } // [hue deg, amount 0..100]
export interface Curves { m: Pt[]; r: Pt[]; g: Pt[]; b: Pt[] }
export const IDENTITY_CURVE: Pt[] = [[0, 0], [1, 1]];
export const defaultCurves = (): Curves => ({ m: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] });
export type NoteKind = "arrow" | "line" | "rect" | "ellipse" | "pen" | "highlight" | "spotlight" | "badge";
export interface Note {
  kind: NoteKind;
  pts: Pt[]; // canvas fractions relative to the canvas centre (x: -0.5..0.5 of width, y: -0.5..0.5 of height)
  color: string;
  width: number; // stroke width in px at 1080p
  fill: number; // 0..100 fill opacity (rect / ellipse)
  label: string; // badge text
}
export interface LutRef { id: string; name: string; path: string }

export interface FilterSet {
  brightness: number; // % (100 = normal)
  contrast: number; // %
  saturate: number; // %
  blur: number; // px
  hue: number; // deg
  grayscale: number; // %
  sepia: number; // %
}
export const DEFAULT_FILTER: FilterSet = { brightness: 100, contrast: 100, saturate: 100, blur: 0, hue: 0, grayscale: 0, sepia: 0 };

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  mediaId?: string;
  name: string;
  start: number; // position on timeline (s)
  duration: number; // length on timeline (s)
  offset: number; // in-point inside the source (s)
  volume: number; // 0..2
  // visual transform
  x: number; // -1..1 offset of center relative to canvas
  y: number;
  scale: number;
  opacity: number;
  // text
  text?: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  bg?: string; // text background box colour ("" = none)
  stroke?: string;
  strokeW?: number;
  // extras
  speed: number; // 0.1..8
  rotation: number; // degrees
  flipX: boolean;
  flipY: boolean;
  filter: FilterSet;
  vignette: number; // 0..100
  blend: string; // canvas globalCompositeOperation
  fadeIn: number; // s
  fadeOut: number; // s
  animIn: string;
  animOut: string;
  animDur: number; // s
  // effects
  effect: string; // svg/canvas effect id ("none")
  effectAmt: number; // 0..100
  pixelate: number; // 0 = off, else block size
  chroma: "" | "green" | "blue";
  chromaAmt: number; // 0..100
  temp: number; // -100..100
  tint: number; // -100..100
  // audio extras
  pan: number; // -100..100
  bass: number; // dB -12..12
  treble: number; // dB -12..12
  // keyframes: prop -> [{t: seconds from clip start, v: value, hold?: boolean}]
  keys: Record<string, { t: number; v: number; hold?: boolean }[]>;
  // transition at the START of this clip (cross with the previous adjacent clip on the track)
  transIn: string;
  transDur: number;
  // editing extras
  linkId?: string; // clips sharing a linkId select / move together
  freeze: boolean; // hold one source frame
  reverse: boolean; // play the source backwards (video only, silent)
  rampTo: number; // 0 = constant speed, otherwise the speed at the clip end (linear ramp from `speed`)
  crop: [number, number, number, number]; // l,t,r,b fractions of the source
  mask: Mask | null;
  matte: { id: string; mode: "alpha" | "luma"; invert: boolean } | null;
  lut: string; // LutRef id, "" = none
  lutAmt: number; // 0..100
  wheels: Wheels | null;
  curves: Curves | null;
  // audio processing
  gate: number; // 0 = off, else noise-gate / reduction amount 1..100
  comp: number; // compressor 0..100
  reverb: number; // 0..100
  deess: number; // 0..100
  eqFreq: number; // mid band Hz
  eqGain: number; // mid band dB
  line2Scale: number; // size of line 2 relative to line 1
  line2Color: string; // "" = same as line 1
  line2Bold?: boolean; // undefined = same as line 1
  color2: string; // gradient end colour ("" = solid)
  glow: string; // glow colour ("" = none)
  spacing: number; // letter spacing (px at 1080p)
  upper: boolean; // UPPERCASE
  textLoop: string; // continuous text animation ("none", wave, pulse, shake, rainbow, blink)
  cropRatio: string; // "" = free, else e.g. "16:9"
  cropPan: [number, number]; // -1..1 position of the crop window inside the source
  note: Note | null;
  // shape
  shape?: "rect" | "ellipse";
  fill?: string;
  sw?: number; // fraction of canvas width
  sh?: number;
}

export const clipDefaults = (c: Partial<Clip> & Pick<Clip, "id" | "trackId" | "type" | "name" | "start" | "duration">): Clip => ({
  offset: 0, volume: 1, x: 0, y: 0, scale: 1, opacity: 1,
  speed: 1, rotation: 0, flipX: false, flipY: false, vignette: 0, blend: "source-over",
  fadeIn: 0, fadeOut: 0, animIn: "none", animOut: "none", animDur: 0.6,
  effect: "none", effectAmt: 50, pixelate: 0, chroma: "", chromaAmt: 50, temp: 0, tint: 0,
  pan: 0, bass: 0, treble: 0, keys: {}, transIn: "none", transDur: 1,
  freeze: false, reverse: false, rampTo: 0, crop: [0, 0, 0, 0], mask: null, matte: null, lut: "", lutAmt: 100, wheels: null, curves: null,
  line2Scale: 1, line2Color: "", color2: "", glow: "", spacing: 0, upper: false,
  textLoop: "none", cropRatio: "", cropPan: [0, 0], note: null,
  gate: 0, comp: 0, reverb: 0, deess: 0, eqFreq: 1000, eqGain: 0,
  ...c,
  filter: { ...DEFAULT_FILTER, ...(c.filter ?? {}) },
});

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  vol?: number; // mixer gain 0..2
  duck?: boolean; // music track that ducks under speech
  tall?: boolean; // taller track row
  role?: "video" | "overlay" | "audio"; // layer kind shown in the UI
}

export const roleOf = (t: Track): "video" | "overlay" | "audio" =>
  t.role ?? (t.kind === "audio" ? "audio" : /^overlay/i.test(t.name) ? "overlay" : "video");

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  bg: string;
  markers: { id: string; t: number; label: string }[];
  rangeIn?: number | null;
  rangeOut?: number | null;
  luts?: LutRef[];
  media: MediaItem[];
  tracks: Track[]; // index 0 = top layer
  clips: Clip[];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const projectDuration = (p: Project) => p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);

export function newProject(): Project {
  return {
    id: uid(),
    name: "Untitled project",
    width: 1920,
    height: 1080,
    fps: 30,
    bg: "#000000",
    markers: [],
    media: [],
    tracks: [
      { id: "track-overlay", kind: "video", role: "overlay", name: "Overlay" },
      { id: "track-video", kind: "video", role: "video", name: "Video" },
      { id: "track-audio", kind: "audio", role: "audio", name: "Audio" },
    ],
    clips: [],
  };
}

export function fmtTime(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
