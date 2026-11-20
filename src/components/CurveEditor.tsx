"use client";
import { useRef, useState } from "react";
import { Curves, Pt, defaultCurves } from "@/lib/types";
import { curveTable } from "@/lib/effects";

const CH = [["m", "RGB", "#e6e8ec"], ["r", "R", "#f87171"], ["g", "G", "#4ade80"], ["b", "B", "#60a5fa"]] as const;
const S = 180;

/** Photoshop/Lumetri-style curves: drag points, double-click to add, right-click to remove */
export default function CurveEditor({ value, onChange, onStart }: { value: Curves | null; onChange: (c: Curves) => void; onStart: () => void }) {
  const [ch, setCh] = useState<"m" | "r" | "g" | "b">("m");
  const svg = useRef<SVGSVGElement>(null);
  const curves = value ?? defaultCurves();
  const pts = curves[ch];
  const color = CH.find((c) => c[0] === ch)![2];

  const toPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))];
  };
  const set = (np: Pt[]) => onChange({ ...curves, [ch]: np.sort((a, b) => a[0] - b[0]) });

  const down = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button === 2 || e.altKey) { if (pts.length > 2 && i !== 0 && i !== pts.length - 1) { onStart(); set(pts.filter((_, k) => k !== i)); } return; }
    onStart();
    const mv = (ev: PointerEvent) => {
      const p = toPt(ev);
      const cur = useRefPts.current;
      const lo = i > 0 ? cur[i - 1][0] + 0.01 : 0, hi = i < cur.length - 1 ? cur[i + 1][0] - 0.01 : 1;
      const x = i === 0 ? 0 : i === cur.length - 1 ? 1 : Math.max(lo, Math.min(hi, p[0]));
      const np = cur.map((q, k) => (k === i ? ([x, p[1]] as Pt) : q));
      useRefPts.current = np;
      onChange({ ...curves, [ch]: np });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const useRefPts = useRef<Pt[]>(pts);
  useRefPts.current = pts;

  const table = curveTable(pts, 48);
  const path = table.map((v, k) => `${k ? "L" : "M"}${(k / 47) * S},${(1 - v) * S}`).join(" ");
  return (
    <div>
      <div className="mb-2 flex gap-1">
        {CH.map(([id, label]) => (
          <button key={id} onClick={() => setCh(id)} className={`btn !px-2 !py-0.5 text-xs ${ch === id ? "!border-[var(--accent)]" : ""}`}>{label}</button>
        ))}
        <button className="btn ml-auto !px-2 !py-0.5 text-xs" onClick={() => { onStart(); onChange(defaultCurves()); }}>Reset</button>
      </div>
      <svg ref={svg} width="100%" viewBox={`0 0 ${S} ${S}`} className="rounded border border-[var(--line)] bg-[var(--bg)]" style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => { const p = toPt(e); onStart(); set([...pts, p]); }}>
        {[0.25, 0.5, 0.75].map((f) => <g key={f}><line x1={f * S} y1={0} x2={f * S} y2={S} stroke="#2a2e37" /><line x1={0} y1={f * S} x2={S} y2={f * S} stroke="#2a2e37" /></g>)}
        <line x1={0} y1={S} x2={S} y2={0} stroke="#3a3f4a" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r={5} fill={color} stroke="#000" onPointerDown={down(i)} style={{ cursor: "grab" }} />
        ))}
      </svg>
      <p className="mt-1 text-[10px] text-[var(--muted)]">Drag points · double-click adds · right-click / Alt+click removes</p>
    </div>
  );
}
