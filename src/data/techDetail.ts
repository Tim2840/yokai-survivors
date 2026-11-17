import type { TechDef, TechMechanic } from './techniques';

/**
 * 能力面板「技法」欄位（使用者 2026-11-17：「應該要有技法的欄位在能力面板裡面，然後寫出所有詳細訊息例如攻擊力 攻速等等」）。
 * 每種機制要列哪些參數、怎麼換算成玩家看的數字。值一律從作用中的定義（詞條、進化已算進去）讀，不在這裡寫數字。
 * kind：
 *  - dmg：傷害比例 × 主武器一發的傷害 × 技法效果倍率 → 「約 N（主武器 X%）」
 *  - secA：間隔秒數，會吃全身攻擊速度與冷卻（× 冷卻 ÷ 攻速）
 *  - sec：間隔秒數（不吃攻速）
 *  - mA：公尺，會吃全身範圍；m：公尺（不吃）
 *  - n：個數（欄位叫 count 的會加上數量詞條）
 *  - dur：持續秒數；pct：百分比；x：倍率；regen：每秒回復；pull：公尺/秒
 */
export type TechDetailKind = 'dmg' | 'secA' | 'sec' | 'mA' | 'm' | 'n' | 'dur' | 'pct' | 'x' | 'regen' | 'pull';
type Sub = Exclude<keyof TechDef, 'id' | 'mech' | 'weapon' | 'family' | 'kind' | 'likes' | 'excludes' | 'form'>;
/** [定義裡的子物件, 欄位, 換算方式, 顯示名稱的 i18n 尾碼（tdet.<label>）] */
export type TechDetailRow = readonly [Sub, string, TechDetailKind, string];

export const TECH_DETAIL: Record<TechMechanic, readonly TechDetailRow[]> = {
  kitsunebi: [['split', 'damage', 'dmg', 'damage'], ['split', 'children', 'n', 'children'], ['split', 'range', 'm', 'seek'], ['rain', 'count', 'n', 'rain']],
  bounce: [['bounce', 'damage', 'dmg', 'jumpDamage'], ['bounce', 'jumps', 'n', 'jumps'], ['bounce', 'range', 'm', 'seek']],
  homing: [['homing', 'returnPierce', 'n', 'returnPierce'], ['homing', 'speedMult', 'x', 'flySpeed'], ['homing', 'returnDamage', 'pct', 'returnDamage']],
  rain: [['rain', 'damage', 'dmg', 'damage'], ['rain', 'count', 'n', 'count'], ['rain', 'radius', 'm', 'radius']],
  ring: [['orbit', 'damage', 'dmg', 'damage'], ['orbit', 'tick', 'secA', 'interval'], ['orbit', 'radius', 'mA', 'radius']],
  ward: [['ward', 'burstDamage', 'dmg', 'burstDamage'], ['ward', 'chargeSeconds', 'sec', 'charge'], ['ward', 'burstRadius', 'mA', 'radius']],
  satellite: [['satellite', 'damage', 'dmg', 'damage'], ['satellite', 'tick', 'secA', 'interval'], ['satellite', 'count', 'n', 'count'], ['satellite', 'radius', 'mA', 'radius']],
  lamp: [['lamp', 'damage', 'dmg', 'damage'], ['lamp', 'tick', 'secA', 'interval'], ['lamp', 'count', 'n', 'count'], ['lamp', 'hitRadius', 'm', 'hitRadius']],
  hellfire: [['burn', 'damage', 'dmg', 'tickDamage'], ['burn', 'tick', 'sec', 'interval'], ['burn', 'radius', 'mA', 'radius'], ['burn', 'seconds', 'dur', 'duration'], ['burn', 'shotDamage', 'x', 'shotDamage']],
  seed: [['seed', 'damage', 'dmg', 'burstDamage'], ['seed', 'delay', 'sec', 'delay'], ['seed', 'radius', 'mA', 'radius'], ['seed', 'max', 'n', 'max']],
  pillar: [['pillar', 'damage', 'dmg', 'damage'], ['pillar', 'interval', 'secA', 'interval'], ['pillar', 'radius', 'mA', 'radius'], ['pillar', 'range', 'm', 'castRange'], ['pillar', 'launchSeconds', 'dur', 'launch']],
  oil: [['oil', 'damage', 'dmg', 'tickDamage'], ['oil', 'tick', 'sec', 'interval'], ['oil', 'seconds', 'dur', 'duration'], ['oil', 'spread', 'n', 'spread']],
  vortex: [['vortex', 'damage', 'dmg', 'tickDamage'], ['vortex', 'tick', 'sec', 'interval'], ['vortex', 'radius', 'mA', 'radius'], ['vortex', 'seconds', 'dur', 'duration'], ['vortex', 'pull', 'pull', 'pull']],
  wake: [['wake', 'damage', 'dmg', 'tickDamage'], ['wake', 'tick', 'sec', 'interval'], ['wake', 'radius', 'mA', 'radius'], ['wake', 'seconds', 'dur', 'duration'], ['wake', 'slow', 'pct', 'slow']],
  sumo: [['sumo', 'damage', 'dmg', 'damage'], ['sumo', 'interval', 'secA', 'interval'], ['sumo', 'reach', 'mA', 'reach'], ['sumo', 'chainDamage', 'pct', 'chainDamage']],
  domain: [['domain', 'radius', 'mA', 'radius'], ['domain', 'seconds', 'dur', 'duration'], ['domain', 'slow', 'pct', 'slow'], ['domain', 'selfAtkSpeed', 'pct', 'selfAtkSpeed'], ['domain', 'selfSpeed', 'pct', 'selfSpeed'], ['domain', 'selfRegen', 'regen', 'selfRegen']],
  spin: [['spin', 'damage', 'pct', 'swingDamage']],
  combo: [['combo', 'extra', 'n', 'extraSwings'], ['combo', 'damage', 'dmg', 'damage']],
  heavy: [['heavy', 'every', 'n', 'shockEvery'], ['heavy', 'damage', 'x', 'shockDamage']],
  rift: [['rift', 'damage', 'x', 'riftDamage'], ['rift', 'length', 'mA', 'length'], ['rift', 'width', 'm', 'width']],
  prison: [['prison', 'damage', 'dmg', 'damage'], ['prison', 'hold', 'dur', 'hold'], ['prison', 'radius', 'mA', 'radius'], ['prison', 'max', 'n', 'max']],
};
