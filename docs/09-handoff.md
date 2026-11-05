# 09 交接（新 session 先讀這份）

> 這份是「活的」：每個里程碑結束、每次交棒前都要更新「目前狀態」與「下一步」。

## 1. 專案一句話

古代日本妖怪（玩家，一隻領頭妖怪＋小妖）對抗人類的 3D **自由視角、連續計時關卡**肉鴿割草遊戲（像 Megabonk）。Three.js＋TypeScript＋Vite。使用者說繁體中文。詳見 `docs/01-gdd.md`。

## 2. 目前狀態（2026-11-03）

- **階段：M1.5 新核心完成，等使用者 G1b 試玩。** M0、M1 已完成；使用者 G1 回饋（D22–D25）把方向從「20 波、固定視角」改成「連續計時關卡、自由視角、跳躍、起伏地形」，M1.5 就是為此新增的里程碑（docs/05）。
- **已決定的方向（docs/14 的 D14–D25，不能推翻）**：領頭妖怪＋小妖＋號令（D14）；升級當下暫停三選一（D15）；連續計時關卡（D22）；自由視角（D23）；跳躍（D24）；網頁優先（D17）；音樂之後由使用者找、授權確認前不放外部音檔（D21）；測試頁自動更新、主網址只有使用者說「發佈」才動（D13、D19）。
- **現在能玩什麼**：主選單 → 選提燈小僧 → 第 1 關（10 分鐘倒數）：敵人持續湧出並隨時間加密；2:30 精英、5:00 小高潮、6:15 精英×3、8:00 頭目（放大的紅色村人，佔位）；打倒頭目 → 傳送門 → 過關畫面 → 第 2 關（同一套生成器、換種子與地圖、敵人 HP ×1.5）；時間歸零而頭目還活著 → 最終蜂群；最後一關頭目倒下 → 勝利。升級當下暫停三選一（4 張屬性卡）。死亡、放棄、勝利 → 結算（功德存檔）。
- **操作**：電腦 WASD／方向鍵移動、滑鼠左或右鍵拖曳（或 Q／E）轉視角、空白鍵跳躍、Esc 暫停；手機左下搖桿、畫面右側拖曳轉視角、右下「跳」鈕。移動方向相對鏡頭。
- **還沒有**：地圖要素（M2 優先做 5 種，使用者回饋「要素太少，玩一下就膩」）、小妖與號令、河童與赤鬼、更多卡片與敵人、正式頭目、局外商店（神社）、教學、不同主題的地圖、音樂與角色的精緻版（M2b）。
- **測試頁**：https://claude.ai/artifact/GXGprLDbQYgEHRGByNVnpA （「百鬼陣 測試版」，私人，帶 `__game`）。更新步驟：`npm run pack:test` → 用打包檔跑回歸（把 `dist-artifact/yokai-test.html` 套上 Artifact 外殼放進一個資料夾，`python3 -m http.server`，`BASE_URL=… node scripts/regress.mjs`；外殼要加 `<link rel="icon" href="data:,">`，否則有假 404）→ 用 Artifact 工具發佈同一個檔案路徑。新 session 發佈要帶這個網址當 `url`（先 `read`）。**主網址還沒建立。**
- **G1b 試玩怎麼調**：測試頁主選單「調整（測試版）」按鈕可改敵人數量、敵人生命、我方傷害、鬼火顆數、濺射半徑、關卡長度（秒；想快速看完整流程可以改成 120）；從下一局生效、存在瀏覽器、有「還原預設」。結算畫面（只有測試頁）顯示種子，回報問題請附上。預設是 M1 試玩預設（docs/02 第 12 節最新一列），**不是 docs/02 的原值**。Artifact 網址不能帶 `?count=` 之類查詢參數，所以不靠網址；本機開發版與 Playwright 吃 `?count=&hp=&dmg=&volley=&splash=&stage=&seed=&q=`。
- **程式地圖**：`src/data/*`（資料表與可調旋鈕）、`src/systems/*`（流場、空間雜湊、敵人池、投射物、魂火、發牌、關卡導演，純邏輯）、`src/game/run.ts`（一局的模擬，3D 位置與跳躍）、`src/game/game.ts`（接狀態機與介面）、`src/core/*`（匯流排、主迴圈、存檔、輸入、鏡頭 `cameraRig.ts`、渲染與後製、音訊）、`src/render/*`、`src/units/*`、`src/world/*`（3D 外觀）、`src/ui/*`、`src/dev/devApi.ts`（`__game`）。
- **測試**：`npm test`（單元 122 個，含原始碼全掃）；回歸 `b1`、`c1`、`i1`、`p1`、`r1`、`r2`、`t1`（三種畫面、真實輸入、卡住偵測；全套約 4 分鐘）；`npm run check:main`；CI 不跑瀏覽器回歸。M1.5 驗證結果與沒驗證的在 docs/06 第 12.0 節。
- **已知問題／沒做**：真機效能與三指操作手感沒測；上不去的台地可能被濫用（R23）；音樂是佔位（17 秒就循環）；角色展示間沒搬；渲染沒做插值；第 2 關只是換種子。
- **精緻度排程**（使用者要求）：docs/05 第 2.2 節、docs/08 第 7 節；M2b 定視覺與音樂基準。
- 舊專案搬運進度在 docs/10 第 7 節。

