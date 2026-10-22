// Açık hava yankısı için dürtü yanıtı (stereo): sönen, zamanla boğuklaşan gürültü ve birkaç erken yansıma
// (yer ve tepeler). Savaş sesleri uzaktan bununla yankılanır.

export function reverbImpulse(sr: number, sec = 1.8): [Float32Array, Float32Array] {
  const n = Math.ceil(sr * sec);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (const ch of out) {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // Tek kutuplu alçak geçiren: kesim 6 kHz'den 400 Hz'e iner
      const a = Math.exp((-2 * Math.PI * (6000 * Math.exp(-t / 0.5) + 400)) / sr);
      const early = t > 0.03 && t < 0.12 && Math.random() < 0.004 ? 1.5 : 0;
      y += (1 - a) * (Math.random() * 2 - 1 + early - y);
      ch[i] = y * Math.exp(-t / 0.45) * Math.min(1, t / 0.02);
    }
  }
  return out;
}
