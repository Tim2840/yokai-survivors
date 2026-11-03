# 06 技術架構

> 版本 v0.1（2026-11-03）。以可行性為先：原型階段（M1）就要驗證的假設標 ⚠。

## 1. 技術選擇

| 項目 | 選擇 | 理由 |
|---|---|---|
| 語言／建置 | TypeScript（strict）＋ Vite | 與燈落之境相同，工具已熟 |
| 3D | Three.js（已用 ^0.186） | 同上；`InstancedMesh` 夠用 |
| 後製 | `postprocessing`（pmndrs）Bloom；或沿用燈落之境自寫的後製 | ⚠ 手機效能要量；Bloom 要能關閉（畫質分級） |
| 介面 | **原生 HTML／CSS**（不用 Tailwind） | 專案介面是遊戲 HUD，不是網頁排版；少一個依賴，打包更小；與燈落之境的 `theme.css` 做法一致 |
| 測試 | Vitest（單元）＋ Playwright（回歸）| 與燈落之境相同 |
| 打包 | `vite-plugin-singlefile`（測試頁／分享頁）＋一般 build（正式網頁）＋ PWA | 同上 |
| 狀態管理 | 自寫狀態機＋事件匯流排 | 不引入 Redux 類框架 |

## 2. 狀態機

```
BOOT ─► MENU ─► RUN_SETUP ─► COMBAT ◄─► INTERMISSION ─► RUN_END ─► META_SHOP ─► MENU
                              │                              ▲
                              └──────── 玩家死亡／通關 ────────┘
  PAUSE 是覆蓋層：只暫停模擬，不改狀態（COMBAT／INTERMISSION 皆可）
```

- 一個 `GameStateMachine`，每個狀態有 `enter(ctx)`、`update(dt)`、`exit()`；**只有狀態機可以改變狀態**，其他系統用事件請求（`bus.emit('request:state', 'INTERMISSION')`）。
- **COMBAT 狀態內不允許開啟任何覆蓋層**，除了暫停、設定；要素互動的 UI 是 3D 世界內的提示泡泡（不暫停）。
- 狀態轉換有單元測試：所有合法轉換、非法轉換拒絕。

## 3. 目錄結構

```
src/
  main.ts                 入口
  core/                   renderer, loop（固定步長）, input, audio, music, bus, save, i18n
  game/                   狀態機、RunContext、波次導演、整備、結算、changelog
  data/                   純資料（數字都在這）：yokai, enemies, cards, elements, terrain, maps, meta, camera
  systems/                戰鬥、傷害、拾取、經驗、卡片、要素、地形查詢、小妖 AI、空間雜湊
  units/                  領頭妖怪、小妖、人類、頭目的模型與動畫（程式建模）
  world/                  地形網格、水面、道具、天空、光照
  ui/                     HUD、卡片介面、商店、圖鑑、設定、教學高亮
  art/                    palette, materials, shapes（沿用）
  lib/                    random, noise, 數學工具
  i18n/                   zh-TW.ts（其他語言之後加）
  dev/                    角色展示間、除錯面板（主網址不含）
tests/unit/               Vitest
scripts/                  regress.mjs, regress/*.mjs, shots/*.mjs, audits, sim/
docs/
```

## 4. 資料驅動

- 所有平衡數字、定義放在 `src/data/*.ts`，匯出**唯讀、帶型別**的資料表；程式碼只看資料，不寫死數字。
- 每個資料表有「結構檢查」單元測試：id 唯一、欄位完整、稀有度表四階都有、每張地圖引用的人類／頭目／要素都存在、i18n key 都存在。
- 資料變更自動會被 `npm run sim` 吃進去（sim 直接匯入 `src/data`）。
- 資料 id 一律英文小寫短橫線；顯示名稱走 i18n。

## 5. 主迴圈

- **固定時間步長 1/60 秒**累積器模擬；渲染用 `requestAnimationFrame` 可變幀率，對上一步與下一步的位置做插值。`dt` 夾在 0～0.1 秒（避免分頁切回來時暴衝）。
- 分頁失焦（`visibilitychange`）自動進暫停。
- 暫停：模擬停、渲染照畫（可看到 UI 與場景）。
- `window.__game.advance(dt)` 讓測試快進（不依賴真實時間；headless 只有 1～2 FPS）。

## 6. 效能預算與做法

| 預算（目標） | 桌機 | 手機（中階） |
|---|---|---|
| 同畫面敵人 | 400 | 200 |
| 同畫面投射物 | 300 | 150 |
| draw call | ≤ 120 | ≤ 80 |
| 幀率 | 60 | 30 |
| 首次載入 | ≤ 30 MB | 同 |
| 記憶體 | ≤ 400 MB | ≤ 250 MB |

做法：

