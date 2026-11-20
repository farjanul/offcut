"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, Grid3x3, Pause, Play, Repeat, SkipBack } from "lucide-react";
import Scopes from "./Scopes";
import { NOTE_KINDS } from "@/lib/effects";
import { useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";
import { fmtTime, projectDuration } from "@/lib/types";

export default function Preview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const guides = useEditor((s) => s.guides);
  const loop = useEditor((s) => s.loop);
  const scale = useEditor((s) => s.previewScale);
  const [scopes, setScopes] = useState(false);
  const annot = useEditor((s) => s.annot);
  const [level, setLevel] = useState(0);
  const peak = useRef(0);
  useEffect(() => {
    const id = setInterval(() => { peak.current = Math.max((engine.level?.() ?? 0), peak.current * 0.9); setLevel(peak.current); }, 60);
    return () => clearInterval(id);
  }, []);
  const dur = projectDuration(project);

  const toCanvas = (e: React.PointerEvent) => {
    const cv = ref.current!;
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height] as const;
  };

  const onDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const [px, py] = toCanvas(e);
    const cv = ref.current!;

    // annotation drawing mode
    if (st.annot) {
      const a = st.annot;
      const fx = px / cv.width - 0.5, fy = py / cv.height - 0.5;
      const label = String(st.project.clips.filter((c) => c.note?.kind === "badge").length + 1);
      const name = NOTE_KINDS.find((k) => k.id === a.kind)?.name ?? "Note";
      st.addLayer({ type: "note", name, duration: 3, note: { kind: a.kind, pts: [[fx, fy], [fx, fy]], color: a.color, width: a.width, fill: a.fill, label }, animIn: "draw", animDur: 0.6 });
      const id = useEditor.getState().selectedId!;
      if (a.kind === "badge") return;
      const mv = (ev: PointerEvent) => {
        const r = cv.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        const cur = useEditor.getState().project.clips.find((c) => c.id === id);
        if (!cur?.note) return;
        let pts = cur.note.pts;
        if (a.kind === "pen") {
          const last = pts[pts.length - 1];
          if (Math.hypot((x - last[0]) * r.width, (y - last[1]) * r.height) > 3) pts = [...pts, [x, y]];
        } else pts = [[fx, fy], [x, y]];
        useEditor.getState().updateClip(id, { note: { ...cur.note, pts } }, false);
      };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
      return;
    }
    const sel = st.selectedId ? st.project.clips.find((c) => c.id === st.selectedId) : null;
    const b = sel ? engine.bounds.get(sel.id) : null;
    let mode: "move" | "scale" | null = null;
    let id = st.selectedId;
    if (sel && b) {
      const k = cv.width / 1280;
      const cs = Math.cos(-b.rot), sn = Math.sin(-b.rot);
      const lx = (px - b.cx) * cs - (py - b.cy) * sn, ly = (px - b.cx) * sn + (py - b.cy) * cs;
      if (Math.abs(Math.abs(lx) - b.w / 2) < 12 * k && Math.abs(Math.abs(ly) - b.h / 2) < 12 * k) mode = "scale";
    }
    if (!mode) {
      id = engine.hitTest(px, py);
      st.select(id);
      if (id) mode = "move";
    }
    if (!mode || !id) return;
    const c0 = st.project.clips.find((c) => c.id === id)!;
    if (st.project.tracks.find((t) => t.id === c0.trackId)?.locked) return;
    const b0 = engine.bounds.get(id)!;
    const d0 = Math.max(1, Math.hypot(px - b0.cx, py - b0.cy));
    let pushed = false;
    const mv = (ev: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * cv.width, y = ((ev.clientY - r.top) / r.height) * cv.height;
      if (!pushed) { st.pushHistory(); pushed = true; }
      if (mode === "move") {
        useEditor.getState().updateClip(id!, { x: c0.x + ((x - px) / cv.width) * 2, y: c0.y + ((y - py) / cv.height) * 2 }, false);
      } else {
        useEditor.getState().updateClip(id!, { scale: Math.max(0.05, c0.scale * (Math.hypot(x - b0.cx, y - b0.cy) / d0)) }, false);
      }
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    engine.attach(ref.current);
    return () => engine.attach(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {scopes && <Scopes />}
        {annot && (
          <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-black">
            Annotating: {NOTE_KINDS.find((k) => k.id === annot.kind)?.name} — draw on the video
            <button className="rounded-full bg-black/20 px-2" onClick={() => useEditor.getState().setAnnot(null)}>Done (Esc)</button>
          </div>
        )}
        <canvas
          ref={ref}
          onPointerDown={onDown}
          className={`max-h-full max-w-full rounded bg-black shadow-2xl ${annot ? "cursor-crosshair" : ""}`}
          style={{ aspectRatio: `${project.width} / ${project.height}`, height: "100%", objectFit: "contain" }}
        />
      </div>
      <div className="flex h-12 items-center justify-center gap-4 border-t border-[var(--line)] bg-[var(--panel)]">
        <button className="btn" onClick={() => engine.seek(0)} title="Go to start (Home)"><SkipBack size={15} /></button>
        <button className="btn btn-primary !px-4" onClick={() => engine.toggle()} disabled={dur <= 0} title="Play / Pause (Space)">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className={`btn ${loop ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} title="Loop playback" onClick={() => useEditor.getState().setLoop(!loop)}><Repeat size={15} /></button>
        <button className={`btn ${scopes ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} title="Video scopes" onClick={() => setScopes(!scopes)}><Activity size={15} /></button>
        <select className="field !w-auto !py-1.5" title="Preview quality (proxy) — export is always full quality" value={scale} onChange={(e) => useEditor.getState().setPreviewScale(+e.target.value)}>
          <option value={1}>Full</option><option value={0.5}>1/2</option><option value={0.25}>1/4</option>
        </select>
        <div className="h-5 w-2 overflow-hidden rounded-sm bg-black" title="Master level"><div className="w-full" style={{ height: `${level * 100}%`, marginTop: `${(1 - level) * 100}%`, background: level > 0.9 ? "#ef4444" : level > 0.7 ? "#facc15" : "#22c55e" }} /></div>
        <button className={`btn ${guides ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} title="Safe margins & thirds" onClick={() => useEditor.getState().setGuides(!guides)}><Grid3x3 size={15} /></button>
        <div className="font-mono text-sm tabular-nums">{fmtTime(time)} <span className="text-[var(--muted)]">/ {fmtTime(dur)}</span></div>
      </div>
    </div>
  );
}