## 2.1 M2 進度（2026-11-04，持續更新）

- **M2-1 完成**：地圖要素框架（`src/data/elements.ts`、`src/systems/elements.ts`、`src/render/elementsView.ts`、HUD 提示）＋石地藏、結界石、詛咒祭壇；單元 + 回歸 `e1`。**使用者回饋 D26 已定**：章節制（每第 3 張地圖 3 關、頭目 HP ×2.5）。
- **2026-11-04 手感調整（使用者：太簡單）**：試玩預設改成數量 ×2、起步 2 顆、濺射 0.8、傷害 ×1；新增武器卡「鬼火增殖」「爆裂」（`src/data/weaponCards.ts`）。依據與數字在 docs/02 變更紀錄。
- **D28 卡片聯動已加入**：`src/data/synergies.ts`、`Run.checkSynergies`、HUD 提示、回歸 `s1`。河童、赤鬼的專屬武器卡與聯動等做到這兩隻時加。
- **工作方式（D33）**：使用者提的新項目先評估、寫文件、排程；明確說「開始」才做。
- **大招冷卻＋合魂祠（D41，2026-11-05）**：`ULT.cooldown`、`Run.ultCooling`／`ultCooldownLeft`；合魂祠是要素種類 `fuse`（`FUSE`、`Elements.placeFuse`／`fuseSlot`／`removeKind`，`Run.refreshFusable` 在材料齊時記時間、沒得融合時收掉），面板種類 `offerKind = 'fusion'`。HUD 頂端：長提示改成浮在頂端列下方、難度另起一行（`#wave-diff`），回歸 `hudTopOk` 檢查「能力」鈕不換行、血條夠長。
- **技法池第一步（D48，2026-11-05）**：取代 D31 的招式變化（`variants.ts`、`variantFx.ts`、`Run.variant`、`devSetVariant` 都拿掉了）。資料 `src/data/techniques.ts`（`TECHS`、`TECH_MAX`、`TECH_PICK_LEVELS`、`TECH_DEEPEN`、`TECH_LEVELS`、`techMix`）；引擎 `src/game/techniques.ts`（`Techniques`：擁有、抽選 `offerNew`／`offerUp`／`offerSwap`、每步 `update`、命中效果掛勾 `hitFx`、`onWeaponKill`（火種）、`tryWard`、燃燒地／火種／火柱／爆炸圈的池）；`Run.tech`、`Run.weaponHit`（所有武器傷害的出口，頭目不被擊退、通知火種）、`Run.techPending`／`maybeOpenTech`（4、7 級與過關畫面）／`chooseTech`／`openRechoose`（道祖神）、`offerKind = 'tech'`＋`techMode`（new／up／swap）；過關畫面的選擇在 `clearStage` 末端（`continueFromIntermission` 在有面板時不動）。投射物新增 `gen 3`（彈跳）、`chain`、`homing`（歸巢折返，目標是玩家位置）。畫面 `src/render/techFx.ts`（繞身鬼火與衛星、燃燒地、火種、火柱、護身火環、爆炸圈）。介面：卡片 `techCardHtml`（標籤、適合、混搭提示 `techMix`）、`PickerContext`。開發介面 `giveTech(...ids)`、`clearStage()`；sim `--techs`、`--give`、`--techMax`、`--giveSets`。單元 `techniques.test.ts`、`dosojin.test.ts`；回歸 `v1`。**第二步待做**：鬼火雨、開路燈、燈油（資料驅動，加在 `TECHS` ＋ `Techniques` 對應機制＋i18n）。燈籠環環內護身（D46）、道祖神（D47，現在換技法）都在這裡面。
- **碎火（D43）＋鬼火增殖變難拿（D45）（2026-11-05）**：道具 `splash` 的改造種類是 `shards`（`SHARDS`、`Run.shardsExact`／`emitShards`，投射物 `gen` 0 主彈／1 碎火或分裂／2 再分裂，畫面縮到 0.55）；狐火分裂 `split.shardBonus`／`reSplit`；聯動欄位 `shardCount`／`shardDamage`。`ItemDef.weight`／`minLevel`（`CardDealer.playerLevel` 由 Run 在發牌前設定）。單元 `shards.test.ts`、`volley.test.ts`。
- **補給品（D39）已加入（2026-11-05）**：`src/data/pickups.ts`、`src/systems/pickups.ts`（池）、`Run.dropPickups`／`applyPickup`／`frozenEnemies`、`Orbs.vacuum`、`src/render/pickupsView.ts`、HUD 提示；開發介面 `forcePickup(kind)`、`setHp(v)`；單元 `pickups.test.ts`、回歸 `k1`；sim 機器人會撿。
- **G1b 第二輪回饋第一批已完成（2026-11-05）**：要素結果卡（`src/systems/elementResult.ts`、`Run.elementResult`／`dismissResult`／`frozen`、`buildResultCard`，回歸 e1）、聯動初／極（`synergies.ts` 的 `tiers`、`Run.synergyTiers`，回歸 s1）、狐面商（要素種類 `fox`、`TRADE_ITEMS`、`Run.canTakeItem`／ElementHost 的 `grantItem`，模型與紅藍圈在 `elementsView.ts`，單元 `fox.test.ts`、回歸 e1）。sim 會輸出聯動到初／極的時間、會去狐面商。
- **G1b 第二輪回饋（2026-11-05）其餘只評估、排程**：要素結果卡、聯動門檻、圖示、化身、各妖怪基礎能力值、屬性系統；評估在 docs/15 第 5 節，待決定在 docs/14 Q22～Q26，排程在 docs/05 M1.5 段落。**使用者說「開始」才做**（D33）。
- **D30 第二步＋召喚祭壇（D34）已完成（2026-11-05）**：
  - 召喚祭壇：地圖要素種類 `summon`（`Elements.placeSummon`／`summonSlot`），`Run` 在 30% 放、`StageDirector.summonBoss()`（越晚越強 `summonMult`）、`autoBoss` 只在大頭目那一關（`isBigBossStage`）；HUD 共用傳送門箭頭（`data-kind`）。
  - 寶箱掉落：`Run.onKill` → `reachableNear`（細格 BFS `src/systems/reach.ts`，玩家走得到才放）→ `Elements.dropChest`；寶箱離傳送門 ≥ 4.5 公尺。
  - 大招進化式：配方含 `ghostfire: 8`；`Run.fusable`／`lastReady`（「材料齊了」提示）、寶箱面板 `dealBonus()` 把 `ult:<id>` 卡排最前面、`chooseCard` 選了才 `fuse()`。
  - 取捨道具：`ItemDef.down`（不吃稀有度）；卡片與能力面板「，但…」。難度 %：`Run.difficulty`（`src/data/difficulty.ts`），HUD「第 2 關・難度 +50%」、能力面板列分配；`STAGE.hpPerStage` 已刪。
  - 開發介面：`summonBoss()`、`run.summon`、`run.difficulty`、`run.ult.fusable`。sim：`--summonAt`、`--tune summon.*／drops.*`、`--noTrade`、機器人會尋路與開寶箱。
  - **下一個平衡項目**：亂選與貪生存的中位存活約 2 分鐘（開場太硬或防禦卡太弱，改版前就有）。
