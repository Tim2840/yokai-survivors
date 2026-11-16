---
name: game-screenshots
description: 百鬼陣用 Playwright 驅動遊戲拍畫面、驗收或除錯的寫法：開局、等 Blender 模型、升級、快進、清掉選卡、設鏡頭、凍結截圖，以及踩過的坑（記憶體爆掉、敵人不生成、短效果拍不到）。要截圖給使用者、要看某個畫面長怎樣、要寫一次性的驗收或除錯腳本、或回報需要照片時，就用這個 skill。
---

# 拍遊戲畫面

使用者規定回報要附照片（手機直式優先），而且我要逐張讀過再送。無頭瀏覽器只有 1～2 FPS，不能等真時間；一切用 `window.__game` 的開發介面快進。

## 先用現成的

| 要拍什麼 | 用 |
|---|---|
| 回歸測試的畫面 | 回歸跑完會自己存在 `screenshots/`（每個 id 幾張） |
| 每種技法的特效 | `scripts/shots/vfx-catalog.mjs`（見 vfx-acceptance skill） |
| 模型 9 視角 | `npm run model:turnaround`；敵人 `scripts/shots/enemy-turnaround.mjs` |
| 打包後的測試頁 | `scripts/packed/check.mjs`（見 publish-test-page skill） |

## 自己寫一次性腳本

放在 scratchpad（不是專案裡），用 `scripts/shots/helpers.mjs`：

```js
import { openRun, levelTo, advance, setCamera, freezeAndShoot } from '/home/user/yokai-survivors/scripts/shots/helpers.mjs';
const { browser, page } = await openRun('?model=blender&seed=21');   // 手機直式、無敵、等 Blender 模型
await levelTo(page, 20);                 // 一點一點升級，自動清掉選卡
await setCamera(page, 0, 55, 16);        // 先設鏡頭（會讓時間跑 1 秒）
await page.evaluate(() => window.__game.setTime(359));
await advance(page, 2);                  // 快進 2 秒，途中清選卡
await freezeAndShoot(page, '/home/user/yokai-survivors/screenshots/xxx.png');
await browser.close();
```

執行：`cd /home/user/yokai-survivors && NODE_PATH=node_modules node <scratchpad>/xxx.mjs`（vite 要開著 5173）。

## 踩過的坑（helpers.mjs 已經處理；自己寫時別再犯）

- **一次給大量經驗**（`addXp(5000)`）會連升十幾級，選卡排一長串，頁面記憶體爆掉、瀏覽器被系統砍掉。用 `levelTo`。
- **用 while 迴圈點 `.card`**：化身提示蓋著時卡片是隱藏的，點了沒反應→無窮迴圈。只點看得見的按鈕、要有上限（`clearOverlays`）。
- **`clearEnemies()` 會順便關掉敵人生成**，之後一隻都不會出來。要清場又要生成，就別用它。
- **`setCamera` 會讓時間往前 1 秒**（內部跑 `game.frame(1)`）：0.95 秒的大火圈會整個錯過。鏡頭在快進之前設，凍結後只 `render()`。
- 截圖前一定要 `render()`（兩次較保險），並 `freeze(true)` 讓畫面停住。
- 要找哪種特效沒畫出來：`__game.fxStats`（火舌／粒子／光各幾個）、`__game.drawList()`（看得到的物件清單）、`__game.perf`（draw call）。
- 手機直式畫面很窄：離玩家超過約 10 公尺的東西左右兩邊會在畫面外。

## 常用的開發介面

`__game.run`（快照：level、kills、enemies、awaitingPick…）、`screens`、`offer`（目前三張卡）、`advance(dt)`、`render()`、`setTime(秒)`、`addXp(n)`、`give(cardId, rarity)`、`giveTech(id)`、`techLevel(id, lv)`、`evolveTech(id)`、`spawn(id, n)`、`spawnAt(id, dx, dz, variant, vet, hp)`、`setUlt(id, lv)`＋`chargeUlt()`（放大招要真的按 F：`page.keyboard.down('f')` → advance → up）、`teleport(x, z)`、`god`、`freeze(on)`、`facingDeg`、`blenderReady`。完整清單在 `src/dev/devApi.ts`。

## 送給使用者之前

逐張讀過、逐字讀畫面上的字，再用 `SendUserFile` 送；caption 寫每張是什麼、看哪裡。看到怪的東西先修再送，或在回報裡講清楚。
