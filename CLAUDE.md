# 百鬼陣 YOKAI SURVIVORS（暫名）：給 AI 協作者的專案說明

- 使用者以繁體中文溝通；文件、註解、介面文字都用繁體中文（台灣用語）。其他語言之後再做，**所有玩家看得到的字一律走 `src/i18n`**，不要寫死在程式裡。
- 技術：Three.js + TypeScript + Vite。**不使用外部模型檔**，所有模型用程式碼建出來（`src/art`、`src/units`）。
- **這份只放必守規則與索引。細節在 `docs/`。文件與程式碼衝突時以程式碼為準，再回頭更新文件。新 session 先讀 `docs/09-handoff.md`。**
- 這個專案是從《燈落之境 LUMENFALL》拆出來的。搬過來的東西與沒搬的理由在 `docs/10-migration.md`。

## 要動哪一塊，先讀哪份

| 要動的東西 | 讀這裡 |
|---|---|
| 玩法、核心循環、操作、勝負 | `docs/01-gdd.md` |
| 任何數字（屬性、卡片、稀有度、地圖要素、局外商店、經濟） | `docs/02-balance.md`（**改數字要同步改 `src/data/` 與這份**） |
| 地形、高低差、各地圖設計、妖怪在各地形的效果 | `docs/03-terrain-maps.md` |
| 妖怪（玩家方）、人類（敵方）、頭目、圖鑑與收集 | `docs/04-yokai-and-enemies.md` |
| 開發進度、里程碑、關卡門檻 | `docs/05-schedule.md` |
| 程式架構、狀態機、資料格式、效能預算 | `docs/06-tech-architecture.md` |
| 測試、驗收、回歸、卡住偵測 | `docs/07-test-qa-plan.md` |
| 美術、音效、音樂、介面 | `docs/08-art-audio-ui.md` |
| 風險與待辦 | `docs/11-risks-backlog.md` |
| 用詞、台詞、介面文字 | `docs/12-voice-and-terms.md` |
| 市場與同類遊戲研究（含來源） | `docs/13-market-research.md`；**同類肉鴿的系統與數值研究、改版提案：`docs/15-roguelike-research.md`** |
| 收集、抽卡、活動系統的研究與排程 | `docs/16-collection-events.md` |
| 還沒決定、等使用者點頭的事 | `docs/14-open-questions.md` |

## 架構鐵則（細節見 docs/06）

- **嚴格狀態機**：`BOOT → MENU → RUN_SETUP → COMBAT → INTERMISSION → (COMBAT …) → RUN_END → META_SHOP → MENU`（D22 之後 INTERMISSION 是「過關畫面」：關與關之間的短畫面，不是波與波之間的整備）。**戰鬥中（COMBAT）允許的打斷只有「升級選卡」與「要素結果卡」**：升級當下模擬暫停、跳出三選一，選完繼續（吸血鬼倖存者式，D15）；要素集滿／收下後暫停顯示拿到了什麼，按繼續才回到戰鬥（D36，共用選卡面板的樣式）；其他任何彈窗都不准。地圖要素的選擇走要素自己的「站進去／按住」流程（賽錢箱的三選一沿用升級選卡的同一個面板）。
- **資料驅動**：所有妖怪、人類、卡片、地圖要素、地形、地圖、局外升級的數字都放 `src/data/`，程式碼裡不准出現平衡用的數字（魔術數字）。
- **事件匯流排**：系統之間不直接互叫，用 `bus.emit`／`bus.on`。
- **存檔只存「發生過什麼」**：新欄位補 `defaultSave()`，並測「存檔 → `page.reload()` → 還在」。局外成長、圖鑑、已解鎖內容在存檔；一局內的狀態不存檔（中途離開視為放棄，局外獎勵照結算規則給）。
- **固定時間步長**（1/60 秒）模擬 + 可變幀率渲染；暫停時模擬停、渲染照畫。分頁失焦自動暫停。
- **敵人用 `THREE.InstancedMesh`**；超過 300 隻要用空間雜湊做碰撞；投射物、傷害數字、特效一律物件池；**熱路徑（每幀）不 `new`**。
- 隨機一律用固定種子的 `Rng`（`src/lib/random.ts`）：地圖生成、卡片抽選、要素抽選都要能用種子重現（回報 bug 時帶種子）。
- 顏色取自 `src/art/palette.ts`；材質用 `soft()`／`glow()`；風格是**和風、圓潤、卡通**：不要 `flatShading`、不隨機推頂點、不留銳利的邊。
- 3D 鏡頭：**玩家可自由旋轉視角**（D23，取代原本的固定俯角鐵則）；第三人稱繞著玩家轉，俯仰有上下限，跟隨玩家的 3D 位置，**碰到地形時拉近（彈簧臂）不穿進地裡**；移動方向永遠相對鏡頭。參數在 `src/data/camera.ts`。操作：移動、轉視角、跳躍（D24）、號令。

