"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fmtTime } from "@/lib/types";

/** Premiere-style source monitor: preview a clip, mark in/out, then insert / overwrite / add */
export default function SourceMonitor({ mediaId, onClose }: { mediaId: string; onClose: () => void }) {
  const { project, urls } = useEditor();
  const m = project.media.find((x) => x.id === mediaId);
  const v = useRef<HTMLVideoElement>(null);
  const [inPt, setIn] = useState(0);
  const [outPt, setOut] = useState(m?.duration ?? 0);
  const [t, setT] = useState(0);
  const url = urls[mediaId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = v.current;
      if (!el) return;
      if (e.code === "Space") { e.preventDefault(); el.paused ? el.play() : el.pause(); }
      else if (e.key.toLowerCase() === "i") setIn(Math.min(el.currentTime, outPt - 0.1));
      else if (e.key.toLowerCase() === "o") setOut(Math.max(el.currentTime, inPt + 0.1));
      else if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - (e.shiftKey ? 1 : 1 / 30));
      else if (e.key === "ArrowRight") el.currentTime += e.shiftKey ? 1 : 1 / 30;
      else if (e.key === "Escape") onClose();
      else return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inPt, outPt, onClose]);

  if (!m || !url) return null;
  const add = (mode: "auto" | "insert" | "overwrite") => {
    useEditor.getState().addClipFromMedia(mediaId, undefined, undefined, { mode, inPt, outPt });
    onClose();
  };
  const pct = (x: number) => `${(x / Math.max(0.001, m.duration)) * 100}%`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onPointerDown={onClose}>
      <div className="w-[680px] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="truncate text-sm font-semibold">Source: {m.name}</h2>
          <button className="btn !p-1" onClick={onClose}><X size={15} /></button>
        </div>
        {m.kind === "audio" ? (
          <audio ref={v as unknown as React.RefObject<HTMLAudioElement>} src={url} controls className="w-full" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} />
        ) : m.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[360px] w-full rounded bg-black object-contain" />
        ) : (
          <video ref={v} src={url} className="max-h-[360px] w-full rounded bg-black" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onClick={(e) => { const el = e.currentTarget; el.paused ? el.play() : el.pause(); }} />
        )}
        {m.kind !== "image" && (
          <>
            <div className="relative mt-3 h-6 cursor-pointer rounded bg-[var(--bg)]" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (v.current) v.current.currentTime = ((e.clientX - r.left) / r.width) * m.duration; }}>
              <div className="absolute inset-y-0 bg-[var(--accent)]/30" style={{ left: pct(inPt), width: pct(outPt - inPt) }} />
              <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: pct(t) }} />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-xs text-[var(--muted)]">
              <span>In {fmtTime(inPt)}</span><span>{fmtTime(t)} / {fmtTime(m.duration)}</span><span>Out {fmtTime(outPt)}</span>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="btn" onClick={() => setIn(Math.min(v.current?.currentTime ?? 0, outPt - 0.1))}>Mark In (I)</button>
              <button className="btn" onClick={() => setOut(Math.max(v.current?.currentTime ?? 0, inPt + 0.1))}>Mark Out (O)</button>
              <button className="btn" onClick={() => { setIn(0); setOut(m.duration); }}>Reset</button>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => add("auto")}>Add to timeline</button>
          <button className="btn" onClick={() => add("insert")} title="Ripple later clips">Insert</button>
          <button className="btn btn-primary" onClick={() => add("overwrite")} title="Replace what is under it">Overwrite</button>
        </div>
      </div>
    </div>
  );
}
