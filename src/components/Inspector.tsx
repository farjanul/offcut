"use client";
import CurveEditor from "./CurveEditor";
import { Diamond, Copy, Scissors, Trash2, Unlink, FlipHorizontal2, FlipVertical2, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";
import { Clip, DEFAULT_FILTER, fmtTime } from "@/lib/types";
import { CROP_RATIOS, MASK_SHAPES, NOTE_ANIMS, NOTE_COLORS, TEXT_ANIMS, TEXT_LOOPS, cropForRatio } from "@/lib/effects";
import { ANIMS, BLENDS, EFFECTS, FONTS, FONT_LABELS, KeyProp, TRANSITIONS, hasKeyAt, prevAdjacent, removeKey, upsertKey, valueAt } from "@/lib/effects";

const ASPECTS = [
  { label: "16:9 · 1920×1080", w: 1920, h: 1080 },
  { label: "9:16 · 1080×1920", w: 1080, h: 1920 },
  { label: "1:1 · 1080×1080", w: 1080, h: 1080 },
  { label: "4:3 · 1440×1080", w: 1440, h: 1080 },
  { label: "16:9 · 1280×720", w: 1280, h: 720 },
  { label: "9:16 · 720×1280", w: 720, h: 1280 },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      {children}
    </label>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border-t border-[var(--line)] pt-3">
      <div className="mb-3 text-xs font-semibold text-[var(--accent)]">{title}</div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, onStart, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; onStart: () => void; fmt?: (v: number) => string;
}) {
  return (
    <Row label={`${label} · ${fmt ? fmt(value) : value}`}>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value}
        onPointerDown={onStart} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </Row>
  );
}

/** slider with a keyframe diamond (Premiere-style animated property) */
function KSlider({ clip, prop, label, min, max, step, factor = 1, fmt, time }: {
  clip: Clip; prop: KeyProp; label: string; min: number; max: number; step: number; factor?: number; fmt?: (v: number) => string; time: number;
}) {
  const { updateClip, pushHistory } = useEditor();
  const tl = Math.max(0, Math.min(clip.duration, time - clip.start));
  const cur = valueAt(clip, prop, time);
  const keyed = !!clip.keys?.[prop]?.length;
  const on = hasKeyAt(clip, prop, tl);
  const shown = Math.round(cur * factor * 100) / 100;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--muted)]">
        <span>{label} · {fmt ? fmt(shown) : shown}</span>
        <span className="flex items-center gap-1">
        {keyed && (
          <>
            <button title="Previous keyframe" className="hover:text-white" onClick={() => { const k = [...clip.keys[prop]].reverse().find((q) => q.t < tl - 0.01); if (k) engine.seek(clip.start + k.t); }}>‹</button>
            <button title="Next keyframe" className="hover:text-white" onClick={() => { const k = clip.keys[prop].find((q) => q.t > tl + 0.01); if (k) engine.seek(clip.start + k.t); }}>›</button>
            {on && (
              <button title="Toggle hold (step) interpolation for this keyframe" className={clip.keys[prop].find((q) => Math.abs(q.t - tl) < 0.02)?.hold ? "text-amber-300" : "hover:text-white"}
                onClick={() => { pushHistory(); updateClip(clip.id, { keys: { ...clip.keys, [prop]: clip.keys[prop].map((q) => (Math.abs(q.t - tl) < 0.02 ? { ...q, hold: !q.hold } : q)) } }, false); }}>▭</button>
            )}
          </>
        )}
        <button title={on ? "Remove keyframe" : "Add keyframe at playhead"} className={on ? "text-amber-300" : keyed ? "text-amber-300/60" : "hover:text-white"}
          onClick={() => { pushHistory(); updateClip(clip.id, on ? { keys: removeKey(clip, prop, tl), ...(keyed && clip.keys[prop].length === 1 ? { [prop]: cur } : {}) } : { keys: upsertKey(clip, prop, tl, cur) }, false); }}>
          <Diamond size={13} fill={on ? "currentColor" : "none"} />
        </button>
        </span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={shown}
        onPointerDown={pushHistory}
        onChange={(e) => {
          const v = parseFloat(e.target.value) / factor;
          updateClip(clip.id, keyed ? { keys: upsertKey(clip, prop, tl, v) } : { [prop]: v }, false);
        }} />
    </div>
  );
}

