# 百鬼陣 YOKAI SURVIVORS（暫名）

古代日本妖怪 vs 人類：3D 固定視角、波次制、肉鴿式割草遊戲。你是一隻統領小妖的妖怪，在夜裡擊退一波又一波闖進地盤的人類；每局三選一長出不同能力，地圖上有高風險高報酬的要素，局外有神社（商店）與收集。

- 技術：Three.js＋TypeScript＋Vite（所有模型程式建出，沒有外部檔案）
- 語言：繁體中文優先
- 狀態：**P0 概念完成，尚未開工（見 `docs/09-handoff.md`）**

## 從哪裡開始

| 你是 | 讀 |
|---|---|
| 新的 AI 協作者 | `CLAUDE.md` → `docs/09-handoff.md` |
| 想知道遊戲怎麼玩 | `docs/01-gdd.md` |
| 想看數值 | `docs/02-balance.md` |
| 想看進度計畫 | `docs/05-schedule.md` |
| 想知道還有什麼沒決定 | `docs/14-open-questions.md` |

## 指令

```bash
npm install
npm run typecheck
npm test
npm run dev        # 開發伺服器（M0 之後才有畫面）
npm run build
```

## 文件目錄

`docs/00-index.md`