## 工作方式（從燈落之境帶過來的教訓）

- **測使用者會做的事，不要測我寫的程式**：介面／教學／選卡流程的回歸要用真實點擊走完整條路，手機直式、橫式、桌面各跑一次，並加「卡住偵測」（畫面狀態連續 N 輪沒變且還沒完成就失敗）。只斷言內部函式，會讓玩家卡住的錯全綠。
- **使用者指出一處問題，就掃同類的全部**；偵測型檢查用「全掃」不用「清單」；修正要有「舊版會紅」的測試。
- **回報要附截圖**（使用者 2026-11-08：「你報告的時候要給我照片喔」）：每次回報有畫面變動的內容，用 `SendUserFile` 把回歸腳本產生的 `screenshots/*.png` 挑關鍵的 3～4 張送出（手機直式優先，必要時加桌面），並在說明裡寫每張是什麼；沒有畫面的改動（純數值、純文件）不用。
- **回報分「驗證了什麼」與「沒覆蓋的類別」**，不要寫「其他應該沒問題」。**原因沒查清楚、沒在使用者實際看到的那份檔案上重現，就不要說修好了。**
- **數字改動要有依據**：改平衡數字時，在 `docs/02-balance.md` 的變更紀錄加一行（日期、改了什麼、為什麼、用什麼模擬或試玩驗證）。
- **分享頁要測打包後的檔案**；打包比對標籤一律加 `\b`。測試頁用 `build:single`，正式分享頁（主網址）**只有使用者說「發佈」才動**。
- 無頭瀏覽器只有 1～2 FPS：用 `waitForFunction` 或 `__loop.advance(dt)` 快進，不要固定等待；截圖前先 `__loop.render()`。
- 測試時不要改 `src`；不要用 `pkill -f 腳本名稱`；回歸 id 必須唯一；步驟接近 45 秒要登記 `stall`。
- **使用者提出的新項目，不一定要馬上做**（使用者 2026-11-05）：先評估（同類遊戲怎麼做、影響哪些系統、工作量、風險），寫進文件並**排進里程碑**，回報評估與排程；使用者明確說「現在做／開始」才實作。
- 子代理（部門）分工前先查使用者在文件裡定過的決定（docs/14 的「已決定」區），任務單寫明不能推翻。
- 不主動開 PR；提交訊息結尾加 `Co-Authored-By` 與 `Claude-Session` 兩行（照該 session 的附註）。

## 開發模式介面

`window.__game`：`state`（目前狀態機）、`seed`、`advance(dt)`、`render()`、`spawn(id, n)`、`setWave(n)`、`give(cardId, rarity)`、`god`（無敵，測試用）、`teleport(x, z)`、`forceElement(id, rarity)`（強制生出某個地圖要素）。目前（M2-1）已有：`state`、`seed`、`paused`、`simTime`、`quality`、`audio`、`perf`（draw call 等）、`screens`（畫面上看得到的畫面名稱，卡住偵測用）、`run`（這一局的快照）、`map`（台地、丘、水池）、`camera`（yaw、pitch、距離、鏡頭離地）、`offer`、`advance`、`render`、`settle`（不畫圖讓鏡頭追上）、`spawn`、`setTime`（跳到關卡的某一秒）、`killBoss`、`give`、`addXp`、`god`、`teleport`；`forceElement(kind, rarity)`（`ELEMENT_KINDS` 全部，含 dosojin）、`chargeUlt()`（大招量表充滿）、`setUlt(id, level)`（換成指定大招與升級等級，D52）、`summonBoss()`（直接召喚小頭目，D34；`run.summon` 看祭壇）、`forcePickup(kind)`（補給品，D39）、`dropOrbs(n, dist)`／`orbsLooseBeyond(d)`（魂火，k1）、`setHp(v)`；其餘隨系統加入；`window.__loop` 是 `advance`／`render` 的別名。**主網址不帶測試工具**（`build:single:main` 拿掉）。

## 檢查

- `npm run typecheck`；`npm test`（Vitest，純邏輯）；`npm run build`；`npm run check:main`（打包後的主網址不含測試工具）。
- `NODE_PATH=node_modules node scripts/regress.mjs --only <id,…>`（要開著 `npx vite --port 5173`；`--list` 看清單）。
- 平衡模擬：`npm run sim -- [--runs 20] [--only random,dps,survive] [--elements on|off|both] [--tune hpScale=1.5,w.hpPerWave=0.25,xp.needPerLevel=4]`（v1 已建立，見 docs/07 第 4 節；約 90 秒）。**改 `src/data` 的數字前後都要跑**，結果寫進 docs/02 變更紀錄。
- **更新紀錄**：每一批影響玩家的改動，在 `src/game/changelog.ts` 最前面加一筆、`CONTENT_VERSION` +1（單元測試守著）；文字是系統口氣、不劇透、台灣用語。
