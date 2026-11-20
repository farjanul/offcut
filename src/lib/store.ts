import { create } from "zustand";
import { computeWaveform } from "./waveform";
import { TEXT_PRESETS, SHAPES, prevAdjacent, splitClipAt, srcAt, srcSpan } from "./effects";
import { Lut, parseCube } from "./lut";
import { alertDialog } from "./dialog";
import {
  clipDefaults, Clip, MediaItem, NoteKind, roleOf, MediaKind, Project, Track, TrackKind, newProject, projectDuration, uid,
} from "./types";
import {
  fileExists, fsSupported, hasPermission, listMediaFiles, pruneBackups, removeFile, pickDirectory, readFile, readProjectJson, safeName, saveProjectJson, writeFile,
} from "./fs";

export const MIN_CLIP = 0.1;

interface State {
  project: Project;
  files: Record<string, File>; // mediaId -> File (in memory)
  urls: Record<string, string>; // mediaId -> blob URL
  thumbs: Record<string, string>; // mediaId -> thumbnail data URL
  missing: Record<string, boolean>;
  waves: Record<string, string>; // mediaId -> waveform data URL

  time: number;
  playing: boolean;
  selectedId: string | null;
  selectedIds: string[];
  tool: "select" | "razor" | "ripple" | "roll" | "slip";
  loop: boolean;
  previewScale: number;
  lutData: Record<string, Lut>;
  pps: number; // timeline pixels per second
  snap: boolean;
  guides: boolean;
  folderError: string | null;
  memoryMode: boolean;
  setMemoryMode: (v: boolean) => void;
  clearFolderError: () => void;
  annot: { kind: NoteKind; color: string; width: number; fill: number } | null;
  setAnnot: (a: State["annot"]) => void;

  past: Project[];
  future: Project[];

  dir: FileSystemDirectoryHandle | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  busy: string | null;

  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  select: (id: string | null, additive?: boolean) => void;
  selectMany: (ids: string[]) => void;
  setTool: (t: State["tool"]) => void;
  setLoop: (v: boolean) => void;
  setPreviewScale: (v: number) => void;
  patchClips: (patches: Record<string, Partial<Clip>>, history?: boolean) => void;
  razorAt: (id: string, time: number) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  freezeFrame: () => void;
  setRange: (a: number | null, b: number | null) => void;
  liftRange: (extract: boolean) => void;
  importLut: (file: File) => Promise<void>;
  setBin: (mediaId: string, bin: string) => void;
  /** look inside <project folder>/media and list files that are not in the project yet; returns how many were added */
  scanMedia: (silent?: boolean) => Promise<number>;
  setPps: (n: number) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  patchProject: (patch: Partial<Project>) => void;
  importFiles: (files: File[]) => Promise<MediaItem[]>;
  removeMedia: (id: string) => void;
  addClipFromMedia: (mediaId: string, trackId?: string, start?: number, opts?: { mode?: "auto" | "insert" | "overwrite"; inPt?: number; outPt?: number }) => void;
  addText: (preset?: Partial<Clip>) => void;
  addSticker: (emoji: string) => void;
  addLayer: (partial: Partial<Clip>) => void;
  addAdjustment: () => void;
  addShape: (id: string) => void;
  setTransition: (id: string, type: string, dur?: number) => boolean;
  applyTransitionAll: (type: string) => void;
  copy: () => void;
  paste: () => void;
  addMarker: () => void;
  removeMarker: (id: string) => void;
  setSnap: (v: boolean) => void;
  setGuides: (v: boolean) => void;
  importSrt: (srt: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  setSpeed: (id: string, speed: number) => void;
  detachAudio: () => void;
  rippleDelete: () => void;
  addTrack: (kind: TrackKind | "overlay") => void;
  moveTrack: (id: string, dir: -1 | 1) => void;
  removeTrack: (id: string) => void;
  /** live edit (no history push; call pushHistory() once before a drag) */
  updateClip: (id: string, patch: Partial<Clip>, history?: boolean) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;

  chooseFolder: () => Promise<void>;
  attachFolder: (h: FileSystemDirectoryHandle) => Promise<void>;
  saveNow: () => Promise<void>;
  newProject: () => void;
}

/* ---------- helpers ---------- */
export function probeMedia(file: File): Promise<{ kind: MediaKind; duration: number; width: number; height: number; thumb?: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const done = () => URL.revokeObjectURL(url);
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        resolve({ kind: "image", duration: 5, width: img.naturalWidth, height: img.naturalHeight, thumb: thumbFrom(img, img.naturalWidth, img.naturalHeight) });
        done();
      };
      img.onerror = () => { done(); reject(new Error("bad image")); };
      img.src = url;
    } else if (file.type.startsWith("audio/")) {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => { resolve({ kind: "audio", duration: a.duration || 0, width: 0, height: 0 }); done(); };
      a.onerror = () => { done(); reject(new Error("bad audio")); };
      a.src = url;
    } else if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.onloadedmetadata = () => {
        const dur = v.duration || 0;
        v.currentTime = Math.min(0.1, dur / 2);
      };
      v.onseeked = () => {
        resolve({ kind: "video", duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight, thumb: thumbFrom(v, v.videoWidth, v.videoHeight) });
        done();
      };
      v.onerror = () => { done(); reject(new Error("bad video")); };
      v.src = url;
    } else {
      done();
      reject(new Error("unsupported file type"));
    }
  });
}

