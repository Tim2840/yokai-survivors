/** 局外商店「修行」（docs/02 第 7.1 節）：價格(lv) = round(基礎價 × 1.35^lv)，lv 從 0 開始，各 8 級 */
export const TRAINING_MAX_LEVEL = 8;
export const PRICE_GROWTH = 1.35;

export interface TrainingDef {
  id: string;
  stat: string;
  perLevel: number;
  basePrice: number;
}

export const TRAINING: readonly TrainingDef[] = [
  { id: 'hp', stat: 'maxHp', perLevel: 0.04, basePrice: 50 },
  { id: 'power', stat: 'power', perLevel: 0.03, basePrice: 50 },
  { id: 'atkSpeed', stat: 'atkSpeed', perLevel: 0.03, basePrice: 50 },
  { id: 'area', stat: 'area', perLevel: 0.03, basePrice: 50 },
  { id: 'speed', stat: 'speed', perLevel: 0.025, basePrice: 50 },
  { id: 'armor', stat: 'armor', perLevel: 0.5, basePrice: 60 },
  { id: 'pickup', stat: 'pickup', perLevel: 0.05, basePrice: 40 },
  { id: 'luck', stat: 'luck', perLevel: 3, basePrice: 70 },
];

export function trainingPrice(def: TrainingDef, level: number): number {
  return Math.round(def.basePrice * Math.pow(PRICE_GROWTH, level));
}