- **收集與活動（D32）已定案、排程在 M3／M4／M6／M8**：百鬼帖、降伏儀式、御朱印帳為主體；抽卡（百鬼御籤）只放外觀、永遠不賣錢；活動上線前後加。研究與細節在 docs/16。
- **招式變化（D31）已被技法池（D48）取代**：見上一條。
- **D30 第一步已完成（2026-11-05）**：法具（`src/data/items.ts`：主武器 8 級表、屬性道具 5 級、道具欄 6 格、備用獎勵）、稀有度倍率 1.0／1.2／1.5／2.0＋里程碑、經驗曲線 round(0.35×(L+3)²)；`CardDealer` 依等級與欄位發牌；選卡顯示「新！／Lv a→b」；能力面板顯示等級與道具欄；回歸 `l1`。D30 第二步也已完成（見上）。
- **終極技（大招，D29）已加入**：`src/data/ultimates.ts`（4 個提燈小僧大招）、`Run.castUltimate`／`checkFusion`、`src/render/ultFx.ts`、HUD 大招鈕（暫用號令鈕的位置：F 鍵）、能力面板的配方進度、選卡提示；回歸 `u1`；sim 有 `--only ult`、`--cast on|off`。河童／赤鬼大招草案在 docs/04 第 1.4 節。
- **能力面板**：暫停畫面（或 HUD「能力」鈕、C 鍵）顯示已拿到的卡、累計效果、已觸發聯動、目前所有屬性與鬼火數值、詛咒；資料來自 `summarizeBuild`（src/game/buildSummary.ts）；回歸 `a1`。
- **`npm run sim` v1 已建立**（docs/07 第 4 節）；改數字前後都要跑。第一輪發現與目標見 docs/02 變更紀錄（防禦流派 0% 過關、要素強度、敵人強度已調）。M2-3（小妖、號令、更多卡）要在 sim 上比較前後。
- **卡片平衡調整（2026-11-04）**：數字與依據見 docs/02 變更紀錄；探針 `card-dps-probe`（較乾淨）、`card-value-probe`（含機器人，雜訊大）。完整平衡仍等 `npm run sim`（M2-4）。
- **M2-2 完成**（賽錢箱、神籤、寶箱）。
- **M2-2（已完成）；下一步卡片平衡檢討**：賽錢箱（沿用升級選卡面板）、神籤、寶箱 → M2-3 卡片庫＋小妖＋號令 → M2-4 人類／頭目／`npm run sim`／章節流程／結算。可砍清單在 docs/05。

