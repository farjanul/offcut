"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";

export default function Mixer({ onClose }: { onClose: () => void }) {
  const { project, updateTrack } = useEditor();
  const [level, setLevel] = useState(0);
  const peak = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const l = (engine.level?.() ?? 0);
      peak.current = Math.max(l, peak.current * 0.92);
      setLevel(peak.current);
    }, 50);
    return () => clearInterval(id);
  }, []);
  const tracks = project.tracks;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onPointerDown={onClose}>
      <div className="max-w-[90vw] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Audio mixer</h2>
          <button className="btn !p-1" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="flex gap-3">
          {tracks.map((t) => (
            <div key={t.id} className="flex w-24 flex-col items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
              <div className="truncate text-xs">{t.name}</div>
              <input type="range" min={0} max={200} value={Math.round((t.vol ?? 1) * 100)} onChange={(e) => updateTrack(t.id, { vol: +e.target.value / 100 })}
                style={{ writingMode: "vertical-lr", direction: "rtl", height: 140 }} />
              <div className="font-mono text-[11px] text-[var(--muted)]">{Math.round((t.vol ?? 1) * 100)}%</div>
              <button className={`btn !px-2 !py-0.5 text-[11px] ${t.muted ? "!border-amber-400 text-amber-300" : ""}`} onClick={() => updateTrack(t.id, { muted: !t.muted })}>Mute</button>
              {t.kind === "audio" && (
                <button className={`btn !px-2 !py-0.5 text-[11px] ${t.duck ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} title="Lower this track while speech plays on other tracks" onClick={() => updateTrack(t.id, { duck: !t.duck })}>Duck</button>
              )}
            </div>
          ))}
          <div className="flex w-20 flex-col items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
            <div className="text-xs">Master</div>
            <div className="relative h-[140px] w-4 overflow-hidden rounded bg-black">
              <div className="absolute inset-x-0 bottom-0" style={{ height: `${level * 100}%`, background: "linear-gradient(to top,#22c55e 0%,#22c55e 60%,#facc15 80%,#ef4444 100%)" }} />
            </div>
            <div className="font-mono text-[11px] text-[var(--muted)]">{level > 0.001 ? `${(20 * Math.log10(level)).toFixed(0)} dB` : "-∞"}</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">“Duck” lowers a music track automatically while a voice / video clip on another track is speaking.</p>
      </div>
    </div>
  );
}