function thumbFrom(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  const H = 90;
  c.height = H;
  c.width = Math.max(1, Math.round((w / Math.max(1, h)) * H));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

export const overlaps = (clips: Clip[], trackId: string, start: number, dur: number, excludeId?: string) =>
  clips.some((c) => c.trackId === trackId && c.id !== excludeId && start < c.start + c.duration - 1e-6 && start + dur > c.start + 1e-6);

/** remove / trim everything overlapping [a,b) on the given tracks (null = all tracks) */
function carve(clips: Clip[], trackIds: string[] | null, a: number, b: number): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    const e = c.start + c.duration;
    if ((trackIds && !trackIds.includes(c.trackId)) || e <= a + 1e-6 || c.start >= b - 1e-6) { out.push(c); continue; }
    if (c.start >= a - 1e-6 && e <= b + 1e-6) continue;
    if (c.start < a && e > b) { const [l, rest] = splitClipAt(c, a, uid()); const [, r] = splitClipAt(rest, b, uid()); out.push(l, r); continue; }
    if (c.start < a) { out.push(splitClipAt(c, a, uid())[0]); continue; }
    out.push(splitClipAt(c, b, uid())[1]);
  }
  return out;
}
const splitTrackAt = (clips: Clip[], trackId: string, at: number): Clip[] =>
  clips.flatMap((c) => (c.trackId === trackId && at > c.start + 1e-6 && at < c.start + c.duration - 1e-6 ? splitClipAt(c, at, uid()) : [c]));
const shiftClips = (clips: Clip[], trackIds: string[] | null, from: number, delta: number): Clip[] =>
  clips.map((c) => ((!trackIds || trackIds.includes(c.trackId)) && c.start >= from - 1e-6 ? { ...c, start: Math.max(0, c.start + delta) } : c));

function explainFolderError(e: unknown): string {
  const err = e as DOMException;
  const name = err?.name ?? "", msg = err?.message ?? String(e);
  if (e instanceof TypeError && /showDirectoryPicker/.test(msg)) return "This browser cannot save to a folder. Use Chrome or Edge, or continue without a folder (temporary).";
  if (/intercept|setInterceptFileChooserDialog/i.test(msg)) return "This browser window is controlled by an automation tool, so it cannot show a folder dialog. Open http://localhost:3000 in your normal Chrome or Edge window and choose the folder there.";
  if (name === "SecurityError" && /top.?level|cross.?origin|sub.?frame|iframe|user activation/i.test(msg)) return "The browser blocks folder access inside an embedded / preview window. Open http://localhost:3000 in a normal Chrome or Edge tab.";
  if (name === "SecurityError") return "Chrome does not allow this folder (system folders such as Desktop, Documents, Downloads or your whole home folder are blocked). Create a NEW folder (for example “MyVideoProject”) and choose that one.";
  if (name === "NotAllowedError") return "Access was denied. Click “Choose folder” again and allow the permission prompt.";
  return `${name || "Error"}: ${msg}`;
}

let lastBackup = 0;
let scanning = false;
const trackKindFor = (type: Clip["type"]): TrackKind => (type === "audio" ? "audio" : "video");

