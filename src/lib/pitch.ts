// Pitch detection (YIN). Runs entirely on the device — audio is never stored or sent.
export function yin(buf: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < 0.01) return -1;
  const maxLag = Math.floor(sampleRate / 45), minLag = Math.floor(sampleRate / 1500), W = buf.length - maxLag;
  if (W < 256) return -1;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  const dn = new Float32Array(maxLag + 1); dn[0] = 1; let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; dn[tau] = (d[tau] * tau) / (run || 1); }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (dn[t] < 0.15) { while (t + 1 <= maxLag && dn[t + 1] < dn[t]) t++; tau = t; break; }
  }
  if (tau < 0) return -1;
  const a = dn[tau - 1] ?? dn[tau], b = dn[tau], c = dn[tau + 1] ?? dn[tau];
  const p = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sampleRate / (tau + (Number.isFinite(p) ? p : 0));
}

/** Frequency → nearest MIDI note and how many cents off (negative = flat). */
export function toNote(freq: number) {
  const mf = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(mf);
  return { midi, cents: Math.round((mf - midi) * 100) };
}
