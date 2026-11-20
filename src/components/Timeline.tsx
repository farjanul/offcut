"use client";
import { memo, useEffect, useRef, useState } from "react";
import { Magnet, Flag, Grid3x3, Copy, Eye, EyeOff, Lock, Maximize2, Music, Plus, Scissors, Trash2, Type, Unlock, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { MIN_CLIP, overlaps, trackKindFor, useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";
import { confirmDialog, promptDialog } from "@/lib/dialog";
import { Clip, fmtTime, projectDuration } from "@/lib/types";

const GUTTER = 160;
const TRACK_H = 56;
const RULER_H = 26;

const COLORS: Record<Clip["type"], string> = {
  video: "#2f5fb3", image: "#7a4bb0", audio: "#1f8a5b", text: "#b57a1c", adjust: "#9b3d6b", shape: "#3d7f9b", note: "#b0453d",
};

/* ---------- ruler ticks ---------- */
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
function Ruler({ width, pps }: { width: number; pps: number }) {
  const step = STEPS.find((s) => s * pps >= 80) ?? 600;
  const minor = step / 5;
  const showMinor = minor * pps >= 9;
  const total = width / pps;
  const ticks: React.ReactNode[] = [];
  for (let t = 0; t <= total; t += showMinor ? minor : step) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ticks.push(
      <div key={t} className="absolute top-0" style={{ left: t * pps }}>
        <div className="w-px bg-[var(--muted)]/60" style={{ height: major ? 10 : 5, marginTop: major ? RULER_H - 10 : RULER_H - 5 }} />
        {major && <span className="absolute -top-0.5 left-1 select-none font-mono text-[10px] text-[var(--muted)]">{fmtTime(t).slice(0, step < 1 ? 8 : 5)}</span>}
      </div>,
    );
  }
  return <>{ticks}</>;
}

/* ---------- playhead ---------- */
function Playhead({ scroller, pps }: { scroller: React.RefObject<HTMLDivElement | null>; pps: number }) {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const x = time * pps;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - GUTTER - 60 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 120);
  }, [x, playing, scroller]);
  return (
    <div className="pointer-events-none absolute top-0 z-40" style={{ left: GUTTER + x, bottom: 0 }}>
      <div className="absolute -left-[6px] top-0 h-3 w-3 rotate-45 bg-[var(--accent)]" style={{ borderRadius: 2, top: 4 }} />
      <div className="h-full w-px bg-[var(--accent)]" />
    </div>
  );
}

