// Uçaksavar toplarının Blender dokuları (2026-11-20; araçlar tools/blender/top_al.mjs ve top.py): oyunun kendi geometrisi
// UV açılıp dokulanır (boya aşınması, kir, yuvarlanmış kenar normali, ortam gölgesi). Yalnız ayrıntılı modelde (Orta ve
// Yüksek kalite, hangar vitrini); Düşükte kodla boyanmış model. Dosyalar public/top: <top>.glb (Draco; base, yaw, pitch,
// recoil parçaları kendi grup ekseninde), _albedo/_normal/_aos.webp. Silah ilk kez çizilince yüklenir (uçaklar gibi).
import type * as THREE from 'three';
import type { AAWeaponId } from '../sim/structures/aaWeapons';
import { archBakedMaterial } from './arch';
import { bakedTexture, gltf } from './models';

interface GunSkin {
  geos: Map<string, THREE.BufferGeometry>;
  maps: { albedo: THREE.Texture; normal: THREE.Texture; ao: THREE.Texture };
}

const skins = new Map<AAWeaponId, GunSkin>();
const loads = new Map<AAWeaponId, Promise<void>>();
let version = 0;

/** Yüklenmiş top dokularının sürümü: artınca bataryalar toplarını yeniden kurar. */
export function gunSkinStamp(): number {
  return version;
}

/** Topun Blender modeli hazır mı; değilse yüklemeyi başlatır (hazır olana dek kodla boyanmış model çizilir). */
export function requestGunSkin(w: AAWeaponId): boolean {
  if (skins.has(w)) return true;
  if (!loads.has(w)) loads.set(w, load(w).catch((e) => console.warn('top modeli', w, e)));
  return false;
}

/** Topun Blender modeli yüklenene dek bekle (hangar vitrini, görsel araçları). */
export async function ensureGunSkin(w: AAWeaponId): Promise<void> {
  if (!requestGunSkin(w)) await loads.get(w);
}

/** Bütün topların Blender modelleri (ansiklopedi ve üretim görselleri). */
export async function loadAllGunSkins(): Promise<void> {
  const { AA_WEAPONS } = await import('../sim/structures/aaWeapons');
  await Promise.all((Object.keys(AA_WEAPONS) as AAWeaponId[]).map(ensureGunSkin));
}

async function load(w: AAWeaponId): Promise<void> {
  const loader = await gltf();
  const [g, albedo, normal, ao] = await Promise.all([
    loader.loadAsync(`${import.meta.env.BASE_URL}top/${w}.glb`),
    bakedTexture(`top/${w}_albedo.webp`, true), bakedTexture(`top/${w}_normal.webp`, false), bakedTexture(`top/${w}_aos.webp`, false),
  ]);
  const geos = new Map<string, THREE.BufferGeometry>();
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geos.set((m.name || m.parent?.name || '').replace(/[^A-Za-z]/g, ''), m.geometry);
  });
  skins.set(w, { geos, maps: { albedo, normal, ao } });
  version++;
}

/** Yapı malzemesi başına (hasar değeri yapıya özgü) top başına bir dokulu malzeme. */
const mats = new WeakMap<THREE.Material, Map<AAWeaponId, THREE.Material>>();

/** Yüklüyse topun dokulu parçaları ve yapının malzemesinden türeyen dokulu malzeme. */
export function bakedGun(w: AAWeaponId, src: THREE.Material): { geos: Map<string, THREE.BufferGeometry>; mat: THREE.Material } | null {
  const sk = skins.get(w);
  if (!sk) return null;
  let per = mats.get(src);
  if (!per) mats.set(src, (per = new Map()));
  let mat = per.get(w);
  if (!mat) per.set(w, (mat = archBakedMaterial(src, sk.maps)));
  return { geos: sk.geos, mat };
}
