/**
 * 法具的「連結」（使用者 2026-11-06：「所有法具能輔助融合成什麼、影響了哪些招式，都要清楚寫明」）。
 * 從資料反推：這個法具是哪些技法「適合」搭配（`TechDef.likes`）。大招在 D52 改成局外裝配後，法具不再是大招的材料，
 * 所以只剩技法。選卡畫面與能力面板都用這一份，所以新增技法或法具時不用另外維護文字。
 * 取捨道具（妖刀、狂燈、金剛身）算成它們加強的那個屬性道具（力量、迅捷、堅甲）。
 */
import { ITEMS, type ItemDef } from './items';
import { TECHS } from './techniques';
import { YOKAI } from './yokai';

export interface CardLinks {
  /** 適合搭配這個法具的技法 id */
  techs: string[];
  /** 主武器：所有技法都靠它出手 */
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
  if (!d || d.kind === 'fallback') return { techs: [], weapon: false };
  const base = baseItemId(d);
  return {
    techs: TECHS.filter((x) => x.weapon === weaponId && x.likes.includes(base)).map((x) => x.id),
    weapon: d.kind === 'weapon',
  };
}