let clipboard: Clip | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useEditor = create<State>((set, get) => {
  const mutate = (fn: (p: Project) => Project, history = true) => {
    const cur = get().project;
    const next = fn(cur);
    if (next === cur) return;
    set({
      project: next,
      past: history ? [...get().past.slice(-99), cur] : get().past,
      future: history ? [] : get().future,
    });
  };

  // waveform cache lives on disk (cache/waves) so reopening never re-decodes audio
  async function loadWave(id: string, file: File) {
    const dir = get().dir;
    const cachePath = `cache/waves/${id}.png`;
    if (dir) {
      const cached = await readFile(dir, cachePath);
      if (cached) return URL.createObjectURL(cached);
    }
    const url = await computeWaveform(file);
    if (url && dir) fetch(url).then((r) => r.blob()).then((b) => writeFile(dir, cachePath, b)).catch(() => {});
    return url;
  }

  async function registerMedia(file: File, id: string, existing?: MediaItem): Promise<MediaItem> {
    const info = await probeMedia(file);
    const item: MediaItem = existing ?? {
      id, name: file.name, kind: info.kind, duration: info.duration, width: info.width, height: info.height, size: file.size,
    };
    set((s) => ({
      files: { ...s.files, [id]: file },
      urls: { ...s.urls, [id]: URL.createObjectURL(file) },
      thumbs: info.thumb ? { ...s.thumbs, [id]: info.thumb } : s.thumbs,
      missing: { ...s.missing, [id]: false },
    }));
    if (info.kind !== "image") {
      loadWave(id, file).then((w) => w && set((s) => ({ waves: { ...s.waves, [id]: w } })));
    }
    return item;
  }

  async function loadFromFolder(dir: FileSystemDirectoryHandle, p: Project) {
    set({ busy: "Loading project…" });
    for (const u of Object.values(get().urls)) URL.revokeObjectURL(u);
    p = {
      ...p, bg: p.bg ?? "#000000", markers: p.markers ?? [],
      clips: p.clips.map((c) => clipDefaults(c)),
    };
    set({ project: p, files: {}, urls: {}, thumbs: {}, missing: {}, waves: {}, lutData: {}, past: [], future: [], time: 0, playing: false, selectedId: null, selectedIds: [], dir });
    for (const m of p.media) {
      const f = m.path ? await readFile(dir, m.path) : null;
      if (!f) { set((s) => ({ missing: { ...s.missing, [m.id]: true } })); continue; }
      try { await registerMedia(f, m.id, m); } catch { set((s) => ({ missing: { ...s.missing, [m.id]: true } })); }
    }
    for (const l of p.luts ?? []) {
      const f = await readFile(dir, l.path);
      const lut = f ? parseCube(await f.text()) : null;
      if (lut) set((s) => ({ lutData: { ...s.lutData, [l.id]: lut } }));
    }
    set({ busy: null, saveStatus: "saved" });
  }

  return {
    project: newProject(),
    files: {}, urls: {}, thumbs: {}, missing: {}, waves: {},
    time: 0, playing: false, selectedId: null, selectedIds: [], tool: "select", loop: false, previewScale: 1, lutData: {}, pps: 60, snap: true, guides: false, folderError: null, memoryMode: false, setMemoryMode: (memoryMode) => set({ memoryMode, folderError: null }), clearFolderError: () => set({ folderError: null }), annot: null, setAnnot: (annot) => set({ annot }),
    past: [], future: [],
    dir: null, saveStatus: "idle", busy: null,

    setTime: (t) => set({ time: Math.max(0, t) }),
    setPlaying: (playing) => set({ playing }),
    select: (id, additive = false) => {
      if (!id) { set({ selectedId: null, selectedIds: [] }); return; }
      const clips = get().project.clips;
      const c = clips.find((x) => x.id === id);
      const group = c?.linkId ? clips.filter((x) => x.linkId === c.linkId).map((x) => x.id) : [id];
      if (additive) {
        const cur = get().selectedIds;
        const next = cur.includes(id) ? cur.filter((x) => !group.includes(x)) : Array.from(new Set([...cur, ...group]));
        set({ selectedIds: next, selectedId: next.includes(id) ? id : next[next.length - 1] ?? null });
      } else set({ selectedId: id, selectedIds: group });
    },
    selectMany: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null }),
    setTool: (tool) => set({ tool }),
    setLoop: (loop) => set({ loop }),
    setPreviewScale: (previewScale) => set({ previewScale }),
    patchClips: (patches, history = false) =>
      mutate((p) => ({ ...p, clips: p.clips.map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c)) }), history),

    razorAt: (id, time) => {
      const { project } = get();
      const c = project.clips.find((x) => x.id === id);
      if (!c) return;
      const ids = c.linkId ? project.clips.filter((x) => x.linkId === c.linkId).map((x) => x.id) : [id];
      mutate((p) => ({
        ...p,
        clips: p.clips.flatMap((x) => (ids.includes(x.id) && time > x.start + MIN_CLIP / 2 && time < x.start + x.duration - MIN_CLIP / 2 ? splitClipAt(x, time, uid()) : [x])),
      }));
    },

    groupSelected: () => {
      const ids = get().selectedIds;
      if (ids.length < 2) return;
      const linkId = uid();
      mutate((p) => ({ ...p, clips: p.clips.map((c) => (ids.includes(c.id) ? { ...c, linkId } : c)) }));
    },
    ungroupSelected: () => {
      const ids = get().selectedIds;
      mutate((p) => ({ ...p, clips: p.clips.map((c) => (ids.includes(c.id) ? { ...c, linkId: undefined } : c)) }));
    },

    freezeFrame: () => {
      const { project, time, selectedId } = get();
      const c = project.clips.find((x) => x.id === selectedId);
      if (!c || c.type !== "video" || time <= c.start + MIN_CLIP / 2 || time >= c.start + c.duration - MIN_CLIP / 2) return;
      const hold = 2;
      const t0 = srcAt(c, time - c.start);
      const [a, b] = splitClipAt(c, time, uid());
      const f = clipDefaults({ ...c, id: uid(), start: time, duration: hold, freeze: true, offset: t0, speed: 1, rampTo: 0, reverse: false, volume: 0, transIn: "none", fadeIn: 0, fadeOut: 0, animIn: "none", animOut: "none", linkId: undefined });
      mutate((p) => ({
        ...p,
        clips: [
          ...p.clips.filter((x) => x.id !== c.id).map((x) => (x.trackId === c.trackId && x.start >= time + 1e-6 ? { ...x, start: x.start + hold } : x)),
          a, f, { ...b, start: b.start + hold },
        ],
      }));
      set({ selectedId: f.id, selectedIds: [f.id] });
    },

    setRange: (a, b) => mutate((p) => ({ ...p, rangeIn: a, rangeOut: b })),
    liftRange: (extract) => {
      const { project } = get();
      const a = project.rangeIn, b = project.rangeOut;
      if (a == null || b == null || b <= a) return;
      mutate((p) => {
        let clips = carve(p.clips, null, a, b);
        if (extract) clips = shiftClips(clips, null, b, -(b - a));
        return { ...p, clips, rangeIn: null, rangeOut: null };
      });
    },

    importLut: async (file) => {
      const lut = parseCube(await file.text());
      if (!lut) { void alertDialog({ title: "Unsupported LUT", message: "Use a 3D .cube file." }); return; }
      const id = uid();
      const dir = get().dir;
      const path = `luts/${id}-${safeName(file.name)}`;
      if (dir) await writeFile(dir, path, file);
      set((s) => ({ lutData: { ...s.lutData, [id]: lut } }));
      mutate((p) => ({ ...p, luts: [...(p.luts ?? []), { id, name: file.name.replace(/\.cube$/i, ""), path }] }));
    },

    scanMedia: async (silent = false) => {
      const { dir, busy } = get();
      if (!dir || busy || scanning) return 0;
      scanning = true;
      try {
        const known = new Set(get().project.media.map((m) => m.path).filter(Boolean));
        const found = (await listMediaFiles(dir)).filter((f) => !known.has(f.path) && /^(video|audio|image)\//.test(f.file.type));
        if (!found.length) return 0;
        if (!silent) set({ busy: `Scanning media folder… (${found.length})` });
        const added: MediaItem[] = [];
        for (const f of found) {
          const id = uid();
          try {
            const item = await registerMedia(f.file, id);
            item.path = f.path;
            item.name = f.file.name.replace(/^[a-z0-9]{12}-(?=.)/, ""); // files copied in by the app carry an id prefix
            added.push(item);
          } catch (e) {
            console.warn("Skipped (unreadable media):", f.path, e);
          }
        }
        if (added.length) mutate((p) => ({ ...p, media: [...p.media, ...added] }), false);
        return added.length;
      } finally {
        scanning = false;
        if (!silent) set({ busy: null });
      }
    },

    setBin: (mediaId, bin) => mutate((p) => ({ ...p, media: p.media.map((m) => (m.id === mediaId ? { ...m, bin } : m)) })),
    setPps: (n) => set({ pps: Math.min(400, Math.max(8, n)) }),

    pushHistory: () => set((s) => ({ past: [...s.past.slice(-99), s.project], future: [] })),
    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project] });
    },

    patchProject: (patch) => mutate((p) => ({ ...p, ...patch })),

    importFiles: async (files) => {
      const supported = files.filter((f) => /^(video|audio|image)\//.test(f.type));
      if (!supported.length) return [];
      set({ busy: "Importing media…" });
      const added: MediaItem[] = [];
      for (const f of supported) {
        const id = uid();
        try {
          const dir = get().dir;
          let src = f;
          let path: string | undefined;
          if (dir) {
            path = `media/${id}-${safeName(f.name)}`;
            await writeFile(dir, path, f); // streamed copy into the project folder on disk
            src = (await readFile(dir, path)) ?? f; // from now on read from the disk copy
          }
          const item = await registerMedia(src, id);
          if (path) item.path = path;
          item.name = f.name; // keep the original name (the disk copy has an id prefix)
          added.push(item);
        } catch (e) {
          console.warn("Import failed", f.name, e);
        }
      }
      mutate((p) => ({ ...p, media: [...p.media, ...added] }));
      set({ busy: null });
      return added;
    },

    removeMedia: (id) => {
      const { project, dir, urls, selectedId } = get();
      const m = project.media.find((x) => x.id === id);
      if (!m) return;
      const selClip = project.clips.find((c) => c.id === selectedId);
      mutate((p) => ({ ...p, media: p.media.filter((x) => x.id !== id), clips: p.clips.filter((c) => c.mediaId !== id) }));
      const drop = <T,>(o: Record<string, T>) => { const { [id]: _gone, ...rest } = o; return rest; };
      set((s) => ({
        files: drop(s.files), urls: drop(s.urls), thumbs: drop(s.thumbs), waves: drop(s.waves), missing: drop(s.missing),
        // the file is deleted from disk, so undo must not bring back clips that point at it
        past: s.past.filter((p) => !p.media.some((x) => x.id === id)),
        future: s.future.filter((p) => !p.media.some((x) => x.id === id)),
        ...(selClip?.mediaId === id ? { selectedId: null, selectedIds: [] } : {}),
      }));
      if (urls[id]) setTimeout(() => URL.revokeObjectURL(urls[id]), 500); // let the preview elements let go first
      if (dir) {
        if (m.path) void removeFile(dir, m.path);
        void removeFile(dir, `cache/waves/${id}.png`);
      }
    },

    addClipFromMedia: (mediaId, trackId, start, opts) => {
      const { project, time } = get();
      const m = project.media.find((x) => x.id === mediaId);
      if (!m) return;
      const mode = opts?.mode ?? "auto";
      const kind: TrackKind = m.kind === "audio" ? "audio" : "video";
      const at = Math.max(0, start ?? time);
      const inPt = m.kind === "image" ? 0 : opts?.inPt ?? 0;
      const outPt = m.kind === "image" ? m.duration : opts?.outPt ?? m.duration;
      const dur = Math.max(MIN_CLIP, outPt - inPt);
      let tracks = project.tracks;
      let clips = project.clips;
      let tid: string | undefined;
      if (mode !== "auto") {
        const cands = tracks.filter((t) => t.kind === kind);
        tid = trackId && cands.find((t) => t.id === trackId) ? trackId : (kind === "video" ? cands[cands.length - 1] : cands[0])?.id;
        if (tid) {
          if (mode === "overwrite") clips = carve(clips, [tid], at, at + dur);
          else clips = shiftClips(splitTrackAt(clips, tid, at), [tid], at, dur);
        }
      }
      if (!tid) {
        tid = trackId && tracks.find((t) => t.id === trackId && t.kind === kind) && !overlaps(clips, trackId, at, dur) ? trackId : undefined;
      }
      if (!tid) {
        // default: prefer the main "Video"/"Audio" track, then any free track of this kind, else a new one
        const cands = tracks.filter((t) => t.kind === kind);
        const ordered = kind === "video" ? [...cands].reverse() : cands;
        tid = ordered.find((t) => !overlaps(clips, t.id, at, dur))?.id;
        if (!tid) {
          const nt: Track = { id: uid(), kind, name: kind === "video" ? `Video ${cands.length + 1}` : `Audio ${cands.length + 1}` };
          tracks = kind === "video" ? [nt, ...tracks] : [...tracks, nt];
          tid = nt.id;
        }
      }
      const clip = clipDefaults({ id: uid(), trackId: tid, type: m.kind, mediaId, name: m.name, start: at, duration: dur, offset: inPt });
      mutate((p) => ({ ...p, tracks, clips: [...clips, clip] }));
      set({ selectedId: clip.id, selectedIds: [clip.id] });
    },

    addLayer: (partial) => {
      const { project, time } = get();
      const dur = partial.duration ?? 3;
      const vtracks = project.tracks.filter((t) => t.kind === "video");
      let tracks = project.tracks;
      let tid = vtracks.find((t) => !overlaps(project.clips, t.id, time, dur))?.id;
      if (!tid) {
        const nt: Track = { id: uid(), kind: "video", role: "overlay", name: `Overlay ${tracks.filter((t) => roleOf(t) === "overlay").length + 1}` };
        tracks = [nt, ...tracks];
        tid = nt.id;
      }
      const clip = clipDefaults({ id: uid(), trackId: tid, type: "text", name: "Layer", start: time, duration: dur, ...partial });
      mutate((p) => ({ ...p, tracks, clips: [...p.clips, clip] }));
      set({ selectedId: clip.id, selectedIds: [clip.id] });
    },

    addText: (preset) => {
      const base = preset ?? TEXT_PRESETS[0].p;
      get().addLayer({ type: "text", name: (base.text ?? "Text").slice(0, 24), duration: 3, text: "Your text", fontSize: 96, color: "#ffffff", ...base });
    },

    addAdjustment: () => get().addLayer({ type: "adjust", name: "Adjustment layer", duration: 5 }),

    addShape: (id) => {
      const sh = SHAPES.find((x) => x.id === id) ?? SHAPES[0];
      get().addLayer({ type: "shape", name: sh.name, duration: 3, shape: id === "ellipse" ? "ellipse" : "rect", fill: sh.fill, sw: sh.sw, sh: sh.sh, y: (sh as { y?: number }).y ? ((sh as { y?: number }).y! - 0.5) * 2 : 0 });
    },

    setTransition: (id, type, dur) => {
      const { project } = get();
      const c = project.clips.find((x) => x.id === id);
      if (!c) return false;
      if (type !== "none" && !prevAdjacent(project.clips, c)) return false;
      mutate((p) => ({ ...p, clips: p.clips.map((x) => (x.id === id ? { ...x, transIn: type, transDur: Math.min(dur ?? x.transDur, Math.max(MIN_CLIP, x.duration)) } : x)) }));
      return true;
    },

    applyTransitionAll: (type) =>
      mutate((p) => ({ ...p, clips: p.clips.map((x) => (prevAdjacent(p.clips, x) ? { ...x, transIn: type } : x)) })),

    copy: () => { const c = get().project.clips.find((x) => x.id === get().selectedId); if (c) clipboard = c; },
    paste: () => {
      if (!clipboard) return;
      const { project, time } = get();
      const kind = trackKindFor(clipboard.type);
      let tid = project.tracks.find((t) => t.id === clipboard!.trackId && !overlaps(project.clips, t.id, time, clipboard!.duration))?.id;
      let tracks = project.tracks;
      if (!tid) tid = tracks.filter((t) => t.kind === kind).find((t) => !overlaps(project.clips, t.id, time, clipboard!.duration))?.id;
      if (!tid) {
        const nt: Track = { id: uid(), kind, name: kind === "video" ? "Video +" : "Audio +" };
        tracks = kind === "video" ? [nt, ...tracks] : [...tracks, nt];
        tid = nt.id;
      }
      const copy: Clip = { ...clipboard, id: uid(), trackId: tid, start: time, transIn: "none" };
      mutate((p) => ({ ...p, tracks, clips: [...p.clips, copy] }));
      set({ selectedId: copy.id, selectedIds: [copy.id] });
    },

    addMarker: () => mutate((p) => ({ ...p, markers: [...(p.markers ?? []), { id: uid(), t: get().time, label: `M${(p.markers?.length ?? 0) + 1}` }] })),
    removeMarker: (id) => mutate((p) => ({ ...p, markers: (p.markers ?? []).filter((m) => m.id !== id) })),
    setSnap: (snap) => set({ snap }),
    setGuides: (guides) => set({ guides }),

    addSticker: (emoji) => get().addText({ text: emoji, name: emoji, fontSize: 220, color: "#ffffff", bg: "", stroke: "", strokeW: 0 }),

    importSrt: (srt) => {
      const toS = (x: string) => { const m = x.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; };
      const blocks = srt.replace(/\r/g, "").split(/\n\s*\n/);
      const subs: { a: number; b: number; text: string }[] = [];
      for (const b of blocks) {
        const lines = b.split("\n").filter(Boolean);
        const ti = lines.findIndex((l) => l.includes("-->"));
        if (ti < 0) continue;
        const [a, c] = lines[ti].split("-->");
        const text = lines.slice(ti + 1).join("\n").replace(/<[^>]+>/g, "");
        if (text) subs.push({ a: toS(a), b: toS(c), text });
      }
      if (!subs.length) return;
      const tr: Track = { id: uid(), kind: "video", role: "overlay", name: "Subtitles" };
      const clips = subs.map((x) => clipDefaults({
        id: uid(), trackId: tr.id, type: "text", name: x.text.slice(0, 24), start: x.a, duration: Math.max(MIN_CLIP, x.b - x.a),
        text: x.text, fontSize: 56, color: "#ffffff", bg: "#000000aa", y: 0.78,
      }));
      mutate((p) => ({ ...p, tracks: [tr, ...p.tracks], clips: [...p.clips, ...clips] }));
    },

    updateTrack: (id, patch) => mutate((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

    setSpeed: (id, speed) => {
      speed = Math.min(8, Math.max(0.1, speed));
      mutate((p) => {
        const c = p.clips.find((x) => x.id === id);
        if (!c) return p;
        const srcLen = srcSpan(c);
        let dur = Math.max(MIN_CLIP, srcLen / speed);
        const next = p.clips.filter((o) => o.trackId === c.trackId && o.id !== id && o.start >= c.start + 1e-6).reduce((m, o) => Math.min(m, o.start), Infinity);
        dur = Math.min(dur, next - c.start);
        return { ...p, clips: p.clips.map((x) => (x.id === id ? { ...x, speed, rampTo: 0, duration: dur } : x)) };
      });
    },

    detachAudio: () => {
      const { project, selectedId } = get();
      const c = project.clips.find((x) => x.id === selectedId);
      if (!c || c.type !== "video") return;
      let tracks = project.tracks;
      let tid = tracks.filter((t) => t.kind === "audio").find((t) => !overlaps(project.clips, t.id, c.start, c.duration))?.id;
      if (!tid) {
        const nt: Track = { id: uid(), kind: "audio", name: `Audio ${tracks.filter((t) => t.kind === "audio").length + 1}` };
        tracks = [...tracks, nt];
        tid = nt.id;
      }
      const link = uid();
      const a = clipDefaults({ ...c, id: uid(), trackId: tid, type: "audio", name: `${c.name} (audio)`, linkId: link });
      mutate((p) => ({ ...p, tracks, clips: [...p.clips.map((x) => (x.id === c.id ? { ...x, volume: 0, linkId: link } : x)), a] }));
      set({ selectedId: a.id, selectedIds: [a.id] });
    },

    rippleDelete: () => {
      const { project, selectedIds, selectedId } = get();
      const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
      const sel = project.clips.filter((x) => ids.includes(x.id));
      if (!sel.length) return;
      mutate((p) => {
        let clips = p.clips.filter((x) => !ids.includes(x.id));
        // process from the latest to the earliest so earlier shifts don't disturb later positions
        for (const c of [...sel].sort((a, b) => b.start - a.start)) clips = shiftClips(clips, [c.trackId], c.start + c.duration, -c.duration);
        return { ...p, clips };
      });
      set({ selectedId: null, selectedIds: [] });
    },

    addTrack: (role) =>
      mutate((p) => {
        const kind: TrackKind = role === "audio" ? "audio" : "video";
        const n = p.tracks.filter((t) => roleOf(t) === role).length + 1;
        const label = role === "overlay" ? "Overlay" : role === "video" ? "Video" : "Audio";
        const t: Track = { id: uid(), kind, role, name: `${label} ${n}` };
        if (role === "overlay") return { ...p, tracks: [t, ...p.tracks] }; // top of the stack
        if (role === "video") {
          const idx = p.tracks.filter((x) => roleOf(x) === "overlay").length; // just under the overlays
          return { ...p, tracks: [...p.tracks.slice(0, idx), t, ...p.tracks.slice(idx)] };
        }
        return { ...p, tracks: [...p.tracks, t] };
      }),

    moveTrack: (id, dir) =>
      mutate((p) => {
        const i = p.tracks.findIndex((t) => t.id === id), j = i + dir;
        if (i < 0 || j < 0 || j >= p.tracks.length || p.tracks[i].kind !== p.tracks[j].kind) return p;
        const tracks = [...p.tracks];
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        return { ...p, tracks };
      }),

    removeTrack: (id) =>
      mutate((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== id), clips: p.clips.filter((c) => c.trackId !== id) })),

    updateClip: (id, patch, history = true) =>
      mutate((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), history),

    splitAtPlayhead: () => {
      const { project, time, selectedIds } = get();
      const inside = (c: Clip) => time > c.start + MIN_CLIP / 2 && time < c.start + c.duration - MIN_CLIP / 2;
      const targets = new Set(project.clips.filter((c) => inside(c) && (selectedIds.length ? selectedIds.includes(c.id) : true)).map((c) => c.id));
      if (!targets.size) return;
      mutate((p) => ({ ...p, clips: p.clips.flatMap((c) => (targets.has(c.id) ? splitClipAt(c, time, uid()) : [c])) }));
    },

    deleteSelected: () => {
      const { selectedIds, selectedId } = get();
      const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
      if (!ids.length) return;
      mutate((p) => ({ ...p, clips: p.clips.filter((c) => !ids.includes(c.id)) }));
      set({ selectedId: null, selectedIds: [] });
    },

    duplicateSelected: () => {
      const { project, selectedIds, selectedId } = get();
      const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
      const sel = project.clips.filter((c) => ids.includes(c.id));
      if (!sel.length) return;
      const span = Math.max(...sel.map((c) => c.start + c.duration)) - Math.min(...sel.map((c) => c.start));
      const all = [...project.clips];
      const copies: Clip[] = [];
      for (const c of sel) {
        let start = c.start + span;
        while (overlaps(all, c.trackId, start, c.duration)) start += span;
        const copy = { ...c, id: uid(), start, linkId: undefined };
        all.push(copy); copies.push(copy);
      }
      mutate((p) => ({ ...p, clips: [...p.clips, ...copies] }));
      set({ selectedId: copies[copies.length - 1].id, selectedIds: copies.map((c) => c.id) });
    },

    chooseFolder: async () => {
      set({ folderError: null });
      let h: FileSystemDirectoryHandle;
      try {
        if (!fsSupported()) throw new TypeError("showDirectoryPicker is not available");
        h = await pickDirectory();
      } catch (e) {
        const ex = e as DOMException;
        // a genuine Cancel is silent; but automation-controlled windows also reject with AbortError ("Intercepted by …")
        if (ex?.name === "AbortError" && !/intercept|automation|setInterceptFileChooserDialog/i.test(ex.message ?? "")) return;
        console.warn("Folder picker failed:", e);
        set({ folderError: explainFolderError(e) });
        return;
      }
      try {
        await get().attachFolder(h);
      } catch (e) {
        console.warn("Could not use the folder:", e);
        set({ busy: null, folderError: `Could not use this folder: ${(e as Error)?.message ?? e}. Try creating a new empty folder and choosing it.` });
      }
    },

    attachFolder: async (h) => {
      if (!(await hasPermission(h, true))) {
        set({ folderError: "Permission to read and write this folder was not granted. Click “Choose folder” again and allow access." });
        return;
      }
      const existing = await readProjectJson(h);
      if (existing) {
        await loadFromFolder(h, existing);
        set({ folderError: null, memoryMode: false });
        await get().scanMedia(true);
      } else {
        // new folder: write the current project (and its media) into it
        set({ dir: h, busy: "Saving to folder…" });
        try {
          const p = get().project;
          const media = [...p.media];
          for (const m of media) {
            const f = get().files[m.id];
            if (f && !m.path) {
              m.path = `media/${m.id}-${safeName(m.name)}`;
              await writeFile(h, m.path, f);
            }
          }
          set({ project: { ...p, media }, folderError: null, memoryMode: false });
          await get().saveNow();
          set({ busy: null });
          await get().scanMedia(true);
        } catch (e) {
          set({ dir: null });
          throw e;
        } finally {
          set({ busy: null });
        }
      }
    },

    saveNow: async () => {
      const { dir, project } = get();
      if (!dir) return;
      set({ saveStatus: "saving" });
      try {
        await saveProjectJson(dir, project);
        if (Date.now() - lastBackup > 60_000) {
          lastBackup = Date.now();
          await writeFile(dir, `backups/project-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(project));
          await pruneBackups(dir, 10);
        }
        set({ saveStatus: "saved" });
      } catch (e) {
        console.error(e);
        set({ saveStatus: "error" });
      }
    },

    newProject: () => {
      for (const u of Object.values(get().urls)) URL.revokeObjectURL(u);
      set({ project: newProject(), files: {}, urls: {}, thumbs: {}, missing: {}, waves: {}, lutData: {}, past: [], future: [], time: 0, playing: false, selectedId: null, selectedIds: [], dir: null, saveStatus: "idle" });
    },
  };
});

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __editor: typeof useEditor }).__editor = useEditor; // dev-only test hook

/* autosave (debounced) whenever the project changes and a folder is attached */
if (typeof window !== "undefined") {
  let last = useEditor.getState().project;
  useEditor.subscribe((s) => {
    if (s.project === last) return;
    last = s.project;
    if (!s.dir) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => useEditor.getState().saveNow(), 700);
  });
}

export { projectDuration, trackKindFor, fileExists };
