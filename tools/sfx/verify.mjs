// sources.json'daki lisansları kayıtların sayfasından yeniden doğrular (NC / ND lisanslı kayıt kullanılamaz).
import { readFileSync } from 'node:fs';

const sources = JSON.parse(readFileSync('sources.json', 'utf8'));
let bad = 0;
for (const [id, s] of Object.entries(sources)) {
  const html = await (await fetch(s.url, { headers: { 'User-Agent': 'Mozilla/5.0 (WarSim sound build)' } })).text();
  const m = html.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/([\d.]+)\//);
  const code = m ? `${m[2]}/${m[3]}` : '?';
  const name = code === 'zero/1.0' ? 'CC0 1.0' : code.startsWith('by/') ? `CC BY ${m[3]}` : code;
  const ok = name === s.license && /^(CC0 1\.0|CC BY [\d.]+)$/.test(name);
  if (!ok) bad++;
  console.log(ok ? 'tamam' : 'SORUN', id, name, s.title);
  await new Promise((r) => setTimeout(r, 250));
}
console.log(bad ? `${bad} sorunlu kayıt` : 'hepsi uygun');
process.exit(bad ? 1 : 0);
