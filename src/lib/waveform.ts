/** Decode audio locally and render a waveform strip as a PNG data URL. */
export async function computeWaveform(file: File): Promise<string | undefined> {
  if (file.size > 100 * 1024 * 1024) return undefined;
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const N = Math.min(4000, Math.max(50, Math.ceil(buf.duration * 40)));
    const data = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / N));
    const H = 48;
    const c = document.createElement("canvas");
    c.width = N; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < N; i++) {
      let peak = 0;
      const s = i * block;
      for (let j = 0; j < block; j += Math.ceil(block / 64)) peak = Math.max(peak, Math.abs(data[s + j] || 0));
      const h = Math.max(1, Math.min(1, peak * 1.4) * H);
      g.fillRect(i, (H - h) / 2, 1, h);
    }
    return c.toDataURL("image/png");
  } catch {
    return undefined; // no audio track / undecodable
  }
}
