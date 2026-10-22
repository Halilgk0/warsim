// Ham kayıtları indirir (Freesound yüksek kaliteli Ogg önizlemesi; giriş gerekmez) → raw/<id>.ogg
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const sources = JSON.parse(readFileSync('sources.json', 'utf8'));
mkdirSync('raw', { recursive: true });
const ids = Object.keys(sources).filter((id) => !existsSync(`raw/${id}.ogg`));
let i = 0;
async function worker() {
  while (i < ids.length) {
    const id = ids[i++];
    const r = await fetch(sources[id].ogg, { headers: { 'User-Agent': 'Mozilla/5.0 (WarSim sound build)' } });
    if (!r.ok) { console.log('indirilemedi', id, r.status); continue; }
    writeFileSync(`raw/${id}.ogg`, Buffer.from(await r.arrayBuffer()));
    console.log('ok', id, sources[id].title);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`${Object.keys(sources).length} kayıt hazır`);
