# 10 從燈落之境搬什麼過來

> 來源專案：https://github.com/Tim2840/Tim-s-Game （分支 `claude/friendly-mendel-apst37`，搬運時的提交 `953befcd2d5fb7bafe81cb7a64cba3a0740402c5`）。燈落之境已**暫停開發**（使用者決定），不會再改動。
> 想讀來源檔案：用 `git show 953befc:<路徑>` 或在 GitHub 上開該提交。若本 session 無法存取舊 repo，請請使用者用 `add_repo` 加進來（唯讀即可）。

## 1. 已經搬進這個 repo 的（M0 前就有）

| 新位置 | 舊位置 | 改了什麼 |
|---|---|---|
| `src/lib/random.ts` | `src/utils/random.ts` | 原樣 |
| `src/lib/noise.ts` | `src/utils/noise.ts` | 原樣（地形起伏、地形種類噪聲用） |
| `src/art/materials.ts` | `src/art/materials.ts` | 原樣（`soft`、`softVertexColors`、`glow`、`haloTexture`、`softDotTexture`） |
| `src/art/shapes.ts` | `src/art/shapes.ts` | 只改了 `Rng` 的匯入路徑 |
| `vitest.config.ts`、`tests/unit/setup.ts` | 同名 | 原樣（假 `localStorage` 與 `window`、`document`） |
| `tsconfig.json` | 同名 | 原樣 |
| `scripts/browser.mjs` | 同名 | 原樣（選 Chromium／Edge 的邏輯；Windows 用 Edge 避免跳黑視窗） |

## 2. 要從舊 repo 直接搬、但需要檢查的（M0–M1 做）

| 舊檔 | 用途 | 搬運時要改的 |
|---|---|---|
| `src/core/renderer.ts`（274 行） | 渲染器、畫質分級、後製（Bloom） | 拿掉燈落之境專用的光源池依賴；保留畫質分級與「自動降級不存檔」 |
| `src/core/audio.ts`（916 行） | 程式合成音效引擎 | 只留引擎與節流；`SfxName` 與各音效重寫（docs/08 第 3 節） |
| `src/core/music.ts`（424 行）＋ `themes.ts` | 程式合成音樂引擎 | 引擎原樣；**`themes.ts` 全部重寫**成日本音階 |
| `src/game/input.ts`（258 行） | 鍵盤＋觸控搖桿 | 拿掉鏡頭拖曳、縮放、跳躍、聚光；只留移動與一顆「號令」鈕 |
| `src/game/events.ts`（233 行） | 事件匯流排 | **只搬匯流排機制**（型別化 emit／on），事件清單全部重寫 |
| `src/game/save.ts`（240 行） | 存檔骨架（`defaultSave()`、`merge()`、版本） | 欄位全部重寫 |
| `src/characters/types.ts`、`src/dev/characterLab.ts` | 角色展示間（從多角度看模型、動畫列表） | 介面改成妖怪／人類；加「固定俯角預覽」 |
| `src/ui/spotlight.ts`（教學高亮：引導模式、泡泡、遮擋偵測） | 教學框架 | M3 做教學時再搬，參考 `scripts/regress/u6-lesson-walk.mjs` |
| `src/game/changelog.ts` ＋ `docs/29-update-notice.md` ＋ 更新紀錄頁 | 更新紀錄機制 | 內容重寫，機制原樣 |
| `src/pwa/*`、`public/manifest.webmanifest`、`public/icons/*` | PWA | 換圖示與名稱 |
| `vite.config.ts`（單檔打包、PWA 外掛） | 打包 | 外掛改名 |

## 3. 腳本與工具（M0 搬、之後逐步改）

| 舊檔 | 用途 |
|---|---|
| `scripts/regress.mjs`、`scripts/regress/lib.mjs` | 回歸執行器與共用函式（`openPage`、`step`、`expect`、`reportErrors`…）；自動起 Vite、暖機、總表、`--only`、`--list`、每支的 `max`／`stall` |
| `scripts/regress/u6-lesson-walk.mjs` | **「照著高亮走完教學」的範本**（三種畫面尺寸、卡住偵測、泡泡不蓋目標） |
| `scripts/perfcheck.mjs`、`glowaudit.mjs`、`layoutcheck.mjs`、`musiccheck.mjs`、`scaleaudit.mjs` | 稽核腳本（選擇器與場景要改成本專案的） |
| `scripts/shots/character.mjs` | 角色多角度截圖 |
| `scripts/pack-artifact.py` | 單檔轉 Artifact 內容（**已知雷：標籤比對加 `\b`**；最後有斷言檢查頂端介面還在） |

## 4. 規則與經驗（已經寫進本專案的 CLAUDE.md、docs/07、docs/12）

- 繁體中文、台灣用語、禁用詞單元測試。
- 圓潤卡通美術規則、角色驗收不能只看一個角度。
- 事件匯流排、存檔只存發生過什麼。
- 測真實玩家路徑＋三種畫面＋卡住偵測；「使用者指出一處就掃同類全部」；回報分驗證／沒覆蓋；原因沒查清就不說修好。
- 無頭瀏覽器 1～2 FPS 的做法、`advance` 不畫圖、截圖前先 render。
- 光源與著色器的規則（不在中途增減真光源、`pow` 先 clamp、預編譯）。
- 子代理分工與「先查使用者已決定的事」。

## 5. 不搬的（與本專案無關）

島嶼與世界場景、劇情與 NPC、對話與導覽鏡頭、上岸見面演出、家園與花園、技能教學、衣櫃、傳送、昏倒、燈塔、光橋、所有 M1–M13 內容、`docs/01–29` 的燈落之境設計文件（想參考的話，教訓都已整理進本專案）。

## 6. 踩過的雷（精選，與本專案相關的）

- 原始 CLAUDE.md 的完整原文封存在舊 repo 的 `docs/27-claude-md-archive.md`。
- **`InstancedBufferGeometry` 要自己給包圍盒**（否則被誤剔除）。
- **主迴圈 `dt` 要夾在 0 到上限**。
- **`renderer.compile()` 要在後製渲染目標綁著時呼叫**。
- **鏡頭遮擋射線不能每幀走整個場景**（本專案鏡頭固定，原則上不需要，但「高物件淡出」若要做就要遵守）。
- **合併網格的顏色寫進頂點色**。
- **`const` 要宣告在使用之前**（Vite 打包後才爆）。
- **發佈被拒「artifact-pr-review machinery」是壓縮後程式碼被誤判**：長串重複的 `switch`／`find` 改查表。
- **剛重啟的 Vite 要先手動載一次再跑測試；跑測試時不要改 `src`；不要用 `pkill -f 腳本名稱`。**
