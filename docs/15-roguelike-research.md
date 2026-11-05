# 15 同類肉鴿遊戲的系統與數值研究（2026-11-04）

> 起因：使用者指出「你的數值都太簡單了，先好好研究其他肉鴿遊戲怎麼做，再動手做」。這份是研究結果與**改版提案**，**提案等使用者點頭才實作**（docs/14 Q20）。
>
> **資料可信度**：這個雲端環境的網路政策擋掉了 wiki 網站（vampire.survivors.wiki、brotato.wiki.spellsandguns.com、holocure.fandom.com、megabonk.wiki、escapistmagazine.com 讀不到），所以數字來自網頁搜尋的摘要（fandom wiki、社群攻略、Steam 討論）。**都是二手資料**；標「社群實測」的不是官方數字。要確認原文，請在環境設定把那些網域加進允許清單後再查一次。

## 1. 各遊戲怎麼做（重點數字）

### 1.1 吸血鬼倖存者（Vampire Survivors）

- **每把武器有 8 級，每一級的加成不同**：魔杖（Magic Wand）Lv2 多 1 顆、Lv3 冷卻 −0.2 秒、Lv4 多 1 顆、Lv5 傷害 +10、Lv6 多 1 顆、Lv7 穿透 +1、Lv8 傷害 +10；滿級合計 +20 傷害、+3 顆、+1 穿透、−0.2 秒（[fandom](https://vampire-survivors.fandom.com/wiki/Magic_Wand)、[dood.gg](https://dood.gg/en/vampire-survivors/weapons/magic-wand)）。→ **每次升級的「感覺」不一樣**。
- **被動道具最多 5 級，每級固定幅度**：菠菜 攻擊力 +10%／級（滿 +50%）、空白之書 冷卻 −8%／級（滿 −40%）、燭台 範圍 +10%／級（滿 +50%）；**數量（多一顆）的道具只有 2 級**（Duplicator +1／級）（[fandom 被動道具](https://vampire-survivors.fandom.com/wiki/Passive_items)、[Spinach](https://vampire-survivors.fandom.com/wiki/Spinach)、[Empty Tome](https://vampire-survivors.fandom.com/wiki/Empty_Tome)、[Duplicator](https://vampire-survivors.fandom.com/wiki/Duplicator)）。→ 「多一顆」非常稀有、有上限。
- **欄位上限**：武器 6 把、被動 6 個 → 選了 A 就不能選 B，build 有取捨（社群攻略共識）。
- **進化**：武器滿級＋指定被動（有的要滿級、有的任何等級）→ **之後開到的寶箱**才進化；多數攻略說要 10 分鐘以後的寶箱（[Prima Games](https://primagames.com/gaming/vampire-survivors-weapon-evolution-guide)、[fandom Evolution](https://vampire-survivors.fandom.com/wiki/Evolution)）。→ 進化**有門檻、有時機、有儀式感**（開箱）。
- **經驗曲線**：在 20 級、40 級有斷點，所需經驗變多（官方用 +100% 成長補償）（[Growth](https://vampire.survivors.wiki/w/Growth)）。確切公式查不到（社群說法不一）。
- **敵人強度**：一般敵人隨時間換成更強的種類；**頭目的 HP 乘以玩家等級**（社群引用 wiki，未證實）；「詛咒」屬性加敵人速度、HP、數量（[Curse](https://vampire-survivors.fandom.com/wiki/Curse)、[Steam](https://steamcommunity.com/app/1794680/discussions/0/3489752656787156939/)）。

### 1.2 土豆兄弟（Brotato）

- **經驗曲線是平方**：升到下一級要 (等級 + 3)²（16、25、36…）（[Experience](https://brotato.wiki.spellsandguns.com/Experience)）。→ 後期升級明顯變慢。
- **護甲**：承受傷害 = 1 / (1 + 護甲/15)，每點 ≈ 有效生命 +6.66%；負護甲另一條公式（[Armor](https://brotato.wiki.spellsandguns.com/Armor)）。**迴避上限 60%**（個別角色或道具可拉高）（[Dodge](https://brotato.wiki.spellsandguns.com/Dodge)）。
- **升級的稀有度**：第 5 級保證藍、10／15／20 級保證紫、25 級起每 5 級保證紅；各階的機率從某個等級才開始成長，並有上限（舊資料：紅 8%、紫 25%、藍 60%）（[fandom Upgrades](https://brotato.fandom.com/wiki/Upgrades)、[Steam](https://steamcommunity.com/app/1942280/discussions/0/3788128182673272907/)）。→ **用「里程碑保證」給節奏感**，不是只靠亂數。
- **道具常常有代價**：例：四階道具 +20 近戰傷害、+5 回復，但 −8% 傷害、−3% 移速；另一件 +12 生命、+5 回復、+3% 吸血，但 −8% 暴擊（[Damage](https://brotato.wiki.spellsandguns.com/Damage)、[Max HP](https://brotato.wiki.spellsandguns.com/Max_HP)）。→ **大部分好東西都帶一點壞處**，玩家要用別的東西補回來。
- **敵人成長**：每種敵人有自己的「基礎 HP + 每波 +X」（例：樹 10 HP、每波 +5）；難度 3／4／5 的 HP 與傷害 +12%／+26%／+40%；精英每波成長很大（[Enemies](https://brotato.wiki.spellsandguns.com/Enemies)、[Danger 5](https://gameplay.tips/guides/brotato-danger-5-guide.html)）。

### 1.3 Megabonk（我們關卡結構的參考，D22）

- **欄位**：武器、書（屬性）各起始 2 格，局外解鎖到 3、4 格（[Gamerant](https://gamerant.com/megabonk-how-get-more-weapon-tome-slots/)、[megabonk.org](https://megabonk.org/guides/unlocks/weapon-slots/)）。**書最高 99 級、武器 40 級**（[Steam 攻略](https://steamcommunity.com/sharedfiles/filedetails/?id=3571240516)）。
- **每本書只加一種屬性**，數值由稀有度放大；社群實測的稀有度倍率約 **1.0／1.2／1.4／1.6／2.0**（凡→傳說）（[Quantity Tome](https://megabonk.org/database/tomes/quantity-tome)、[megabonk.org 書](https://megabonk.org/database/tomes/)）。例：最大生命 初始 100、書 +25、祭壇 +15（[Gamesron](https://gamesron.com/megabonk-how-to-understand-weapon-and-tome-upgrades/)）。
- **祭壇（Shrine）**：充能祭壇給一項屬性 +12%（金色＝傳說）；**貪婪祭壇 +25 金幣、整局難度 +5%**；詛咒書 +3.5% 難度／級（[shrines](https://megabonk.org/guides/mechanics/shrines/)、[Destructoid](https://www.destructoid.com/what-does-difficulty-do-in-megabonk/)）。→ 「難度 %」是一個玩家看得到、會自己去加的數字。
- **寶箱價格隨等級上升**：1 級 3 金、10 級 5、50 級 13、100 級以上 23（[Steam 攻略](https://steamcommunity.com/sharedfiles/filedetails/?id=3571240516)）。
- **頭目可以提早叫**，但越晚越強：同一關早叫 < 7,500 HP、晚叫 > 31,000；第 2 階段 19,000 → 500,000+（[Megabonk 攻略](https://www.dtgre.com/2025/10/megabonk-beginners-guide-survive-first-10-minute-run.html)，單一來源）。→ **敵人隨時間是指數級成長**，玩家的 build 也要能指數級成長。
- 預設難度一局大約打到 80～150 級（[Dexerto](https://www.dexerto.com/wikis/megabonk/what-does-difficulty-do)）。

### 1.4 HoloCure（合成）

- **合成（Collab）**：兩把**滿級（7 級）**、有配方的武器＋撿到**金鐵砧**才合成；鐵砧掉落率 1/100，每分鐘 +1/2000；武器欄 5 格，最多 4 把合成武器；**超級合成**＝合成武器＋滿級道具＋金錘（50 級或 3 把合成後才掉），**一局只能一把**（[wiki.gg Collab](https://holocure.wiki.gg/wiki/Collab)、[Pocket Tactics](https://www.pockettactics.com/holocure/collab)）。

### 1.5 黑帝斯（Hades）

- 祝福四階：例 冰霜打擊 普通 +40%、稀有 ×1.3～1.5、史詩 ×1.8～2.0、英雄 ×2.3～2.5；阿瑞斯 +100%／150%／200%／250%（[fextralife](https://hades.wiki.fextralife.com/Boons)）。**雙神祝福、傳說祝福要先有指定的祝福才會出現**，不能用石榴升級（[Prima](https://primagames.com/tips/hades-what-are-duo-boons-how-get-duo-boons)）。

### 1.6 深岩銀河：倖存者（Deep Rock Galactic: Survivor）

- **武器等級本身不加數值**，到 6／12 級各選一個「超頻」、18 級選強力的不穩定超頻；超頻常有代價（[wiki.gg](https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks)）。→ **里程碑分支**：同一把武器走出不同路線。

### 1.7 設計論點

- 敵人 HP 跟著玩家火力等比例上升，會讓升級「跑步機化」（Conan Chop Chop 的反例；Remnant II 玩家抱怨「難度跟著你走，永遠在原地跑」）；倖存者類好玩的核心是「數字真的往上衝」（[Escapist](https://www.escapistmagazine.com/roguelites-items-power-scale-game-development-vampire-survivors/)、[Steam](https://steamcommunity.com/app/1282100/discussions/0/3807282428860286290/?ctp=2)）。
- 用時間斷點調整敵人成長（例：10 分鐘後 +4%、15 分鐘後 +12.5%）（[Tower Survivors](https://www.hiveworkshop.com/threads/tower-survivors.353429/)）。

## 2. 我們現在的設計哪裡太簡單（對照）

| 面向 | 同類遊戲 | 我們現在 | 問題 |
|---|---|---|---|
| 升級內容 | 武器 8 級、每級加不同東西；被動 5 級 | 同一張屬性卡重複拿、每次加一樣的 % | 每次升級感覺都一樣；沒有「把一把武器練滿」的目標 |
| 欄位 | 武器 6＋被動 6（VS）、武器 2～4＋書 2～4（Megabonk） | **無限**，卡池全部都能拿 | 沒有取捨；拿到後期什麼都有 |
| 稀有度倍率 | 約 1.0／1.2／1.4／1.6／2.0（Megabonk）、1／1.4／1.9／2.4（Hades 大致） | 1／1.6／2.4／3.5 | 稀有度壓過卡片種類，玩家只看顏色選 |
| 經驗曲線 | 平方成長（Brotato）、20／40 級斷點（VS） | 線性 6 + 2.5L | 一關 10 分鐘就 40 級，後期升級太頻繁、每級太廉價 |
| 進化／合成 | 滿級武器＋指定被動＋寶箱（10 分鐘後）；HoloCure 兩把滿級＋鐵砧 | 湊滿 4～5 張任何稀有度的卡就自動融合 | 太容易、沒有儀式感、沒有時機 |
| 代價 | Brotato 多數高階道具帶負面效果 | 只有祭壇有代價 | 沒有「要不要拿」的猶豫 |
| 敵人成長 | 每種敵人基礎＋每波成長、難度 %、頭目吃玩家等級、時間越久越強（指數） | 單一線性倍率 × 虛擬波數；頭目固定 HP | 敵人太單調；頭目不會跟著 build 變強，強 build 一下就打掉 |
| 里程碑 | Brotato 5／10／15 級保證稀有度；DRG 6／12／18 級超頻 | 只有保底 | 沒有節奏上的高點 |

## 3. 改版提案（D30：分兩步；**第一步 1＋2＋3 已在 2026-11-05 完成**，數字見 docs/02 第 5.0 節）

1. **法具（道具）取代「無限重複的卡」**：
   - 領頭妖怪的主武器（鬼火）有 **8 級表**，每級加不同東西（參考魔杖：顆數、冷卻、傷害、穿透輪流）。
   - 屬性道具（力量、迅捷、廣域、強健、堅甲、再生…）**最多 5 級**，每級固定幅度（例：力量 +10%／級）。
   - 「多一顆」類（鬼火增殖）**最多 2 級**。
   - **欄位上限**：副武器／小妖 4 格、屬性道具 6 格（數字可討論）；滿了以後升級只會出現「已有道具的下一級」。
2. **稀有度改成「這一級加多少」的倍率**：凡 1.0、靈 1.2、妖 1.5、神 2.0（參考 Megabonk）；稀有度出現率加上**里程碑保證**（5 級保證靈、10／15 級保證妖、20 級起每 5 級保證神，參考 Brotato）。
3. **經驗曲線改平方**：升級所需 = a × (等級 + b)²，目標「一張地圖 2 關、打完約 30～40 級」（剛好把主武器 8 級＋5～6 個道具練滿），之後升級轉成「金錢／回血」等次要獎勵（VS 的做法）。
4. **大招改成「進化」式**：主武器滿 8 級＋指定道具（1～2 個，至少 3 級）→ **打倒精英或頭目掉的寶箱**才融合（5 分鐘後）；一局可以融合多個，但欄位有限所以大概 1～2 個；大招仍用量表發動。
5. **部分道具帶代價**：高階道具有 30～40% 帶一個小負面（參考 Brotato），例：「狂燈」攻擊力 +25%、最大生命 −10%。
6. **敵人改成「每種敵人有自己的基礎 HP＋每分鐘成長」**，加上**難度 %**（時間、祭壇詛咒、夜深度都加這個數字，HUD 可以看到）；**頭目 HP 吃玩家等級**（VS），強 build 也要打一陣子。
7. **主武器里程碑分支**：鬼火 4 級、8 級各選一個「變化」（2 選 1，例：分裂 vs. 追蹤加強），參考 DRG 超頻。

這些改動很大，會動到卡片、升級面板、能力面板、sim、大部分的平衡測試。建議分兩步：先做 1＋2＋3（道具與等級、稀有度、經驗曲線），跑 sim 與試玩；再做 4～7。

## 4. 招式變化（使用者 2026-11-05：每個角色的招式要有 3 種變化）

### 4.1 別人怎麼做

- **20 Minutes Till Dawn**：每把武器在 20 級時「進化」，給**三個這把武器專屬**的選項三選一；另有 25 棵升級樹，第一層一選、第二層任一個就能進第三層（[wiki.gg](https://20minutestilldawn.wiki.gg/wiki/Weapons)、[fandom](https://20-minutes-till-dawn.fandom.com/wiki/Upgrades)）。玩家的抱怨：**有些分支太弱，大家只拿第一層就跳過**（[Inven Global](https://invenglobal.com/articles/17637/20-minutes-till-dawn-tier-list-best-characters-weapons-runes-and-skills)）→ 三個選項的強度要接近。
- **黑帝斯的武器樣貌（Aspect）**：同一把武器的不同樣貌改變機制，不只改數字；例：凱龍樣貌讓特殊攻擊變成追蹤、赫拉樣貌讓魔彈裝進下一次攻擊（[RPG Site](https://rpgsite.net/feature/10254-hades-infernal-arms-weapon-aspect-guide-aspects-and-upgrades-in-detail)）。
- **深岩銀河：倖存者的超頻**：武器 6／12／18 級二選一，超頻會「從根本改變武器怎麼運作」：穿透、爆炸、狀態異常（燃燒、中毒）、改變彈道；也會有代價，換了傷害類型會讓原本堆的加成失效（[High Ground Gaming](https://www.highgroundgaming.com/deep-rock-galactic-survivor-tips-beginner-advanced-guide/)、[Steam](https://steamcommunity.com/app/2321470/discussions/0/4304949638718568679)）。
- **吸血鬼倖存者**：進化不只變強，常常變成完全不同的攻擊方式（例：聖經 → 繞身持續、魔杖 → 冷卻減半、彈速加倍）（docs/15 第 1.1 節）。

### 4.2 我們的做法（已實作提燈小僧）

- **時機**：主武器升到 4 級時跳出「招式變化」三選一（用同一個選卡面板，D15），選了整局固定；主武器滿 8 級時，變化本身再加強一次。
- **原則**：①三種是**打法不同**（不是數字不同）；②各自**想要不同的道具**（選卡畫面寫「適合：…」），所以選了變化會改變後面怎麼選卡；③**三種的強度要接近**，用 `npm run sim -- --variant <id>` 比較，避開 20MTD「大家只選一種」的問題。
- 提燈小僧（鬼火）：
  | 變化 | 玩法 | 適合 | 滿級加強 |
  |---|---|---|---|
  | 狐火分裂 | 命中時分裂出 2 顆小火（55% 傷害），追向 7 公尺內其他敵人；小火不再分裂 | 鬼火增殖、迅捷、力量（顆數越多分裂越多） | 分裂 3 顆 |
  | 燈籠環 | **不再發射**，鬼火（數量 = 鬼火數量 + 1）繞身轉，碰到就燒（130% 傷害、每 0.25 秒判定）、擊退 | 廣域、強健、堅甲、迅捷（近身坦） | 多 1 顆、半徑 ×1.25 |
  | 業火 | 鬼火 ×1.2 傷害、冷卻 ×1.25，命中處留下燃燒地（半徑 1.6 × 範圍、2.5 秒、每 0.5 秒燒 35%） | 廣域、爆裂、力量（區域壓制） | 燃燒地 ×1.3 |
- 河童、赤鬼的三種變化草案見 docs/04 第 1.5 節（等做到那兩隻定案）。
