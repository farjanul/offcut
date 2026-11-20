"use client";
import { useRef, useState } from "react";
import { Film, ImageIcon, Mic, Music, Plus, Square, Sparkles, Trash2, Type, Upload, Wand2, Smile, Layers, FileText, ArrowLeftRight, Volume2, Pencil, Play, RefreshCw } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fmtTime } from "@/lib/types";
import SourceMonitor from "./SourceMonitor";
import { alertDialog, confirmDialog, promptDialog } from "@/lib/dialog";
import { SFX, SFX_CATS, Sfx, bufferToWav, previewSfx, renderSfx } from "@/lib/sfx";
import { TEXT_CATS, type TextCat, NOTE_ANIMS, NOTE_COLORS, NOTE_KINDS, TEXT_ANIMS, TEXT_LOOPS, ANIMS, EFFECTS, FILTER_PRESETS, SHAPES, STICKERS, TEXT_PRESETS, TRANSITIONS, filterCss, presetFilter, prevAdjacent } from "@/lib/effects";

type Tab = "media" | "text" | "stickers" | "effects" | "fx" | "trans" | "anim" | "sfx" | "annot";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "media", label: "Media", icon: <Film size={16} /> },
  { id: "text", label: "Titles", icon: <Type size={16} /> },
  { id: "stickers", label: "Sticker", icon: <Smile size={16} /> },
  { id: "sfx", label: "Sound", icon: <Volume2 size={16} /> },
  { id: "annot", label: "Annotate", icon: <Pencil size={16} /> },
  { id: "effects", label: "Filters", icon: <Wand2 size={16} /> },
  { id: "fx", label: "Effects", icon: <Sparkles size={16} /> },
  { id: "trans", label: "Trans", icon: <ArrowLeftRight size={16} /> },
  { id: "anim", label: "Anim", icon: <Layers size={16} /> },
];

export default function MediaPanel() {
  const [tab, setTab] = useState<Tab>("media");
  return (
    <div className="flex h-full">
      <nav className="flex w-14 shrink-0 flex-col items-stretch overflow-y-auto border-r border-[var(--line)] py-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 py-1.5 text-[10px] ${tab === t.id ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-white"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {tab === "media" && <MediaTab />}
        {tab === "text" && <TextTab />}
        {tab === "stickers" && <StickerTab />}
        {tab === "sfx" && <SfxTab />}
        {tab === "annot" && <AnnotTab />}
        {tab === "effects" && <FilterTab />}
        {tab === "fx" && <FxTab />}
        {tab === "trans" && <TransTab />}
        {tab === "anim" && <AnimTab />}
      </div>
    </div>
  );
}

