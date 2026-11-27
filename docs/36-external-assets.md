# 36. 外部免費素材試用（使用者 2026-11-27：「腳色和敵人還有特效跟介面 ui…不夠精緻…自動化去抓不同模型來試試」；準則：高自動化）

## 1. 流程（全自動，工具已進版本庫）
1. **網路**：環境允許清單加了 `quaternius.com`、`api.polyhaven.com`、`dl.polyhaven.org`、`ambientcg.com`、`opengameart.org`（kenney.nl、poly.pizza 也加了，但網站本身擋自動下載回 403——**不偽裝瀏覽器繞過**；Kenney 的包在 OpenGameArt 有鏡像可抓）。
2. **下載**：`node scripts/assets/fetch-oga.mjs <OpenGameArt 頁面名稱> …` → `candidates/<名稱>/`（**不進版本庫**，`.gitignore`）＋ `candidates/manifest.json`（來源、作者、授權、檔案、日期）。**頁面授權不是只有 CC0 就拒絕下載**。用 curl（走環境代理；Node 的 fetch 不走代理）。
3. **轉檔**：`python3 tools/blender/convert.py <bpy 目錄> <FBX/OBJ/blend/glb> <輸出.glb> [身高]`：等比縮到指定身高、腳底 z=0、置中、把縮放烘進資料、材質一律不透明與非金屬（踩到的坑見第 4 節）。
4. **對照**：開發介面 `__game.previewGlb(url, dx, dz, yaw)`（載入 glb、擺待機姿勢、回傳三角形數）＋ `node scripts/shots/candidates.mjs <標籤> <我們的人類 id,…> <候選 glb,…>` → `screenshots/cand-<標籤>-{desktop,phone-portrait}.png`（同一個畫面風格、同一個光、同一排）。
5. **真的要用**：搬進 `src/assets/`，寫進 `src/assets/LICENSES.json`（之後加單元測試：沒有紀錄或不是 CC0 的檔案擋下來）。

## 2. 第一輪試用結果（2026-11-27）
| 類別 | 候選（全部 CC0） | 結論 |
|---|---|---|
| 人類（敵人） | Quaternius「Ultimate Animated Character Pack」：和服男、忍者、騎士（有骨架、7 段動畫） | **不採用**：①頭小身長、臉是黑色平面——和我們的 Q 版大頭大眼放在一起很突兀（對照圖 `cand-q-*`）②一隻 2,500～3,000 三角形，敵人預算 700（場上 200 隻 → 每幀多 50 萬三角形，手機吃不下）③顏色是原作的灰黑，不是我們的色票 |
| 怪物 | 「50+ Monsters Pack 3D」（isaiah658） | **不採用**：圓潤、三角形少（約 600，合預算），但是西式怪物，和「人類 vs 妖怪（玩家方）」的設定不合 |
| 其他角色 | Tiby、Little Knight、Chibi Neko、Kenney Blocky | 看預覽就淘汰：沒有貼圖（白模）、寫實比例、方塊頭 |
| 特效 | 「Animated particle effects #1」（para）序列圖、2D Spell Effects、25 special effects | **值得試**：火環／爆炸序列圖可以當命中、打倒時多一層貼片（我們的火是著色器畫的浮世繪風格，序列圖偏寫實，要調色＋只放一層）。排下一輪 |
| 介面 | Golden UI（像素風）、Free Game GUI、Casual Game Button Pack | 像素風不合；其餘是西式休閒風，**可以拿版型參考**，直接用會和和風不搭 |

## 3. 判斷與下一步（我的建議）
- 角色與敵人：外面沒有「和風 Q 版妖怪／人類」的 CC0 模型（OpenGameArt 搜 chibi、samurai、ninja、japanese、monster 都沒有合用的）；**精緻度改由自己的 Blender 模型升級**（頭部與五官面數、衣服皺褶與層次、描邊、貼圖細節），比換別人的模型風格一致、也守得住效能預算。
- 特效：序列圖貼片試做一輪（命中火花、打倒煙），用特效目錄（vfx-catalog）逐格對照、p1 量效能。
- 介面：參考休閒風版型重做面板邊框與按鈕（和風花紋），不直接用。
- 材質：地面、岩石、樹皮換 ambientCG／Poly Haven 的 CC0 貼圖（Q74 原本的第一批）。

## 4. 踩到的坑（轉檔工具已處理）
- 骨架的縮放匯出時被重設 → 第一版還是 3 公尺高：改成縮放後 `transform_apply`。
- Quaternius 的 FBX 轉過來材質透明度 0 → 整隻看不見：一律改不透明。
- 金屬度 1 在我們的場景（沒有環境反射）是全黑：一律非金屬、霧面。
- 從 .blend 轉顏色全白、從 FBX 轉是原作的灰黑：**原作本來就是黑臉灰衣**（包裡的預覽圖也是），FBX 版才是對的。
- Blender 的 glTF 匯入器會自己產生一顆 Icosphere（骨頭顯示用），不是檔案裡的東西。

## 5. 第二輪：貼圖（2026-11-27，建模師，docs/37 第一批）
- **ambientCG 下載不了**：API 查得到，但 `ambientcg.com/get?file=…` 會轉到 `acg-download.struffelproductions.com`，環境代理擋（403，不在允許清單）。沒有繞過；改用 Poly Haven。要用 ambientCG 的話，請主 session 評估把那個網域加進環境的允許清單。
- **Poly Haven**：`node scripts/assets/fetch-polyhaven.mjs <id…>` → `candidates/polyhaven/<id>/`（1k 的 Diffuse、nor_gl、AO；記作者與來源到 `candidates/manifest.json`）。全站 CC0。
- 採用：`sparse_grass`（草）、`park_dirt`（泥土）、`grey_stone_path`（石板）、`rock_face_03`（岩石）、`weathered_planks`（木頭）；`tools/textures/prep_layers.py` 轉成 512 的中性灰細節貼圖（顏色由色票決定）→ `src/assets/textures/ground-*.jpg`，已寫進 `LICENSES.json`（作者照 Poly Haven 頁面）。
- 沒採用：`leafy_grass`、`forrest_ground_01`（顏色斑駁，轉灰之後和 sparse_grass 差不多）、`stone_pathway_02`（方整的石板，比較像西式廣場）、`monastery_stone_floor`、`rock_face`（偏紅）、`japanese_cedar_planks`（太新、太亮；之後做木造建築可以再試）。
