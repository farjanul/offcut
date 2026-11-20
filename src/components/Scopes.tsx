"use client";
import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/engine";

type Mode = "waveform" | "histogram" | "vector";

/** Live video scopes computed from the program monitor (waveform, RGB histogram, vectorscope) */
export default function Scopes() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("waveform");

  useEffect(() => {
    const W = 256, H = 128;
    const id = setInterval(() => {
      const cv = ref.current;
      const img = engine.sample(160);
      if (!cv || !img) return;
      const g = cv.getContext("2d")!;
      g.fillStyle = "#07080a"; g.fillRect(0, 0, W, H);
      const { data, width, height } = img;
      if (mode === "waveform") {
        g.fillStyle = "rgba(120,255,160,.18)";
        for (let x = 0; x < width; x++) for (let y = 0; y < height; y += 1) {
          const i = (y * width + x) * 4;
          const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          g.fillRect((x / width) * W, H - 1 - l * (H - 1), Math.max(1, W / width), 1);
        }
        g.strokeStyle = "#333"; for (const f of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * f); g.lineTo(W, H * f); g.stroke(); }
      } else if (mode === "histogram") {
        const bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) bins[c][data[i + c] >> 2]++;
        const max = Math.max(1, ...bins.flatMap((b) => Array.from(b)));
        g.globalCompositeOperation = "lighter";
        (["#ff4040", "#40ff60", "#4080ff"] as const).forEach((col, c) => {
          g.fillStyle = col + "99";
          bins[c].forEach((v, i) => { const h = (v / max) * (H - 4); g.fillRect((i / 64) * W, H - h, W / 64, h); });
        });
        g.globalCompositeOperation = "source-over";
      } else {
        const cx = W / 2, cy = H / 2, r = H / 2 - 4;
        g.strokeStyle = "#333"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
        g.fillStyle = "rgba(255,255,255,.35)";
        for (let i = 0; i < data.length; i += 8) {
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const u = (-0.168736 * R - 0.331264 * G + 0.5 * B) / 128, v = (0.5 * R - 0.418688 * G - 0.081312 * B) / 128;
          g.fillRect(cx + u * r * 1.6, cy - v * r * 1.6, 1.5, 1.5);
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, [mode]);

  return (
    <div className="absolute bottom-2 right-2 z-10 rounded-lg border border-[var(--line)] bg-[var(--panel)]/95 p-2 shadow-xl">
      <div className="mb-1 flex gap-1">
        {(["waveform", "histogram", "vector"] as const).map((m) => (
          <button key={m} className={`btn !px-2 !py-0.5 text-[11px] ${mode === m ? "!border-[var(--accent)] text-[var(--accent)]" : ""}`} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      <canvas ref={ref} width={256} height={128} className="rounded" />
    </div>
  );
}
