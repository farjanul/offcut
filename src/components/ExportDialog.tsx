"use client";
import { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";
import { projectDuration, fmtTime } from "@/lib/types";
import { openWritable, removeFile, safeName } from "@/lib/fs";
import { encodeWav, fastExport, fastExportSupported, mixAudio } from "@/lib/exporter";

type Mode = "fast" | "realtime" | "audio" | "frame";
const RES = [[0, "Original"], [2160, "4K (2160p)"], [1440, "1440p"], [1080, "1080p"], [720, "720p"], [480, "480p"]] as const;
const PRESETS: { name: string; mode: Mode; res: number; q: number }[] = [
  { name: "YouTube 1080p", mode: "fast", res: 1080, q: 12 },
  { name: "Master 4K", mode: "fast", res: 2160, q: 40 },
  { name: "Draft 480p", mode: "fast", res: 480, q: 2 },
  { name: "Social 720p", mode: "fast", res: 720, q: 6 },
];

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const { project, dir } = useEditor();
  const canFast = fastExportSupported();
  const [mode, setMode] = useState<Mode>(canFast ? "fast" : "realtime");
  const [res, setRes] = useState(0);
  const [quality, setQuality] = useState(10);
  const [webm, setWebm] = useState(false);
  const [useRange, setUseRange] = useState(false);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");
  const sig = useRef({ cancelled: false });

  const total = projectDuration(project);
  const hasRange = project.rangeIn != null && project.rangeOut != null && project.rangeOut > project.rangeIn;
  const from = useRange && hasRange ? project.rangeIn! : 0;
  const to = useRange && hasRange ? project.rangeOut! : total;
  const scale = res ? res / Math.min(project.width, project.height) : 1;
  const outW = Math.round((project.width * scale) / 2) * 2, outH = Math.round((project.height * scale) / 2) * 2;

  const save = async (name: string, blob?: Blob) => {
    if (dir) { setMsg(`Saved to ${dir.name}/exports/${name}`); return; }
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setMsg(`Downloaded ${name}`);
  };

  const start = async () => {
    sig.current = { cancelled: false };
    setState("running"); setProgress(0); setLabel("");
    const base = `${safeName(project.name)}-${Date.now()}`;
    let name = "";
    try {
      const openSink = async (ext: string) => {
        if (!dir) return null;
        name = `${base}.${ext}`;
        return openWritable(dir, `exports/${name}`);
      };
      let out: { blob?: Blob; ext: string } | null = null;

      if (mode === "fast") {
        const sink = await openSink("mp4");
        out = await fastExport({
          scale, from, to, bitrate: quality * 1_000_000, sink,
          onProgress: (p, l) => { setProgress(p); setLabel(l); }, signal: sig.current,
        });
      } else if (mode === "realtime") {
        out = await engine.exportVideo((p) => setProgress(p), sig.current, { bitrate: quality * 1_000_000, webmOnly: webm, scale, from, to }, openSink);
      } else if (mode === "audio") {
        setLabel("Mixing audio…");
        const [L, R] = await mixAudio(from, to, 48000, (p) => setProgress(p));
        const blob = encodeWav(L, R, 48000);
        name = `${base}.wav`;
        if (dir) { const w = await openWritable(dir, `exports/${name}`); await w.write(blob); await w.close(); out = { ext: "wav" }; }
        else out = { blob, ext: "wav" };
      } else {
        const t = useEditor.getState().time;
        await engine.frameAt(t, scale);
        const blob = await new Promise<Blob | null>((r) => engine.canvas!.toBlob(r, "image/png"));
        engine.endExport();
        name = `${base}.png`;
        if (blob && dir) { const w = await openWritable(dir, `exports/${name}`); await w.write(blob); await w.close(); }
        out = blob ? { blob: dir ? undefined : blob, ext: "png" } : null;
      }

      if (!out) {
        if (dir && name) await removeFile(dir, `exports/${name}`);
        setState("idle");
        return;
      }
      if (!dir) name = `${base}.${out.ext}`;
      await save(name, out.blob);
      setState("done");
    } catch (e) {
      console.error(e);
      engine.endExport();
      setMsg(String(e));
      setState("error");
    }
  };

  const close = () => { if (state === "running") sig.current.cancelled = true; onClose(); };
  const modes: [Mode, string, string, boolean][] = [
    ["fast", "Fast (MP4 · H.264)", "Offline render — not tied to real time", canFast],
    ["realtime", "Real-time (MP4/WebM)", "Records playback; keep the tab in front", true],
    ["audio", "Audio only (WAV)", "Mixed audio track", true],
    ["frame", "Current frame (PNG)", "Still image at the playhead", true],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Export</h2>
          <button className="btn !p-1" onClick={close}><X size={15} /></button>
        </div>

        {state === "idle" && (
          <>
            <div className="mb-3 flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button key={p.name} className="btn !px-2 !py-1 text-xs" onClick={() => { if (p.mode !== "fast" || canFast) setMode(p.mode); setRes(p.res); setQuality(p.q); }}>{p.name}</button>
              ))}
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {modes.map(([id, t, d, ok]) => (
                <button key={id} disabled={!ok} onClick={() => setMode(id)} className={`rounded-lg border p-2 text-left text-xs disabled:opacity-40 ${mode === id ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--line)]"}`}>
                  <div className="font-semibold">{t}</div><div className="text-[var(--muted)]">{d}</div>
                </button>
              ))}
            </div>
            {(mode === "fast" || mode === "realtime" || mode === "frame") && (
              <div className="mb-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--muted)]">Resolution
                  <select className="field mt-1" value={res} onChange={(e) => setRes(+e.target.value)}>
                    {RES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                {mode !== "frame" && (
                  <label className="text-xs text-[var(--muted)]">Bitrate
                    <select className="field mt-1" value={quality} onChange={(e) => setQuality(+e.target.value)}>
                      <option value={2}>2 Mbps</option><option value={4}>4 Mbps</option><option value={6}>6 Mbps</option><option value={10}>10 Mbps</option><option value={12}>12 Mbps</option><option value={20}>20 Mbps</option><option value={40}>40 Mbps</option>
                    </select>
                  </label>
                )}
                {mode === "realtime" && (
                  <label className="col-span-2 flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={webm} onChange={(e) => setWebm(e.target.checked)} /> Force WebM</label>
                )}
              </div>
            )}
            {hasRange && mode !== "frame" && (
              <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} /> Export only the In/Out range ({fmtTime(project.rangeIn!)} – {fmtTime(project.rangeOut!)})</label>
            )}
            <p className="mb-4 text-xs leading-relaxed text-[var(--muted)]">
              {mode === "frame" ? "Single frame" : `${fmtTime(to - from)}`} · {outW}×{outH}{mode === "fast" || mode === "realtime" ? ` · ${project.fps} fps` : ""}.{" "}
              {dir ? "Written straight to the exports/ folder of your project folder." : "No project folder — the file will be downloaded."}
              {mode === "fast" && " Noise-gate and auto-ducking are real-time only and are not applied in fast exports."}
            </p>
          </>
        )}

        {state !== "idle" && (
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded bg-[var(--bg)]"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress * 100}%` }} /></div>
            <div className="mt-1 text-xs text-[var(--muted)]">{state === "running" ? `${label || "Rendering…"} ${Math.round(progress * 100)}%` : msg}</div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={close}>{state === "done" ? "Close" : "Cancel"}</button>
          {(state === "idle" || state === "error") && <button className="btn btn-primary" onClick={start}><Download size={15} /> Start export</button>}
        </div>
      </div>
    </div>
  );
}
