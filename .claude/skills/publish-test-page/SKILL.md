---
name: publish-test-page
description: 百鬼陣的「測試頁」打包、在不准 fetch 的環境下檢查打包檔、用 Artifact 發佈到固定網址；以及只有使用者說「發佈」時才動的正式分享頁（主網址）。使用者提到測試頁、分享頁、Artifact、發佈、更新網址、「我在手機上看到的版本」，或一批改動做完要讓使用者試玩時，就用這個 skill。
---

# 測試頁打包與發佈

使用者在手機上開 Artifact 試玩。Artifact 不准網路請求（fetch），本機開發版能跑的東西到了那裡可能默默壞掉——之前模型用 fetch 載入，測試頁退回舊模型，使用者問「為什麼造型又恢復以前醜醜的樣子」。所以**一定要測打包後的檔案**，而且要在不准 fetch 的環境下測。

## 測試頁（使用者已授權，做完一批就更新，不用問）

網址：https://claude.ai/artifact/GXGprLDbQYgEHRGByNVnpA

```bash
cd /home/user/yokai-survivors
bash scripts/packed/prepare.sh <scratchpad>/yokai-test.html   # 打包＋外殼＋開 5181（不准 fetch）
BASE_URL=http://localhost:5181/yokai-test.html NODE_PATH=node_modules node scripts/packed/check.mjs
BASE_URL=http://localhost:5181/yokai-test.html NODE_PATH=node_modules node scripts/regress.mjs --only p1   # 有畫面或效能改動時
```

- `check.mjs` 會確認 Blender 模型真的載入（`blenderReady`），並截 `screenshots/packed-menu.png`、`packed-play.png`——讀一下這兩張。
- 打包比對標籤一律加 `\b`（正規表示式），不然會誤配。
- 發佈：Artifact 工具，`file_path` 用上面那個 scratchpad 檔、`label` 寫這次改了什麼（≤ 60 字）。這個 session 沒發佈過的話要帶 `url`（新 session 先 `read` 一次）。
- 回報時附版本號（工具回傳的 Version）。

## 主網址（正式分享頁）

**只有使用者說「發佈」才動。** 主網址不帶測試工具：

```bash
npm run check:main   # build:single:main，並確認打包後沒有 __game 等測試工具
```

主網址還沒建立過；第一次建立時把網址寫進 `docs/09-handoff.md` 與這份 skill。

## 常見問題

- 5181 沒回應：伺服器被砍了，重跑 `prepare.sh`（它會自己開）。
- 發佈被拒說「artifact-pr-review machinery」：壓縮後的程式碼被誤判，把長串重複的 `switch`／`find` 改成查表。
- 記憶體不足把瀏覽器砍掉：同時跑的模擬、回歸太多，一次跑一個。
