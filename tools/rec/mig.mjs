// MiG-15 videosu (geceden gün doğumuna): src/rec/migTakes.ts çekimleri (out/mig/<çekim>.mp4 + .wav) kurgulanır.
//   node record.mjs --dir=mig mig_g1_uzak … mig_s13_siluet   çekimler
//   node mig.mjs                                             → ../../release/sosyal/07-mig15-gece/mig15_gece.mp4
// Gece bölümü kısa çapraz geçişlerle, şafak bölümü düz kesmelerle, bulut üstü yeniden çapraz geçişle; siyahtan açılış,
// sonda logo. Oyunun sesi (motor, rüzgâr) aynı geçişlerle, −14 LUFS. Çekimlerin tamamı klipler/ altına kopyalanır.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(HERE, 'out', 'mig');
const DEST = join(ROOT, 'release', 'sosyal', '07-mig15-gece');
const FPS = 60;
const W = 1080;
const H = 1920;
const CUT = 1 / FPS;
// [çekim, kaynakta başlangıç (sn), süre (sn), sonraki çekime geçiş (sn; CUT = düz kesme)]
const CUTS = [
  ['mig_g1_uzak', 0.4, 1.4, 0.25],
  ['mig_g2_kafa', 1.1, 1.4, 0.25],
  ['mig_g4_kuyruk', 0.5, 1.6, 0.25],
  ['mig_g5_hangar', 1.4, 1.7, 0.4],
  ['mig_s6_siluet', 1.0, 1.3, CUT],
  ['mig_s7_kanopi', 0.5, 1.0, CUT],
  ['mig_s8_hizalan', 1.2, 1.1, CUT],
  ['mig_s9_kalkis', 3.1, 1.5, CUT],
  ['mig_s10_takim', 0.5, 1.8, 0.3],
  ['mig_s11_tirmanis', 0.5, 1.5, 0.3],
  ['mig_s12_iz', 0.5, 1.5, 0.4],
  ['mig_s13_siluet', 0.4, 2.3, 0],
];
const LOGO = join(ROOT, 'brand', 'logo-yatay-beyaz-yazi.png');
/** Logo, sondan bu kadar önce belirir (sn). */
const LOGO_AT = 1.5;

function run(args, tag) {
  return new Promise((ok, fail) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${tag}: ${err.slice(-800)}`))));
  });
}

mkdirSync(join(DEST, 'klipler'), { recursive: true });
const args = ['-y'];
for (const [id] of CUTS) {
  if (!existsSync(join(SRC, `${id}.mp4`))) throw new Error(`çekim yok: ${id}`);
  args.push('-i', join(SRC, `${id}.mp4`));
}
for (const [id] of CUTS) args.push('-i', join(SRC, `${id}.wav`));
const n = CUTS.length;
const f = [];
CUTS.forEach(([, s, d], i) => {
  f.push(`[${i}:v]trim=start=${s}:duration=${d},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H},format=yuv420p,settb=AVTB[v${i}]`);
  f.push(`[${n + i}:a]atrim=start=${s}:duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
});
let len = CUTS[0][2];
let pv = 'v0';
let pa = 'a0';
for (let i = 1; i < n; i++) {
  const x = CUTS[i - 1][3];
  f.push(`[${pv}][v${i}]xfade=transition=fade:duration=${x.toFixed(4)}:offset=${(len - x).toFixed(4)}[vx${i}]`);
  f.push(`[${pa}][a${i}]acrossfade=d=${x.toFixed(4)}:c1=tri:c2=tri[ax${i}]`);
  pv = `vx${i}`;
  pa = `ax${i}`;
  len += CUTS[i][2] - x;
}
const T = len;
// Logo: son anda ortada, aşağıda; yumuşak beliriş. Açılış siyahtan, kapanışta ses söner.
args.push('-loop', '1', '-t', String(T), '-i', LOGO);
f.push(`[${2 * n}:v]scale=760:-1,format=rgba,fade=t=in:st=${(T - LOGO_AT).toFixed(3)}:d=0.5:alpha=1[lg]`);
f.push(`[${pv}]fade=t=in:st=0:d=0.6[vf]`);
f.push(`[vf][lg]overlay=(W-w)/2:H*0.68:shortest=1,format=yuv420p[vout]`);
f.push(`[${pa}]afade=t=in:st=0:d=0.5,afade=t=out:st=${(T - 0.8).toFixed(3)}:d=0.8,loudnorm=I=-14:TP=-1.0:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', T.toFixed(3), join(DEST, 'mig15_gece.mp4'));
await run(args, 'kurgu');
// Kapak: hangar ağzındaki MiG-15 (gece)
await run(['-y', '-ss', '2.2', '-i', join(SRC, 'mig_g5_hangar.mp4'), '-frames:v', '1', '-q:v', '2', join(DEST, 'kapak.jpg')], 'kapak');
// Kısa klipler (çekimlerin tamamı, sesli) sonradan kullanmak için
// Kurguda kullanılmayan gece apron çekimi de (karanlık; başka videoya)
for (const id of [...CUTS.map((c) => c[0]), 'mig_g3_apron']) {
  copyFileSync(join(SRC, `${id}.mp4`), join(DEST, 'klipler', `${id}.mp4`));
  copyFileSync(join(SRC, `${id}.wav`), join(DEST, 'klipler', `${id}.wav`));
}
console.log(`tamam: ${join(DEST, 'mig15_gece.mp4')} (${T.toFixed(2)} sn), ${n} klip klipler/ altında`);
