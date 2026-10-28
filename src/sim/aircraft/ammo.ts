// Mermi kuşağı (dizilim): aynı silah, farklı mermi karışımı. Hava hedefine, yer hedefine ve yangın çıkarmaya
// etkisi farklıdır. Tüm uçağın makineli tüfek ve toplarına birlikte uygulanır (taretler standart kalır).

import { L } from '../../i18n';

export type BeltId = 'std' | 'he' | 'ap' | 'tracer';

export interface BeltDef {
  id: BeltId;
  name: string;
  desc: string;
  /** Hava hedefine hasar çarpanı. */
  air: number;
  /** Yer hedefine (yapı, uçaksavar) hasar çarpanı. */
  ground: number;
  /** Yangın ve depo/bomba infilakı ihtimali çarpanı. */
  fire: number;
  /** Hedef zırhının etkisi (0,5 = zırhın yarısını deler). */
  armor: number;
  /** Nişan hatası çarpanı (iz mermisi düzeltmeyi kolaylaştırır). */
  aim: number;
}

export const BELTS: Record<BeltId, BeltDef> = {
  std: {
    id: 'std', name: L('Standart karışım', 'Standard mix'), air: 1, ground: 1, fire: 1, armor: 1, aim: 1,
    desc: L('Zırh delici, yangın ve iz mermisi karışık. Her işe yarar.', 'A mix of armour-piercing, incendiary and tracer rounds. Good for everything.'),
  },
  he: {
    id: 'he', name: L('Yangın / infilaklı', 'Incendiary / HE'), air: 1.1, ground: 0.8, fire: 1.35, armor: 1.25, aim: 1,
    desc: L('Uçağı tutuşturur, depoyu patlatır. Zırhlı hedefte ve yerde zayıf.', 'Sets aircraft alight and blows up fuel tanks. Weak against armour and ground targets.'),
  },
  ap: {
    id: 'ap', name: L('Zırh delici', 'Armour-piercing'), air: 0.92, ground: 1.3, fire: 0.7, armor: 0.5, aim: 1,
    desc: L('Zırhlı taarruz uçağına ve yer hedeflerine karşı. Yangın çıkarması zor.', 'For armoured attack aircraft and ground targets. Rarely starts fires.'),
  },
  tracer: {
    id: 'tracer', name: L('İz mermisi ağırlıklı', 'Tracer-heavy'), air: 0.92, ground: 0.9, fire: 1, armor: 1, aim: 0.85,
    desc: L('Atışı düzeltmek kolaylaşır (acemi pilota yarar); her mermi biraz daha zayıf.', 'Easier to correct aim (helps rookie pilots); each round is slightly weaker.'),
  },
};

export const BELT_LIST: BeltDef[] = Object.values(BELTS);
