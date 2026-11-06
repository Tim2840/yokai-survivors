/**
 * 法具的「連結」（使用者 2026-11-06：「所有法具能輔助融合成什麼、影響了哪些招式，都要清楚寫明」）。
 * 從資料反推：這個法具是哪些大招的配方材料（需要練到幾級）、是哪些技法「適合」搭配（`TechDef.likes`）。
 * 選卡畫面與能力面板都用這一份，所以新增大招、技法或法具時不用另外維護文字。
 * 取捨道具（妖刀、狂燈、金剛身）算成它們加強的那個屬性道具（力量、迅捷、堅甲）。
 */
import { ITEMS, type ItemDef } from './items';
import { ULT_RECIPES } from './ultimates';
import { TECHS } from './techniques';
import { YOKAI } from './yokai';

export interface CardLinks {
  /** 這個法具是材料的大招：id 與需要練到幾級 */
  ults: { id: string; level: number }[];
  /** 適合搭配這個法具的技法 id */
  techs: string[];
  /** 主武器：所有大招都要它練到最高、所有技法都靠它出手 */
  weapon: boolean;
}

/** 取捨道具視為它加強的那個一般道具 */
function baseItemId(d: ItemDef): string {
  if (d.kind === 'stat' && d.down) return ITEMS.find((x) => x.kind === 'stat' && x.stat === d.stat && !x.down)?.id ?? d.id;
  return d.id;
}

export function cardLinks(cardId: string, yokai: string): CardLinks {
  const weaponId = YOKAI[yokai]?.weapon.id ?? '';
  const d = ITEMS.find((x) => x.id === cardId);
  if (!d || d.kind === 'fallback') return { ults: [], techs: [], weapon: false };
  const base = baseItemId(d);
  return {
    ults: ULT_RECIPES.filter((r) => r.yokai === yokai && base in r.requires).map((r) => ({ id: r.id, level: r.requires[base] })),
    techs: TECHS.filter((x) => x.weapon === weaponId && x.likes.includes(base)).map((x) => x.id),
    weapon: d.kind === 'weapon',
  };
}