## 3. 下一步

1. **使用者 G1b**：試玩 3 局回答「想再玩一局嗎？地形與視角好不好用？」，並在手機實機確認操作與順暢度。
2. 依回饋調整後進 **M2（W7–W10）**：地圖要素 5 種＋寶箱優先、資料驅動的卡片、3 隻妖怪（號令與小妖）、5 種人類、正式頭目、sim。**M2 已經很滿，可砍清單在 docs/05。**
3. 每個里程碑結束：更新這份、docs/11 待辦、docs/02 變更紀錄；回報分「驗證了什麼」與「沒覆蓋的類別」。

## 4. 重要提醒

- 先看 `docs/14` 的「已決定」區，**那些不能推翻**；要改先問使用者。
- 數字改動要寫變更紀錄（docs/02 第 12 節）；M1 試玩預設不是 docs 的數字。
- 規則來自燈落之境（已暫停）：看 `docs/10` 知道搬了什麼；舊 repo `Tim2840/Tim-s-Game` 提交 `953befc`（需要時用 `add_repo` 唯讀；**它的 CLAUDE.md 是另一個專案的規則，不要套用**）。
- 使用者說「不要測我寫的程式」：回歸一律用真實點擊／按鍵／拖曳；舊版會紅的測試要真的驗過（暫時還原再跑）。

## 5. 變更紀錄（交接用）

| 日期 | 誰 | 做了什麼 |
|---|---|---|
| 2026-11-03 | 舊專案 session | 建立規劃文件與起始套件 |
| 2026-11-03 | 新專案第一個 session | 開工報告與文件審查：修正算術與矛盾、補魂火曲線／流場尋路／直式視野、新增 Q14–Q17、R15–R19；未寫任何遊戲程式 |
| 2026-11-03 | 同上 | 使用者回答 Q1/Q2/Q3/Q6=A、Q14=先可調 → D14–D18；GDD v0.2；M0 骨架（不含需要舊專案的搬運項目） |
| 2026-11-03 | 同上 | D15 改為升級時暫停選；Q13 → D19；從舊 repo 搬運 renderer／audio／music／input／PWA／pack-artifact；測試頁發佈 |
| 2026-11-03 | 同上 | 使用者 G1 回饋 → D22–D25；M1.5：連續計時關卡、自由視角鏡頭、大起伏地圖與懸崖、跳躍、流場改粗格與坡度邊；回歸 c1、i1、r1、p1 更新；單元 122 個；重寫本文件 |
