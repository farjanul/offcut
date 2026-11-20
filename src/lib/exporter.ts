// Offline ("fast") exporter: WebCodecs video + AAC/Opus audio muxed to MP4. Everything stays on this machine.
import { ArrayBufferTarget, FileSystemWritableFileStreamTarget, Muxer } from "mp4-muxer";
import { useEditor } from "./store";
import { projectDuration } from "./types";
import { applyChainParams, buildChain, engine, makeImpulse } from "./engine";
import { fadeFactor, fwd, speedAt, valueAt } from "./effects";

export interface FastOpts {
  scale: number; from: number; to: number; bitrate: number;
  sink: FileSystemWritableFileStream | null;
  onProgress: (p: number, label: string) => void;
  signal: { cancelled: boolean };
}

export const fastExportSupported = () =>
  typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window && "VideoFrame" in window;

/** mixes all audible clips between from..to into a stereo float buffer (clip by clip, to keep memory low) */
export async function mixAudio(from: number, to: number, sr = 48000, onStep?: (p: number) => void): Promise<[Float32Array, Float32Array]> {
  const st = useEditor.getState();
  const total = Math.ceil((to - from) * sr);
  const L = new Float32Array(total), R = new Float32Array(total);
  const dec = new OfflineAudioContext(2, 1, sr);
  const clips = st.project.clips.filter((c) => (c.type === "audio" || c.type === "video") && c.mediaId && !c.reverse && !c.freeze && c.start < to && c.start + c.duration > from);
  let n = 0;
  for (const c of clips) {
    onStep?.(n++ / Math.max(1, clips.length));
    const tr = st.project.tracks.find((t) => t.id === c.trackId);
    const file = st.files[c.mediaId!];
    if (!file || tr?.muted) continue;
    let buf: AudioBuffer;
    try { buf = await dec.decodeAudioData(await file.arrayBuffer()); } catch { continue; } // no audio track
    const a = Math.max(c.start, from), b = Math.min(c.start + c.duration, to);
    const segLen = Math.ceil((b - a) * sr);
    if (segLen < 8) continue;
    const off = new OfflineAudioContext(2, segLen, sr);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(speedAt(c, a - c.start), 0);
    if (c.rampTo) src.playbackRate.linearRampToValueAtTime(speedAt(c, b - c.start), b - a);
    const chain = buildChain(off, src, [off.destination], makeImpulse(off));
    applyChainParams(chain, c, tr?.vol ?? 1);
    for (let k = 0; k <= (b - a) / 0.05; k++) {
      const tt = a + k * 0.05;
      chain.gain.gain.setValueAtTime(valueAt(c, "volume", tt) * fadeFactor(c, Math.min(tt, c.start + c.duration - 0.001)) * (tr?.vol ?? 1), k * 0.05);
    }
    src.start(0, Math.max(0, c.offset + fwd(c, a - c.start)));
    const out = await off.startRendering();
    const o = Math.round((a - from) * sr);
    const l = out.getChannelData(0), r = out.getChannelData(1);
    for (let i = 0; i < l.length && o + i < total; i++) { L[o + i] += l[i]; R[o + i] += r[i]; }
  }
  for (let i = 0; i < total; i++) { L[i] = Math.max(-1, Math.min(1, L[i])); R[i] = Math.max(-1, Math.min(1, R[i])); }
  return [L, R];
}

export function encodeWav(L: Float32Array, R: Float32Array, sr: number): Blob {
  const n = L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, L[i] * 0x7fff, true); v.setInt16(46 + i * 4, R[i] * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}

export async function fastExport(o: FastOpts): Promise<{ blob?: Blob; ext: "mp4" } | null> {
  const st = useEditor.getState();
  const P = st.project;
  const total = projectDuration(P);
  const from = o.from, to = Math.min(total, o.to), dur = to - from;
  if (dur <= 0) return null;
  const even = (x: number) => Math.max(16, Math.round(x / 2) * 2);
  const W = even(P.width * o.scale), H = even(P.height * o.scale);
  const fps = P.fps;
  const sr = 48000;

  // ---- audio first (offline mix) ----
  o.onProgress(0, "Mixing audio…");
  const [L, R] = await mixAudio(from, to, sr, (p) => o.onProgress(p * 0.1, "Mixing audio…"));
  if (o.signal.cancelled) return null;

  const audioCodec = (await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: 2, bitrate: 192000 })).supported ? "aac" : "opus";
  const target = o.sink ? new FileSystemWritableFileStreamTarget(o.sink) : new ArrayBufferTarget();
  const muxer = new Muxer({
    target: target as never,
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    audio: { codec: audioCodec, numberOfChannels: 2, sampleRate: sr },
    fastStart: o.sink ? false : "in-memory",
  } as never);

  const level = W * H > 1920 * 1088 ? "avc1.640033" : "avc1.640028";
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { throw e; } });
  venc.configure({ codec: level, width: W, height: H, bitrate: o.bitrate, framerate: fps });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { throw e; } });
  aenc.configure({ codec: audioCodec === "aac" ? "mp4a.40.2" : "opus", sampleRate: sr, numberOfChannels: 2, bitrate: 192000 });

  // audio in 1 s blocks
  const block = sr;
  for (let s = 0; s < L.length; s += block) {
    const n = Math.min(block, L.length - s);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(s, s + n), 0); data.set(R.subarray(s, s + n), n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s / sr) * 1e6), data });
    aenc.encode(ad); ad.close();
  }
  await aenc.flush();

  // ---- video frames: deterministic, one at a time ----
  const frames = Math.ceil(dur * fps);
  const cv = engine.canvas!;
  useEditorSelectionClear();
  for (let i = 0; i < frames; i++) {
    if (o.signal.cancelled) break;
    await engine.frameAt(from + i / fps, o.scale);
    const f = new VideoFrame(cv, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) });
    venc.encode(f, { keyFrame: i % (fps * 2) === 0 });
    f.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
    if (i % 5 === 0) o.onProgress(0.1 + (i / frames) * 0.9, `Rendering frame ${i + 1} / ${frames}`);
  }
  engine.endExport();
  if (o.signal.cancelled) { venc.close(); aenc.close(); return null; }
  await venc.flush();
  muxer.finalize();
  venc.close(); aenc.close();
  o.onProgress(1, "Done");
  if (o.sink) { await o.sink.close(); return { ext: "mp4" }; }
  return { blob: new Blob([(target as InstanceType<typeof ArrayBufferTarget>).buffer], { type: "video/mp4" }), ext: "mp4" };
}

function useEditorSelectionClear() {
  useEditor.setState({ selectedId: null, selectedIds: [] });
}