/* ---------- a clip block ---------- */
const ClipView = memo(function ClipView({
  clip, pps, selected, thumb, wave, mediaDur, h: rowH, onDown,
}: {
  clip: Clip; pps: number; selected: boolean; h: number; thumb?: string; wave?: string; mediaDur?: number;
  onDown: (e: React.PointerEvent, c: Clip, mode: "move" | "l" | "r") => void;
}) {
  const w = Math.max(4, clip.duration * pps);
  const showThumb = (clip.type === "video" || clip.type === "image") && thumb;
  const showWave = clip.type === "audio" && wave && mediaDur;
  const waveBg = showWave ? `url(${wave}) ${(-clip.offset / clip.speed) * pps}px center / ${(mediaDur! / clip.speed) * pps}px 100% no-repeat, ` : "";
  return (
    <div
      className="absolute top-1 cursor-grab overflow-hidden rounded-md text-[11px] active:cursor-grabbing"
      style={{
        left: clip.start * pps, width: w, height: rowH - 8,
        background: showThumb ? `linear-gradient(#0008,#0008), url(${thumb}) left center / auto 100% repeat-x, ${COLORS[clip.type]}` : `${waveBg}${COLORS[clip.type]}`,
        outline: selected ? "2px solid var(--accent)" : "1px solid #0006",
        outlineOffset: selected ? 0 : -1,
        zIndex: selected ? 5 : 1,
      }}
      onPointerDown={(e) => onDown(e, clip, "move")}
    >
      <div className="pointer-events-none flex items-center gap-1 truncate px-2 py-0.5 text-white/90">
        {clip.type === "audio" && <Music size={11} />}
        {clip.type === "text" && <Type size={11} />}
        <span className="truncate">{clip.name}</span>
        {clip.speed !== 1 && <span className="rounded bg-black/50 px-1">{clip.rampTo ? `${clip.speed}→${clip.rampTo}x` : `${clip.speed}x`}</span>}
        {clip.reverse && <span className="rounded bg-black/50 px-1">⟲</span>}
        {clip.freeze && <span className="rounded bg-black/50 px-1">❄</span>}
        {clip.linkId && <span className="rounded bg-black/50 px-1">🔗</span>}
      </div>
      {clip.transIn !== "none" && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-white/25 px-0.5 text-[9px]" style={{ width: Math.min(w, clip.transDur * pps) }} title="Transition">⇄</div>}
      {Object.values(clip.keys ?? {}).flat().map((k, i) => (
        <div key={i} className="pointer-events-none absolute bottom-0.5 h-2 w-2 rotate-45 bg-amber-300" style={{ left: k.t * pps - 4 }} />
      ))}
      <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/40" onPointerDown={(e) => onDown(e, clip, "l")} />
      <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/40" onPointerDown={(e) => onDown(e, clip, "r")} />
    </div>
  );
});

export default function Timeline({ onMixer }: { onMixer?: () => void }) {
  const project = useEditor((s) => s.project);
  const pps = useEditor((s) => s.pps);
  const selectedId = useEditor((s) => s.selectedId);
  const selectedIds = useEditor((s) => s.selectedIds);
  const tool = useEditor((s) => s.tool);
  const thumbs = useEditor((s) => s.thumbs);
  const waves = useEditor((s) => s.waves);
  const snapOn = useEditor((s) => s.snap);
  const st = useEditor.getState;
  const scroller = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);

  const dur = projectDuration(project);
  const [vw, setVw] = useState(1600);
  useEffect(() => { const f = () => setVw(window.innerWidth); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const width = Math.max(dur + 15, vw / pps) * pps;

  // ctrl/cmd + wheel zooms
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      st().setPps(st().pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [st]);

  /* ----- scrubbing on the ruler ----- */
  const scrub = (e: React.PointerEvent) => {
    const set = (cx: number) => engine.seek((cx - ruler.current!.getBoundingClientRect().left) / st().pps);
    set(e.clientX);
    const mv = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  /* ----- clip drag / trim / tools ----- */
  const onClipDown = (e: React.PointerEvent, clip: Clip, mode: "move" | "l" | "r") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const S = st();
    const tool = S.tool;
    const locked = S.project.tracks.find((t) => t.id === clip.trackId)?.locked;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    // razor: cut where you click
    if (tool === "razor" && mode === "move") {
      const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
      S.razorAt(clip.id, (e.clientX - rect.left) / S.pps);
      return;
    }
    if (additive) { S.select(clip.id, true); return; }
    if (!S.selectedIds.includes(clip.id)) S.select(clip.id);
    else useEditor.setState({ selectedId: clip.id });
    if (locked) return;

    const orig = { ...clip };
    const x0 = e.clientX;
    let pushed = false;
    const all = S.project.clips;
    const media = clip.mediaId ? S.project.media.find((m) => m.id === clip.mediaId) : undefined;
    const sourceBound = !!media && (clip.type === "video" || clip.type === "audio") && !clip.freeze;
    const timeWarped = clip.reverse || clip.rampTo > 0;
    const ids = new Set(useEditor.getState().selectedIds.includes(clip.id) ? useEditor.getState().selectedIds : [clip.id]);
    const group = all.filter((c) => ids.has(c.id) && !S.project.tracks.find((t) => t.id === c.trackId)?.locked);

    const others = all.filter((c) => !ids.has(c.id));
    const points = [0, S.time, ...(S.project.markers ?? []).map((m) => m.t), ...others.flatMap((c) => [c.start, c.start + c.duration])];
    const thr = 8 / S.pps;
    const snap = (v: number) => {
      if (!st().snap) return v;
      let best = v, bd = thr;
      for (const p of points) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    const sameTrack = all.filter((c) => c.id !== orig.id && c.trackId === orig.trackId);
    const prevEnd = sameTrack.filter((c) => c.start + c.duration <= orig.start + 1e-6).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
    const nextStart = sameTrack.filter((c) => c.start >= orig.start + orig.duration - 1e-6).reduce((m, c) => Math.min(m, c.start), Infinity);
    const prevAdj = sameTrack.find((c) => Math.abs(c.start + c.duration - orig.start) < 0.05);
    const nextAdj = sameTrack.find((c) => Math.abs(orig.start + orig.duration - c.start) < 0.05);
    const mediaOf = (c: Clip) => (c.mediaId ? S.project.media.find((m) => m.id === c.mediaId) : undefined);
    const srcOk = (c: Clip) => !!mediaOf(c) && (c.type === "video" || c.type === "audio") && !c.freeze;

    const move = (ev: PointerEvent) => {
      if (!pushed) { if (Math.abs(ev.clientX - x0) < 3) return; st().pushHistory(); pushed = true; }
      const dx = (ev.clientX - x0) / st().pps;
      const P = st();

      /* ---- slip: change what is shown, keep position & length ---- */
      if (tool === "slip" && mode === "move") {
        if (!sourceBound || timeWarped) return;
        const max = Math.max(0, media!.duration - orig.duration * orig.speed);
        P.updateClip(orig.id, { offset: Math.max(0, Math.min(max, orig.offset - dx * orig.speed)) }, false);
        return;
      }

      if (mode === "move") {
        const minStart = Math.min(...group.map((c) => c.start));
        const ns0 = orig.start + Math.max(dx, -minStart);
        const a = snap(ns0), b = snap(ns0 + orig.duration) - orig.duration;
        const dt = Math.max(-minStart, (Math.abs(a - ns0) <= Math.abs(b - ns0) ? a : b) - orig.start);
        let tid = orig.trackId;
        if (group.length === 1) {
          for (const n of document.elementsFromPoint(ev.clientX, ev.clientY)) {
            const id = (n as HTMLElement).dataset?.trackId;
            if (id) {
              const tr = P.project.tracks.find((t) => t.id === id);
              if (tr && !tr.locked && tr.kind === trackKindFor(orig.type)) tid = id;
              break;
            }
          }
        }
        const patches: Record<string, Partial<Clip>> = {};
        for (const c of group) {
          const tr = c.id === orig.id ? tid : c.trackId;
          const start = c.start + dt;
          if (others.some((o) => o.trackId === tr && start < o.start + o.duration - 1e-6 && start + c.duration > o.start + 1e-6)) return;
          patches[c.id] = { start, trackId: tr };
        }
        P.patchClips(patches, false);
        return;
      }

      if (timeWarped && tool !== "roll") return; // reversed / ramped clips can only be split or rolled

      /* ---- rolling edit: move the cut between two adjacent clips ---- */
      if (tool === "roll") {
        const a = mode === "l" ? prevAdj : orig, bC = mode === "l" ? orig : nextAdj;
        if (!a || !bC) return;
        let d = snap((mode === "l" ? orig.start : orig.start + orig.duration) + dx) - (mode === "l" ? orig.start : orig.start + orig.duration);
        d = Math.max(d, MIN_CLIP - a.duration, -(bC.offset / bC.speed) * (srcOk(bC) ? 1 : 0) - (srcOk(bC) ? 0 : 1e9));
        d = Math.min(d, bC.duration - MIN_CLIP);
        if (srcOk(a)) d = Math.min(d, (mediaOf(a)!.duration - a.offset) / a.speed - a.duration);
        P.patchClips({
          [a.id]: { duration: a.duration + d },
          [bC.id]: { start: bC.start + d, duration: bC.duration - d, offset: srcOk(bC) ? bC.offset + d * bC.speed : bC.offset },
        }, false);
        return;
      }

      const ripple = tool === "ripple";
      if (mode === "l") {
        const end = orig.start + orig.duration;
        let d = snap(orig.start + dx) - orig.start;
        d = Math.max(d, -orig.start, ripple ? -1e9 : prevEnd - orig.start, sourceBound ? -orig.offset / orig.speed : -1e9);
        d = Math.min(d, orig.duration - MIN_CLIP);
        const patches: Record<string, Partial<Clip>> = {
          [orig.id]: ripple
            ? { duration: orig.duration - d, offset: sourceBound ? orig.offset + d * orig.speed : orig.offset }
            : { start: orig.start + d, duration: end - (orig.start + d), offset: sourceBound ? orig.offset + d * orig.speed : orig.offset },
        };
        if (ripple) for (const c of sameTrack) if (c.start >= end - 1e-6) patches[c.id] = { start: c.start - d };
        P.patchClips(patches, false);
      } else {
        const maxLen = sourceBound ? (media!.duration - orig.offset) / orig.speed : Infinity;
        let nd = snap(orig.start + orig.duration + dx) - orig.start;
        nd = Math.max(MIN_CLIP, Math.min(nd, maxLen, ripple ? Infinity : nextStart - orig.start));
        const patches: Record<string, Partial<Clip>> = { [orig.id]: { duration: nd } };
        if (ripple) for (const c of sameTrack) if (c.start >= orig.start + orig.duration - 1e-6) patches[c.id] = { start: c.start + (nd - orig.duration) };
        P.patchClips(patches, false);
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDrop = (e: React.DragEvent, trackId: string) => {
    const id = e.dataTransfer.getData("application/x-media-id");
    if (!id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    st().addClipFromMedia(id, trackId, Math.max(0, (e.clientX - rect.left) / st().pps));
  };

  const s = useEditor.getState();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--line)] px-3 [&>*]:shrink-0">
        {([["select", "V", "Selection (V)"], ["razor", "C", "Razor — click a clip to cut (C)"], ["ripple", "B", "Ripple trim (B)"], ["roll", "N", "Rolling edit (N)"], ["slip", "Y", "Slip (Y)"]] as const).map(([id, k, tip]) => (
          <button key={id} title={tip} onClick={() => s.setTool(id)} className={`btn !px-2 !py-1 font-mono text-xs ${tool === id ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`}>{k}</button>
        ))}
        <div className="mx-1 h-5 w-px bg-[var(--line)]" />
        <button className="btn !py-1" onClick={s.splitAtPlayhead} title="Split at playhead (S)"><Scissors size={14} /> Split</button>
        <button className="btn !py-1" disabled={!selectedId} onClick={s.duplicateSelected} title="Duplicate (Ctrl/Cmd+D)"><Copy size={14} /></button>
        <button className="btn !py-1 hover:!bg-red-600" disabled={!selectedId} onClick={s.deleteSelected} title="Delete (Del)"><Trash2 size={14} /></button>
        <button className={`btn !py-1 ${snapOn ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} onClick={() => s.setSnap(!snapOn)} title="Snapping"><Magnet size={14} /></button>
        <button className="btn !py-1" onClick={s.addMarker} title="Add marker at playhead (M)"><Flag size={14} /></button>
        <button className="btn !py-1 text-xs" disabled={selectedIds.length < 2} onClick={s.groupSelected} title="Link / group selected (Ctrl+G)">Link</button>
        <button className="btn !py-1 text-xs" disabled={!selectedId} onClick={s.ungroupSelected} title="Unlink (Ctrl+Shift+G)">Unlink</button>
        <button className="btn !py-1 text-xs" disabled={!selectedId} onClick={s.freezeFrame} title="Freeze frame at playhead">Freeze</button>
        <button className="btn !py-1 text-xs" disabled={project.rangeIn == null} onClick={() => s.liftRange(false)} title="Lift range (;)">Lift</button>
        <button className="btn !py-1 text-xs" disabled={project.rangeIn == null} onClick={() => s.liftRange(true)} title="Extract range (')">Extract</button>
        <div className="mx-2 h-5 w-px bg-[var(--line)]" />
        <button className="btn !py-1" onClick={() => s.addTrack("overlay")} title="New overlay layer (on top of everything)"><Plus size={13} /> Overlay</button>
        <button className="btn !py-1" onClick={() => s.addTrack("video")} title="New video layer"><Plus size={13} /> Video</button>
        <button className="btn !py-1" onClick={() => s.addTrack("audio")} title="New audio layer"><Plus size={13} /> Audio</button>
        <button className="btn !py-1 text-xs" onClick={onMixer} title="Audio mixer">Mixer</button>
        <div className="flex-1" />
        <button className="btn !py-1" title="Fit project to view" onClick={() => { const d = projectDuration(st().project) || 10; s.setPps(((scroller.current?.clientWidth ?? 1000) - GUTTER - 40) / d); if (scroller.current) scroller.current.scrollLeft = 0; }}><Maximize2 size={13} /></button>
        <ZoomOut size={14} className="text-[var(--muted)]" />
        <input type="range" min={Math.log(8)} max={Math.log(400)} step={0.01} value={Math.log(pps)} onChange={(e) => s.setPps(Math.exp(parseFloat(e.target.value)))} className="w-32" />
        <ZoomIn size={14} className="text-[var(--muted)]" />
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto" onPointerDown={() => st().select(null)}>
        <div className="relative" style={{ width: GUTTER + width, minHeight: "100%" }}>
          <div className="sticky top-0 z-30 flex bg-[var(--panel)]" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-b border-r border-[var(--line)] bg-[var(--panel)]" style={{ width: GUTTER }} />
            <div ref={ruler} className="relative cursor-pointer border-b border-[var(--line)]" style={{ width }} onPointerDown={(e) => { e.stopPropagation(); scrub(e); }}>
              <Ruler width={width} pps={pps} />
              {project.rangeIn != null && project.rangeOut != null && (
                <div className="pointer-events-none absolute top-0 h-full bg-[var(--accent)]/25 outline outline-1 outline-[var(--accent)]" style={{ left: project.rangeIn * pps, width: Math.max(2, (project.rangeOut - project.rangeIn) * pps) }} />
              )}
              {(project.markers ?? []).map((m) => (
                <button key={m.id} title={`${m.label} — click: go to · Shift+click: remove`} className="absolute top-0 z-10 flex items-center text-amber-400"
                  style={{ left: m.t * pps - 4 }}
                  onPointerDown={(e) => { e.stopPropagation(); e.shiftKey ? s.removeMarker(m.id) : engine.seek(m.t); }}>
                  <Flag size={12} fill="currentColor" />
                </button>
              ))}
            </div>
          </div>

          {project.tracks.map((tr) => (
            <div key={tr.id} className="flex" style={{ height: tr.tall ? 88 : TRACK_H }}>
              <div className="group sticky left-0 z-20 flex shrink-0 items-center justify-between border-b border-r border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--muted)]" style={{ width: GUTTER }}>
                <button className="min-w-0 flex-1 truncate text-left hover:text-white" title="Double-click to rename"
                  onDoubleClick={async () => { const n = await promptDialog({ title: "Rename layer", value: tr.name, confirmLabel: "Rename" }); if (n?.trim()) s.updateTrack(tr.id, { name: n.trim() }); }}>{tr.name}</button>
                <span className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
                  {tr.kind === "video" && <button title="Show / hide" className={tr.hidden ? "text-amber-400" : "hover:text-white"} onClick={() => s.updateTrack(tr.id, { hidden: !tr.hidden })}>{tr.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
                  <button title="Mute" className={tr.muted ? "text-amber-400" : "hover:text-white"} onClick={() => s.updateTrack(tr.id, { muted: !tr.muted })}>{tr.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
                  <button title="Lock" className={tr.locked ? "text-amber-400" : "hover:text-white"} onClick={() => s.updateTrack(tr.id, { locked: !tr.locked })}>{tr.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                </span>
                <span className="hidden items-center gap-0.5 group-hover:flex" onPointerDown={(e) => e.stopPropagation()}>
                  <button title="Taller / shorter layer" className="rounded px-0.5 hover:bg-[var(--panel2)] hover:text-white" onClick={() => s.updateTrack(tr.id, { tall: !tr.tall })}>↕</button>
                  <button title="Move layer up" className="rounded px-0.5 hover:bg-[var(--panel2)] hover:text-white" onClick={() => s.moveTrack(tr.id, -1)}>▲</button>
                  <button title="Move layer down" className="rounded px-0.5 hover:bg-[var(--panel2)] hover:text-white" onClick={() => s.moveTrack(tr.id, 1)}>▼</button>
                  {project.tracks.length > 1 && (
                    <button title="Delete layer" className="rounded p-0.5 hover:bg-red-600 hover:text-white"
                      onClick={async (e) => { e.stopPropagation(); const n = project.clips.filter((c) => c.trackId === tr.id).length; if (!n || await confirmDialog({ title: `Delete “${tr.name}”?`, message: `${n} clip${n > 1 ? "s" : ""} on this layer will be removed from the timeline.`, confirmLabel: "Delete layer", danger: true })) s.removeTrack(tr.id); }}>
                      <X size={12} />
                    </button>
                  )}
                </span>
              </div>
              <div
                data-track-id={tr.id}
                className="relative border-b border-[var(--line)]"
                style={{ width, background: tr.kind === "audio" ? "#13171a" : "#15171c" }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-media-id")) e.preventDefault(); }}
                onDrop={(e) => onDrop(e, tr.id)}
              >
                {project.clips.filter((c) => c.trackId === tr.id).map((c) => (
                  <ClipView key={c.id} clip={c} pps={pps} selected={selectedIds.includes(c.id)} h={tr.tall ? 88 : TRACK_H} thumb={c.mediaId ? thumbs[c.mediaId] : undefined} wave={c.mediaId ? waves[c.mediaId] : undefined} mediaDur={project.media.find((m) => m.id === c.mediaId)?.duration} onDown={onClipDown} />
                ))}
              </div>
            </div>
          ))}
          <Playhead scroller={scroller} pps={pps} />
        </div>
      </div>
    </div>
  );
}
