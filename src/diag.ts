// Tanı bilgisi (2026-11-25, oyuncu bildirimi: "güçlü PC'de geç oyunda 5 kare/sn"; bende tekrarlanamadı). Hata raporunda oyuncu
// "Teknik bilgileri ekle" kutusunu işaretli bırakırsa raporla birlikte gider: kare hızı, ekran kartının adı ve yazılımla çizilip
// çizilmediği, tarayıcı, ekran, grafik ayarları, oyun süresi, dünyanın kalabalığı. Kişisel bilgi yok. Gizlilik metninde yazar.

/** Ekran kartı: adı ve yazılımla (işlemciyle) çizilip çizilmediği (Chrome'da donanım hızlandırma kapalıysa SwiftShader). */
export interface GpuInfo {
  name: string;
  software: boolean;
}

export function gpuInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    /* bilgi verilmiyor */
  }
  return { name: name.slice(0, 160), software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) };
}

let provider: (() => Record<string, string | number | boolean>) | null = null;

/** Oyun kendi durumunu verir (game.ts). */
export function setDiagProvider(f: () => Record<string, string | number | boolean>): void {
  provider = f;
}

/** Rapora eklenecek tek satırlık döküm (en çok 900 karakter). */
export function diagText(): string {
  const o: Record<string, string | number | boolean> = {};
  try {
    Object.assign(o, provider?.() ?? {});
  } catch {
    /* tanı raporu bozmasın */
  }
  const ua = navigator.userAgent;
  const browser = /Edg\/(\d+)/.exec(ua)?.[0] ?? /OPR\/(\d+)/.exec(ua)?.[0] ?? /Firefox\/(\d+)/.exec(ua)?.[0] ?? /Chrome\/(\d+)/.exec(ua)?.[0] ?? /Version\/(\d+).*Safari/.exec(ua)?.[0] ?? 'bilinmiyor';
  const os = /Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|iPad|Mac OS X [\d_]+|CrOS|Linux/.exec(ua)?.[0] ?? '';
  o.tarayici = `${browser} ${os}`.trim();
  o.ekran = `${innerWidth}×${innerHeight}@${devicePixelRatio}`;
  o.cekirdek = navigator.hardwareConcurrency ?? 0;
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) o.yiginMB = Math.round(mem.usedJSHeapSize / 1e6);
  return Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' · ').slice(0, 900);
}