/* ---------------- media ---------------- */
function MediaTab() {
  const { project, thumbs, missing, importFiles, addClipFromMedia, removeMedia, scanMedia, dir } = useEditor();
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rec, setRec] = useState<{ mr: MediaRecorder; t0: number } | null>(null);
  const [q, setQ] = useState("");
  const [bin, setBinFilter] = useState("");
  const [src, setSrc] = useState<string | null>(null);
  const setBin = useEditor((s) => s.setBin);
  const bins = Array.from(new Set(project.media.map((m) => m.bin).filter(Boolean))) as string[];
  const shown = project.media.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) && (!bin || m.bin === bin));

  const toggleRec = async () => {
    if (rec) { rec.mr.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const at = useEditor.getState().time;
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        const file = new File(chunks, `Voiceover ${new Date().toLocaleTimeString().replace(/:/g, "-")}.webm`, { type: "audio/webm" });
        const [m] = await importFiles([file]);
        if (m) useEditor.getState().addClipFromMedia(m.id, undefined, at);
      };
      mr.start();
      setRec({ mr, t0: Date.now() });
    } catch { void alertDialog({ title: "Microphone blocked", message: "Allow microphone access for this site in the browser, then try again." }); }
  };

  return (
    <div className="flex h-full flex-col"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); importFiles(Array.from(e.dataTransfer.files)); }}
    >
      <div className="flex gap-2 border-b border-[var(--line)] p-3">
        <button className="btn btn-primary flex-1 justify-center" onClick={() => input.current?.click()}><Upload size={15} /> Import</button>
        <button className={`btn ${rec ? "!bg-red-600 !text-white" : ""}`} onClick={toggleRec} title="Record voiceover at playhead">
          {rec ? <><Square size={13} /> Stop</> : <><Mic size={15} /></>}
        </button>
        {dir && (
          <button className="btn" title="Rescan the project’s media/ folder for new files" disabled={scanBusy}
            onClick={async () => { setScanBusy(true); const n = await scanMedia(false); setScanBusy(false); setScanMsg(n ? `${n} new file${n > 1 ? "s" : ""} found` : "No new files in media/"); setTimeout(() => setScanMsg(""), 3000); }}>
            <RefreshCw size={15} className={scanBusy ? "animate-spin" : ""} />
          </button>
        )}
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*"
          onChange={(e) => { importFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {scanMsg && <div className="bg-[var(--accent)]/15 px-3 py-1 text-[11px] text-[var(--accent)]">{scanMsg}</div>}
      <div className="border-b border-[var(--line)] px-3 py-2">
        <input className="field" placeholder="Search media…" value={q} onChange={(e) => setQ(e.target.value)} />
        {bins.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {["", ...bins].map((b) => (
              <button key={b || "all"} onClick={() => setBinFilter(b)} className={`btn !px-2 !py-0.5 text-[11px] ${bin === b ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}>{b || "All"}</button>
            ))}
          </div>
        )}
      </div>
      {src && <SourceMonitor mediaId={src} onClose={() => setSrc(null)} />}
      <div className={`min-h-0 flex-1 overflow-y-auto p-3 ${over ? "bg-[var(--accent)]/10 outline-dashed outline-1 outline-[var(--accent)]" : ""}`}>
        {project.media.length === 0 ? (
          <div className="mt-10 text-center text-[var(--muted)]">
            <Upload className="mx-auto mb-2 opacity-60" />
            Drop video, audio or images here<br />
            <span className="text-xs">Files are processed locally — never uploaded.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {shown.map((m) => (
              <div key={m.id} draggable
                onDragStart={(e) => { e.dataTransfer.setData("application/x-media-id", m.id); e.dataTransfer.effectAllowed = "copy"; }}
                onDoubleClick={() => setSrc(m.id)}
                className="group relative overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel2)]"
                title="Drag to the timeline · double-click opens the source monitor">
                <div className="flex aspect-video items-center justify-center bg-black">
                  {thumbs[m.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[m.id]} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : m.kind === "audio" ? <Music className="text-[var(--muted)]" /> : m.kind === "video" ? <Film className="text-[var(--muted)]" /> : <ImageIcon className="text-[var(--muted)]" />}
                </div>
                {missing[m.id] && <div className="absolute inset-x-0 top-0 bg-red-600/80 px-1 text-center text-[10px]">File missing</div>}
                <div className="px-1.5 py-1">
                  <div className="truncate text-xs">{m.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">{m.kind}{m.kind !== "image" && ` · ${fmtTime(m.duration)}`}</div>
                </div>
                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button className="rounded bg-black/70 p-1 hover:bg-[var(--accent)] hover:text-black" onClick={(e) => addClipFromMedia(m.id, undefined, undefined, { mode: e.shiftKey ? "insert" : e.altKey ? "overwrite" : "auto" })} title="Add at playhead (Shift = insert, Alt = overwrite)"><Plus size={13} /></button>
                  <button className="rounded bg-black/70 px-1 text-[10px] hover:bg-[var(--accent)] hover:text-black" onClick={async () => { const b = await promptDialog({ title: "Move to bin", message: "Type a folder (bin) name. Leave empty to remove it from any bin.", value: m.bin ?? "", placeholder: "e.g. Interviews", confirmLabel: "Move" }); if (b !== null) setBin(m.id, b.trim()); }} title="Move to bin">bin</button>
                  <button className="rounded bg-black/70 p-1 hover:bg-red-500" title="Delete (also removes the file from the project folder)"
                    onClick={async () => {
                      const st = useEditor.getState();
                      const used = st.project.clips.filter((c) => c.mediaId === m.id).length;
                      const ok = await confirmDialog({
                        title: "Delete this media?",
                        message: `“${m.name}”\n\n${st.dir ? "The file will be deleted from the project folder. " : "It will be removed from the project. "}${used ? `${used} clip${used > 1 ? "s" : ""} on the timeline that use${used > 1 ? "" : "s"} it will be removed too. ` : ""}This cannot be undone.`,
                        confirmLabel: "Delete", danger: true,
                      });
                      if (ok) removeMedia(m.id);
                    }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- text ---------------- */
function PresetChip({ p }: { p: Partial<import("@/lib/types").Clip> }) {
  const lines = (p.text ?? "").split("\n");
  const base = Math.max(11, Math.min(22, (p.fontSize ?? 96) / 8));
  const style = (i: number): React.CSSProperties => {
    const desired = base * (i ? Math.min(1, p.line2Scale ?? 1) : 1) * (i && (p.line2Scale ?? 1) > 0.8 ? 0.8 : 1);
    const len = Math.max(4, (lines[i] ?? "").length);
    const size = Math.min(desired, 92 / (len * (0.62 + (p.spacing ?? 0) / 8 / Math.max(10, desired)))); // keep the sample inside the card
    const color = i && p.line2Color ? p.line2Color : p.color ?? "#fff";
    const bold = i && p.line2Bold !== undefined ? p.line2Bold : p.bold !== false;
    const grad = p.color2 && !(i && p.line2Color);
    return {
      fontFamily: p.fontFamily, fontWeight: bold ? 700 : 400, fontStyle: p.italic ? "italic" : "normal", fontSize: Math.max(6, size),
      letterSpacing: `${(p.spacing ?? 0) / 8}px`, textTransform: p.upper ? "uppercase" : "none", lineHeight: 1.15, whiteSpace: "nowrap",
      color: grad ? "transparent" : color,
      backgroundImage: grad ? `linear-gradient(${color}, ${p.color2})` : undefined, WebkitBackgroundClip: grad ? "text" : undefined, backgroundClip: grad ? "text" : undefined,
      WebkitTextStroke: p.stroke && (p.strokeW ?? 0) > 0 ? `${Math.max(0.6, (p.strokeW ?? 0) / 9)}px ${p.stroke}` : undefined,
      textShadow: p.glow ? `0 0 8px ${p.glow}, 0 0 16px ${p.glow}` : undefined,
    };
  };
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center" style={{ background: p.bg || undefined, padding: p.bg ? "2px 8px" : 0, borderRadius: 4 }}>
        {lines.slice(0, 2).map((l, i) => <span key={i} style={style(i)}>{l}</span>)}
      </div>
    </div>
  );
}

function TextTab() {
  const addText = useEditor((s) => s.addText);
  const importSrt = useEditor((s) => s.importSrt);
  const srt = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<TextCat | "All">("All");
  const list = TEXT_PRESETS.filter((t) => cat === "All" || t.cat === cat);
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-[var(--line)] p-3">
        <button className="btn btn-primary w-full justify-center" onClick={() => addText()}><Type size={15} /> Add title</button>
        <button className="btn w-full justify-center" onClick={() => srt.current?.click()}><FileText size={15} /> Import subtitles (.srt)</button>
        <input ref={srt} type="file" accept=".srt,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) importSrt(await f.text()); e.target.value = ""; }} />
        <div className="flex flex-wrap gap-1">
          {(["All", ...TEXT_CATS] as const).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`btn !px-2 !py-0.5 text-[11px] ${cat === c ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {list.map((t) => (
            <button key={t.name} onClick={() => addText(t.p)} title={`${t.name} — two lines`}
              className="group overflow-hidden rounded-md border border-[var(--line)] bg-black text-left hover:border-[var(--accent)]">
              <div className="aspect-video p-1"><PresetChip p={t.p} /></div>
              <div className="bg-[var(--panel2)] px-1.5 py-1 text-[10px] text-[var(--muted)] group-hover:text-white">{t.name}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-[var(--muted)]">Each title has up to two lines — edit them in the right-hand panel.</p>
      </div>
    </div>
  );
}

/* ---------------- stickers ---------------- */
function StickerTab() {
  const addSticker = useEditor((s) => s.addSticker);
  const addShape = useEditor((s) => s.addShape);
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">Shapes</div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {SHAPES.map((sh) => (
          <button key={sh.id} onClick={() => addShape(sh.id)} className="flex flex-col items-center gap-1 rounded-md border border-[var(--line)] p-2 text-xs hover:border-[var(--accent)]">
            <div style={{ width: 44 * Math.min(1, sh.sw * 2), height: 24, background: sh.fill, borderRadius: sh.id === "ellipse" ? "50%" : 3, minWidth: 24 }} />
            {sh.name}
          </button>
        ))}
      </div>
      <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">Stickers</div>
      <div className="grid grid-cols-4 gap-1">
        {STICKERS.map((e) => <button key={e} className="rounded p-1 text-2xl hover:bg-[var(--panel2)]" onClick={() => addSticker(e)}>{e}</button>)}
      </div>
    </div>
  );
}

/* ---------------- filters ---------------- */
function useSelected() {
  const id = useEditor((s) => s.selectedId);
  const clip = useEditor((s) => s.project.clips.find((c) => c.id === id));
  return clip && clip.type !== "audio" ? clip : undefined;
}

function FilterTab() {
  const clip = useSelected();
  const thumbs = useEditor((s) => s.thumbs);
  const updateClip = useEditor((s) => s.updateClip);
  const thumb = clip?.mediaId ? thumbs[clip.mediaId] : undefined;
  return (
    <div className="h-full overflow-y-auto p-3">
      {!clip && <p className="mb-3 text-xs text-amber-400">Select a video, image or text clip on the timeline first.</p>}
      <div className="grid grid-cols-2 gap-2">
        {FILTER_PRESETS.map((p) => (
          <button key={p.name} disabled={!clip} onClick={() => clip && updateClip(clip.id, { filter: presetFilter(p.f), vignette: p.vignette ?? 0 })}
            className="overflow-hidden rounded-md border border-[var(--line)] text-left hover:border-[var(--accent)] disabled:opacity-50">
            <div className="aspect-video bg-gradient-to-br from-sky-500 via-emerald-400 to-orange-400"
              style={{ filter: filterCss(presetFilter(p.f)), backgroundImage: thumb ? `url(${thumb})` : undefined, backgroundSize: "cover" }} />
            <div className="px-1.5 py-1 text-xs">{p.name}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--muted)]"><Sparkles size={11} className="inline" /> Fine-tune in the right-hand panel.</p>
    </div>
  );
}

/* ---------------- animations / transitions ---------------- */
function AnimTab() {
  const id = useEditor((s) => s.selectedId);
  const clip = useEditor((s) => s.project.clips.find((c) => c.id === id));
  const updateClip = useEditor((s) => s.updateClip);
  const [which, setWhich] = useState<"animIn" | "animOut">("animIn");
  const isText = clip?.type === "text";
  const list = isText ? [...ANIMS, ...TEXT_ANIMS] : clip?.type === "note" ? [...ANIMS, ...NOTE_ANIMS] : ANIMS;
  return (
    <div className="h-full overflow-y-auto p-3">
      {!clip && <p className="mb-3 text-xs text-amber-400">Select a clip on the timeline first.</p>}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-[var(--bg)] p-1 text-xs">
        {(["animIn", "animOut"] as const).map((w) => (
          <button key={w} onClick={() => setWhich(w)} className={`rounded py-1 ${which === w ? "bg-[var(--panel2)] text-[var(--accent)]" : "text-[var(--muted)]"}`}>{w === "animIn" ? "In / Transition" : "Out"}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.map((a) => (
          <button key={a.id} disabled={!clip} onClick={() => clip && updateClip(clip.id, { [which]: a.id })}
            className={`rounded-md border px-2 py-3 text-xs hover:border-[var(--accent)] disabled:opacity-50 ${clip?.[which] === a.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
            {a.name}
          </button>
        ))}
      </div>
      {isText && (
        <>
          <div className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-[var(--muted)]">Looping text motion</div>
          <div className="grid grid-cols-2 gap-2">
            {TEXT_LOOPS.map((a) => (
              <button key={a.id} onClick={() => updateClip(clip!.id, { textLoop: a.id })}
                className={`rounded-md border px-2 py-3 text-xs hover:border-[var(--accent)] ${clip?.textLoop === a.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
                {a.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- effects ---------------- */
function FxTab() {
  const id = useEditor((s) => s.selectedId);
  const clip = useEditor((s) => s.project.clips.find((c) => c.id === id));
  const updateClip = useEditor((s) => s.updateClip);
  const addAdjustment = useEditor((s) => s.addAdjustment);
  const ok = clip && clip.type !== "audio";
  return (
    <div className="h-full overflow-y-auto p-3">
      <button className="btn btn-primary mb-1 w-full justify-center" onClick={addAdjustment}><Layers size={15} /> Add adjustment layer</button>
      <p className="mb-4 text-[11px] text-[var(--muted)]">An adjustment layer applies filters &amp; effects to every track below it.</p>
      {!ok && <p className="mb-3 text-xs text-amber-400">Select a visual clip (or adjustment layer) to apply an effect.</p>}
      <div className="grid grid-cols-2 gap-2">
        {EFFECTS.map((f) => (
          <button key={f.id} disabled={!ok} onClick={() => ok && updateClip(clip!.id, { effect: f.id })}
            className={`rounded-md border px-2 py-3 text-xs hover:border-[var(--accent)] disabled:opacity-50 ${clip?.effect === f.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
            {f.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--muted)]">Pixelate, chroma key, temperature/tint and effect strength are in the right-hand panel.</p>
    </div>
  );
}

/* ---------------- transitions between clips ---------------- */
function TransTab() {
  const id = useEditor((s) => s.selectedId);
  const project = useEditor((s) => s.project);
  const setTransition = useEditor((s) => s.setTransition);
  const applyAll = useEditor((s) => s.applyTransitionAll);
  const [msg, setMsg] = useState("");
  const clip = project.clips.find((c) => c.id === id);
  const hasPrev = !!clip && !!prevAdjacent(project.clips, clip);
  const apply = (t: string) => {
    if (!clip) return setMsg("Select the clip that comes AFTER the cut.");
    if (!setTransition(clip.id, t)) setMsg("This clip has no clip right before it on the same track. Place two clips back-to-back.");
    else setMsg("");
  };
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Select the second clip of two back-to-back clips, then choose a transition. It plays over the first seconds of that clip (length is adjustable in the right panel).
      </p>
      {clip && !hasPrev && <p className="mb-3 text-xs text-amber-400">Selected clip has no neighbour before it.</p>}
      {msg && <p className="mb-3 text-xs text-amber-400">{msg}</p>}
      <div className="grid grid-cols-2 gap-2">
        {TRANSITIONS.map((t) => (
          <button key={t.id} onClick={() => apply(t.id)}
            className={`rounded-md border px-2 py-3 text-xs hover:border-[var(--accent)] ${clip?.transIn === t.id ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
            {t.name}
          </button>
        ))}
      </div>
      <button className="btn mt-3 w-full justify-center" onClick={() => { const t = clip?.transIn && clip.transIn !== "none" ? clip.transIn : "dissolve"; applyAll(t); }}>Apply to all cuts</button>
    </div>
  );
}

/* ---------------- sound effects (synthesised locally) ---------------- */
function SfxTab() {
  const [cat, setCat] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const importFiles = useEditor((s) => s.importFiles);
  const list = SFX.filter((x) => cat === "All" || x.cat === cat);
  const add = async (x: Sfx) => {
    setBusy(x.id);
    try {
      const name = `SFX ${x.name}.wav`;
      let m = useEditor.getState().project.media.find((q) => q.name === name);
      if (!m) {
        const file = new File([bufferToWav(await renderSfx(x))], name, { type: "audio/wav" });
        [m] = await importFiles([file]);
      }
      if (m) useEditor.getState().addClipFromMedia(m.id);
    } finally { setBusy(null); }
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-[var(--line)] p-2">
        {["All", ...SFX_CATS].map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`btn !px-2 !py-0.5 text-[11px] ${cat === c ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}>{c}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {list.map((x) => (
          <div key={x.id} className="mb-1 flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel2)] px-2 py-1.5">
            <button className="rounded-full bg-black/40 p-1.5 hover:bg-[var(--accent)] hover:text-black" title="Preview" onClick={() => previewSfx(x)}><Play size={12} /></button>
            <div className="min-w-0 flex-1"><div className="truncate text-xs">{x.name}</div><div className="text-[10px] text-[var(--muted)]">{x.cat} · {x.dur.toFixed(1)}s</div></div>
            <button className="btn !px-2 !py-0.5 text-[11px]" disabled={busy === x.id} onClick={() => add(x)} title="Add to the timeline at the playhead">{busy === x.id ? "…" : <><Plus size={12} /> Add</>}</button>
          </div>
        ))}
        <p className="mt-2 text-[10px] text-[var(--muted)]">Generated on your device — no downloads. Added sounds are saved into the project folder.</p>
      </div>
    </div>
  );
}

/* ---------------- annotation tools ---------------- */
function AnnotTab() {
  const annot = useEditor((s) => s.annot);
  const setAnnot = useEditor((s) => s.setAnnot);
  const [cfg, setCfg] = useState({ color: "#ff3b30", width: 8, fill: 0 });
  const pick = (kind: (typeof NOTE_KINDS)[number]["id"]) => setAnnot({ kind, ...cfg });
  const upd = (p: Partial<typeof cfg>) => { const n = { ...cfg, ...p }; setCfg(n); if (annot) setAnnot({ ...annot, ...n }); };
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--muted)]">Pick a tool, then draw directly on the video preview. Each annotation becomes a clip on the timeline (3 s) that you can move, trim or animate.</p>
      <div className="grid grid-cols-2 gap-2">
        {NOTE_KINDS.map((k) => (
          <button key={k.id} onClick={() => pick(k.id)} title={k.hint}
            className={`rounded-md border px-2 py-3 text-xs hover:border-[var(--accent)] ${annot?.kind === k.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)]"}`}>
            {k.name}
          </button>
        ))}
      </div>
      <div className="mb-1 mt-4 text-[11px] uppercase tracking-wide text-[var(--muted)]">Colour</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {NOTE_COLORS.map((c) => (
          <button key={c} onClick={() => upd({ color: c })} className="h-6 w-6 rounded-full border-2" style={{ background: c, borderColor: cfg.color === c ? "var(--accent)" : "#2a2e37" }} />
        ))}
      </div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Thickness · {cfg.width}</div>
      <input type="range" className="mb-3 w-full" min={2} max={40} value={cfg.width} onChange={(e) => upd({ width: +e.target.value })} />
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Box / circle fill · {cfg.fill}%</div>
      <input type="range" className="mb-3 w-full" min={0} max={100} value={cfg.fill} onChange={(e) => upd({ fill: +e.target.value })} />
      {annot && <button className="btn w-full justify-center" onClick={() => setAnnot(null)}>Stop annotating (Esc)</button>}
    </div>
  );
}