export default function Inspector() {
  const { project, selectedId, updateClip, pushHistory, patchProject, deleteSelected, duplicateSelected, splitAtPlayhead, setSpeed, detachAudio } = useEditor();
  const clip = project.clips.find((c) => c.id === selectedId);
  const time = useEditor((s) => (s.playing ? 0 : s.time));

  if (!clip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 font-semibold">Project</h3>
        <Row label="Canvas size">
          <select className="field" value={`${project.width}x${project.height}`}
            onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); patchProject({ width: w, height: h }); }}>
            {ASPECTS.map((a) => <option key={a.label} value={`${a.w}x${a.h}`}>{a.label}</option>)}
          </select>
        </Row>
        <Row label="Frame rate">
          <select className="field" value={project.fps} onChange={(e) => patchProject({ fps: parseInt(e.target.value) })}>
            {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </Row>
        <Row label="Background colour">
          <input type="color" className="h-8 w-full rounded border border-[var(--line)] bg-transparent" value={project.bg ?? "#000000"} onChange={(e) => patchProject({ bg: e.target.value })} />
        </Row>
        <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
          Shortcuts<br />
          Space — play/pause · S — split at playhead<br />
          Del — delete · Shift+Del — ripple delete<br />
          ⌘/Ctrl+D — duplicate · ⌘/Ctrl+Z — undo · Shift+Z — redo<br />
          ←/→ — frame step · Ctrl+scroll on timeline — zoom<br />
          Drag clips in the preview to move; drag a corner to scale.
        </p>
      </div>
    );
  }

  const set = (patch: Partial<Clip>) => updateClip(clip.id, patch, false);
  const setFilter = (patch: Partial<Clip["filter"]>) => updateClip(clip.id, { filter: { ...clip.filter, ...patch } }, false);
  const visual = clip.type !== "audio";
  const hasAudio = clip.type === "video" || clip.type === "audio";
  const timed = clip.type === "video" || clip.type === "audio";
  const pct = (v: number) => `${v}%`;
  const animList = clip.type === "text" ? [...ANIMS, ...TEXT_ANIMS] : clip.type === "note" ? [...ANIMS, ...NOTE_ANIMS] : ANIMS;
  const med = clip.mediaId ? project.media.find((m) => m.id === clip.mediaId) : undefined;

  return (
    <div className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="truncate font-semibold capitalize">{clip.type} clip</h3>
        <div className="flex gap-1">
          <button className="btn !p-1.5" onClick={splitAtPlayhead} title="Split (S)"><Scissors size={14} /></button>
          <button className="btn !p-1.5" onClick={duplicateSelected} title="Duplicate"><Copy size={14} /></button>
          <button className="btn !p-1.5 hover:!bg-red-600" onClick={deleteSelected} title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="mb-3 truncate text-xs text-[var(--muted)]">{clip.name}</div>
      <div className="mb-4 grid grid-cols-2 gap-2 font-mono text-xs text-[var(--muted)]">
        <div>Start {fmtTime(clip.start)}</div><div>Length {fmtTime(clip.duration)}</div>
      </div>

      {clip.type === "text" && (
        <Section title="Title text">
          {(() => {
            const lines = (clip.text ?? "").split("\n");
            const two = lines.length <= 2;
            return two ? (
              <>
                <Row label="Line 1"><input className="field" value={lines[0] ?? ""} onFocus={pushHistory} onChange={(e) => updateClip(clip.id, { text: lines.length > 1 ? `${e.target.value}\n${lines[1]}` : e.target.value, name: e.target.value.slice(0, 24) || "Text" }, false)} /></Row>
                <Row label="Line 2 (optional)"><input className="field" value={lines[1] ?? ""} onFocus={pushHistory} onChange={(e) => updateClip(clip.id, { text: e.target.value === "" ? lines[0] ?? "" : `${lines[0] ?? ""}\n${e.target.value}` }, false)} /></Row>
              </>
            ) : (
              <Row label="Content"><textarea className="field" rows={4} value={clip.text} onFocus={pushHistory} onChange={(e) => set({ text: e.target.value, name: e.target.value.split("\n")[0].slice(0, 24) || "Text" })} /></Row>
            );
          })()}
          <Row label="Font">
            <select className="field" value={clip.fontFamily ?? FONTS[0]} onChange={(e) => updateClip(clip.id, { fontFamily: e.target.value })}>
              {FONTS.map((f, i) => <option key={f} value={f} style={{ fontFamily: f }}>{FONT_LABELS[i]}</option>)}
            </select>
          </Row>
          <div className="mb-3 flex gap-2">
            <button className={`btn flex-1 justify-center font-bold ${clip.bold !== false ? "!border-[var(--accent)]" : ""}`} onClick={() => updateClip(clip.id, { bold: clip.bold === false })}>B</button>
            <button className={`btn flex-1 justify-center italic ${clip.italic ? "!border-[var(--accent)]" : ""}`} onClick={() => updateClip(clip.id, { italic: !clip.italic })}>I</button>
            <button className={`btn flex-1 justify-center text-xs ${clip.upper ? "!border-[var(--accent)]" : ""}`} onClick={() => updateClip(clip.id, { upper: !clip.upper })} title="UPPERCASE">AA</button>
          </div>
          <Row label="Looping motion">
            <select className="field" value={clip.textLoop} onChange={(e) => updateClip(clip.id, { textLoop: e.target.value })}>{TEXT_LOOPS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </Row>
          <Slider label="Size (line 1)" value={clip.fontSize ?? 96} min={20} max={400} step={2} onStart={pushHistory} onChange={(v) => set({ fontSize: v })} />
          <Slider label="Letter spacing" value={clip.spacing} min={-5} max={40} step={1} fmt={(v) => `${v}px`} onStart={pushHistory} onChange={(v) => set({ spacing: v })} />
          <div className="mb-3 grid grid-cols-3 gap-2 text-[10px] uppercase text-[var(--muted)]">
            <label>Text<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.color ?? "#ffffff").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ color: e.target.value })} /></label>
            <label>Outline<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={clip.stroke || "#000000"} onFocus={pushHistory} onChange={(e) => set({ stroke: e.target.value, strokeW: clip.strokeW || 6 })} /></label>
            <label>Box<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.bg || "#000000").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ bg: e.target.value + "cc" })} /></label>
            <label>Gradient<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.color2 || "#ff2d92").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ color2: e.target.value })} /></label>
            <label>Glow<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.glow || "#22d3c5").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ glow: e.target.value })} /></label>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button className="btn justify-center text-xs" onClick={() => updateClip(clip.id, { bg: "" })}>No box</button>
            <button className="btn justify-center text-xs" onClick={() => updateClip(clip.id, { strokeW: 0, stroke: "" })}>No outline</button>
            <button className="btn justify-center text-xs" onClick={() => updateClip(clip.id, { color2: "" })}>No gradient</button>
            <button className="btn justify-center text-xs" onClick={() => updateClip(clip.id, { glow: "" })}>No glow</button>
          </div>
          {!!clip.strokeW && <Slider label="Outline width" value={clip.strokeW} min={1} max={30} step={1} onStart={pushHistory} onChange={(v) => set({ strokeW: v })} />}
          {(clip.text ?? "").includes("\n") && (
            <div className="mt-2 rounded border border-[var(--line)] p-2">
              <div className="mb-2 text-xs font-semibold text-[var(--accent)]">Line 2 style</div>
              <Slider label="Size (× line 1)" value={Math.round((clip.line2Scale || 1) * 100)} min={20} max={120} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ line2Scale: v / 100 })} />
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--muted)]">
                <label className="flex-1">Colour<input type="color" className="mt-1 h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.line2Color || clip.color || "#ffffff").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ line2Color: e.target.value })} /></label>
                <button className={`btn mt-4 justify-center text-xs font-bold ${clip.line2Bold === false ? "" : "!border-[var(--accent)]"}`} onClick={() => updateClip(clip.id, { line2Bold: clip.line2Bold === false ? true : false })}>B</button>
                <button className="btn mt-4 justify-center text-xs" onClick={() => updateClip(clip.id, { line2Color: "" })}>Same</button>
              </div>
            </div>
          )}
        </Section>
      )}

      {timed && (
        <Section title="Speed">
          <Slider label="Speed" value={clip.speed} min={0.1} max={4} step={0.05} fmt={(v) => `${v.toFixed(2)}x`} onStart={pushHistory} onChange={(v) => setSpeed(clip.id, v)} />
          <div className="mb-3 flex flex-wrap gap-1">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((v) => <button key={v} className="btn !px-2 !py-0.5 text-xs" onClick={() => { pushHistory(); setSpeed(clip.id, v); }}>{v}x</button>)}
          </div>
          {clip.type === "video" && (
            <>
              <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={clip.reverse} onChange={(e) => { pushHistory(); set({ reverse: e.target.checked }); }} /> Reverse (silent, seek-based)</label>
              <Slider label="Speed ramp → end speed" value={clip.rampTo} min={0} max={8} step={0.1} fmt={(v) => (v ? `${v.toFixed(1)}x` : "off")} onStart={pushHistory} onChange={(v) => set({ rampTo: v })} />
            </>
          )}
        </Section>
      )}

      {hasAudio && (
        <Section title="Audio">
          <KSlider clip={clip} prop="volume" label="Volume" min={0} max={200} step={1} factor={100} fmt={pct} time={time} />
          <Slider label="Pan" value={clip.pan} min={-100} max={100} step={1} fmt={(v) => (v === 0 ? "C" : v < 0 ? `L${-v}` : `R${v}`)} onStart={pushHistory} onChange={(v) => set({ pan: v })} />
          <Slider label="Bass" value={clip.bass} min={-12} max={12} step={1} fmt={(v) => `${v} dB`} onStart={pushHistory} onChange={(v) => set({ bass: v })} />
          <Slider label="Treble" value={clip.treble} min={-12} max={12} step={1} fmt={(v) => `${v} dB`} onStart={pushHistory} onChange={(v) => set({ treble: v })} />
          <Slider label="EQ mid frequency" value={clip.eqFreq} min={200} max={8000} step={50} fmt={(v) => `${v} Hz`} onStart={pushHistory} onChange={(v) => set({ eqFreq: v })} />
          <Slider label="EQ mid gain" value={clip.eqGain} min={-12} max={12} step={1} fmt={(v) => `${v} dB`} onStart={pushHistory} onChange={(v) => set({ eqGain: v })} />
          <Slider label="Noise reduction (gate)" value={clip.gate} min={0} max={100} step={1} fmt={(v) => (v ? `${v}` : "off")} onStart={pushHistory} onChange={(v) => set({ gate: v })} />
          <Slider label="Compressor" value={clip.comp} min={0} max={100} step={1} fmt={(v) => (v ? `${v}` : "off")} onStart={pushHistory} onChange={(v) => set({ comp: v })} />
          <Slider label="De-esser" value={clip.deess} min={0} max={100} step={1} fmt={(v) => (v ? `${v}` : "off")} onStart={pushHistory} onChange={(v) => set({ deess: v })} />
          <Slider label="Reverb" value={clip.reverb} min={0} max={100} step={1} fmt={(v) => (v ? `${v}%` : "off")} onStart={pushHistory} onChange={(v) => set({ reverb: v })} />
          <Slider label="Fade in" value={clip.fadeIn} min={0} max={Math.min(5, clip.duration)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ fadeIn: v })} />
          <Slider label="Fade out" value={clip.fadeOut} min={0} max={Math.min(5, clip.duration)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ fadeOut: v })} />
          {clip.type === "video" && <button className="btn w-full justify-center" onClick={detachAudio}><Unlink size={14} /> Detach audio</button>}
        </Section>
      )}

      {visual && (
        <>
          {clip.type === "note" && clip.note && (
            <Section title="Annotation">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {NOTE_COLORS.map((c) => (
                  <button key={c} onClick={() => updateClip(clip.id, { note: { ...clip.note!, color: c } })} className="h-6 w-6 rounded-full border-2" style={{ background: c, borderColor: clip.note!.color === c ? "var(--accent)" : "#2a2e37" }} />
                ))}
              </div>
              <Slider label="Thickness" value={clip.note.width} min={2} max={60} step={1} onStart={pushHistory} onChange={(v) => set({ note: { ...clip.note!, width: v } })} />
              {(clip.note.kind === "rect" || clip.note.kind === "ellipse") && <Slider label="Fill" value={clip.note.fill} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ note: { ...clip.note!, fill: v } })} />}
              {clip.note.kind === "badge" && (
                <Row label="Number / text"><input className="field" value={clip.note.label} onFocus={pushHistory} onChange={(e) => set({ note: { ...clip.note!, label: e.target.value.slice(0, 3) } })} /></Row>
              )}
              <p className="text-[11px] text-[var(--muted)]">Set <b>In → Draw on</b> in the Animation section for a hand-drawn reveal.</p>
            </Section>
          )}

          {clip.type === "shape" && (
            <Section title="Shape">
              <Row label="Type">
                <select className="field" value={clip.shape ?? "rect"} onChange={(e) => updateClip(clip.id, { shape: e.target.value as "rect" | "ellipse" })}>
                  <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option>
                </select>
              </Row>
              <Row label="Fill">
                <input type="color" className="h-8 w-full rounded border border-[var(--line)] bg-transparent" value={(clip.fill ?? "#ffffff").slice(0, 7)} onFocus={pushHistory} onChange={(e) => set({ fill: e.target.value })} />
              </Row>
              <Slider label="Width" value={Math.round((clip.sw ?? 0.4) * 100)} min={2} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ sw: v / 100 })} />
              <Slider label="Height" value={Math.round((clip.sh ?? 0.25) * 100)} min={2} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ sh: v / 100 })} />
            </Section>
          )}

          <Section title="Transform">
            {clip.type !== "adjust" && (
              <>
                <KSlider clip={clip} prop="scale" label="Scale" min={10} max={400} step={1} factor={100} fmt={pct} time={time} />
                <KSlider clip={clip} prop="x" label="Position X" min={-100} max={100} step={1} factor={100} time={time} />
                <KSlider clip={clip} prop="y" label="Position Y" min={-100} max={100} step={1} factor={100} time={time} />
                <KSlider clip={clip} prop="rotation" label="Rotation" min={-180} max={180} step={1} fmt={(v) => `${v}°`} time={time} />
              </>
            )}
            <KSlider clip={clip} prop="opacity" label="Opacity" min={0} max={100} step={1} factor={100} fmt={pct} time={time} />
            <div className="flex gap-2">
              <button className={`btn flex-1 justify-center ${clip.flipX ? "!border-[var(--accent)]" : ""}`} onClick={() => updateClip(clip.id, { flipX: !clip.flipX })} title="Flip horizontal"><FlipHorizontal2 size={14} /></button>
              <button className={`btn flex-1 justify-center ${clip.flipY ? "!border-[var(--accent)]" : ""}`} onClick={() => updateClip(clip.id, { flipY: !clip.flipY })} title="Flip vertical"><FlipVertical2 size={14} /></button>
              <button className="btn flex-1 justify-center" onClick={() => updateClip(clip.id, { x: 0, y: clip.type === "text" ? clip.y : 0, scale: 1, rotation: 0, flipX: false, flipY: false, opacity: 1 })} title="Reset transform"><RotateCcw size={14} /></button>
            </div>
          </Section>

          {(clip.type === "video" || clip.type === "image") && (
            <Section title="Crop">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Aspect ratio</div>
              <div className="mb-3 flex flex-wrap gap-1">
                <button className={`btn !px-2 !py-0.5 text-xs ${!clip.cropRatio ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}
                  onClick={() => { pushHistory(); set({ cropRatio: "", crop: [0, 0, 0, 0], cropPan: [0, 0] }); }}>Original</button>
                {CROP_RATIOS.map(([label, ratio]) => (
                  <button key={label} disabled={!med} className={`btn !px-2 !py-0.5 text-xs ${clip.cropRatio === label ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}
                    onClick={() => { if (!med) return; pushHistory(); set({ cropRatio: label, cropPan: [0, 0], crop: cropForRatio(med.width, med.height, ratio, 0, 0) }); }}>{label}</button>
                ))}
              </div>
              {clip.cropRatio && med && (
                <>
                  <Slider label="Move crop window — horizontal" value={Math.round(clip.cropPan[0] * 100)} min={-100} max={100} step={1} onStart={pushHistory}
                    onChange={(v) => set({ cropPan: [v / 100, clip.cropPan[1]], crop: cropForRatio(med.width, med.height, CROP_RATIOS.find((r) => r[0] === clip.cropRatio)![1], v / 100, clip.cropPan[1]) })} />
                  <Slider label="Move crop window — vertical" value={Math.round(clip.cropPan[1] * 100)} min={-100} max={100} step={1} onStart={pushHistory}
                    onChange={(v) => set({ cropPan: [clip.cropPan[0], v / 100], crop: cropForRatio(med.width, med.height, CROP_RATIOS.find((r) => r[0] === clip.cropRatio)![1], clip.cropPan[0], v / 100) })} />
                  <div className="mb-3 flex gap-2">
                    <button className="btn flex-1 justify-center text-xs" onClick={() => {
                      pushHistory();
                      const w = (1 - clip.crop[0] - clip.crop[2]) * med.width, h = (1 - clip.crop[1] - clip.crop[3]) * med.height;
                      const a = project.width / w, b = project.height / h;
                      set({ scale: Math.max(a, b) / Math.min(a, b), x: 0, y: 0 });
                    }} title="Scale up so the cropped picture fills the whole frame">Fill frame</button>
                    <button className="btn flex-1 justify-center text-xs" onClick={() => { pushHistory(); set({ scale: 1, x: 0, y: 0 }); }}>Fit in frame</button>
                  </div>
                </>
              )}
              <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Manual</div>
              {(["Left", "Top", "Right", "Bottom"] as const).map((lab, i) => (
                <Slider key={lab} label={lab} value={Math.round(clip.crop[i] * 100)} min={0} max={90} step={1} fmt={pct} onStart={pushHistory}
                  onChange={(v) => { const c = [...clip.crop] as Clip["crop"]; c[i] = v / 100; set({ crop: c, cropRatio: "" }); }} />
              ))}
            </Section>
          )}

          {clip.type !== "adjust" && (
            <Section title="Mask">
              <label className="mb-3 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!clip.mask} onChange={(e) => { pushHistory(); set({ mask: e.target.checked ? { shape: "ellipse", x: 0, y: 0, w: 0.6, h: 0.6, feather: 20, invert: false } : null }); }} /> Enable mask
              </label>
              {clip.mask && (
                <>
                  <Row label="Shape">
                    <select className="field" value={clip.mask.shape} onChange={(e) => updateClip(clip.id, { mask: { ...clip.mask!, shape: e.target.value as NonNullable<Clip["mask"]>["shape"] } })}>
                      {MASK_SHAPES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Row>
                  <Slider label="X" value={Math.round(clip.mask.x * 100)} min={-100} max={100} step={1} onStart={pushHistory} onChange={(v) => set({ mask: { ...clip.mask!, x: v / 100 } })} />
                  <Slider label="Y" value={Math.round(clip.mask.y * 100)} min={-100} max={100} step={1} onStart={pushHistory} onChange={(v) => set({ mask: { ...clip.mask!, y: v / 100 } })} />
                  <Slider label="Width" value={Math.round(clip.mask.w * 100)} min={5} max={200} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ mask: { ...clip.mask!, w: v / 100 } })} />
                  <Slider label="Height" value={Math.round(clip.mask.h * 100)} min={5} max={200} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ mask: { ...clip.mask!, h: v / 100 } })} />
                  <Slider label="Feather" value={clip.mask.feather} min={0} max={100} step={1} fmt={(v) => `${v}px`} onStart={pushHistory} onChange={(v) => set({ mask: { ...clip.mask!, feather: v } })} />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clip.mask.invert} onChange={(e) => { pushHistory(); set({ mask: { ...clip.mask!, invert: e.target.checked } }); }} /> Invert</label>
                </>
              )}
            </Section>
          )}

          {clip.type !== "adjust" && (
            <Section title="Track matte">
              <Row label="Matte clip">
                <select className="field" value={clip.matte?.id ?? ""} onChange={(e) => updateClip(clip.id, { matte: e.target.value ? { id: e.target.value, mode: clip.matte?.mode ?? "alpha", invert: clip.matte?.invert ?? false } : null })}>
                  <option value="">None</option>
                  {project.clips.filter((o) => o.id !== clip.id && o.type !== "audio" && o.type !== "adjust" && !o.matte).map((o) => <option key={o.id} value={o.id}>{o.type}: {o.name.slice(0, 24)}</option>)}
                </select>
              </Row>
              {clip.matte && (
                <>
                  <Row label="Mode">
                    <select className="field" value={clip.matte.mode} onChange={(e) => updateClip(clip.id, { matte: { ...clip.matte!, mode: e.target.value as "alpha" | "luma" } })}>
                      <option value="alpha">Alpha (shape / text / image)</option><option value="luma">Luma (brightness)</option>
                    </select>
                  </Row>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clip.matte.invert} onChange={(e) => updateClip(clip.id, { matte: { ...clip.matte!, invert: e.target.checked } })} /> Invert matte</label>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">The matte clip is hidden and only used as a stencil.</p>
                </>
              )}
            </Section>
          )}

          <Section title="Adjust & filter">
            <Slider label="Brightness" value={clip.filter.brightness} min={0} max={200} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => setFilter({ brightness: v })} />
            <Slider label="Contrast" value={clip.filter.contrast} min={0} max={200} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => setFilter({ contrast: v })} />
            <Slider label="Saturation" value={clip.filter.saturate} min={0} max={300} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => setFilter({ saturate: v })} />
            <Slider label="Hue" value={clip.filter.hue} min={-180} max={180} step={1} fmt={(v) => `${v}°`} onStart={pushHistory} onChange={(v) => setFilter({ hue: v })} />
            <Slider label="Blur" value={clip.filter.blur} min={0} max={30} step={0.5} fmt={(v) => `${v}px`} onStart={pushHistory} onChange={(v) => setFilter({ blur: v })} />
            <Slider label="Grayscale" value={clip.filter.grayscale} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => setFilter({ grayscale: v })} />
            <Slider label="Sepia" value={clip.filter.sepia} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => setFilter({ sepia: v })} />
            {clip.type !== "text" && <Slider label="Vignette" value={clip.vignette} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ vignette: v })} />}
            <button className="btn w-full justify-center" onClick={() => updateClip(clip.id, { filter: { ...DEFAULT_FILTER }, vignette: 0 })}><RotateCcw size={13} /> Reset adjustments</button>
          </Section>

          <Section title="Color · LUT / curves / wheels">
            {clip.type !== "adjust" && (
              <>
                <Row label="LUT (.cube)">
                  <select className="field" value={clip.lut} onChange={(e) => updateClip(clip.id, { lut: e.target.value })}>
                    <option value="">None</option>
                    {(project.luts ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Row>
                <label className="btn mb-3 w-full cursor-pointer justify-center text-xs">
                  Import LUT…
                  <input type="file" accept=".cube" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) useEditor.getState().importLut(f); e.target.value = ""; }} />
                </label>
                {clip.lut && <Slider label="LUT strength" value={clip.lutAmt} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ lutAmt: v })} />}
              </>
            )}
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Curves</div>
            <div className="mb-4"><CurveEditor value={clip.curves} onStart={pushHistory} onChange={(c) => set({ curves: c })} /></div>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <span>Color wheels</span>
              <button className="hover:text-white" onClick={() => { pushHistory(); set({ wheels: null }); }}>reset</button>
            </div>
            {(["shadows", "mids", "highs"] as const).map((k) => {
              const w = clip.wheels ?? { shadows: [0, 0], mids: [0, 0], highs: [0, 0] };
              return (
                <div key={k} className="mb-3 rounded border border-[var(--line)] p-2">
                  <div className="mb-1 text-xs capitalize">{k}</div>
                  <input type="range" className="mb-1 w-full" style={{ accentColor: `hsl(${w[k][0]} 80% 55%)` }} min={0} max={360} value={w[k][0]}
                    onPointerDown={pushHistory} onChange={(e) => set({ wheels: { ...w, [k]: [+e.target.value, w[k][1] || 40] } })} />
                  <Slider label="Amount" value={w[k][1]} min={0} max={100} step={1} onStart={pushHistory} onChange={(v) => set({ wheels: { ...w, [k]: [w[k][0], v] } })} />
                </div>
              );
            })}
          </Section>

          <Section title="Effects">
            <Row label="Effect">
              <select className="field" value={clip.effect} onChange={(e) => updateClip(clip.id, { effect: e.target.value })}>{EFFECTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </Row>
            {["rgb", "glitch", "grain"].includes(clip.effect) && <Slider label="Strength" value={clip.effectAmt} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ effectAmt: v })} />}
            {(clip.type === "video" || clip.type === "image") && <Slider label="Pixelate" value={clip.pixelate} min={0} max={60} step={1} fmt={(v) => (v ? `${v}px` : "off")} onStart={pushHistory} onChange={(v) => set({ pixelate: v })} />}
            <Slider label="Temperature" value={clip.temp} min={-100} max={100} step={1} onStart={pushHistory} onChange={(v) => set({ temp: v })} />
            <Slider label="Tint" value={clip.tint} min={-100} max={100} step={1} onStart={pushHistory} onChange={(v) => set({ tint: v })} />
            {clip.type !== "text" && clip.type !== "shape" && (
              <>
                <Row label="Chroma key (green screen)">
                  <select className="field" value={clip.chroma} onChange={(e) => updateClip(clip.id, { chroma: e.target.value as Clip["chroma"] })}>
                    <option value="">Off</option><option value="green">Remove green</option><option value="blue">Remove blue</option>
                  </select>
                </Row>
                {clip.chroma && <Slider label="Key strength" value={clip.chromaAmt} min={0} max={100} step={1} fmt={pct} onStart={pushHistory} onChange={(v) => set({ chromaAmt: v })} />}
              </>
            )}
          </Section>

          {prevAdjacent(project.clips, clip) && (
            <Section title="Transition (from previous clip)">
              <Row label="Type">
                <select className="field" value={clip.transIn} onChange={(e) => useEditor.getState().setTransition(clip.id, e.target.value)}>{TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </Row>
              {clip.transIn !== "none" && <Slider label="Duration" value={clip.transDur} min={0.2} max={Math.min(4, clip.duration)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ transDur: v })} />}
            </Section>
          )}

          <Section title="Blend">
            <select className="field" value={clip.blend} onChange={(e) => updateClip(clip.id, { blend: e.target.value })}>
              {BLENDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Section>

          <Section title="Animation / transition">
            <Row label="In">
              <select className="field" value={clip.animIn} onChange={(e) => updateClip(clip.id, { animIn: e.target.value })}>{animList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Row>
            <Row label="Out">
              <select className="field" value={clip.animOut} onChange={(e) => updateClip(clip.id, { animOut: e.target.value })}>{animList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Row>
            <Slider label="Duration" value={clip.animDur} min={0.1} max={3} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ animDur: v })} />
            {clip.type !== "audio" && (
              <>
                <Slider label="Fade in" value={clip.fadeIn} min={0} max={Math.min(5, clip.duration)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ fadeIn: v })} />
                <Slider label="Fade out" value={clip.fadeOut} min={0} max={Math.min(5, clip.duration)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onStart={pushHistory} onChange={(v) => set({ fadeOut: v })} />
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