- 敵人、投射物、魂火、傷害數字：`InstancedMesh`＋物件池，**熱路徑零配置**（每幀不 `new`、不建陣列；用預先配置的 TypedArray）。
- 碰撞：敵人↔玩家／小妖／投射物都用**空間雜湊（格子 2 公尺）**；敵人之間的軟推擠（避免疊成一團）只在 ≥ 250 隻時做、且只算鄰格。
- 敵人動畫：`InstancedMesh` 沒辦法做骨架動畫 → 用**頂點著色器**做「彈跳＋傾斜＋走路擺動」（以實例屬性 `phase` 驅動），命中閃白用實例顏色屬性。 ⚠ M1 驗證。
- 光源：場景只有 1 盞方向光 ＋ 玩家身上 1 盞點光源；**不在遊戲中途增減真光源**（沿用燈落之境的鐵則：光源數量是著色器的一部分）。其他「光」用發光材質與光暈貼片。
- 新著色器要預編譯（`renderer.compile()` 在渲染目標綁著時呼叫）；`pow`／`sqrt`／`log` 輸入先 clamp；時間先 `% 2π`。
- 畫質分級（低／中／高）：後製、水面、陰影、粒子數；自動降級**不存檔**。
- 地形：烘焙成高度圖＋地形種類圖（`Float32Array`／`Uint8Array`），`terrainAt(x,z)` O(1)。

## 7. 鏡頭

- 透視鏡頭，FOV 35°，俯角 50°（可調），距離約 22 公尺；位置 = 玩家位置 + 固定偏移，**以阻尼平滑跟隨（只動 X／Z）**，不旋轉、不縮放。
- 鏡頭資料在 `src/data/camera.ts`。
- ⚠ M1 驗證：高低差下（上坡時玩家被地形遮住？）需要的處理——**優先調整地圖設計（坡度與高度上限）**，不做遮擋透明（見 docs/03 第 6.6 節）。

## 8. 存檔

- `localStorage`，鍵 `yokai-survivors-save-v1`，內容 JSON，含 `version`；`merge(defaultSave(), loaded)` 補新欄位；版本升級寫遷移函式並測。
- 存什麼：功德、局外升級等級、已解鎖卡片／要素／妖怪／地圖、圖鑑進度、最高夜深度、設定（音量、畫質、語言）、統計（總局數、最高波）。
- **不存**：局內狀態、種子（只有「重播／回報 bug」時顯示，不存）。
- 寫入失敗（隱私模式、容量不足）：遊戲照常進行，並提示一次；有單元測試（`failWrites`）。

## 9. 事件匯流排

型別化的 `GameEvent` 聯集；系統只 `emit` 與 `on`，不互相呼叫。例：`enemyKilled`、`pickup`、`levelUp`、`waveStart`、`waveEnd`、`cardChosen`、`elementActivated`、`playerHurt`、`runEnd`、`stateChanged`。事件的新增要同步補單元測試（誰會收到）。

## 10. 國際化

- `t('key', params)`，所有玩家看得到的字都從 `src/i18n/zh-TW.ts` 取；沒有的 key 在開發模式丟錯、在正式版回傳 key 本身。
- 單元測試掃描 `src/` 裡有沒有寫死的中文字串（燈落之境的 `voice.test.ts` 做法）。
- 日文與英文放在上線後；設計時預留字串長度（英文比中文長 2～3 倍，UI 要能撐開）。

## 11. 隨機與可重現

- 所有隨機用 `Rng`（種子）。每局有一個 `runSeed`；各子系統用 `runSeed` 衍生子種子（地圖、卡片、要素、敵人生成）。這樣 `__game.seed` 可重現整局（輸入相同時）。
- 戰鬥中不可使用 `Math.random()`（用單元測試掃描）。

## 12. 要先驗證的技術假設（M1）

| # | 假設 | 驗證方式 | 失敗的備案 |
|---|---|---|---|
| T1 | 400 隻 `InstancedMesh` 敵人＋Bloom 在中階手機 ≥ 30 FPS | 實機量（或 CPU 節流＋`perfcheck`） | 降低上限至 250，關 Bloom 改發光貼片 |
| T2 | 頂點著色器動畫看起來夠活 | 截圖與錄影比較 | 改用 3～4 個預烘焙姿勢圖（sprite 切換）或用 `SkinnedMesh` 但限制數量 |
| T3 | 固定 50° 鏡頭在高低差地形可讀 | 在原型地形走一圈錄影 | 降低高度上限、改傾角 |
| T4 | 地形查詢＋空間雜湊在 400 隻下 CPU ≤ 4 ms／幀 | 計時 | 降低更新頻率（敵人 AI 分幀更新） |
| T5 | 手機虛擬搖桿手感 | 實機 | 增加死區／固定位置搖桿選項 |
