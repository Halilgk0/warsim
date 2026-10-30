// Ansiklopedi makaleleri: her uçağın tarihçesi ve gerçek verileri, Türkçe ve İngilizce, döneme göre makale/*.ts
// dosyalarında (biçim tur.ts). Yalnız sayfa üretiminde kullanılır (sayfalar.ts, derlemede); oyun paketine girmez.
// Sıra ve ad, yıl, ülke uçak katalogundan (specs.ts) gelir; "Oyunda" bölümünün sayıları ve araştırma yolu da oradan
// türetilir. Burada yalnız elle yazılan metin durur. Yeni makalenin adresi liste.ts'e de yazılır.

import type { Article } from './tur';
import { A1937_1939 } from './makale/1937-1939';
import { A1940_1941 } from './makale/1940-1941';
import { A1942_1943 } from './makale/1942-1943';
import { A1944 } from './makale/1944';
import { A1945_1952 } from './makale/1945-1952';
import { A1960 } from './makale/1960-sonrasi';

export type { Article, Tx } from './tur';

export const ARTICLES: Article[] = [...A1937_1939, ...A1940_1941, ...A1942_1943, ...A1944, ...A1945_1952, ...A1960];
