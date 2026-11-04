import { writeFileSync } from "node:fs";
// src/core/bus.ts
var EventBus = class {
	handlers = {};
	on(name, fn) {
		const list = this.handlers[name] ?? [];
		this.handlers[name] = [...list, fn];
		return () => this.off(name, fn);
	}
	off(name, fn) {
		const list = this.handlers[name];
		if (!list) return;
		this.handlers[name] = list.filter((h) => h !== fn);
	}
	emit(name, payload) {
		const list = this.handlers[name];
		if (!list) return;
		for (let i = 0; i < list.length; i++) list[i](payload);
	}
	/** 測試用：清空所有監聽 */
	clear() {
		this.handlers = {};
	}
};
/** 全遊戲共用的一條匯流排 */
var bus = new EventBus();
// src/data/combat.ts
/** 戰鬥通用數字（docs/04 第 3.1 節接觸傷害規則、docs/06 第 6 節效能預算）。 */
var COMBAT = {
	/** 同一隻對玩家的接觸傷害冷卻（秒）、玩家受傷後無敵（秒） */
	contactCooldown: .8,
	invulnerable: .3,
	/** 擊退速度衰減（每秒保留比例的指數底，越小停得越快） */
	knockbackDecay: 5e-4,
	/** 命中閃白持續（秒） */
	hitFlash: .12,
	/** 軟推擠：敵人數 ≥ 這個才做，只算鄰格 */
	softPushMin: 250,
	softPushStrength: 3,
	/** 空間雜湊格子（公尺） */
	hashCell: 2,
	/** 玩家身體半徑（接觸判定用） */
	playerRadius: .5,
	/** 單次查詢最多回傳幾個（預先配置的緩衝大小） */
	queryMax: 512,
	/** 傷害數字：同時最多、停留（秒）、上飄速度 */
	damageNumbers: {
		max: 48,
		life: .6,
		rise: 1.2
	},
	/** 暫停、死亡時的小延遲（秒），讓玩家看見最後一擊 */
	deathDelay: .8
};
// src/data/movement.ts
/** 玩家移動與跳躍（D24，docs/03 第 4 節）。 */
var MOVE = {
	/** 起跳速度（公尺/秒）、重力（公尺/秒²）→ 高約 v²/2g = 1.2 公尺 */
	jumpSpeed: 7,
	gravity: 20,
	/** 離開地面後仍可起跳的時間（土狼時間）、按太早仍會被記住的時間（跳躍緩衝）（秒） */
	coyote: .1,
	jumpBuffer: .1,
	/** 空中的操控力（0..1）：水平速度每秒向目標靠近的比例 */
	airControl: .8,
	airAccel: 10,
	/** 走在地面上時能走的最大坡度（度），超過視為牆（要跳或繞） */
	maxWalkSlopeDeg: 35,
	/** 往下走多高仍貼著地面（超過就變成掉落）（公尺） */
	stepDown: .6,
	/** 玩家腳高於敵人腳底多少公尺，就不會被這隻的接觸傷害（人類身高約 1.3） */
	contactClear: 1,
	/** 掉到地圖外或過深的保險：不會發生，因為地圖有邊界；留給測試 */
	killY: -50
};
// src/data/yokai.ts
var YOKAI = { "chochin-kozo": {
	id: "chochin-kozo",
	base: {
		maxHp: 100,
		speed: 4
	},
	weapon: {
		id: "ghostfire",
		damage: 8,
		interval: .8,
		range: 9,
		volley: 1,
		projectileSpeed: 12,
		turnRate: 6,
		lifetime: 1.6,
		hitRadius: .5,
		pierce: 0,
		splashRadius: 0,
		splashRatio: 0,
		knockback: 5
	},
	aura: {
		radius: 5,
		slow: .1
	},
	radius: .45
} };
/** M1 已可玩的領頭妖怪（其餘在選單顯示「製作中」） */
var PLAYABLE_YOKAI = ["chochin-kozo"];
// src/data/progression.ts
/** 魂火與升級（docs/02 第 3.1 節，起始提案）。 */
var PROGRESSION = {
	/** 第 L 級升到 L+1 所需魂火 = base + perLevel × L */
	needBase: 6,
	needPerLevel: 2.5,
	/** 魂火顆的數值 = 威脅點數 × 這個 */
	orbPerPoint: 1,
	/** 魂火被吸向玩家的速度（公尺/秒）與加速度 */
	orbMagnetSpeed: 11,
	orbIdleDrift: 0,
	/** 魂火顆數上限（超過直接加經驗，不再生顆） */
	maxOrbs: 600,
	/** 波次結束時，場上所有魂火自動吸向玩家的速度 */
	orbSweepSpeed: 22
};
var xpNeed = (level) => PROGRESSION.needBase + PROGRESSION.needPerLevel * level;
/** M1 的升級卡池（docs/05：4 張屬性卡就好）；M2 起改成依局外解鎖。每次升級給幾張、可用的稀有度 */
var CARD_POOL_M1 = [
	"hp",
	"power",
	"atkSpeed",
	"speed",
	"area",
	"volley",
	"splash",
	"pierce"
];
/** 沒解鎖「妖」之前只有凡、靈（docs/02 第 4.1 節） */
var RARITIES_UNLOCKED_M1 = ["common", "rare"];
// src/data/stage.ts
/**
* 連續計時關卡（D22，docs/02 第 8.1 節）。起始提案，G1b 試玩後調。
* 取代原本的 20 波：用「虛擬波數」n(t) 沿用既有的敵人強度公式與威脅點數 T(n)。
*/
var STAGE = {
	/** 章節制（D26）：一般地圖幾關；每第 everyMaps 張地圖是「大關」，關數增加、最後一關的頭目更強 */
	chapter: {
		normalStages: 2,
		bigStages: 3,
		everyMaps: 3,
		/** 大關最後一關的頭目 HP 倍率（佔位，M2 sim 調；頭目的招式強化等 M7 做完整頭目時再加） */
		bigBossHp: 2.5
	},
	/** 關卡長度（秒，可調） */
	duration: 600,
	/** 第 k 關（從 0 起）的敵人 HP 額外倍率 = 1 + hpPerStage × k */
	hpPerStage: .5,
	/** 湧出速率（威脅點數／秒）= (threatBase + threatPerWave × n(t)) ÷ rateBaseSeconds × countScale */
	rateBaseSeconds: 20,
	/** 虛擬波數的範圍：t = 0 時是 virtualStart，t = duration 時是 virtualEnd */
	virtualStart: 1,
	virtualEnd: 20,
	/** 生成：離玩家的距離範圍（公尺）；自由視角沒有「畫面外」所以用距離 */
	spawnRingMin: 18,
	spawnRingMax: 24,
	/** 精英：HP、傷害倍率與體型、魂火倍率（docs/04 第 3.2 節） */
	elite: {
		hp: 4,
		damage: 1.5,
		scale: 1.4,
		orbMult: 5
	},
	/** 定時事件（at = 佔關卡長度的比例） */
	events: [
		{
			at: .25,
			kind: "elite",
			count: 1
		},
		{
			at: .5,
			kind: "surge",
			count: 2,
			surgeSeconds: 30,
			surgeMult: 2
		},
		{
			at: .75,
			kind: "elite",
			count: 3
		}
	],
	/** 頭目出現的時間點（比例）；M1.5 是放大的退魔僧佔位 */
	bossAt: .8,
	/** 最終蜂群：湧出速率倍率、每幾秒一隻精英 */
	swarm: {
		rateMult: 3,
		eliteEvery: 20
	},
	/** 傳送門：進入距離（公尺）、垂直容許差（公尺） */
	portalRadius: 1.5,
	portalHeight: 2.5
};
/** 第 mapNumber 張地圖（從 1 起）是不是大關 */
function isBigMap(mapNumber) {
	return mapNumber >= STAGE.chapter.everyMaps && mapNumber % STAGE.chapter.everyMaps === 0;
}
/** 這張地圖有幾關 */
function stagesForMap(mapNumber) {
	return isBigMap(mapNumber) ? STAGE.chapter.bigStages : STAGE.chapter.normalStages;
}
/** 這張地圖第 stageIndex（0 起）關的頭目 HP 倍率：只有大關的最後一關加強 */
function bossHpMult(mapNumber, stageIndex) {
	return isBigMap(mapNumber) && stageIndex === stagesForMap(mapNumber) - 1 ? STAGE.chapter.bigBossHp : 1;
}
// src/data/waves.ts
/** 波次與敵人強度（docs/02 第 3、8、9 節）。 */
var WAVES = {
	/** 一局幾波 */
	total: 20,
	/** 原型波長（秒，D16）；正式版依波數見 docs/02 第 8 節 */
	duration: 20,
	/** 威脅點數 T(n) = base + perWave × n（以 20 秒波為基準） */
	threatBase: 8,
	threatPerWave: 5,
	/**
	* 數量倍率（D18：先做成可調，G1 試玩定）。1 = docs/02 的原值（第 20 波約 60 隻，不像割草）；
	* docs/14 D18 目標是第 5 波約 60 隻、第 10 波約 150 隻、第 20 波約 300 隻 ≈ 2.5。測試頁可用 ?count= 調。
	*/
	countScale: 1,
	/** 單隻 HP 的額外倍率（改數量時等比下調用）；?hp= */
	hpScale: 1.5,
	/** 每波分幾批湧入、湧入佔波長的比例（最後一段留給收尾） */
	batches: 5,
	spawnSpan: .8,
	/** 敵人強度（第 n 波、夜深度 d） */
	hpPerWave: .25,
	hpPerNight: .15,
	damagePerWave: .08,
	speedPerNight: .03,
	/** 同畫面敵人上限（桌機／手機）；超過的點數留到下一批 */
	maxEnemiesDesktop: 400,
	maxEnemiesMobile: 200,
	/** 生成：離玩家的距離（公尺）、嘗試幾個角度找可走的位置 */
	spawnRing: 15,
	spawnTries: 12,
	/** 每個模擬步最多生幾隻（避免一步生太多卡住） */
	spawnPerStepMax: 12,
	/** 玩家出生點周圍不生成的安全半徑 */
	safeRadius: 6
};
function threat(n) {
	return WAVES.threatBase + WAVES.threatPerWave * n;
}
var enemyHpMult = (n, night = 0) => (1 + WAVES.hpPerWave * (n - 1)) * (1 + WAVES.hpPerNight * night);
var enemyDamageMult = (n) => 1 + WAVES.damagePerWave * (n - 1);
var enemySpeedMult = (night = 0) => 1 + WAVES.speedPerNight * night;
// src/data/tuning.ts
/**
* 可調的旋鈕（D18：敵人數量先做成可調）。預設值取自資料表；只有開發模式與測試頁會用網址參數覆寫
* （?count=2.5&hp=0.6&dmg=2），主網址不吃。程式讀這個物件，不直接讀 WAVES 的數量與 HP 倍率。
*/
/**
* M1／M1.5 試玩預設（G1、G1b 用手感決定）：不是 docs/02 的數字。依據：2026-11-03 無頭機器人探針
* （tests/unit/m1-balance-probe.test.ts，4 個種子，只會逃跑繞圈的機器人，第 1 關 10 分鐘）：
* 數量 ×2.5、3 顆、濺射 1.2、傷害 ×1 → 平均撐 174 秒（死在頭目之前）；
* 數量 ×2.5、4 顆、濺射 1.5、傷害 ×1.5（採用）→ 平均撐 429 秒、2,562 擊殺，頭目出現 2/4、過關 1/4。
* 人會比機器人強，所以不再加強。M2 有小妖與 sim 之後移除，改回資料表。
*
* 2026-11-04（使用者：「太簡單，開局不要打這麼多敵人」）：舊預設機器人 4/4 過關（平均 516 秒、擊殺 3,607）。
* 改成數量 ×2、起步 2 顆、濺射 0.8、傷害 ×1（鬼火再多、濺射再大要靠「鬼火增殖」「爆裂」武器卡）→ 機器人 2/4 過關（平均 341 秒、擊殺 1,630）。
* 起步 1 顆、無濺射太弱（×1.5 平均 201 秒、×2.5 平均 49 秒，機器人撐不過前幾分鐘）。
*/
var M1_PLAYTEST = {
	countScale: 2,
	hpScale: WAVES.hpScale,
	damageScale: 1,
	volley: 2,
	splash: .8,
	stageSeconds: STAGE.duration
};
var tuning = {
	/** 敵人數量倍率（見 WAVES.countScale） */
	countScale: M1_PLAYTEST.countScale,
	/** 單隻敵人 HP 倍率 */
	hpScale: M1_PLAYTEST.hpScale,
	/** 玩家輸出傷害倍率（M1 試玩手感用；sim 之後移除，見 docs/02 第 8 節警告） */
	damageScale: M1_PLAYTEST.damageScale,
	/** 領頭武器一次發幾顆／濺射半徑（公尺）；0 = 用 yokai.ts 的原值。M1 沒有小妖，領頭火力不夠，試玩用 */
	volley: M1_PLAYTEST.volley,
	splash: M1_PLAYTEST.splash,
	/** 關卡長度（秒，D22；G1b 試玩調） */
	stageSeconds: M1_PLAYTEST.stageSeconds
};
/** 測試用：恢復預設 */
function resetTuning() {
	Object.assign(tuning, M1_PLAYTEST);
}
// src/lib/random.ts
/** 固定種子的亂數產生器（mulberry32），讓每次產生的模型都一模一樣 */
var Rng = class {
	state;
	constructor(seed) {
		this.state = seed >>> 0;
	}
	next() {
		this.state = this.state + 1831565813 >>> 0;
		let t = this.state;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
	range(min, max) {
		return min + (max - min) * this.next();
	}
	int(min, max) {
		return Math.floor(this.range(min, max + 1));
	}
	pick(items) {
		return items[Math.floor(this.next() * items.length)];
	}
	sign() {
		return this.next() < .5 ? -1 : 1;
	}
};
// src/data/maps/highlands.ts
/**
* 大起伏的關卡地圖（M1.5，D23、D24）：約 120×120 公尺、高度 0～12 公尺。
* 由種子生成：丘陵（高斯）、**台地**（有陡峭的懸崖邊，但一定有一條緩坡可以走上去）、水池、散落的岩石與石燈籠。
* 地形骨架由種子決定，所以同種子同地圖（回報問題帶種子）；出生點周圍保證是平地。
* 單元測試全掃多個種子：出生點平坦、可走區域連通、台地都有坡道。
*/
var HIGHLANDS = {
	size: 120,
	hills: {
		count: 16,
		height: [1.5, 6.5],
		sigma: [5, 12]
	},
	plateaus: {
		count: 5,
		r: [8, 14],
		height: [2.2, 5.5],
		cliffEdge: .01,
		rampWidth: [9, 13]
	},
	ponds: {
		count: 3,
		r: [6, 11]
	},
	obstacles: {
		rocks: 40,
		lanterns: 14
	},
	/** 出生點周圍保證平坦的半徑（公尺） */
	safeRadius: 12
};
function farFromStart(rng, half, min) {
	for (let i = 0; i < 40; i++) {
		const x = rng.range(-half + 6, half - 6);
		const z = rng.range(-half + 6, half - 6);
		if (Math.hypot(x, z) >= min) return {
			x,
			z
		};
	}
	return {
		x: half - 10,
		z: half - 10
	};
}
function makeHighlands(seed) {
	const rng = new Rng(seed ^ 2654435761);
	const half = HIGHLANDS.size / 2;
	const H = HIGHLANDS;
	const hills = Array.from({ length: H.hills.count }, () => {
		const p = farFromStart(rng, half, H.safeRadius + 8);
		const height = rng.range(H.hills.height[0], H.hills.height[1]);
		return {
			...p,
			height,
			sigma: Math.max(rng.range(H.hills.sigma[0], H.hills.sigma[1]), height * 1.4)
		};
	});
	const plateaus = [];
	for (let n = 0; n < H.plateaus.count; n++) {
		const r = rng.range(H.plateaus.r[0], H.plateaus.r[1]);
		let p = farFromStart(rng, half, H.safeRadius + r + 10);
		for (let t = 0; t < 30 && plateaus.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + r + 30); t++) p = farFromStart(rng, half, H.safeRadius + r + 10);
		if (plateaus.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + r + 30)) continue;
		plateaus.push({
			...p,
			r,
			height: rng.range(H.plateaus.height[0], H.plateaus.height[1]),
			rampDir: Math.atan2(-p.z, -p.x) + rng.range(-.8, .8),
			rampWidth: rng.range(H.plateaus.rampWidth[0], H.plateaus.rampWidth[1]),
			cliffEdge: H.plateaus.cliffEdge
		});
	}
	const nearPlateau = (x, z, extra) => plateaus.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + o.height * 1.6 + 4 + extra);
	/** 丘在某處的高度（池塘不放在山上，水面是平的） */
	const hillAt = (x, z) => hills.reduce((a, h) => a + h.height * Math.exp(-((x - h.x) ** 2 + (z - h.z) ** 2) / (2 * h.sigma * h.sigma)), 0);
	const zones = [];
	for (let i = 0; i < H.ponds.count; i++) {
		const r = rng.range(H.ponds.r[0], H.ponds.r[1]);
		let p = farFromStart(rng, half, H.safeRadius + 14);
		for (let t = 0; t < 60 && (nearPlateau(p.x, p.z, r) || hillAt(p.x, p.z) > .4); t++) p = farFromStart(rng, half, H.safeRadius + 14);
		if (nearPlateau(p.x, p.z, r) || hillAt(p.x, p.z) > .4) continue;
		zones.push({
			...p,
			r,
			type: "shallow",
			depth: .15
		});
		zones.push({
			...p,
			r: r * .45,
			type: "deep",
			depth: .5
		});
	}
	const obstacles = [];
	for (let i = 0; i < H.obstacles.rocks + H.obstacles.lanterns; i++) {
		let p = farFromStart(rng, half, H.safeRadius + 3);
		for (let t = 0; t < 40 && nearPlateau(p.x, p.z, 0); t++) p = farFromStart(rng, half, H.safeRadius + 3);
		if (nearPlateau(p.x, p.z, 0)) continue;
		const rock = i < H.obstacles.rocks;
		obstacles.push({
			...p,
			r: rock ? rng.range(.8, 1.6) : .6,
			kind: rock ? "rock" : "lantern"
		});
	}
	return {
		id: "highlands",
		size: {
			w: H.size,
			d: H.size
		},
		cell: 1,
		noiseSeed: seed & 65535,
		noiseHeight: .15,
		hills,
		zones,
		obstacles,
		playerStart: {
			x: 0,
			z: 0
		},
		plateaus,
		flatRadius: H.safeRadius,
		edgeFalloff: 14
	};
}
// src/data/terrain.ts
/** 地形種類（docs/03 第 2 節）。M1 用到草地、淺水、深水、岩地（障礙）。 */
var TERRAIN_IDS = [
	"grass",
	"shallow",
	"deep",
	"mud",
	"rock",
	"bamboo",
	"stone",
	"spring"
];
var TERRAIN = {
	grass: {
		speed: 1,
		walkable: true,
		cost: 1
	},
	shallow: {
		speed: .8,
		walkable: true,
		cost: 1.5
	},
	deep: {
		speed: 1,
		walkable: false,
		cost: 1
	},
	mud: {
		speed: .7,
		walkable: true,
		cost: 2
	},
	rock: {
		speed: 1,
		walkable: true,
		cost: 1
	},
	bamboo: {
		speed: 1,
		walkable: true,
		cost: 1.2
	},
	stone: {
		speed: 1.05,
		walkable: true,
		cost: 1
	},
	spring: {
		speed: 1,
		walkable: true,
		cost: 1
	}
};
/** 高低差（docs/03 第 4 節）：上坡／下坡的速度倍率、陡坡（視為牆）的角度 */
var SLOPE = {
	uphill: .85,
	downhill: 1.1,
	/** 沿移動方向的高度變化率（公尺/公尺）超過這個才算上／下坡 */
	threshold: .08,
	/** 超過這個角度（度）視為牆：人類走不上去，玩家要跳或繞（同 MOVE.maxWalkSlopeDeg） */
	wallDeg: 35
};
// src/lib/noise.ts
/** 2D value noise 與 fBm，用來做地形起伏和邊緣變化 */
function hash(x, y, seed) {
	let h = x * 374761393 + y * 668265263 + seed * 144269504 | 0;
	h = Math.imul(h ^ h >>> 13, 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967295;
}
function smooth$1(t) {
	return t * t * (3 - 2 * t);
}
function valueNoise(x, y, seed = 0) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = smooth$1(x - xi);
	const yf = smooth$1(y - yi);
	const a = hash(xi, yi, seed);
	const b = hash(xi + 1, yi, seed);
	const c = hash(xi, yi + 1, seed);
	const d = hash(xi + 1, yi + 1, seed);
	const top = a + (b - a) * xf;
	return top + (c + (d - c) * xf - top) * yf;
}
/** 分形布朗運動，回傳約 -1..1 */
function fbm(x, y, seed = 0, octaves = 4) {
	let sum = 0;
	let amp = 1;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += (valueNoise(x * freq, y * freq, seed + i * 17) * 2 - 1) * amp;
		norm += amp;
		amp *= .5;
		freq *= 2;
	}
	return sum / norm;
}
// src/world/terrainMap.ts
/**
* 地形查詢（docs/03 第 7 節、docs/06 第 6 節）：烘焙成高度圖＋地形種類圖＋阻擋圖，O(1) 取值。
* 純邏輯（不碰 Three.js），模擬、流場、單元測試共用。熱路徑不配置記憶體。
*/
var TYPE_INDEX = Object.fromEntries(TERRAIN_IDS.map((id, i) => [id, i]));
var SPEED_BY_INDEX = new Float32Array(TERRAIN_IDS.map((id) => TERRAIN[id].speed));
var WALK_BY_INDEX = new Uint8Array(TERRAIN_IDS.map((id) => TERRAIN[id].walkable ? 1 : 0));
/** 牆的坡度（高度變化率）：tan(35°) */
var WALL_TAN = Math.tan(SLOPE.wallDeg * Math.PI / 180);
var smooth = (t) => {
	const u = Math.min(1, Math.max(0, t));
	return u * u * (3 - 2 * u);
};
/**
* 台地的高度（docs/03 第 4 節）：平台中心高度 height，往外在「邊」的寬度內降到 0。
* 緩坡方向（rampDir ± 半寬）的邊寬是坡道長度（坡度 ≤ 約 28°），其餘是 cliffEdge（陡到走不上去）。
*/
function plateauHeight(p, x, z) {
	const dx = x - p.x;
	const dz = z - p.z;
	const d = Math.hypot(dx, dz);
	const ang = Math.abs((Math.atan2(dz, dx) - p.rampDir + Math.PI * 3) % (Math.PI * 2) - Math.PI);
	const half = Math.atan2(p.rampWidth / 2, p.r);
	const window = p.rampWidth <= 0 ? 0 : 1 - smooth((ang - half) / .25);
	const rampRun = p.height * 3.2;
	const w = p.cliffEdge + (rampRun - p.cliffEdge) * window;
	return p.height * smooth((p.r + w / 2 - d) / w);
}
var TerrainMap = class {
	def;
	cols;
	rows;
	cell;
	minX;
	minZ;
	maxX;
	maxZ;
	/** 頂點高度：(cols+1) × (rows+1) */
	heights;
	/** 每格地形種類（索引到 TERRAIN_IDS） */
	types;
	/** 每格是否擋路（1 = 擋）：深水、障礙（陡坡不算，見 stepBlocked） */
	blocked;
	constructor(def) {
		this.def = def;
		this.cell = def.cell;
		this.cols = Math.round(def.size.w / def.cell);
		this.rows = Math.round(def.size.d / def.cell);
		this.minX = -def.size.w / 2;
		this.maxX = def.size.w / 2;
		this.minZ = -def.size.d / 2;
		this.maxZ = def.size.d / 2;
		const vc = this.cols + 1;
		this.heights = new Float32Array(vc * (this.rows + 1));
		this.types = new Uint8Array(this.cols * this.rows);
		this.blocked = new Uint8Array(this.cols * this.rows);
		for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
			const x = this.minX + i * this.cell;
			const z = this.minZ + j * this.cell;
			let h = (fbm(x * .15, z * .15, def.noiseSeed, 3) - .5) * 2 * def.noiseHeight;
			let big = 0;
			for (const hill of def.hills) {
				const dx = x - hill.x;
				const dz = z - hill.z;
				big += hill.height * Math.exp(-(dx * dx + dz * dz) / (2 * hill.sigma * hill.sigma));
			}
			for (const pl of def.plateaus ?? []) big += plateauHeight(pl, x, z);
			if (def.flatRadius !== void 0) {
				const d = Math.hypot(x - def.playerStart.x, z - def.playerStart.z);
				big *= smooth((d - def.flatRadius) / 12);
			}
			if (def.edgeFalloff !== void 0) {
				const edge = Math.min(x - this.minX, this.maxX - x, z - this.minZ, this.maxZ - z);
				big *= smooth(edge / def.edgeFalloff);
			}
			if (big > 8) big = 8 + 3.5 * Math.tanh((big - 8) / 3.5);
			h += big;
			for (const zn of def.zones) {
				if (!zn.depth) continue;
				const d = Math.hypot(x - zn.x, z - zn.z);
				if (d < zn.r) {
					const u = 1 - d / zn.r;
					h -= zn.depth * (u * u * (3 - 2 * u));
				}
			}
			this.heights[j * vc + i] = h;
		}
		for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
			const cx = this.minX + (i + .5) * this.cell;
			const cz = this.minZ + (j + .5) * this.cell;
			let t = "grass";
			for (const z of def.zones) if ((cx - z.x) ** 2 + (cz - z.z) ** 2 <= z.r * z.r) t = z.type;
			const idx = j * this.cols + i;
			this.types[idx] = TYPE_INDEX[t];
			let b = WALK_BY_INDEX[TYPE_INDEX[t]] ? 0 : 1;
			for (const o of def.obstacles) if ((cx - o.x) ** 2 + (cz - o.z) ** 2 <= (o.r + this.cell * .35) ** 2) b = 1;
			this.blocked[idx] = b;
		}
	}
	inBounds(x, z) {
		return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ;
	}
	cellIndex(x, z) {
		let i = Math.floor((x - this.minX) / this.cell);
		let j = Math.floor((z - this.minZ) / this.cell);
		if (i < 0) i = 0;
		else if (i >= this.cols) i = this.cols - 1;
		if (j < 0) j = 0;
		else if (j >= this.rows) j = this.rows - 1;
		return j * this.cols + i;
	}
	/** 地面高度（雙線性內插） */
	heightAt(x, z) {
		const vc = this.cols + 1;
		let fx = (x - this.minX) / this.cell;
		let fz = (z - this.minZ) / this.cell;
		if (fx < 0) fx = 0;
		else if (fx > this.cols - 1e-6) fx = this.cols - 1e-6;
		if (fz < 0) fz = 0;
		else if (fz > this.rows - 1e-6) fz = this.rows - 1e-6;
		const i = fx | 0;
		const j = fz | 0;
		const u = fx - i;
		const v = fz - j;
		const h = this.heights;
		const h00 = h[j * vc + i];
		const h10 = h[j * vc + i + 1];
		const h01 = h[(j + 1) * vc + i];
		const h11 = h[(j + 1) * vc + i + 1];
		return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
	}
	typeAt(x, z) {
		return this.types[this.cellIndex(x, z)];
	}
	typeIdAt(x, z) {
		return TERRAIN_IDS[this.types[this.cellIndex(x, z)]];
	}
	isBlocked(x, z) {
		if (!this.inBounds(x, z)) return true;
		return this.blocked[this.cellIndex(x, z)] === 1;
	}
	/** 該位置的地形速度倍率（對所有單位的基礎效果，docs/03 第 2 節） */
	speedAt(x, z) {
		return SPEED_BY_INDEX[this.types[this.cellIndex(x, z)]];
	}
	/**
	* 從 (x0,z0) 走到 (x1,z1) 的坡度倍率（docs/03 第 4 節）：上坡 ×0.85、下坡 ×1.1、其餘 ×1。
	*/
	/**
	* 從 (x0,z0) 走到 (x1,z1) 被擋住嗎（地面上的單位用）：目標格是擋路格、或沿路往上的坡度超過牆的角度。
	* 往下走（下坡）不會被擋。玩家與人類共用這條規則（玩家在空中另有規則，見 Run.movePlayer）。
	*/
	stepBlocked(x0, z0, x1, z1) {
		if (this.isBlocked(x1, z1)) return true;
		const dist = Math.hypot(x1 - x0, z1 - z0);
		if (dist < 1e-6) return false;
		return (this.heightAt(x1, z1) - this.heightAt(x0, z0)) / dist > WALL_TAN;
	}
	/** 沿線段（取樣間隔 0.5 公尺）的最大上坡坡度（高度變化率，往 (x1,z1) 方向）；流場預先算邊用 */
	maxRiseAlong(x0, z0, x1, z1) {
		const dist = Math.hypot(x1 - x0, z1 - z0);
		const n = Math.max(1, Math.ceil(dist / .5));
		let worst = -Infinity;
		let px = x0;
		let pz = z0;
		let ph = this.heightAt(x0, z0);
		for (let k = 1; k <= n; k++) {
			const x = x0 + (x1 - x0) * k / n;
			const z = z0 + (z1 - z0) * k / n;
			const h = this.heightAt(x, z);
			worst = Math.max(worst, (h - ph) / Math.hypot(x - px, z - pz), (ph - h) / Math.hypot(x - px, z - pz));
			px = x;
			pz = z;
			ph = h;
		}
		return worst;
	}
	slopeMult(x0, z0, x1, z1) {
		const dist = Math.hypot(x1 - x0, z1 - z0);
		if (dist < 1e-6) return 1;
		const rise = (this.heightAt(x1, z1) - this.heightAt(x0, z0)) / dist;
		if (rise > SLOPE.threshold) return SLOPE.uphill;
		if (rise < -SLOPE.threshold) return SLOPE.downhill;
		return 1;
	}
};
// src/systems/flowField.ts
/**
* 流場尋路（docs/06 第 6 節，T7、T8）：以玩家所在的格為起點，在「粗格子」（預設 2 公尺）上做一次 Dijkstra（8 方向），
* 得到每格到玩家的通行距離；敵人只查自己所在的格（O(1)）往距離更小的鄰格走。
* - 粗格擋路：裡面任何一個細格是擋路格（深水、障礙）。
* - 邊可不可走：預先沿著兩格中心連線取樣，最大坡度超過牆（35°）的邊不能走（懸崖）。往上往下都算：人類不會跳下懸崖。
* - 玩家站在上不去的台地時，整個區域不連通：`isolated` = true，呼叫端要讓敵人直線朝玩家擠（在懸崖底聚集）、生成不看連通。
* 預先配置，重算不 new。
*/
var DIAG = Math.SQRT2;
var NEIGH_DX = new Int8Array([
	1,
	-1,
	0,
	0,
	1,
	1,
	-1,
	-1
]);
var NEIGH_DZ = new Int8Array([
	0,
	0,
	1,
	-1,
	1,
	-1,
	1,
	-1
]);
/** 玩家可到的區域小於全部可走區域的這個比例，就視為被困在孤島（台地）上 */
var ISOLATED_RATIO = .5;
var FlowField = class {
	map;
	cell;
	cols;
	rows;
	dist;
	blocked;
	/** 每格 8 個方向的邊是否能走（索引 = cell × 8 + k） */
	edgeOk;
	cost;
	heap;
	heapSize = 0;
	lastCell = -1;
	targetCell = -1;
	/** 這次重算有幾格走得到玩家 */
	reachableCount = 0;
	/** 全部可走的粗格數 */
	walkableCount;
	constructor(map, cell = 2) {
		this.map = map;
		this.cell = cell;
		this.cols = Math.ceil((map.maxX - map.minX) / cell);
		this.rows = Math.ceil((map.maxZ - map.minZ) / cell);
		const n = this.cols * this.rows;
		this.dist = new Float32Array(n).fill(Infinity);
		this.blocked = new Uint8Array(n);
		this.cost = new Float32Array(n);
		this.edgeOk = new Uint8Array(n * 8);
		this.walkableCount = 0;
		this.heap = new Int32Array(n * 8);
		const step = map.cell;
		for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
			const c = j * this.cols + i;
			const x0 = map.minX + i * cell;
			const z0 = map.minZ + j * cell;
			let b = 0;
			for (let z = z0 + step / 2; z < z0 + cell; z += step) for (let x = x0 + step / 2; x < x0 + cell; x += step) if (map.isBlocked(x, z)) b = 1;
			this.blocked[c] = b;
			if (!b) this.walkableCount++;
			this.cost[c] = TERRAIN[TERRAIN_IDS[map.typeAt(x0 + cell / 2, z0 + cell / 2)]].cost;
		}
		for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
			const c = j * this.cols + i;
			if (this.blocked[c]) continue;
			const cx = map.minX + (i + .5) * cell;
			const cz = map.minZ + (j + .5) * cell;
			for (let k = 0; k < 8; k++) {
				const ni = i + NEIGH_DX[k];
				const nj = j + NEIGH_DZ[k];
				if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
				const nc = nj * this.cols + ni;
				if (this.blocked[nc]) continue;
				if (k >= 4 && (this.blocked[j * this.cols + ni] || this.blocked[nj * this.cols + i])) continue;
				const tx = map.minX + (ni + .5) * cell;
				const tz = map.minZ + (nj + .5) * cell;
				if (map.maxRiseAlong(cx, cz, tx, tz) <= WALL_TAN) this.edgeOk[c * 8 + k] = 1;
			}
		}
	}
	cellIndex(x, z) {
		let i = Math.floor((x - this.map.minX) / this.cell);
		let j = Math.floor((z - this.map.minZ) / this.cell);
		if (i < 0) i = 0;
		else if (i >= this.cols) i = this.cols - 1;
		if (j < 0) j = 0;
		else if (j >= this.rows) j = this.rows - 1;
		return j * this.cols + i;
	}
	/** 玩家換格才重算（呼叫端可每步呼叫）。force = true 一定重算。回傳是否重算了 */
	update(targetX, targetZ, force = false) {
		const c = this.cellIndex(targetX, targetZ);
		if (!force && c === this.lastCell) return false;
		this.lastCell = c;
		this.targetCell = c;
		this.build(c);
		return true;
	}
	get isolated() {
		return this.reachableCount < this.walkableCount * ISOLATED_RATIO;
	}
	less(a, b) {
		return this.dist[this.heap[a]] < this.dist[this.heap[b]];
	}
	push(cell) {
		let i = this.heapSize++;
		this.heap[i] = cell;
		while (i > 0) {
			const p = i - 1 >> 1;
			if (!this.less(i, p)) break;
			const t = this.heap[i];
			this.heap[i] = this.heap[p];
			this.heap[p] = t;
			i = p;
		}
	}
	pop() {
		const top = this.heap[0];
		this.heap[0] = this.heap[--this.heapSize];
		let i = 0;
		for (;;) {
			const l = 2 * i + 1;
			const r = l + 1;
			let m = i;
			if (l < this.heapSize && this.less(l, m)) m = l;
			if (r < this.heapSize && this.less(r, m)) m = r;
			if (m === i) break;
			const t = this.heap[i];
			this.heap[i] = this.heap[m];
			this.heap[m] = t;
			i = m;
		}
		return top;
	}
	build(start) {
		const { cols, rows } = this;
		const dist = this.dist;
		dist.fill(Infinity);
		this.heapSize = 0;
		this.reachableCount = 0;
		dist[start] = 0;
		this.push(start);
		while (this.heapSize > 0) {
			const c = this.pop();
			const d0 = dist[c];
			this.reachableCount++;
			const ci = c % cols;
			const cj = c / cols | 0;
			for (let k = 0; k < 8; k++) {
				if (!this.edgeOk[c * 8 + k]) continue;
				const ni = ci + NEIGH_DX[k];
				const nj = cj + NEIGH_DZ[k];
				if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
				const n = nj * cols + ni;
				const nd = d0 + (k >= 4 ? DIAG : 1) * this.cost[n];
				if (nd < dist[n]) {
					dist[n] = nd;
					if (this.heapSize < this.heap.length) this.push(n);
				}
			}
		}
	}
	/** 該位置走得到玩家嗎（距離有限） */
	reachable(x, z) {
		return this.dist[this.cellIndex(x, z)] < Infinity;
	}
	/**
	* 從 (x,z) 往哪走：寫入 out[0]、out[1]（單位向量，世界 X／Z）。
	* 走不到玩家（被懸崖隔開）回傳 false，out 為 0；呼叫端改成直線朝玩家擠。
	*/
	dirAt(x, z, out) {
		const { cols } = this;
		const c = this.cellIndex(x, z);
		const ci = c % cols;
		const cj = c / cols | 0;
		let best = this.dist[c];
		if (best === Infinity) {
			out[0] = 0;
			out[1] = 0;
			return false;
		}
		let bx = 0;
		let bz = 0;
		for (let k = 0; k < 8; k++) {
			if (!this.edgeOk[c * 8 + k]) continue;
			const d = this.dist[(cj + NEIGH_DZ[k]) * cols + ci + NEIGH_DX[k]];
			if (d < best) {
				best = d;
				bx = NEIGH_DX[k];
				bz = NEIGH_DZ[k];
			}
		}
		const len = Math.hypot(bx, bz);
		if (len === 0) {
			out[0] = 0;
			out[1] = 0;
			return true;
		}
		out[0] = bx / len;
		out[1] = bz / len;
		return true;
	}
};
// src/data/enemies.ts
var ENEMIES = {
	villager: {
		id: "villager",
		points: 1,
		hp: 10,
		speed: 2,
		contact: 5,
		radius: .4
	},
	/** 退魔僧（頭目佔位，docs/04 第 3.2 節）：M1.5 用放大的村人造型；HP 是 M1.5 手感佔位（docs/04 寫 6000，M1.5 玩家火力還不夠），依試玩調 */
	taimasou: {
		id: "taimasou",
		points: 30,
		hp: 2500,
		speed: 1.4,
		contact: 20,
		radius: 1
	}
};
var ENEMY_IDS = Object.keys(ENEMIES);
// src/lib/spatialHash.ts
/**
* 空間雜湊（docs/06 第 6 節）：格子計數排序，每步重建一次（O(n)），查詢不配置記憶體。
* 用法：rebuild(xs, zs, n) → queryInto(x, z, r, out) 回傳命中的索引數。
*/
var SpatialHash = class {
	minX;
	minZ;
	cols;
	rows;
	cellStart;
	sorted;
	cellOf;
	fill;
	inv;
	constructor(minX, minZ, width, depth, cell, capacity) {
		this.minX = minX;
		this.minZ = minZ;
		this.inv = 1 / cell;
		this.cols = Math.ceil(width / cell) + 1;
		this.rows = Math.ceil(depth / cell) + 1;
		this.cellStart = new Int32Array(this.cols * this.rows + 1);
		this.sorted = new Int32Array(capacity);
		this.cellOf = new Int32Array(capacity);
		this.fill = new Int32Array(this.cols * this.rows + 1);
	}
	cellIndex(x, z) {
		let i = (x - this.minX) * this.inv | 0;
		let j = (z - this.minZ) * this.inv | 0;
		if (i < 0) i = 0;
		else if (i >= this.cols) i = this.cols - 1;
		if (j < 0) j = 0;
		else if (j >= this.rows) j = this.rows - 1;
		return j * this.cols + i;
	}
	/** alive[i] = 1 的才放進去 */
	rebuild(xs, zs, alive, n) {
		const cs = this.cellStart;
		cs.fill(0);
		for (let i = 0; i < n; i++) {
			if (!alive[i]) {
				this.cellOf[i] = -1;
				continue;
			}
			const c = this.cellIndex(xs[i], zs[i]);
			this.cellOf[i] = c;
			cs[c + 1]++;
		}
		for (let c = 0; c < cs.length - 1; c++) cs[c + 1] += cs[c];
		const fill = this.fill;
		fill.set(cs);
		for (let i = 0; i < n; i++) {
			const c = this.cellOf[i];
			if (c < 0) continue;
			this.sorted[fill[c]++] = i;
		}
	}
	/** 找出離 (x,z) 距離 ≤ r 的索引，寫進 out，回傳數量（超過 out 長度就截斷） */
	queryInto(x, z, r, xs, zs, out) {
		const i0 = Math.max(0, (x - r - this.minX) * this.inv | 0);
		const i1 = Math.min(this.cols - 1, (x + r - this.minX) * this.inv | 0);
		const j0 = Math.max(0, (z - r - this.minZ) * this.inv | 0);
		const j1 = Math.min(this.rows - 1, (z + r - this.minZ) * this.inv | 0);
		const r2 = r * r;
		let n = 0;
		const max = out.length;
		for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
			const c = j * this.cols + i;
			for (let k = this.cellStart[c], e = this.cellStart[c + 1]; k < e; k++) {
				const id = this.sorted[k];
				const dx = xs[id] - x;
				const dz = zs[id] - z;
				if (dx * dx + dz * dz <= r2) {
					if (n >= max) return n;
					out[n++] = id;
				}
			}
		}
		return n;
	}
};
// src/systems/enemies.ts
var KIND_HP = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].hp));
var KIND_SPEED = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].speed));
var KIND_CONTACT = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].contact));
var KIND_RADIUS = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].radius));
var KIND_POINTS = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].points));
var kindIndex = (id) => {
	const i = ENEMY_IDS.indexOf(id);
	if (i < 0) throw new Error(`沒有這種人類：${id}`);
	return i;
};
/**
* 敵人池（SoA 型別陣列，熱路徑不配置記憶體）。索引在整局不變；死掉的格子進 free 堆疊重用。
* 渲染層每幀走 0..high，只畫 alive[i] = 1 的。
*/
var Enemies = class {
	map;
	capacity;
	x;
	z;
	/** 擊退速度 */
	kx;
	kz;
	hp;
	maxHp;
	damage;
	speed;
	flash;
	contactCd;
	yaw;
	phase;
	kind;
	/** 0 一般、1 精英、2 頭目 */
	variant;
	/** 渲染體型倍率 */
	scale;
	/** 擊殺掉的魂火倍率後的點數 */
	pointsLeft;
	alive;
	/** 用過的最大索引 + 1（渲染與迴圈的上界） */
	high = 0;
	aliveCount = 0;
	free;
	freeTop = 0;
	hash;
	dir = /* @__PURE__ */ new Float32Array(2);
	near = new Int32Array(COMBAT.queryMax);
	constructor(map, capacity) {
		this.map = map;
		this.capacity = capacity;
		const f = () => new Float32Array(capacity);
		this.x = f();
		this.z = f();
		this.kx = f();
		this.kz = f();
		this.hp = f();
		this.maxHp = f();
		this.damage = f();
		this.speed = f();
		this.flash = f();
		this.contactCd = f();
		this.yaw = f();
		this.phase = f();
		this.kind = new Uint8Array(capacity);
		this.variant = new Uint8Array(capacity);
		this.scale = new Float32Array(capacity).fill(1);
		this.pointsLeft = new Float32Array(capacity);
		this.alive = new Uint8Array(capacity);
		this.free = new Int32Array(capacity);
		this.hash = new SpatialHash(map.minX, map.minZ, map.maxX - map.minX, map.maxZ - map.minZ, COMBAT.hashCell, capacity);
	}
	reset() {
		this.alive.fill(0);
		this.high = 0;
		this.aliveCount = 0;
		this.freeTop = 0;
	}
	radius(i) {
		return KIND_RADIUS[this.kind[i]] * (this.scale[i] > 1.2 && this.variant[i] === 1 ? 1.2 : 1);
	}
	points(i) {
		return this.pointsLeft[i];
	}
	/**
	* 生一隻；滿了回傳 -1。virtualWave = 虛擬波數（docs/02 第 8.1 節）；variant 0 一般／1 精英／2 頭目；stageMult = 第 k 關的 HP 倍率。
	* 頭目不吃「虛擬波數」的 HP 加成（它的 HP 是固定的佔位值）。
	*/
	spawn(kind, x, z, virtualWave, night, phase, variant = 0, stageMult = 1) {
		let i;
		if (this.freeTop > 0) i = this.free[--this.freeTop];
		else if (this.high < this.capacity) i = this.high++;
		else return -1;
		this.alive[i] = 1;
		this.kind[i] = kind;
		this.x[i] = x;
		this.z[i] = z;
		this.kx[i] = 0;
		this.kz[i] = 0;
		const elite = variant === 1;
		const boss = variant === 2;
		const hp = KIND_HP[kind] * (boss ? 1 : enemyHpMult(virtualWave, night)) * stageMult * tuning.hpScale * (elite ? STAGE.elite.hp : 1);
		this.hp[i] = hp;
		this.maxHp[i] = hp;
		this.damage[i] = KIND_CONTACT[kind] * (boss ? 1 : enemyDamageMult(virtualWave)) * (elite ? STAGE.elite.damage : 1);
		this.variant[i] = variant;
		this.scale[i] = boss ? 2.4 : elite ? STAGE.elite.scale : 1;
		this.pointsLeft[i] = KIND_POINTS[kind] * (elite ? STAGE.elite.orbMult : 1);
		this.speed[i] = KIND_SPEED[kind] * enemySpeedMult(night);
		this.flash[i] = 0;
		this.contactCd[i] = 0;
		this.yaw[i] = 0;
		this.phase[i] = phase;
		this.aliveCount++;
		return i;
	}
	/** 場上滿了：擠掉離 (px,pz) 最遠的一隻「一般」敵人（不動精英與頭目），回傳是否擠掉了 */
	evictFarthest(px, pz) {
		let best = -1;
		let bd = -1;
		for (let i = 0; i < this.high; i++) {
			if (!this.alive[i] || this.variant[i] !== 0) continue;
			const d = (this.x[i] - px) ** 2 + (this.z[i] - pz) ** 2;
			if (d > bd) {
				bd = d;
				best = i;
			}
		}
		if (best < 0) return false;
		this.kill(best);
		return true;
	}
	kill(i) {
		if (!this.alive[i]) return;
		this.alive[i] = 0;
		this.free[this.freeTop++] = i;
		this.aliveCount--;
	}
	/** 對一隻造成傷害並擊退；回傳是否死亡 */
	hurt(i, dmg, dirX, dirZ, knock) {
		this.hp[i] -= dmg;
		this.flash[i] = COMBAT.hitFlash;
		this.kx[i] += dirX * knock;
		this.kz[i] += dirZ * knock;
		return this.hp[i] <= 0;
	}
	/**
	* 每個模擬步：往玩家走（流場）、被光圈減速、擊退衰減、軟推擠、碰撞阻擋。
	* auraRadius／auraSlow：提燈小僧的「燈火」；px、pz：玩家位置。
	*/
	/** 敵人移動速度倍率（詛咒；每步由 Run 設） */
	speedMult = 1;
	update(dt, px, pz, flow, auraRadius, auraSlow) {
		const map = this.map;
		const decay = Math.pow(COMBAT.knockbackDecay, dt);
		const soft = this.aliveCount >= COMBAT.softPushMin;
		const dir = this.dir;
		const auraR2 = auraRadius * auraRadius;
		for (let i = 0; i < this.high; i++) {
			if (!this.alive[i]) continue;
			const ex = this.x[i];
			const ez = this.z[i];
			const dx = px - ex;
			const dz = pz - ez;
			const d2 = dx * dx + dz * dz;
			let mx;
			let mz;
			if (d2 < 9 || !flow.dirAt(ex, ez, dir)) {
				const inv = 1 / (Math.sqrt(d2) + 1e-6);
				mx = dx * inv;
				mz = dz * inv;
			} else {
				mx = dir[0];
				mz = dir[1];
			}
			let spd = this.speed[i] * this.speedMult * map.speedAt(ex, ez);
			if (d2 < auraR2) spd *= 1 - auraSlow;
			let vx = mx * spd + this.kx[i];
			let vz = mz * spd + this.kz[i];
			this.kx[i] *= decay;
			this.kz[i] *= decay;
			if (soft) {
				const n = this.hash.queryInto(ex, ez, .8, this.x, this.z, this.near);
				let sx = 0;
				let sz = 0;
				for (let k = 0; k < n; k++) {
					const j = this.near[k];
					if (j === i) continue;
					const ox = ex - this.x[j];
					const oz = ez - this.z[j];
					const od = ox * ox + oz * oz + 1e-4;
					sx += ox / od;
					sz += oz / od;
				}
				vx += sx * COMBAT.softPushStrength * .1;
				vz += sz * COMBAT.softPushStrength * .1;
			}
			let nx = ex + vx * dt;
			let nz = ez + vz * dt;
			if (map.stepBlocked(ex, ez, nx, nz)) {
				if (!map.stepBlocked(ex, ez, nx, ez)) nz = ez;
				else if (!map.stepBlocked(ex, ez, ex, nz)) nx = ex;
				else {
					nx = ex;
					nz = ez;
				}
			}
			this.x[i] = nx;
			this.z[i] = nz;
			if (mx !== 0 || mz !== 0) this.yaw[i] = Math.atan2(mx, mz);
			if (this.flash[i] > 0) this.flash[i] -= dt;
			if (this.contactCd[i] > 0) this.contactCd[i] -= dt;
		}
		this.hash.rebuild(this.x, this.z, this.alive, this.high);
	}
	/** 最近的敵人（在 range 內）；沒有回傳 -1 */
	nearest(x, z, range) {
		const n = this.hash.queryInto(x, z, range, this.x, this.z, this.near);
		let best = -1;
		let bd = Infinity;
		for (let k = 0; k < n; k++) {
			const j = this.near[k];
			const dx = this.x[j] - x;
			const dz = this.z[j] - z;
			const d = dx * dx + dz * dz;
			if (d < bd) {
				bd = d;
				best = j;
			}
		}
		return best;
	}
	/** 範圍內所有敵人寫進 out，回傳數量（呼叫端提供緩衝） */
	within(x, z, r, out) {
		return this.hash.queryInto(x, z, r, this.x, this.z, out);
	}
};
// src/systems/projectiles.ts
/** 投射物池（鬼火）：追蹤最近的敵人，命中時回呼。熱路徑不配置記憶體。 */
var Projectiles = class {
	capacity;
	x;
	z;
	vx;
	vz;
	life;
	damage;
	crit;
	pierceLeft;
	target;
	lastHit;
	alive;
	high = 0;
	aliveCount = 0;
	near = new Int32Array(COMBAT.queryMax);
	constructor(capacity) {
		this.capacity = capacity;
		this.x = new Float32Array(capacity);
		this.z = new Float32Array(capacity);
		this.vx = new Float32Array(capacity);
		this.vz = new Float32Array(capacity);
		this.life = new Float32Array(capacity);
		this.damage = new Float32Array(capacity);
		this.crit = new Uint8Array(capacity);
		this.pierceLeft = new Int8Array(capacity);
		this.target = new Int32Array(capacity);
		this.lastHit = new Int32Array(capacity);
		this.alive = new Uint8Array(capacity);
	}
	reset() {
		this.alive.fill(0);
		this.high = 0;
		this.aliveCount = 0;
	}
	spawn(x, z, dirX, dirZ, w, damage, crit, target, pierceBonus = 0) {
		let i = -1;
		for (let k = 0; k < this.high; k++) if (!this.alive[k]) {
			i = k;
			break;
		}
		if (i < 0) {
			if (this.high >= this.capacity) return -1;
			i = this.high++;
		}
		this.alive[i] = 1;
		this.x[i] = x;
		this.z[i] = z;
		this.vx[i] = dirX * w.projectileSpeed;
		this.vz[i] = dirZ * w.projectileSpeed;
		this.life[i] = w.lifetime;
		this.damage[i] = damage;
		this.crit[i] = crit ? 1 : 0;
		this.pierceLeft[i] = w.pierce + pierceBonus;
		this.target[i] = target;
		this.lastHit[i] = -1;
		this.aliveCount++;
		return i;
	}
	kill(i) {
		if (!this.alive[i]) return;
		this.alive[i] = 0;
		this.aliveCount--;
	}
	/**
	* 前進一步：轉向目標、移動、命中判定。onHit(敵人索引, 投射物索引) 由呼叫端結算傷害與擊殺；
	* 回呼是固定的方法參照（不在迴圈裡建函式）。
	*/
	update(dt, w, enemies, rangeMult, onHit) {
		const speed2 = w.projectileSpeed;
		for (let i = 0; i < this.high; i++) {
			if (!this.alive[i]) continue;
			this.life[i] -= dt;
			if (this.life[i] <= 0) {
				this.kill(i);
				continue;
			}
			let t = this.target[i];
			if (t < 0 || !enemies.alive[t]) {
				t = enemies.nearest(this.x[i], this.z[i], w.range * rangeMult);
				this.target[i] = t;
			}
			if (t >= 0) {
				const dx = enemies.x[t] - this.x[i];
				const dz = enemies.z[t] - this.z[i];
				const want = Math.atan2(dz, dx);
				const cur = Math.atan2(this.vz[i], this.vx[i]);
				let diff = want - cur;
				while (diff > Math.PI) diff -= 2 * Math.PI;
				while (diff < -Math.PI) diff += 2 * Math.PI;
				const maxTurn = w.turnRate * dt;
				const a = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
				this.vx[i] = Math.cos(a) * speed2;
				this.vz[i] = Math.sin(a) * speed2;
			}
			this.x[i] += this.vx[i] * dt;
			this.z[i] += this.vz[i] * dt;
			const n = enemies.within(this.x[i], this.z[i], w.hitRadius + .5, this.near);
			for (let k = 0; k < n; k++) {
				const e = this.near[k];
				if (e === this.lastHit[i] || !enemies.alive[e]) continue;
				const dx = enemies.x[e] - this.x[i];
				const dz = enemies.z[e] - this.z[i];
				const r = w.hitRadius + enemies.radius(e);
				if (dx * dx + dz * dz > r * r) continue;
				onHit(e, i);
				this.lastHit[i] = e;
				if (this.pierceLeft[i] <= 0) {
					this.kill(i);
					break;
				}
				this.pierceLeft[i]--;
			}
		}
	}
};
// src/systems/orbs.ts
/** 魂火（經驗）池：被拾取範圍吸住後飛向玩家；波次結束時全部吸過來。 */
var Orbs = class {
	capacity;
	x;
	z;
	value;
	pulled;
	alive;
	speed;
	high = 0;
	aliveCount = 0;
	freeTop = 0;
	free;
	/** 波次結束的全吸模式 */
	sweeping = false;
	constructor(capacity) {
		this.capacity = capacity;
		this.x = new Float32Array(capacity);
		this.z = new Float32Array(capacity);
		this.value = new Float32Array(capacity);
		this.pulled = new Uint8Array(capacity);
		this.alive = new Uint8Array(capacity);
		this.speed = new Float32Array(capacity);
		this.free = new Int32Array(capacity);
	}
	reset() {
		this.alive.fill(0);
		this.high = 0;
		this.aliveCount = 0;
		this.freeTop = 0;
		this.sweeping = false;
	}
	/** 生一顆；滿了回傳 false（呼叫端直接把價值加進經驗） */
	spawn(x, z, value) {
		let i;
		if (this.freeTop > 0) i = this.free[--this.freeTop];
		else if (this.high < this.capacity) i = this.high++;
		else return false;
		this.alive[i] = 1;
		this.x[i] = x;
		this.z[i] = z;
		this.value[i] = value;
		this.pulled[i] = 0;
		this.speed[i] = 0;
		this.aliveCount++;
		return true;
	}
	/** 前進一步；回傳這一步被拾取的總價值 */
	update(dt, px, pz, pickupRadius) {
		let gained = 0;
		const r2 = pickupRadius * pickupRadius;
		for (let i = 0; i < this.high; i++) {
			if (!this.alive[i]) continue;
			const dx = px - this.x[i];
			const dz = pz - this.z[i];
			const d2 = dx * dx + dz * dz;
			if (!this.pulled[i] && (this.sweeping || d2 <= r2)) {
				this.pulled[i] = 1;
				this.speed[i] = this.sweeping ? PROGRESSION.orbSweepSpeed : PROGRESSION.orbMagnetSpeed * .5;
			}
			if (!this.pulled[i]) continue;
			const target = this.sweeping ? PROGRESSION.orbSweepSpeed : PROGRESSION.orbMagnetSpeed;
			this.speed[i] += (target - this.speed[i]) * Math.min(1, dt * 8);
			const d = Math.sqrt(d2);
			const step = this.speed[i] * dt;
			if (d <= step + .3) {
				gained += this.value[i];
				this.alive[i] = 0;
				this.free[this.freeTop++] = i;
				this.aliveCount--;
				continue;
			}
			this.x[i] += dx / d * step;
			this.z[i] += dz / d * step;
		}
		return gained;
	}
};
// src/systems/hitFeed.ts
/**
* 命中回報（給傷害數字、音效用）：環狀緩衝，模擬端 push、渲染端用自己的 tail 讀。
* 不配置記憶體；寫太快時舊的被蓋掉（只是少幾個數字，不影響模擬）。
*/
var HitFeed = class {
	cap;
	x;
	z;
	dmg;
	crit;
	/** 累計寫入數（單調遞增） */
	head = 0;
	constructor(cap = 256) {
		this.cap = cap;
		this.x = new Float32Array(cap);
		this.z = new Float32Array(cap);
		this.dmg = new Float32Array(cap);
		this.crit = new Uint8Array(cap);
	}
	push(x, z, dmg, crit) {
		const i = this.head % this.cap;
		this.x[i] = x;
		this.z[i] = z;
		this.dmg[i] = dmg;
		this.crit[i] = crit ? 1 : 0;
		this.head++;
	}
};
// src/data/stats.ts
/** 玩家屬性定義（docs/02 第 2、3 節）。最終值 = (基礎 + Σ加算) × (1 + Σ百分比)，再夾在上下限。 */
var STAT_IDS = [
	"maxHp",
	"regen",
	"power",
	"atkSpeed",
	"area",
	"crit",
	"critDmg",
	"speed",
	"armor",
	"dodge",
	"pickup",
	"luck",
	"merit"
];
var STAT_LIMITS = {
	maxHp: {
		min: .4,
		max: 4,
		rel: true
	},
	regen: {
		min: 0,
		max: 8
	},
	power: {
		min: .4,
		max: 6
	},
	atkSpeed: {
		min: .5,
		max: 4
	},
	area: {
		min: .5,
		max: 3
	},
	crit: {
		min: 0,
		max: 1
	},
	critDmg: {
		min: 1.5,
		max: 5
	},
	speed: {
		min: .55,
		max: 1.8,
		rel: true
	},
	armor: {
		min: -12,
		max: 45
	},
	dodge: {
		min: 0,
		max: .6
	},
	pickup: {
		min: 1,
		max: 8
	},
	luck: {
		min: -50,
		max: 300
	},
	merit: {
		min: 0,
		max: 1
	}
};
/** 共通基礎值（領頭妖怪各自的覆寫在 yokai.ts） */
var STAT_BASE = {
	maxHp: 100,
	regen: .5,
	power: 1,
	atkSpeed: 1,
	area: 1,
	crit: .05,
	critDmg: 1.5,
	speed: 4,
	armor: 0,
	dodge: 0,
	pickup: 2,
	luck: 0,
	merit: 0
};
/**
* 屬性卡的數值（docs/02 第 5.1 節，單位是卡片上寫的數字）怎麼加進屬性：
* target = flat（加進基礎）或 pct（加進百分比）；scale 把卡片數字換成內部單位。
*/
var CARD_EFFECT = {
	maxHp: {
		target: "flat",
		scale: 1
	},
	regen: {
		target: "flat",
		scale: 1
	},
	power: {
		target: "pct",
		scale: .01
	},
	atkSpeed: {
		target: "pct",
		scale: .01
	},
	area: {
		target: "pct",
		scale: .01
	},
	crit: {
		target: "flat",
		scale: .01
	},
	critDmg: {
		target: "flat",
		scale: .01
	},
	speed: {
		target: "pct",
		scale: .01
	},
	armor: {
		target: "flat",
		scale: 1
	},
	dodge: {
		target: "flat",
		scale: .01
	},
	pickup: {
		target: "pct",
		scale: .01
	},
	luck: {
		target: "flat",
		scale: 1
	},
	merit: {
		target: "flat",
		scale: .01
	}
};
/** 減傷（docs/02 第 3 節）：護甲 A≥0 倍率 = 1 − A/(A+15)，最低 0.25；A<0 倍率 = 1 + |A|/15，最高 1.8 */
var ARMOR = {
	k: 15,
	minMult: .25,
	maxMult: 1.8
};
// src/systems/stats.ts
/**
* 玩家屬性（docs/02 第 2、3 節）：基礎值、加算來源（卡片、之後的修行／遺物／要素），
* 最終值 = (基礎 + Σflat) × (1 + Σpct)，再夾在上下限。來源改動時才重算（recompute），每幀只讀 value。
*/
var Stats = class {
	base;
	flat;
	pct;
	/** 具名的加成來源（地圖要素：祭壇、結界石、石地藏護甲…）：可以整組換掉或移除，不會有浮點累積誤差 */
	mods = /* @__PURE__ */ new Map();
	/** 最終值（唯讀使用） */
	value;
	constructor(baseOverride = {}) {
		this.base = {
			...STAT_BASE,
			...baseOverride
		};
		this.flat = Object.fromEntries(STAT_IDS.map((s) => [s, 0]));
		this.pct = { ...this.flat };
		this.value = { ...this.base };
		this.recompute();
	}
	/** 加一張屬性卡（value = 卡片上寫的數字） */
	addCard(stat, cardValue) {
		const e = CARD_EFFECT[stat];
		if (e.target === "flat") this.flat[stat] += cardValue * e.scale;
		else this.pct[stat] += cardValue * e.scale;
		this.recompute();
	}
	addFlat(stat, v) {
		this.flat[stat] += v;
		this.recompute();
	}
	addPct(stat, v) {
		this.pct[stat] += v;
		this.recompute();
	}
	/** 設定（或換掉）一個具名來源；flat 加進基礎、pct 加進百分比 */
	setMod(key, mod) {
		this.mods.set(key, mod);
		this.recompute();
	}
	clearMod(key) {
		const had = this.mods.delete(key);
		if (had) this.recompute();
		return had;
	}
	hasMod(key) {
		return this.mods.has(key);
	}
	recompute() {
		for (const s of STAT_IDS) {
			const lim = STAT_LIMITS[s];
			let f = this.flat[s];
			let p = this.pct[s];
			for (const m of this.mods.values()) {
				f += m.flat?.[s] ?? 0;
				p += m.pct?.[s] ?? 0;
			}
			const raw = (this.base[s] + f) * (1 + p);
			const lo = lim.rel ? this.base[s] * lim.min : lim.min;
			const hi = lim.rel ? this.base[s] * lim.max : lim.max;
			this.value[s] = Math.min(hi, Math.max(lo, raw));
		}
	}
	baseOf(stat) {
		return this.base[stat];
	}
};
/** 護甲換算成「承受傷害倍率」（docs/02 第 3 節） */
function armorMult(armor) {
	if (armor >= 0) return Math.max(ARMOR.minMult, 1 - armor / (armor + ARMOR.k));
	return Math.min(ARMOR.maxMult, 1 + Math.abs(armor) / ARMOR.k);
}
// src/data/rarity.ts
/** 稀有度（docs/02 第 4 節）：同一個效果的倍率 */
var RARITIES = [
	"common",
	"rare",
	"epic",
	"legend"
];
/** 升級卡片的稀有度權重（docs/02 第 4.1 節）；L = 玩家等級，luck = 幸運 */
function cardRarityWeights(L, luck, unlocked = ["common", "rare"]) {
	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const luckMul = 1 + luck / 100;
	const w = {
		common: 100,
		rare: Math.min(40, 12 + 1.2 * L) * luckMul,
		epic: clamp((L - 4) * 1, 0, 16) * luckMul,
		legend: clamp((L - 10) * .4, 0, 5) * luckMul
	};
	for (let i = RARITIES.length - 1; i > 0; i--) {
		const r = RARITIES[i];
		if (!unlocked.includes(r)) {
			w[RARITIES[i - 1]] += w[r];
			w[r] = 0;
		}
	}
	return w;
}
// src/data/statCards.ts
var STAT_CARDS = [
	{
		id: "hp",
		stat: "maxHp",
		starter: true,
		values: {
			common: 10,
			rare: 16,
			epic: 24,
			legend: 35
		}
	},
	{
		id: "power",
		stat: "power",
		starter: true,
		values: {
			common: 10,
			rare: 16,
			epic: 24,
			legend: 35
		}
	},
	{
		id: "atkSpeed",
		stat: "atkSpeed",
		starter: true,
		values: {
			common: 10,
			rare: 16,
			epic: 24,
			legend: 35
		}
	},
	{
		id: "area",
		stat: "area",
		starter: true,
		values: {
			common: 10,
			rare: 16,
			epic: 24,
			legend: 35
		}
	},
	{
		id: "speed",
		stat: "speed",
		starter: true,
		values: {
			common: 8,
			rare: 13,
			epic: 19,
			legend: 28
		}
	},
	{
		id: "crit",
		stat: "crit",
		starter: true,
		values: {
			common: 3,
			rare: 5,
			epic: 7,
			legend: 10
		}
	},
	{
		id: "critDmg",
		stat: "critDmg",
		starter: true,
		values: {
			common: 10,
			rare: 16,
			epic: 24,
			legend: 35
		}
	},
	{
		id: "armor",
		stat: "armor",
		starter: true,
		values: {
			common: 1,
			rare: 2,
			epic: 3,
			legend: 4
		}
	},
	{
		id: "regen",
		stat: "regen",
		starter: false,
		values: {
			common: .3,
			rare: .5,
			epic: .7,
			legend: 1
		}
	},
	{
		id: "pickup",
		stat: "pickup",
		starter: false,
		values: {
			common: 12,
			rare: 19,
			epic: 29,
			legend: 42
		}
	},
	{
		id: "dodge",
		stat: "dodge",
		starter: false,
		values: {
			common: 2,
			rare: 3,
			epic: 5,
			legend: 7
		}
	},
	{
		id: "luck",
		stat: "luck",
		starter: false,
		values: {
			common: 5,
			rare: 8,
			epic: 12,
			legend: 18
		}
	}
];
// src/data/weaponCards.ts
var WEAPON_CARDS = [
	(
	/** 鬼火增殖：每次多發射幾顆（小數 = 機率多一顆；總數上限見 WEAPON_LIMITS.volley）。數值依 2026-11-04 卡片價值探針調整 */
	{
		id: "volley",
		weapon: "volley",
		values: {
			common: .25,
			rare: .4,
			epic: .6,
			legend: .9
		}
	}),
	(
	/** 爆裂：命中時濺射半徑（公尺）增加 */
	{
		id: "splash",
		weapon: "splash",
		values: {
			common: .3,
			rare: .5,
			epic: .7,
			legend: 1
		}
	}),
	(
	/** 穿透：每顆鬼火多穿過幾隻敵人 */
	{
		id: "pierce",
		weapon: "pierce",
		values: {
			common: .3,
			rare: .5,
			epic: .8,
			legend: 1.2
		}
	})
];
var WEAPON_LIMITS = {
	volley: 7,
	splash: 4,
	pierce: 6
};
// src/systems/cards.ts
var BY_ID = new Map([...STAT_CARDS, ...WEAPON_CARDS].map((c) => [c.id, c]));
var cardById = (id) => {
	const c = BY_ID.get(id);
	if (!c) throw new Error(`沒有這張卡：${id}`);
	return c;
};
var isWeaponCard = (c) => "weapon" in c;
/** 依權重抽一個稀有度（單一次亂數） */
function pickRarity(rng, weights) {
	let total = 0;
	for (const r of RARITIES) total += weights[r];
	let t = rng.next() * total;
	for (const r of RARITIES) {
		t -= weights[r];
		if (t < 0) return r;
	}
	return "common";
}
/**
* 升級三選一的發牌（docs/02 第 4.1、5 節）。
* - 三張是不同的卡；稀有度每張獨立抽。
* - 保底：連續 PITY_LEVELUPS 次升級都沒出現「靈」以上，下一次第 1 張至少是靈。狀態在這個物件裡（每局一個）。
*/
var CardDealer = class {
	rng;
	pool;
	unlocked;
	/** 目前連續幾次升級沒有靈以上 */
	drought = 0;
	constructor(rng, pool, unlocked) {
		this.rng = rng;
		this.pool = pool;
		this.unlocked = unlocked;
	}
	/** 固定稀有度的三選一（賽錢箱、寶箱）：n 張不同的卡，全部是 rarity 階 */
	dealRarity(rarity, n = 3) {
		const ids = [...this.pool];
		const out = [];
		for (let k = 0; k < n && ids.length > 0; k++) out.push({
			cardId: ids.splice(Math.floor(this.rng.next() * ids.length), 1)[0],
			rarity
		});
		return out;
	}
	deal(level, luck, n = 3) {
		const weights = cardRarityWeights(level, luck, [...this.unlocked]);
		const ids = [...this.pool];
		const out = [];
		const guarantee = this.drought >= 5;
		for (let k = 0; k < n && ids.length > 0; k++) {
			const idx = Math.floor(this.rng.next() * ids.length);
			const cardId = ids.splice(idx, 1)[0];
			let rarity = pickRarity(this.rng, weights);
			if (k === 0 && guarantee && rarity === "common" && this.unlocked.length > 1) rarity = "rare";
			out.push({
				cardId,
				rarity
			});
		}
		this.drought = out.some((o) => o.rarity !== "common") ? 0 : this.drought + 1;
		return out;
	}
};
// src/systems/stageDirector.ts
/**
* 連續計時關卡的導演（D22，docs/02 第 8.1 節）：
* - 湧出速率隨時間升高（用虛擬波數沿用 T(n)），持續累積「待生成的威脅點數」再一隻隻生出來；
* - 定時事件：精英、小高潮（湧出速率加倍一段時間）、頭目；時間歸零而頭目還活著 → 最終蜂群；
* - 生成位置：離玩家 spawnRingMin～Max 公尺、不在擋路格、走得到玩家（玩家被困在孤島時不看連通）。
* 時間由 Run 餵進來（dt）；這裡不碰渲染與輸入。
*/
var StageDirector = class {
	rng;
	map;
	flow;
	enemies;
	maxEnemies;
	time = 0;
	active = false;
	/** 等著生成的點數 */
	pending = 0;
	/** 已觸發的事件數（STAGE.events 依序）與頭目是否已出現 */
	eventsFired = 0;
	bossSpawned = false;
	/** 外部的湧出倍率（結界圈內 ×1.25 等；每步由 Run 設） */
	extraMult = 1;
	/** 詛咒讓敵人 HP 變多的倍率（每步由 Run 設） */
	hpCurse = 1;
	/** 頭目 HP 倍率（大關最後一關加強，D26） */
	bossMult = 1;
	bossIndex = -1;
	/** 小高潮結束的時間（秒）；0 = 沒有進行中的 */
	surgeUntil = 0;
	surgeMult = 1;
	swarm = false;
	nextSwarmElite = 0;
	stageMult = 1;
	kindVillager = kindIndex("villager");
	kindBoss = kindIndex("taimasou");
	/** 待生成的精英數（因同畫面上限或找不到位置而延後） */
	pendingElites = 0;
	bossPending = false;
	spot = /* @__PURE__ */ new Float32Array(2);
	constructor(rng, map, flow, enemies, maxEnemies) {
		this.rng = rng;
		this.map = map;
		this.flow = flow;
		this.enemies = enemies;
		this.maxEnemies = maxEnemies;
	}
	start(stage, bossMult = 1) {
		this.stageMult = 1 + STAGE.hpPerStage * stage;
		this.bossMult = bossMult;
		this.time = 0;
		this.active = true;
		this.pending = 0;
		this.eventsFired = 0;
		this.bossSpawned = false;
		this.bossIndex = -1;
		this.bossPending = false;
		this.surgeUntil = 0;
		this.surgeMult = 1;
		this.swarm = false;
		this.pendingElites = 0;
		this.nextSwarmElite = 0;
	}
	get duration() {
		return tuning.stageSeconds;
	}
	/** 虛擬波數 n(t)：t = 0 → virtualStart，t = duration → virtualEnd（之後不再增加） */
	virtualWave(t = this.time) {
		const u = Math.min(1, Math.max(0, t / this.duration));
		return STAGE.virtualStart + (STAGE.virtualEnd - STAGE.virtualStart) * u;
	}
	/** 目前的湧出速率（威脅點數／秒） */
	rate(t = this.time) {
		let r = threat(this.virtualWave(t)) / STAGE.rateBaseSeconds * tuning.countScale;
		if (this.surgeUntil > t) r *= this.surgeMult;
		if (this.swarm) r *= STAGE.swarm.rateMult;
		r *= this.extraMult;
		return r;
	}
	findSpot(px, pz) {
		const m = this.map;
		for (let t = 0; t < WAVES.spawnTries; t++) {
			const a = this.rng.range(0, Math.PI * 2);
			const r = this.rng.range(STAGE.spawnRingMin, STAGE.spawnRingMax);
			const x = px + Math.cos(a) * r;
			const z = pz + Math.sin(a) * r;
			if (x < m.minX + 1 || x > m.maxX - 1 || z < m.minZ + 1 || z > m.maxZ - 1) continue;
			if (m.isBlocked(x, z)) continue;
			if (!this.flow.isolated && !this.flow.reachable(x, z)) continue;
			this.spot[0] = x;
			this.spot[1] = z;
			return true;
		}
		return false;
	}
	spawnOne(kind, variant, px, pz, night) {
		if (!this.findSpot(px, pz)) return -1;
		return this.enemies.spawn(kind, this.spot[0], this.spot[1], this.virtualWave(), night, this.rng.range(0, Math.PI * 2), variant, (variant === 2 ? this.stageMult * this.bossMult : this.stageMult) * this.hpCurse);
	}
	update(dt, px, pz, night, bossDefeated) {
		if (!this.active) return;
		this.time += dt;
		const dur = this.duration;
		while (this.eventsFired < STAGE.events.length && this.time >= STAGE.events[this.eventsFired].at * dur) {
			const ev = STAGE.events[this.eventsFired++];
			this.pendingElites += ev.count;
			if (ev.kind === "surge") {
				this.surgeUntil = this.time + (ev.surgeSeconds ?? 0);
				this.surgeMult = ev.surgeMult ?? 1;
			}
		}
		if (!this.bossSpawned && this.time >= STAGE.bossAt * dur) {
			this.bossSpawned = true;
			this.bossPending = true;
		}
		if (!this.swarm && this.time >= dur && !bossDefeated) {
			this.swarm = true;
			this.nextSwarmElite = this.time;
		}
		if (this.swarm && this.time >= this.nextSwarmElite) {
			this.pendingElites++;
			this.nextSwarmElite += STAGE.swarm.eliteEvery;
		}
		this.pending += this.rate() * dt;
		let n = 0;
		if (this.bossPending) {
			if (this.enemies.aliveCount >= this.enemies.capacity) this.enemies.evictFarthest(px, pz);
			const i = this.spawnOne(this.kindBoss, 2, px, pz, night);
			if (i >= 0) {
				this.bossPending = false;
				this.bossIndex = i;
			}
		}
		while (this.pendingElites > 0 && this.enemies.aliveCount < this.enemies.capacity && n < WAVES.spawnPerStepMax) {
			if (this.spawnOne(this.kindVillager, 1, px, pz, night) < 0) break;
			this.pendingElites--;
			n++;
		}
		while (this.pending >= 1 && n < WAVES.spawnPerStepMax && this.enemies.aliveCount < this.maxEnemies) {
			const i = this.spawnOne(this.kindVillager, 0, px, pz, night);
			if (i < 0) break;
			this.pending -= this.enemies.points(i);
			n++;
		}
		if (this.pending > 40) this.pending = 40;
	}
};
// src/data/altar.ts
/** 詛咒祭壇（docs/02 第 6.2 節①，D27 改版）：每次隨機抽出數個「不同」效果，其中至少一個是讓這一局變難的詛咒、至少一個是好處 */
/** 好處：百分比提升（pct）。數值 = 稀有度對應的相對提升 */
var ALTAR_BOON_PCT = {
	common: .2,
	rare: .32,
	epic: .48,
	legend: .72
};
var ALTAR_BOONS = [
	"power",
	"atkSpeed",
	"area",
	"speed",
	"maxHp",
	"critDmg",
	"pickup"
];
/** 詛咒（讓整局的敵人變強；整局有效、跨關保留）。數值是相對增加（0.1 = +10%） */
var ALTAR_CURSE_IDS = [
	"enemyHp",
	"enemySpeed",
	"enemyDamage",
	"spawnRate"
];
var ALTAR_CURSE = {
	common: {
		enemyHp: .1,
		enemySpeed: .05,
		enemyDamage: .1,
		spawnRate: .1
	},
	rare: {
		enemyHp: .15,
		enemySpeed: .08,
		enemyDamage: .15,
		spawnRate: .15
	},
	epic: {
		enemyHp: .22,
		enemySpeed: .12,
		enemyDamage: .22,
		spawnRate: .22
	},
	legend: {
		enemyHp: .32,
		enemySpeed: .18,
		enemyDamage: .32,
		spawnRate: .32
	}
};
/** 一個祭壇抽幾個效果（其中至少 1 好處、1 詛咒） */
var ALTAR_EFFECT_COUNT = {
	common: 2,
	rare: 2,
	epic: 3,
	legend: 3
};
// src/data/elements.ts
/** 地圖要素（docs/02 第 6 節）。M2 先做石地藏、結界石、詛咒祭壇；其餘隨後加入。 */
var ELEMENT_KINDS = [
	"jizo",
	"barrier",
	"altar",
	"offering",
	"omikuji",
	"chest"
];
/** 出現規則（docs/02 第 6.3 節，改成連續關卡：用「關卡經過比例」取代「整備」） */
var ELEMENT_RULES = {
	/** 開局先放幾個 */
	initial: 2,
	/** 之後每隔幾秒落下 1 個（關卡長度的比例；以 600 秒為準約每 50 秒） */
	everyFrac: .085,
	/** 同時最多幾個、同種最多幾個 */
	maxActive: 5,
	perKind: 2,
	/** 沒人理會，幾秒後消失（約 4 個虛擬波） */
	lifetime: 120,
	/** 離出生點、離邊界、彼此的最小距離（公尺） */
	minFromStart: 8,
	edgeMargin: 3,
	minApart: 10,
	/** 要素周圍必須平坦：四方向 1.5 公尺高度差上限 */
	flatTolerance: .5,
	/** 玩家與要素的互動半徑（公尺）、垂直容許（公尺） */
	useRadius: 1.8,
	useHeight: 2,
	/** 預告光柱：落下前幾秒（要素已存在但還不能用） */
	announce: 2.5,
	tries: 40
};
/** 要素種類權重（地圖可覆寫） */
var ELEMENT_WEIGHTS = {
	jizo: 1,
	barrier: 1,
	altar: 1,
	offering: 1,
	omikuji: 1,
	chest: .6
};
/** 同種同時最多幾個（沒寫的用 ELEMENT_RULES.perKind） */
var ELEMENT_PER_KIND = {
	chest: 1,
	omikuji: 1
};
/** 稀有度權重（依虛擬波數；docs/02 第 6.3 節）。波數落在哪一列取最後一個 from <= n */
var ELEMENT_RARITY_BY_WAVE = [
	{
		from: 1,
		w: {
			common: 80,
			rare: 20,
			epic: 0,
			legend: 0
		}
	},
	{
		from: 5,
		w: {
			common: 55,
			rare: 33,
			epic: 12,
			legend: 0
		}
	},
	{
		from: 10,
		w: {
			common: 40,
			rare: 35,
			epic: 20,
			legend: 5
		}
	},
	{
		from: 15,
		w: {
			common: 28,
			rare: 35,
			epic: 27,
			legend: 10
		}
	}
];
/** 石地藏（docs/02 第 6.2 節⑦） */
var JIZO = {
	common: {
		healFrac: .2,
		armor: 2
	},
	rare: {
		healFrac: .35,
		armor: 3
	},
	epic: {
		healFrac: .5,
		armor: 5
	},
	legend: {
		healFrac: 1,
		armor: 8
	}
};
/** 結界石（⑥）：圈內的攻擊力與攻擊速度加成、半徑、存在秒數（3 個虛擬波）、圈內敵人湧出倍率 */
var BARRIER = {
	common: { bonus: .2 },
	rare: { bonus: .32 },
	epic: { bonus: .48 },
	legend: { bonus: .72 }
};
var BARRIER_SPAWN_MULT = 1.25;
/** 詛咒祭壇（①）：按住秒數 */
var ALTAR_HOLD_SECONDS = 1.5;
/** 賽錢箱（docs/02 第 6.2 節②）：付出最大生命的比例（不致死），換一次三選一（三張都是 reward 階）；picks = 連選幾次 */
var OFFERING = {
	common: {
		costFrac: .1,
		reward: "rare",
		picks: 1
	},
	rare: {
		costFrac: .2,
		reward: "epic",
		picks: 1
	},
	epic: {
		costFrac: .3,
		reward: "epic",
		picks: 2
	},
	legend: {
		costFrac: .4,
		reward: "legend",
		picks: 1
	}
};
var OFFERING_HOLD_SECONDS = 1.5;
var OMIKUJI_RESULTS = [
	"daikichi",
	"chukichi",
	"shokichi",
	"suekichi",
	"kyo",
	"daikyo"
];
var OMIKUJI_WEIGHTS = {
	common: {
		daikichi: 5,
		chukichi: 15,
		shokichi: 30,
		suekichi: 20,
		kyo: 20,
		daikyo: 10
	},
	rare: {
		daikichi: 8,
		chukichi: 20,
		shokichi: 32,
		suekichi: 20,
		kyo: 15,
		daikyo: 5
	},
	epic: {
		daikichi: 12,
		chukichi: 26,
		shokichi: 32,
		suekichi: 18,
		kyo: 10,
		daikyo: 2
	},
	legend: {
		daikichi: 20,
		chukichi: 32,
		shokichi: 30,
		suekichi: 15,
		kyo: 3,
		daikyo: 0
	}
};
/** 各結果的效果：pct／flat = 自己的屬性；curse = 讓敵人變強（凶類）；merit = 功德；seconds = 持續 */
var OMIKUJI_EFFECT = {
	daikichi: {
		seconds: 60,
		pct: {
			power: .25,
			atkSpeed: .25,
			area: .25,
			speed: .25
		}
	},
	chukichi: {
		seconds: 60,
		pct: { power: .25 }
	},
	shokichi: {
		seconds: 60,
		flat: { regen: 2 }
	},
	suekichi: {
		seconds: 0,
		merit: 5
	},
	kyo: {
		seconds: 45,
		curse: { enemySpeed: .15 }
	},
	daikyo: {
		seconds: 45,
		curse: { enemyDamage: .3 }
	}
};
// src/systems/elements.ts
var USED_FADE = .7;
/** 各要素按住幾秒（結界石不用按住） */
var HOLD = {
	jizo: 1,
	altar: ALTAR_HOLD_SECONDS,
	offering: OFFERING_HOLD_SECONDS,
	omikuji: 1,
	chest: 1
};
function blankSlot() {
	return {
		active: false,
		kind: "jizo",
		rarity: "common",
		x: 0,
		y: 0,
		z: 0,
		age: 0,
		life: 0,
		announce: 0,
		progress: 0,
		inside: false,
		blocked: false,
		usedAge: -1,
		effects: Array.from({ length: 3 }, () => ({
			id: "power",
			v: 0,
			curse: false
		})),
		effectCount: 0
	};
}
/** 依虛擬波數取稀有度權重（幸運乘在非凡權重上） */
function elementRarityWeights(virtualWave, luck) {
	let row = ELEMENT_RARITY_BY_WAVE[0].w;
	for (const r of ELEMENT_RARITY_BY_WAVE) if (virtualWave >= r.from) row = r.w;
	const m = 1 + Math.max(-.5, luck / 100);
	return {
		common: row.common,
		rare: row.rare * m,
		epic: row.epic * m,
		legend: row.legend * m
	};
}
/**
* 地圖要素（docs/02 第 6 節）：落下（預告光柱）→ 玩家走近按住／站進去 → 效果 → 消失。
* 純邏輯；渲染層讀 slots。同一個種子、同樣的玩家走位 → 同樣的要素（Rng）。
*/
var Elements = class {
	rng;
	map;
	flow;
	host;
	carry;
	slots = Array.from({ length: ELEMENT_RULES.maxActive }, blankSlot);
	/** 玩家腳邊正在互動／最近的那個（HUD 提示用）；沒有 = null */
	focus = null;
	/** 玩家在結界圈內時，敵人湧出速率的倍率（給 StageDirector） */
	spawnMult = 1;
	nextDrop = 0;
	drops = 0;
	timed = [];
	luck = 0;
	clock = 0;
	constructor(rng, map, flow, host, carry = {
		serial: 0,
		downKeys: []
	}) {
		this.rng = rng;
		this.map = map;
		this.flow = flow;
		this.host = host;
		this.carry = carry;
	}
	/** 新的一關開始：清空，先落下 initial 個 */
	start(px, pz, duration, virtualWave, luck) {
		for (const s of this.slots) {
			s.active = false;
			s.inside = false;
		}
		this.focus = null;
		this.spawnMult = 1;
		this.drops = 0;
		this.nextDrop = ELEMENT_RULES.everyFrac * duration;
		this.clearAllMods();
		for (let i = 0; i < ELEMENT_RULES.initial; i++) this.drop(px, 0, pz, virtualWave, luck, 0);
	}
	/** 這一關結束：限時與結界的效果收掉，祭壇的永久效果留著 */
	endStage() {
		this.clearAllMods();
		for (const s of this.slots) s.active = false;
		this.spawnMult = 1;
		this.focus = null;
	}
	clearAllMods() {
		for (const t of this.timed) if (t.curse) this.host.clearCurse(t.key);
		else this.host.stats.clearMod(t.key);
		this.timed.length = 0;
		for (const s of this.slots) this.host.stats.clearMod(`barrier:${this.slots.indexOf(s)}`);
	}
	get activeCount() {
		let n = 0;
		for (const s of this.slots) if (s.active) n++;
		return n;
	}
	/** 場上有幾個這種要素 */
	countKind(kind) {
		let n = 0;
		for (const s of this.slots) if (s.active && s.usedAge < 0 && s.kind === kind) n++;
		return n;
	}
	update(dt, t, duration, virtualWave, luck, px, py, pz) {
		this.clock = t;
		this.luck = luck;
		for (let i = this.timed.length - 1; i >= 0; i--) if (t >= this.timed[i].until) {
			if (this.timed[i].curse) this.host.clearCurse(this.timed[i].key);
			else this.host.stats.clearMod(this.timed[i].key);
			this.timed.splice(i, 1);
		}
		while (t >= this.nextDrop && this.nextDrop < duration) {
			this.drop(px, ELEMENT_RULES.announce, pz, virtualWave, luck, ELEMENT_RULES.announce);
			this.drops++;
			this.nextDrop += ELEMENT_RULES.everyFrac * duration;
		}
		let focusSlot = null;
		let focusD = Infinity;
		let mult = 1;
		for (let i = 0; i < this.slots.length; i++) {
			const s = this.slots[i];
			if (!s.active) continue;
			s.age += dt;
			if (s.usedAge >= 0) {
				s.usedAge += dt;
				if (s.usedAge >= USED_FADE) this.free(i);
				continue;
			}
			if (s.announce > 0) {
				s.announce -= dt;
				continue;
			}
			s.life -= dt;
			if (s.life <= 0) {
				this.free(i);
				continue;
			}
			const dx = px - s.x;
			const dz = pz - s.z;
			const dist = Math.hypot(dx, dz);
			const vertical = Math.abs(py - s.y) <= ELEMENT_RULES.useHeight;
			if (s.kind === "barrier") {
				const inside = dist <= 4 && vertical;
				if (inside !== s.inside) {
					s.inside = inside;
					const key = `barrier:${i}`;
					if (inside) {
						const v = BARRIER[s.rarity].bonus;
						this.host.stats.setMod(key, { pct: {
							power: v,
							atkSpeed: v
						} });
					} else this.host.stats.clearMod(key);
				}
				if (inside) mult = BARRIER_SPAWN_MULT;
				if (dist < focusD && dist <= 6) {
					focusD = dist;
					focusSlot = s;
				}
				continue;
			}
			const near = dist <= ELEMENT_RULES.useRadius && vertical;
			s.inside = near;
			s.blocked = s.kind === "offering" && !this.host.canPayHpFrac(OFFERING[s.rarity].costFrac);
			if (near && !s.blocked) {
				const hold = HOLD[s.kind] ?? 1;
				s.progress = Math.min(1, s.progress + dt / hold);
				if (s.progress >= 1) {
					this.use(i);
					continue;
				}
			} else s.progress = Math.max(0, s.progress - dt * 3);
			if (dist < focusD && dist <= ELEMENT_RULES.useRadius + 4) {
				focusD = dist;
				focusSlot = s;
			}
		}
		this.focus = focusSlot;
		this.spawnMult = mult;
	}
	free(i) {
		const s = this.slots[i];
		if (s.kind === "barrier") this.host.stats.clearMod(`barrier:${i}`);
		s.active = false;
		s.inside = false;
	}
	use(i) {
		const s = this.slots[i];
		const st = this.host.stats;
		if (s.kind === "jizo") {
			const j = JIZO[s.rarity];
			this.host.healFrac(j.healFrac);
			const key = `jizo:${this.carry.serial++}`;
			st.setMod(key, { flat: { armor: j.armor } });
			this.timed.push({
				key,
				until: this.clock + 60
			});
			if (s.rarity === "legend" && this.carry.downKeys.length > 0) this.host.clearCurse(this.carry.downKeys.shift());
		} else if (s.kind === "altar") {
			const n = this.carry.serial++;
			const pct = {};
			for (let k = 0; k < s.effectCount; k++) {
				const f = s.effects[k];
				if (f.curse) {
					const key = `altar:${n}:${f.id}`;
					this.host.setCurse(key, f.id, f.v);
					this.carry.downKeys.push(key);
				} else pct[f.id] = f.v;
			}
			st.setMod(`altar:${n}:boons`, { pct });
		} else if (s.kind === "offering") {
			const o = OFFERING[s.rarity];
			this.host.payHpFrac(o.costFrac);
			this.host.openPick(o.reward, o.picks, "offering");
		} else if (s.kind === "chest") this.host.openPick(s.rarity, 1, "chest");
		else if (s.kind === "omikuji") this.drawOmikuji(s);
		s.usedAge = 0;
		s.progress = 1;
		this.host.emitUsed(s.kind, s.rarity);
	}
	/** 神籤：依稀有度與幸運抽結果（幸運把凶類權重乘以 1/(1+luck/100)），套用限時效果 */
	drawOmikuji(s) {
		const w = OMIKUJI_WEIGHTS[s.rarity];
		const dampen = 1 / (1 + Math.max(0, this.luck) / 100);
		let total = 0;
		const ws = OMIKUJI_RESULTS.map((r) => {
			const v = w[r] * (r === "kyo" || r === "daikyo" ? dampen : 1);
			total += v;
			return v;
		});
		let r = this.rng.next() * total;
		let result = OMIKUJI_RESULTS[0];
		for (let i = 0; i < ws.length; i++) {
			r -= ws[i];
			if (r < 0) {
				result = OMIKUJI_RESULTS[i];
				break;
			}
		}
		this.applyOmikuji(result);
	}
	/** 套用神籤結果（測試也直接呼叫） */
	applyOmikuji(result) {
		const f = OMIKUJI_EFFECT[result];
		const key = `omikuji:${this.carry.serial++}`;
		if (f.pct || f.flat) {
			this.host.stats.setMod(key, {
				pct: f.pct,
				flat: f.flat
			});
			this.timed.push({
				key,
				until: this.clock + f.seconds
			});
		}
		if (f.curse) for (const [id, v] of Object.entries(f.curse)) {
			const k = `${key}:${id}`;
			this.host.setCurse(k, id, v);
			this.timed.push({
				key: k,
				until: this.clock + f.seconds,
				curse: true
			});
		}
		if (f.merit) this.host.addMerit(f.merit);
		this.host.notifyOmikuji(result);
	}
	pickKind() {
		let total = 0;
		const w = [];
		for (const k of ELEMENT_KINDS) {
			const v = this.countKind(k) < (ELEMENT_PER_KIND[k] ?? ELEMENT_RULES.perKind) ? ELEMENT_WEIGHTS[k] : 0;
			w.push(v);
			total += v;
		}
		if (total <= 0) return null;
		let r = this.rng.next() * total;
		for (let i = 0; i < ELEMENT_KINDS.length; i++) {
			r -= w[i];
			if (r < 0) return ELEMENT_KINDS[i];
		}
		return ELEMENT_KINDS[0];
	}
	findSpot(px, pz, out) {
		const m = this.map;
		const R = ELEMENT_RULES;
		const start = m.def.playerStart;
		for (let tr = 0; tr < R.tries; tr++) {
			const a = this.rng.range(0, Math.PI * 2);
			const d = this.rng.range(10, 40);
			const x = px + Math.cos(a) * d;
			const z = pz + Math.sin(a) * d;
			if (x < m.minX + R.edgeMargin || x > m.maxX - R.edgeMargin || z < m.minZ + R.edgeMargin || z > m.maxZ - R.edgeMargin) continue;
			if (Math.hypot(x - start.x, z - start.z) < R.minFromStart) continue;
			if (!this.spotOk(x, z)) continue;
			out.x = x;
			out.z = z;
			return true;
		}
		return false;
	}
	/** 這個位置能放要素嗎：不擋路、平坦、玩家走得到、離別的要素夠遠 */
	spotOk(x, z) {
		const m = this.map;
		const R = ELEMENT_RULES;
		if (m.isBlocked(x, z)) return false;
		const h = m.heightAt(x, z);
		for (const [ox, oz] of [
			[1.5, 0],
			[-1.5, 0],
			[0, 1.5],
			[0, -1.5]
		]) if (m.isBlocked(x + ox, z + oz) || Math.abs(m.heightAt(x + ox, z + oz) - h) > R.flatTolerance) return false;
		if (!this.flow.isolated && !this.flow.reachable(x, z)) return false;
		for (const s of this.slots) if (s.active && Math.hypot(s.x - x, s.z - z) < R.minApart) return false;
		return true;
	}
	freeSlot() {
		for (let i = 0; i < this.slots.length; i++) if (!this.slots[i].active) return i;
		return -1;
	}
	drop(px, _unused, pz, virtualWave, luck, announce) {
		const i = this.freeSlot();
		if (i < 0) return false;
		const kind = this.pickKind();
		if (!kind) return false;
		const spot = {
			x: 0,
			z: 0
		};
		if (!this.findSpot(px, pz, spot)) return false;
		const rarity = pickRarity(this.rng, elementRarityWeights(virtualWave, luck));
		this.place(i, kind, rarity, spot.x, spot.z, announce);
		return true;
	}
	place(i, kind, rarity, x, z, announce) {
		const s = this.slots[i];
		s.active = true;
		s.kind = kind;
		s.rarity = rarity;
		s.x = x;
		s.z = z;
		s.y = this.map.heightAt(x, z);
		s.age = 0;
		s.life = (kind === "barrier" ? 90 : ELEMENT_RULES.lifetime) + announce;
		s.announce = announce;
		s.progress = 0;
		s.inside = false;
		s.blocked = false;
		s.usedAge = -1;
		if (kind === "altar") this.rollAltar(s);
		this.host.emitSpawn(kind, rarity);
	}
	/** 祭壇：隨機抽數個不同的效果，至少 1 個好處、1 個詛咒（D27） */
	rollAltar(s) {
		const n = ALTAR_EFFECT_COUNT[s.rarity];
		const boons = [...ALTAR_BOONS];
		const curses = [...ALTAR_CURSE_IDS];
		const take = (arr) => arr.splice(Math.floor(this.rng.next() * arr.length), 1)[0];
		const picked = [];
		picked.push({
			id: take(boons),
			v: ALTAR_BOON_PCT[s.rarity],
			curse: false
		});
		const c0 = take(curses);
		picked.push({
			id: c0,
			v: ALTAR_CURSE[s.rarity][c0],
			curse: true
		});
		while (picked.length < n) {
			const total = boons.length + curses.length;
			if (total === 0) break;
			const k = Math.floor(this.rng.next() * total);
			if (k < boons.length) picked.push({
				id: boons.splice(k, 1)[0],
				v: ALTAR_BOON_PCT[s.rarity],
				curse: false
			});
			else {
				const c = curses.splice(k - boons.length, 1)[0];
				picked.push({
					id: c,
					v: ALTAR_CURSE[s.rarity][c],
					curse: true
				});
			}
		}
		for (let i = picked.length - 1; i > 0; i--) {
			const j = Math.floor(this.rng.next() * (i + 1));
			[picked[i], picked[j]] = [picked[j], picked[i]];
		}
		s.effectCount = picked.length;
		for (let i = 0; i < picked.length; i++) Object.assign(s.effects[i], picked[i]);
	}
	/** 開發與測試：在 (x,z) 或玩家身邊 3 公尺的平地，立刻放一個（可選指定稀有度） */
	devForce(kind, rarity, px, pz) {
		if (!RARITIES.includes(rarity)) return null;
		let i = this.freeSlot();
		if (i < 0) {
			let oldest = 0;
			for (let k = 1; k < this.slots.length; k++) if (this.slots[k].age > this.slots[oldest].age) oldest = k;
			this.free(oldest);
			i = oldest;
		}
		for (const r of [
			3,
			4,
			5,
			6,
			8,
			10,
			12,
			16
		]) for (let k = 0; k < 16; k++) {
			const a = k / 16 * Math.PI * 2;
			const x = px + Math.cos(a) * r;
			const z = pz + Math.sin(a) * r;
			const m = this.map;
			if (m.isBlocked(x, z)) continue;
			const h = m.heightAt(x, z);
			let flat = true;
			for (const [ox, oz] of [
				[1.5, 0],
				[-1.5, 0],
				[0, 1.5],
				[0, -1.5]
			]) if (m.isBlocked(x + ox, z + oz) || Math.abs(m.heightAt(x + ox, z + oz) - h) > ELEMENT_RULES.flatTolerance) flat = false;
			if (!flat) continue;
			this.place(i, kind, rarity, x, z, 0);
			return this.slots[i];
		}
		return null;
	}
	get dropCount() {
		return this.drops;
	}
};
// src/data/merit.ts
/** 局外功德的結算（docs/02 第 7.4 節）。 */
var MERIT = {
	/** 每通過一關（D22：約 10 分鐘，對應原本 20 波 × 12 = 240 的一半；M3 經濟模擬再調） */
	perStage: 120,
	killsDivisor: 10,
	/** 每打倒一隻頭目 */
	boss: 100,
	firstClear: 200,
	nightBonus: .25,
	/** 中途離開（放棄）給的比例（docs/14 Q9 建議值，未決定） */
	abandonRatio: .5
};
// src/systems/merit.ts
/** 功德結算（docs/02 第 7.4 節、第 8.1 節）。stagesCleared = 通過的關卡數。 */
function computeMerit(o) {
	const total = (MERIT.perStage * o.stagesCleared + o.kills / MERIT.killsDivisor + MERIT.boss * o.bossesDefeated + (o.firstClear ? MERIT.firstClear : 0)) * (1 + o.meritStat + MERIT.nightBonus * o.night);
	return Math.floor(o.abandoned ? total * MERIT.abandonRatio : total);
}
// src/data/synergies.ts
/** 提燈小僧的聯動（其他妖怪的聯動在各自的武器卡做好時加入） */
var SYNERGIES = [
	{
		id: "chainBlast",
		requires: ["volley", "splash"],
		effect: {
			splashRatio: .4,
			splashMult: 1.3
		}
	},
	{
		id: "piercingFire",
		requires: ["volley", "pierce"],
		effect: {
			pierce: 1,
			volley: .5
		}
	},
	{
		id: "lanternGlow",
		requires: ["splash", "area"],
		effect: { auraMult: 1.5 }
	}
];
// src/game/run.ts
/** 從一個種子衍生各子系統的種子（docs/06 第 11 節）：同種子同輸入 → 同結果 */
function subSeed(seed, salt) {
	let h = (seed ^ Math.imul(salt, 2654435761)) >>> 0;
	h = Math.imul(h ^ h >>> 16, 2246822507) >>> 0;
	h = Math.imul(h ^ h >>> 13, 3266489909) >>> 0;
	return (h ^ h >>> 16) >>> 0;
}
/**
* 一局的模擬（純邏輯，不碰 Three.js；渲染層只讀這裡的陣列與數值）。
* 關卡（D22）：一關是連續計時，敵人持續湧出；頭目倒下後傳送門開，走進去過關。
* 玩家有 3D 位置與跳躍（D24）；移動輸入是「世界座標」的向量（鏡頭相對的換算在外面）。
* 升級選卡：升級當下 awaitingPick = true，step() 直接返回（模擬凍結），直到選完（D15）。
*/
var Run = class {
	seed;
	night;
	yokai;
	map;
	flow;
	enemies;
	director;
	elements;
	/** 詛咒祭壇留下的詛咒（整局有效）：來源 key → 效果；totals 是各項的相對增加合計 */
	curseSources = /* @__PURE__ */ new Map();
	curse = {
		enemyHp: 0,
		enemySpeed: 0,
		enemyDamage: 0,
		spawnRate: 0
	};
	elementCarry = {
		serial: 0,
		downKeys: []
	};
	projectiles;
	orbs;
	feed = new HitFeed();
	stats;
	dealer;
	rngCombat;
	rngCards;
	rngSpawn;
	rngElements;
	bus;
	opts;
	maxEnemies;
	phase = "combat";
	/** 目前這一關的 0 起序號 */
	stageIndex = -1;
	/** 這一局打第幾張地圖、共幾關（一般 2、大關 3，D26） */
	mapNumber;
	stageCount;
	/** 這一關已經過的秒數 */
	time = 0;
	px = 0;
	py = 0;
	pz = 0;
	vy = 0;
	grounded = true;
	coyote = 0;
	jumpBuf = 0;
	hvx = 0;
	hvz = 0;
	/** 面向（弧度，atan2(x, z)） */
	facing = 0;
	/** 本步的水平速度（公尺/秒，給動畫用） */
	moveSpeed = 0;
	hp;
	invul = 0;
	god = false;
	dead = false;
	deathTimer = 0;
	mx = 0;
	mz = 0;
	jumpReq = false;
	level = 0;
	xp = 0;
	kills = 0;
	pendingPicks = 0;
	offer = null;
	picked = [];
	bossesDefeated = 0;
	bossDefeated = false;
	portal = {
		active: false,
		x: 0,
		y: 0,
		z: 0
	};
	/** 武器卡累積：多發射的顆數、濺射半徑（公尺）。一開始都是 0（領頭只有一顆鬼火、沒有濺射） */
	volleyBonus = 0;
	splashBonus = 0;
	pierceBonus = 0;
	/** 拿過的卡 id、已觸發的聯動，與聯動帶來的加成（D28） */
	ownedCards = /* @__PURE__ */ new Set();
	activeSynergies = [];
	syn = {
		splashRatio: 0,
		splashMult: 1,
		pierce: 0,
		volley: 0,
		auraMult: 1
	};
	/** 最近一次聯動觸發的時間（模擬累計秒）與 id，HUD 顯示提示用 */
	lastSynergy = null;
	/** 神籤的功德獎勵累計、最近一次神籤結果（HUD 提示用） */
	bonusMerit = 0;
	lastOmikuji = null;
	/** 目前這個選卡面板的來源：升級／賽錢箱／寶箱；賽錢箱、寶箱的剩餘選卡次數與稀有度 */
	offerKind = "levelup";
	bonusLeft = 0;
	bonusRarity = "rare";
	/** 這一局累計的模擬秒數（跨關） */
	clock = 0;
	fireCd = 0;
	near = new Int32Array(COMBAT.queryMax);
	splashNear = new Int32Array(COMBAT.queryMax);
	constructor(opts) {
		this.opts = opts;
		this.mapNumber = opts.mapNumber ?? 1;
		this.stageCount = stagesForMap(this.mapNumber);
		this.bus = opts.bus ?? bus;
		this.seed = opts.seed >>> 0;
		this.night = opts.night ?? 0;
		const id = opts.yokaiId ?? "chochin-kozo";
		if (!PLAYABLE_YOKAI.includes(id)) throw new Error(`這隻妖怪還不能玩：${id}`);
		this.yokai = YOKAI[id];
		this.maxEnemies = opts.mobile ? WAVES.maxEnemiesMobile : WAVES.maxEnemiesDesktop;
		this.projectiles = new Projectiles(300);
		this.orbs = new Orbs(PROGRESSION.maxOrbs);
		this.stats = new Stats(this.yokai.base);
		this.rngCombat = new Rng(subSeed(this.seed, 1));
		this.rngCards = new Rng(subSeed(this.seed, 2));
		this.rngSpawn = new Rng(subSeed(this.seed, 3));
		this.rngElements = new Rng(subSeed(this.seed, 4));
		this.dealer = new CardDealer(this.rngCards, CARD_POOL_M1, RARITIES_UNLOCKED_M1);
		this.hp = this.stats.value.maxHp;
		this.startNextStage();
	}
	get awaitingPick() {
		return this.offer !== null;
	}
	get maxHp() {
		return this.stats.value.maxHp;
	}
	get xpNeeded() {
		return xpNeed(this.level);
	}
	/** 第幾關（1 起） */
	get stageNumber() {
		return this.stageIndex + 1;
	}
	/** 這一關還剩幾秒（最終蜂群時為 0） */
	get timeLeft() {
		return Math.max(0, this.director.duration - this.time);
	}
	/** 世界座標的移動向量（長度 > 1 會被正規化）；鏡頭相對的換算由呼叫端做（cameraRig.worldMove） */
	setMove(wx, wz) {
		this.mx = wx;
		this.mz = wz;
	}
	requestJump() {
		this.jumpReq = true;
	}
	buildWorld() {
		const def = this.opts.mapFor ? this.opts.mapFor(this.stageIndex, this.seed) : makeHighlands(subSeed(this.seed, 100 + this.stageIndex));
		this.map = new TerrainMap(def);
		this.flow = new FlowField(this.map);
		this.enemies = new Enemies(this.map, this.maxEnemies);
		this.director = new StageDirector(this.rngSpawn, this.map, this.flow, this.enemies, this.maxEnemies);
		this.elements = new Elements(this.rngElements, this.map, this.flow, {
			stats: this.stats,
			healFrac: (f) => {
				this.hp = Math.min(this.maxHp, this.hp + this.maxHp * f);
			},
			canPayHpFrac: (f) => this.hp > this.maxHp * f + 1,
			payHpFrac: (f) => {
				this.hp -= this.maxHp * f;
			},
			openPick: (rarity, picks, kind) => this.openBonusPick(rarity, picks, kind),
			addMerit: (n) => {
				this.bonusMerit += n;
			},
			notifyOmikuji: (result) => {
				this.lastOmikuji = {
					id: result,
					at: this.clock
				};
			},
			setCurse: (key, id, v) => {
				this.curseSources.set(key, {
					id,
					v
				});
				this.recomputeCurse();
			},
			clearCurse: (key) => {
				this.curseSources.delete(key);
				this.recomputeCurse();
			},
			emitSpawn: (kind, rarity) => this.bus.emit("elementSpawn", {
				kind,
				rarity
			}),
			emitUsed: (kind, rarity) => this.bus.emit("elementUsed", {
				kind,
				rarity
			})
		}, this.elementCarry);
		this.projectiles.reset();
		this.orbs.reset();
		const s = this.map.def.playerStart;
		this.px = s.x;
		this.pz = s.z;
		this.py = this.map.heightAt(s.x, s.z);
		this.vy = 0;
		this.grounded = true;
		this.hvx = 0;
		this.hvz = 0;
		this.flow.update(this.px, this.pz, true);
	}
	recomputeCurse() {
		for (const id of ALTAR_CURSE_IDS) this.curse[id] = 0;
		for (const c of this.curseSources.values()) this.curse[c.id] += c.v;
	}
	startNextStage() {
		if (this.phase === "ended") return;
		this.stageIndex++;
		this.phase = "combat";
		this.time = 0;
		this.bossDefeated = false;
		this.portal.active = false;
		this.buildWorld();
		this.director.start(this.stageIndex, bossHpMult(this.mapNumber, this.stageIndex));
		this.elements.start(this.px, this.pz, this.director.duration, this.director.virtualWave(), this.stats.value.luck);
		this.fireCd = .3;
		this.bus.emit("stageStart", { stage: this.stageNumber });
	}
	/** 過關畫面 → 下一關（外面的狀態機在 INTERMISSION 按「出發」時呼叫） */
	continueFromIntermission() {
		if (this.phase !== "intermission") return;
		this.startNextStage();
	}
	/** 開發與測試：把關卡時間直接設成 t 秒（觸發中間錯過的定時事件不補發；只用來跳到頭目前後） */
	devSetTime(t) {
		this.time = t;
		this.director.time = t;
		const dur = this.director.duration;
		this.director.eventsFired = STAGE.events.filter((e) => e.at * dur <= t).length;
	}
	/** 開發與測試：頭目現在就倒下（走正常的擊殺流程，傳送門會開） */
	devKillBoss() {
		const i = this.director.bossIndex;
		if (i < 0 || !this.enemies.alive[i]) return false;
		this.enemies.hp[i] = 0;
		this.onKill(i);
		return true;
	}
	/** 開發與測試：不管在哪，現在就過關（走正常的過關流程） */
	devClearStage() {
		if (this.phase === "combat") this.clearStage();
	}
	devSpawn(kindId, n) {
		const kind = kindIndex(kindId);
		let made = 0;
		for (let k = 0; k < n; k++) for (const r of [
			8,
			6,
			10,
			12
		]) {
			const a = k * 2.399963 + r;
			const x = this.px + Math.cos(a) * r;
			const z = this.pz + Math.sin(a) * r;
			if (this.map.isBlocked(x, z) || !(this.flow.isolated || this.flow.reachable(x, z))) continue;
			if (this.enemies.spawn(kind, x, z, this.director.virtualWave(), this.night, k * .7) >= 0) made++;
			break;
		}
		return made;
	}
	devTeleport(x, z) {
		if (this.map.isBlocked(x, z) || !this.map.inBounds(x, z)) return false;
		this.px = x;
		this.pz = z;
		this.py = this.map.heightAt(x, z);
		this.vy = 0;
		this.grounded = true;
		this.hvx = 0;
		this.hvz = 0;
		this.flow.update(x, z, true);
		return true;
	}
	step(dt) {
		if (this.phase !== "combat" || this.awaitingPick) return;
		if (this.dead) {
			this.deathTimer -= dt;
			if (this.deathTimer <= 0) this.finish("death");
			return;
		}
		this.time += dt;
		this.clock += dt;
		this.movePlayer(dt);
		const s = this.stats.value;
		this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
		if (this.invul > 0) this.invul -= dt;
		this.flow.update(this.px, this.pz);
		const aura = this.yokai.aura;
		this.enemies.update(dt, this.px, this.pz, this.flow, aura.radius * s.area * this.syn.auraMult, aura.slow);
		this.contactDamage();
		this.weapon(dt);
		this.projectiles.update(dt, this.yokai.weapon, this.enemies, s.area, this.onProjectileHit);
		const gained = this.orbs.update(dt, this.px, this.pz, s.pickup);
		if (gained > 0) this.addXp(gained);
		this.elements.update(dt, this.time, this.director.duration, this.director.virtualWave(), s.luck, this.px, this.py, this.pz);
		this.director.extraMult = this.elements.spawnMult * (1 + this.curse.spawnRate);
		this.director.hpCurse = 1 + this.curse.enemyHp;
		this.enemies.speedMult = 1 + this.curse.enemySpeed;
		this.director.update(dt, this.px, this.pz, this.night, this.bossDefeated);
		if (this.hp <= 0 && !this.god) {
			this.dead = true;
			this.deathTimer = COMBAT.deathDelay;
			return;
		}
		if (this.portal.active && this.portalReached()) this.clearStage();
	}
	portalReached() {
		const p = this.portal;
		return Math.hypot(this.px - p.x, this.pz - p.z) <= STAGE.portalRadius && Math.abs(this.py - p.y) <= STAGE.portalHeight;
	}
	/** 玩家在 (x1,z1) 這個水平位置、目前腳高 py 時，這一步被擋住嗎（地面與空中規則不同） */
	moveBlocked(x0, z0, x1, z1) {
		const m = this.map;
		if (m.isBlocked(x1, z1)) return true;
		const h1 = m.heightAt(x1, z1);
		if (this.grounded) {
			const dist = Math.hypot(x1 - x0, z1 - z0);
			return dist > 1e-6 && (h1 - m.heightAt(x0, z0)) / dist > WALL_TAN;
		}
		return h1 > this.py + .05;
	}
	movePlayer(dt) {
		const m = this.map;
		this.coyote = this.grounded ? MOVE.coyote : Math.max(0, this.coyote - dt);
		this.jumpBuf = Math.max(0, this.jumpBuf - dt);
		if (this.jumpReq) {
			this.jumpBuf = MOVE.jumpBuffer;
			this.jumpReq = false;
		}
		if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
			this.vy = MOVE.jumpSpeed;
			this.grounded = false;
			this.coyote = 0;
			this.jumpBuf = 0;
		}
		let mx = this.mx;
		let mz = this.mz;
		const len = Math.hypot(mx, mz);
		if (len > 1) {
			mx /= len;
			mz /= len;
		}
		const mag = Math.min(1, len);
		let spd = this.stats.value.speed * mag;
		if (this.grounded && len > .001) spd *= m.speedAt(this.px, this.pz) * m.slopeMult(this.px, this.pz, this.px + mx, this.pz + mz);
		const dx = len > .001 ? mx / Math.max(mag, 1e-6) : 0;
		const dz = len > .001 ? mz / Math.max(mag, 1e-6) : 0;
		const tvx = dx * spd;
		const tvz = dz * spd;
		if (this.grounded) {
			this.hvx = tvx;
			this.hvz = tvz;
		} else {
			const k = Math.min(1, MOVE.airAccel * dt) * MOVE.airControl;
			this.hvx += (tvx - this.hvx) * k;
			this.hvz += (tvz - this.hvz) * k;
		}
		const r = COMBAT.playerRadius;
		let nx = Math.min(m.maxX - r, Math.max(m.minX + r, this.px + this.hvx * dt));
		let nz = Math.min(m.maxZ - r, Math.max(m.minZ + r, this.pz + this.hvz * dt));
		if (this.moveBlocked(this.px, this.pz, nx, nz)) {
			if (!this.moveBlocked(this.px, this.pz, nx, this.pz)) nz = this.pz;
			else if (!this.moveBlocked(this.px, this.pz, this.px, nz)) nx = this.px;
			else {
				nx = this.px;
				nz = this.pz;
				this.hvx = 0;
				this.hvz = 0;
			}
		}
		const hdist = Math.hypot(nx - this.px, nz - this.pz);
		this.moveSpeed = hdist / dt;
		if (this.moveSpeed > .05) this.facing = Math.atan2(nx - this.px, nz - this.pz);
		this.px = nx;
		this.pz = nz;
		const ground = m.heightAt(this.px, this.pz);
		if (this.grounded) {
			const drop = this.py - ground;
			if (drop > MOVE.stepDown || hdist > 1e-6 && drop / hdist > WALL_TAN) {
				this.grounded = false;
				this.vy = 0;
			} else this.py = ground;
		}
		if (!this.grounded) {
			this.vy -= MOVE.gravity * dt;
			this.py += this.vy * dt;
			if (this.py <= ground) {
				this.py = ground;
				this.vy = 0;
				this.grounded = true;
			}
		}
	}
	contactDamage() {
		const e = this.enemies;
		const n = e.within(this.px, this.pz, COMBAT.playerRadius + 2, this.near);
		for (let k = 0; k < n; k++) {
			const i = this.near[k];
			if (!e.alive[i] || e.contactCd[i] > 0) continue;
			const dx = e.x[i] - this.px;
			const dz = e.z[i] - this.pz;
			const r = COMBAT.playerRadius + e.radius(i);
			if (dx * dx + dz * dz > r * r) continue;
			if (this.py - this.map.heightAt(e.x[i], e.z[i]) > MOVE.contactClear * e.scale[i]) continue;
			if (this.invul > 0 || this.god) continue;
			e.contactCd[i] = COMBAT.contactCooldown;
			if (this.rngCombat.next() < this.stats.value.dodge) continue;
			const dmg = e.damage[i] * (1 + this.curse.enemyDamage) * armorMult(this.stats.value.armor);
			this.hp -= dmg;
			this.invul = COMBAT.invulnerable;
			this.bus.emit("playerHurt", {
				damage: dmg,
				hp: this.hp
			});
			break;
		}
	}
	weapon(dt) {
		const w = this.yokai.weapon;
		const s = this.stats.value;
		this.fireCd -= dt;
		if (this.fireCd > 0) return;
		const target = this.enemies.nearest(this.px, this.pz, w.range * s.area);
		if (target < 0) {
			this.fireCd = 0;
			return;
		}
		this.fireCd += w.interval / s.atkSpeed;
		const dx = this.enemies.x[target] - this.px;
		const dz = this.enemies.z[target] - this.pz;
		const d = Math.hypot(dx, dz) || 1;
		const volleyExact = (tuning.volley > 0 ? tuning.volley : w.volley) + this.volleyBonus + this.syn.volley;
		const volley = Math.floor(volleyExact) + (this.rngCombat.next() < volleyExact - Math.floor(volleyExact) ? 1 : 0);
		for (let v = 0; v < volley; v++) {
			const crit = this.rngCombat.next() < s.crit;
			const dmg = w.damage * s.power * tuning.damageScale * (crit ? s.critDmg : 1);
			const spread = (v - (volley - 1) / 2) * .18;
			const c = Math.cos(spread);
			const sn = Math.sin(spread);
			const ux = dx / d;
			const uz = dz / d;
			this.projectiles.spawn(this.px, this.pz, ux * c - uz * sn, ux * sn + uz * c, w, dmg, crit, target, this.rollPierce());
		}
	}
	/** 每顆鬼火的穿透次數：小數 = 機率多穿一隻 */
	rollPierce() {
		const p = this.pierceBonus + this.syn.pierce;
		const base = Math.floor(p);
		return base + (this.rngCombat.next() < p - base ? 1 : 0);
	}
	/** 固定的方法參照：投射物命中時結算傷害（不在迴圈裡建函式） */
	onProjectileHit = (e, p) => {
		const pr = this.projectiles;
		const w = this.yokai.weapon;
		const vl = Math.hypot(pr.vx[p], pr.vz[p]) || 1;
		const dmg = pr.damage[p];
		this.feed.push(this.enemies.x[e], this.enemies.z[e], dmg, pr.crit[p] === 1);
		const knock = this.enemies.variant[e] === 2 ? 0 : w.knockback;
		if (this.enemies.hurt(e, dmg, pr.vx[p] / vl, pr.vz[p] / vl, knock)) this.onKill(e);
		const splashR = ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + this.splashBonus) * this.syn.splashMult;
		if (splashR > 0) {
			const n = this.enemies.within(this.enemies.x[e], this.enemies.z[e], splashR * this.stats.value.area, this.splashNear);
			const sd = dmg * ((w.splashRatio > 0 ? w.splashRatio : .6) + this.syn.splashRatio);
			for (let k = 0; k < n; k++) {
				const o = this.splashNear[k];
				if (o === e || !this.enemies.alive[o]) continue;
				if (this.enemies.hurt(o, sd, 0, 0, 0)) this.onKill(o);
			}
		}
	};
	onKill(e) {
		this.kills++;
		const value = this.enemies.points(e) * PROGRESSION.orbPerPoint;
		const x = this.enemies.x[e];
		const z = this.enemies.z[e];
		const isBoss = this.enemies.variant[e] === 2;
		if (!this.orbs.spawn(x, z, value)) this.addXp(value);
		this.enemies.kill(e);
		if (isBoss) this.openPortal(x, z);
	}
	openPortal(x, z) {
		this.bossDefeated = true;
		this.bossesDefeated++;
		let px = x;
		let pz = z;
		if (this.map.isBlocked(px, pz) || !this.map.inBounds(px, pz)) {
			px = this.px + 3;
			pz = this.pz;
			if (this.map.isBlocked(px, pz)) pz = this.pz + 3;
		}
		this.portal = {
			active: true,
			x: px,
			y: this.map.heightAt(px, pz),
			z: pz
		};
		this.bus.emit("bossDown", { stage: this.stageNumber });
	}
	addXp(v) {
		this.xp += v;
		let leveled = 0;
		while (this.xp >= xpNeed(this.level)) {
			this.xp -= xpNeed(this.level);
			this.level++;
			this.pendingPicks++;
			leveled++;
		}
		if (leveled > 0 && this.offer === null) {
			this.makeOffer();
			this.bus.emit("levelUp", {
				level: this.level,
				pending: this.pendingPicks
			});
		}
	}
	makeOffer() {
		this.offer = this.dealer.deal(this.level, this.stats.value.luck);
	}
	/** 玩家選了第 index 張卡。回傳是否還有下一次待選（UI 繼續開著面板） */
	/** 賽錢箱、寶箱：開三選一面板（模擬暫停，沿用升級選卡的同一個面板，D15），連選 picks 次 */
	openBonusPick(rarity, picks, kind) {
		if (this.offer !== null) return;
		this.bonusLeft = picks;
		this.bonusRarity = rarity;
		this.offerKind = kind;
		this.offer = this.dealer.dealRarity(rarity);
		this.bus.emit("levelUp", {
			level: this.level,
			pending: this.bonusLeft
		});
	}
	/** 面板上「還有幾次」：賽錢箱／寶箱看剩下的連選次數，升級看待選的升級數 */
	get picksLeft() {
		return this.offerKind === "levelup" ? this.pendingPicks : this.bonusLeft;
	}
	chooseCard(index) {
		if (!this.offer || index < 0 || index >= this.offer.length) return this.offer !== null;
		const o = this.offer[index];
		this.applyCard(o);
		this.bus.emit("cardChosen", {
			cardId: o.cardId,
			rarity: o.rarity
		});
		if (this.offerKind !== "levelup") {
			this.bonusLeft--;
			if (this.bonusLeft > 0) {
				this.offer = this.dealer.dealRarity(this.bonusRarity);
				return true;
			}
			this.offerKind = "levelup";
			this.offer = null;
			if (this.pendingPicks > 0) {
				this.makeOffer();
				return true;
			}
			return false;
		}
		this.pendingPicks--;
		if (this.pendingPicks > 0) {
			this.makeOffer();
			return true;
		}
		this.offer = null;
		return false;
	}
	applyCard(o) {
		const card = cardById(o.cardId);
		this.ownedCards.add(card.id);
		if (isWeaponCard(card)) {
			if (card.weapon === "pierce") this.pierceBonus = Math.min(WEAPON_LIMITS.pierce, this.pierceBonus + card.values[o.rarity]);
			else if (card.weapon === "volley") this.volleyBonus = Math.min(WEAPON_LIMITS.volley - 1, this.volleyBonus + card.values[o.rarity]);
			else this.splashBonus = Math.min(WEAPON_LIMITS.splash, this.splashBonus + card.values[o.rarity]);
			this.picked.push(o);
			this.checkSynergies();
			return;
		}
		const before = this.maxHp;
		this.stats.addCard(card.stat, card.values[o.rarity]);
		if (this.maxHp > before) this.hp += this.maxHp - before;
		this.hp = Math.min(this.hp, this.maxHp);
		this.picked.push(o);
		this.checkSynergies();
	}
	/** 拿到卡之後檢查聯動：兩張都有、還沒觸發過 → 永久加成並通知 */
	checkSynergies() {
		for (const sy of SYNERGIES) {
			if (this.activeSynergies.includes(sy.id)) continue;
			if (!sy.requires.every((id) => this.ownedCards.has(id))) continue;
			this.activeSynergies.push(sy.id);
			const e = sy.effect;
			this.syn.splashRatio += e.splashRatio ?? 0;
			this.syn.splashMult *= e.splashMult ?? 1;
			this.syn.pierce += e.pierce ?? 0;
			this.syn.volley += e.volley ?? 0;
			this.syn.auraMult *= e.auraMult ?? 1;
			this.lastSynergy = {
				id: sy.id,
				at: this.clock
			};
			this.bus.emit("synergy", { id: sy.id });
		}
	}
	/** 測試與開發介面：直接給一張卡（不經選卡） */
	give(cardId, rarity) {
		this.applyCard({
			cardId,
			rarity
		});
	}
	clearStage() {
		this.enemies.reset();
		this.projectiles.reset();
		let rest = 0;
		for (let i = 0; i < this.orbs.high; i++) if (this.orbs.alive[i]) rest += this.orbs.value[i];
		this.orbs.reset();
		this.director.active = false;
		this.portal.active = false;
		this.elements.endStage();
		const last = this.stageNumber >= this.stageCount;
		if (rest > 0) this.addXp(rest);
		this.bus.emit("stageClear", {
			stage: this.stageNumber,
			last
		});
		if (last) {
			this.finish("victory");
			return;
		}
		this.phase = "intermission";
	}
	/** 放棄這一局（過關畫面或暫停選單）：局外獎勵照 50% 結算 */
	abandon() {
		if (this.phase === "ended") return;
		this.offer = null;
		this.pendingPicks = 0;
		this.bonusLeft = 0;
		this.offerKind = "levelup";
		this.finish("abandon");
	}
	finish(result) {
		if (this.phase === "ended") return;
		const wasPhase = this.phase;
		this.phase = "ended";
		const cleared = result === "victory" ? this.stageNumber : wasPhase === "intermission" ? this.stageNumber : this.stageIndex;
		const merit = this.bonusMerit + computeMerit({
			stagesCleared: cleared,
			kills: this.kills,
			bossesDefeated: this.bossesDefeated,
			firstClear: result === "victory" && !this.opts.clearedBefore,
			meritStat: this.opts.meritStat ?? 0,
			night: this.night,
			abandoned: result === "abandon"
		});
		this.meritEarned = merit;
		this.result = result;
		this.bus.emit("runEnd", {
			result,
			stage: this.stageNumber,
			kills: this.kills,
			level: this.level,
			time: this.time,
			merit
		});
	}
	meritEarned = 0;
	result = null;
};
// scripts/sim/sim.ts
/**
* 平衡模擬 v1（docs/07 第 4 節）：無頭跑真正的 `Run`（和遊戲同一份邏輯），用簡單的機器人玩很多局，
* 輸出存活時間、過關率、擊殺、等級的分佈，以及不同選卡策略、有沒有去用地圖要素的差別。
*
* 用法：npm run sim -- [--runs 24] [--seconds 600] [--stages 1] [--seeds 1] [--only random,dps] [--elements both] [--json out.json]
*
* 限制（要誠實）：機器人只會「風箏＋選分數最高的卡＋走去用要素」，比真人笨；結果看「相對差異」比看絕對值可靠。
* 模擬器不能取代真人試玩（docs/07 第 4 節）。
*/
var DT = 1 / 60;
var argv = process.argv.slice(2);
var arg = (name, def) => {
	const i = argv.indexOf("--" + name);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
var RUNS = Number(arg("runs", "24"));
var SECONDS = Number(arg("seconds", "600"));
var STAGES = Number(arg("stages", "1"));
var SEED0 = Number(arg("seeds", "1"));
var ONLY = arg("only", "random,dps,survive").split(",");
var ELEMENTS = arg("elements", "both");
var JSON_OUT = arg("json", "");
/** --tune countScale=3,hpScale=1.2,xp.needPerLevel=4,w.hpPerWave=0.2：臨時改旋鈕比較（不改檔案）；xp. 開頭是 PROGRESSION、w. 開頭是 WAVES */
var TUNE = arg("tune", "");
function applyTune() {
	for (const kv of TUNE.split(",").filter(Boolean)) {
		const [k, v] = kv.split("=");
		if (k.startsWith("w.")) WAVES[k.slice(2)] = Number(v);
		else if (k.startsWith("xp.")) PROGRESSION[k.slice(3)] = Number(v);
		else tuning[k] = Number(v);
	}
}
var SCORES = {
	dps: {
		volley: 3,
		splash: 2.6,
		pierce: 2.2,
		power: 2.4,
		atkSpeed: 2.4,
		area: 1.6,
		hp: 1,
		speed: .6
	},
	survive: {
		hp: 3,
		speed: 2.4,
		area: 1.8,
		atkSpeed: 1.4,
		power: 1.2,
		volley: 1,
		splash: 1,
		pierce: .8
	}
};
var RARITY_SCORE = {
	common: 1,
	rare: 1.6,
	epic: 2.4,
	legend: 3.5
};
function choose(run, strategy, rnd) {
	const offer = run.offer;
	if (strategy === "random") return Math.floor(rnd() * offer.length);
	const sc = SCORES[strategy];
	let best = 0;
	let bestV = -1;
	offer.forEach((o, i) => {
		const v = (sc[o.cardId] ?? 1) * RARITY_SCORE[o.rarity];
		if (v > bestV) {
			bestV = v;
			best = i;
		}
	});
	return best;
}
/** 簡單的確定性亂數（只給「random」策略用，不影響遊戲本身的 Rng） */
function lcg(seed) {
	let s = seed >>> 0;
	return () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296;
}
function play(seed, strategy, useElements) {
	resetTuning();
	applyTune();
	const rnd = lcg(seed * 7919);
	tuning.stageSeconds = SECONDS;
	const run = new Run({
		seed,
		bus: new EventBus(),
		mapNumber: 1
	});
	let used = 0;
	run.bus.on("elementUsed", () => used++);
	let t = 0;
	let totalTime = 0;
	let cleared = 0;
	let bossSeen = false;
	const cards = {};
	const maxStage = Math.min(STAGES, run.stageCount);
	let guard = 0;
	while (run.phase !== "ended" && guard++ < 5e7) {
		if (run.awaitingPick) {
			const i = choose(run, strategy, rnd);
			const c = run.offer[i].cardId;
			cards[c] = (cards[c] ?? 0) + 1;
			run.chooseCard(i);
			continue;
		}
		if (run.phase === "intermission") {
			cleared++;
			totalTime += run.time;
			if (cleared >= maxStage) break;
			run.continueFromIntermission();
			continue;
		}
		const e = run.enemies;
		const n = e.nearest(run.px, run.pz, 5);
		let mx;
		let mz;
		if (run.portal.active) {
			mx = run.portal.x - run.px;
			mz = run.portal.z - run.pz;
		} else if (n >= 0) {
			const dx = run.px - e.x[n];
			const dz = run.pz - e.z[n];
			const d = Math.hypot(dx, dz) || 1;
			mx = dx / d + Math.cos(t) * .4;
			mz = dz / d + Math.sin(t) * .4;
		} else {
			const target = useElements ? nearestElement(run) : null;
			if (target) {
				const dx = target.x - run.px;
				const dz = target.z - run.pz;
				if (Math.hypot(dx, dz) < .6) {
					mx = 0;
					mz = 0;
				} else {
					mx = dx;
					mz = dz;
				}
			} else {
				mx = Math.cos(t * .5);
				mz = Math.sin(t * .5);
			}
		}
		run.setMove(mx, mz);
		if (run.director.bossIndex >= 0) bossSeen = true;
		run.step(DT);
		t += DT;
		if (run.time > SECONDS + 150) break;
	}
	if (run.phase === "ended" && run.result === "victory") cleared = maxStage;
	return {
		seed,
		strategy,
		elements: useElements,
		survived: run.phase === "intermission" ? totalTime : totalTime + run.time,
		stagesCleared: cleared,
		bossSeen: bossSeen || run.bossesDefeated > 0,
		bossKilled: run.bossesDefeated > 0,
		kills: run.kills,
		level: run.level,
		elementsUsed: used,
		cards,
		curseTotal: run.curse.enemyHp + run.curse.enemySpeed + run.curse.enemyDamage + run.curse.spawnRate
	};
}
function nearestElement(run) {
	let best = null;
	let bd = 40;
	for (const s of run.elements.slots) {
		if (!s.active || s.usedAge >= 0 || s.announce > 0 || s.blocked) continue;
		if (s.kind === "barrier") continue;
		const d = Math.hypot(s.x - run.px, s.z - run.pz);
		if (d < bd) {
			bd = d;
			best = s;
		}
	}
	return best;
}
var pct = (a, p) => {
	const s = [...a].sort((x, y) => x - y);
	return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
};
var avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
function summarize(rs) {
	const surv = rs.map((r) => r.survived);
	const clear = rs.filter((r) => r.stagesCleared >= Math.min(STAGES, 99)).length / rs.length;
	return [
		`存活 P10/P50/P90 ${pct(surv, 10).toFixed(0)}/${pct(surv, 50).toFixed(0)}/${pct(surv, 90).toFixed(0)} 秒`,
		`過關 ${(clear * 100).toFixed(0)}%`,
		`見頭目 ${(rs.filter((r) => r.bossSeen).length / rs.length * 100).toFixed(0)}%`,
		`打倒頭目 ${(rs.filter((r) => r.bossKilled).length / rs.length * 100).toFixed(0)}%`,
		`擊殺 ${avg(rs.map((r) => r.kills)).toFixed(0)}`,
		`等級 ${avg(rs.map((r) => r.level)).toFixed(1)}`,
		`用掉要素 ${avg(rs.map((r) => r.elementsUsed)).toFixed(1)}`
	].join("；");
}
var all = [];
var modes = ELEMENTS === "both" ? [false, true] : [ELEMENTS === "on"];
var t0 = Date.now();
console.log(`# 平衡模擬 v1\n\n參數：${RUNS} 局／組合、關卡 ${SECONDS} 秒、${STAGES} 關、種子 ${SEED0}…${SEED0 + RUNS - 1}；機器人（風箏＋選卡策略＋可選去用要素）。數量×${tuning.countScale}、鬼火起步 ${tuning.volley} 顆。${TUNE ? " 臨時旋鈕：" + TUNE : ""}\n`);
for (const strategy of ONLY) for (const useEl of modes) {
	const rs = [];
	for (let i = 0; i < RUNS; i++) rs.push(play(SEED0 + i, strategy, useEl));
	all.push(...rs);
	console.log(`- **${strategy}／${useEl ? "用要素" : "不理要素"}**：${summarize(rs)}`);
}
console.log("\n## 卡片貢獻（只看「random」策略：選卡是隨機的，所以有沒有拿到某張卡才算接近獨立）；樣本小，看趨勢，不看小差距\n");
console.log("| 卡 | 平均每局拿幾張 | 拿得比平均多的局：平均存活（秒） | 拿得比平均少的局（秒） |\n|---|---|---|---|");
var pool = all.filter((r) => r.strategy === "random");
for (const id of CARD_POOL_M1) {
	const have = pool.filter((r) => (r.cards[id] ?? 0) >= avg(pool.map((x) => x.cards[id] ?? 0)));
	const not = pool.filter((r) => (r.cards[id] ?? 0) < avg(pool.map((x) => x.cards[id] ?? 0)));
	console.log(`| ${id} | ${avg(pool.map((r) => r.cards[id] ?? 0)).toFixed(1)} | ${have.length ? avg(have.map((r) => r.survived)).toFixed(0) : "-"} | ${not.length ? avg(not.map((r) => r.survived)).toFixed(0) : "-"} |`);
}
console.log(`\n（耗時 ${((Date.now() - t0) / 1e3).toFixed(0)} 秒）`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 1));
export {};
