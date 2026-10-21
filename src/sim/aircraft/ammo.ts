// Mermi kuşağı (dizilim): aynı silah, farklı mermi karışımı. Hava hedefine, yer hedefine ve yangın çıkarmaya
// etkisi farklıdır. Tüm uçağın makineli tüfek ve toplarına birlikte uygulanır (taretler standart kalır).

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
    id: 'std', name: 'Standart karışım', air: 1, ground: 1, fire: 1, armor: 1, aim: 1,
    desc: 'Zırh delici, yangın ve iz mermisi karışık. Her işe yarar.',
  },
  he: {
    id: 'he', name: 'Yangın / infilaklı', air: 1.1, ground: 0.8, fire: 1.35, armor: 1.25, aim: 1,
    desc: 'Uçağı tutuşturur, depoyu patlatır. Zırhlı hedefte ve yerde zayıf.',
  },
  ap: {
    id: 'ap', name: 'Zırh delici', air: 0.92, ground: 1.3, fire: 0.7, armor: 0.5, aim: 1,
    desc: 'Zırhlı taarruz uçağına ve yer hedeflerine karşı. Yangın çıkarması zor.',
  },
  tracer: {
    id: 'tracer', name: 'İz mermisi ağırlıklı', air: 0.92, ground: 0.9, fire: 1, armor: 1, aim: 0.85,
    desc: 'Atışı düzeltmek kolaylaşır (acemi pilota yarar); her mermi biraz daha zayıf.',
  },
};

export const BELT_LIST: BeltDef[] = Object.values(BELTS);
