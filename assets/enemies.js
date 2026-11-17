"use strict";
/* ============================================================
   敵の設計図（enemies.js）：形 + 移動部品名 + 攻撃部品名 + 性能
   新しい敵は、この表に1行足して movement / attack に
   components.js で登録済みの部品名を書くだけで追加できる。
   スプリッターの分裂先（nextType）もここで世代をたどる。
   ============================================================ */

/* ============================================================
   敵の設計図（形 + 移動 + 攻撃 + 性能）
   ============================================================ */
var ENEMY_TYPES = {
  square: { // 四角：追跡・撃たない（移動速度は従来から20%下げた）
    shape: "square", color: "#ff2d78", r: 15, hp: 1, score: 100,
    name: "四角", desc: "まっすぐ追跡、射撃なし",
    icon: '<rect x="-11" y="-11" width="22" height="22" fill="none" stroke="#ff2d78" stroke-width="3"/>',
    movement: "chase", attack: "none", speed: [90, 122], rotMode: "spin"
  },
  diamond: { // 菱形：揺れながら追跡・撃たない（移動速度-20%／耐久は半分の0.5／揺れ幅は約2倍に拡大）
    shape: "diamond", color: "#b26bff", r: 13, hp: 0.5, score: 150,
    name: "菱形", desc: "揺れながら追跡、射撃なし",
    icon: '<path d="M0 -14 L11 0 L0 14 L-11 0 Z" fill="none" stroke="#b26bff" stroke-width="3"/>',
    movement: "swayChase", attack: "none", speed: [77, 104],
    swayAmp: [48, 84], swayFreq: [2.2, 3.2], rotMode: "face"
  },
  hexagon: { // 六角形：ゆっくり追跡・撃ってくる・硬い
    shape: "hexagon", color: "#ff4040", r: 19, hp: 3, score: 300,
    name: "六角形", desc: "追跡しつつ射撃。自機狙い型は黄色リング付き",
    icon: '<path d="M12 -7 L12 7 L0 14 L-12 7 L-12 -7 L0 -14 Z" fill="none" stroke="#ff4040" stroke-width="3"/>',
    movement: "chase", attack: "aimed", speed: [60, 84],
    fireInterval: [1.5, 2.1], rotMode: "spin"
  },
  darter: { // ダーター：小さな三角。近づくと予告のあと高速突進
    // 基本移動速度（接近時）は従来から40%下げた。突進速度は従来の2倍のまま（dash側で1180）。予告時間は不変。
    shape: "triangle", color: "#ff8c1a", r: 12, hp: 0.5, score: 120,
    name: "ダーター", desc: "3体で出現、予告0.45秒のあと高速突進",
    icon: '<path d="M0 -14 L12 10 L-12 10 Z" fill="none" stroke="#ff8c1a" stroke-width="3"/>',
    movement: "dash", attack: "none", speed: [194, 254], rotMode: "face"
  },
  splitter: { // スプリッター（第0世代）：五角形。倒すと2体に分裂し、最大3世代まで続く
    // 耐久は従来の2倍の4（命中16発分）。移動速度は従来から約30%下げた。
    shape: "pentagon", color: "#3dff7a", r: 17, hp: 4, score: 250,
    name: "スプリッター", desc: "倒すと2体に分裂",
    icon: '<path d="M0 -13 L12 -4 L7 11 L-7 11 L-12 -4 Z" fill="none" stroke="#3dff7a" stroke-width="3"/>',
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 0, nextType: "splitter2"
  },
  splitter2: { // スプリッター第1世代：少し小さく、耐久2
    shape: "pentagon", color: "#55ff8c", r: 14, hp: 2, score: 150,
    name: "スプリッター 第1世代", desc: "さらに2体に分裂",
    icon: '<path d="M0 -11 L10 -3.4 L6 9 L-6 9 L-10 -3.4 Z" fill="none" stroke="#55ff8c" stroke-width="3"/>',
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 1, nextType: "splitter3"
  },
  splitter3: { // スプリッター第2世代：さらに小さく、耐久1
    shape: "pentagon", color: "#74ffab", r: 12, hp: 1, score: 80,
    name: "スプリッター 第2世代", desc: "さらに2体に分裂",
    icon: '<path d="M0 -9.5 L8.5 -3 L5 7.5 L-5 7.5 L-8.5 -3 Z" fill="none" stroke="#74ffab" stroke-width="3"/>',
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 2, nextType: "splitlet"
  },
  splitlet: { // スプリッター第3世代（最終）：小丸。ここで分裂は終わる
    shape: "circle", color: "#7dff9e", r: 9, hp: 0.25, score: 50,
    name: "スプリットレット（最終）", desc: "分裂はここまで",
    icon: '<circle cx="0" cy="0" r="8" fill="none" stroke="#7dff9e" stroke-width="3"/>',
    movement: "chase", attack: "none", speed: [138, 168], rotMode: "none",
    gen: 3
  },
  tank: { // タンク：大きな円。高耐久で3方向拡散弾（威力は控えめ）
    shape: "circle", color: "#e8ecf2", r: 28, hp: 10, score: 800,
    name: "タンク", desc: "3方向拡散弾、体力バー付き。倒すとランダムな子機カプセル",
    icon: '<circle cx="0" cy="0" r="13" fill="none" stroke="#e8ecf2" stroke-width="3"/><circle cx="0" cy="0" r="6" fill="none" stroke="#e8ecf2" stroke-width="2"/>',
    movement: "chase", attack: "spread", speed: [38, 52],
    fireInterval: [0.9, 1.2], rotMode: "none" // 発射間隔は従来の半分（レート2倍）。弾の威力（-5）は不変
  },
  spiral: { // スパイラル：星形。回転弾幕（威力は控えめ）
    shape: "star", color: "#ffd51f", r: 17, hp: 3, score: 400,
    name: "スパイラル", desc: "回転弾幕。倒すとアタッカーをドロップ",
    icon: '<path d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4 Z" fill="none" stroke="#ffd51f" stroke-width="2.5"/>',
    movement: "chase", attack: "spiral", speed: [62, 80],
    fireInterval: [0.13, 0.17], rotMode: "spin"
  },
  guardian: { // ガーディアン：正面の盾で正面からの弾を防ぐ
    // 盾の旋回速度（turnSpeed, rad/秒）は従来の半分に抑え、回り込めるようにした
    shape: "guardian", color: "#2d7bff", r: 17, hp: 2, score: 350,
    name: "ガーディアン", desc: "正面の盾で弾を防ぐ。倒すとガードをドロップ",
    icon: '<circle cx="0" cy="3" r="9" fill="none" stroke="#2d7bff" stroke-width="3"/><path d="M-13 -6 A14 14 0 0 1 13 -6" fill="none" stroke="#9fd0ff" stroke-width="4"/>',
    movement: "guardianChase", attack: "none", speed: [72, 94], rotMode: "face",
    turnSpeed: 2.6
  },
  bomber: { // ボマー：丸。近づくと点滅して自爆し、周囲を巻き込む（耐久は2倍の2／移動速度は20%上げた）
    shape: "circle", color: "#ff2a2a", r: 15, hp: 2, score: 200,
    name: "ボマー", desc: "近づくと点滅して自爆（爆発半径130）",
    icon: '<circle cx="0" cy="0" r="12" fill="none" stroke="#ff2a2a" stroke-width="3"/><circle cx="0" cy="0" r="4" fill="#ff2a2a"/>',
    movement: "bomberChase", attack: "none", speed: [110, 142], rotMode: "none"
  },
  froster: { // フロスター：雪の結晶。ボマーと同じ挙動・速さで起爆するが、ダメージはなく凍結エリアを残す
    shape: "snowflake", color: "#7fd8ff", r: 16, hp: 2, score: 200,
    name: "フロスター", desc: "自爆・撃墜どちらでも起爆し、凍結エリア（半径230・6秒・移動×0.45、ダメージなし）を残す",
    icon: '<path d="M0 -13 L2.7 -4.7 L11.3 -6.5 L5.5 0 L11.3 6.5 L2.7 4.7 L0 13 L-2.7 4.7 L-11.3 6.5 L-5.5 0 L-11.3 -6.5 L-2.7 -4.7 Z" fill="none" stroke="#7fd8ff" stroke-width="2.5"/>',
    movement: "bomberChase", attack: "none", speed: [110, 142], rotMode: "spin"
  },
  sniper: { // スナイパー：細長い矢じり。間合いを保ち（距離維持）、照準線で予告してから高速弾を撃つ（狙撃）
    shape: "arrowhead", color: "#b6ff2e", r: 14, hp: 1.5, score: 250,
    name: "スナイパー", desc: "間合い430、照準線0.75秒の予告のあと高速弾。倒すとスナイパー型子機をドロップ",
    icon: '<path d="M0 -15 L6 9 L0 3 L-6 9 Z" fill="none" stroke="#b6ff2e" stroke-width="2.5"/>',
    movement: "keepDistance", attack: "snipe", speed: [150, 178], rotMode: "face"
  },
  amp: { // アンプ：ピンクのリング。攻撃せず漂い、パルスで周囲の敵を強化する支援型（自身はバフを受けない）
    shape: "ring", color: "#ff5fc8", r: 16, hp: 2.5, score: 300,
    name: "アンプ", desc: "2.8秒ごとにパルス（半径260）で周囲の敵を強化（移動+20%・3秒、ダメージ無効0.5秒）。倒すとブースターをドロップ",
    icon: '<circle cx="0" cy="0" r="10" fill="none" stroke="#ff5fc8" stroke-width="5"/>',
    movement: "drift", attack: "pulse", speed: [70, 88], rotMode: "spin",
    fireInterval: [2.8, 2.8] // パルスの間隔（AMP_PULSE_INTERVAL と同値）
  },
  healer: { // ヒーラー：濃いマゼンタのトゲ状の縁取り＋黒い十字。距離を保ちながら、1秒ごとに近くの味方を回復する支援型
    shape: "healer", color: "#c2187a", r: 16, hp: 2.5, score: 350,
    name: "ヒーラー", desc: "自機と距離を保ち、1秒ごとに周囲280pxで最も近い味方を最大5体、最大HPの20%回復する",
    icon: '<path d="M0 -13 L2.7 -10.1 L6.5 -11.3 L7.4 -7.4 L11.3 -6.5 L10.1 -2.7 L13 0 L10.1 2.7 L11.3 6.5 L7.4 7.4 L6.5 11.3 L2.7 10.1 L0 13 L-2.7 10.1 L-6.5 11.3 L-7.4 7.4 L-11.3 6.5 L-10.1 2.7 L-13 0 L-10.1 -2.7 L-11.3 -6.5 L-7.4 -7.4 L-6.5 -11.3 L-2.7 -10.1 Z" fill="none" stroke="#c2187a" stroke-width="2.6"/><path d="M0 -5.5 V5.5 M-5.5 0 H5.5" fill="none" stroke="#160510" stroke-width="3.4"/>',
    movement: "healerKeep", attack: "heal", speed: [60, 60], rotMode: "none",
    fireInterval: [1.0, 1.0] // 回復の間隔（HEALER_INTERVAL と同値）
  },
  arc: { // アーク：白黄色の小さなオーブ。3体セットで三角形を作り、回転＋伸縮しながら電気を張って迫る
    shape: "orb", color: "#ffe66d", r: 11, hp: 4, score: 150,
    name: "アーク", desc: "3体セットで出現。回転＋伸縮する三角形の電気に触れると-10。2体で直線の電気、1体になると電気が消えて突撃する",
    icon: '<circle cx="0" cy="0" r="8" fill="none" stroke="#ffe66d" stroke-width="3"/><circle cx="0" cy="0" r="2.6" fill="#ffe66d"/>',
    movement: "arcOrbit", attack: "none", speed: [75, 75], rotMode: "none" // 中心の移動速度（ARC_CENTER_SPEED と同値）
  },
  stepper: { // ステッパー：バイオレットの十字。上下左右にだけ決まった歩幅でカクカク進む（基本の敵として序盤から出現。耐久は倍の1.5＝6発）
    shape: "cross", color: "#a06bff", r: 13, hp: 1.5, score: 150,
    name: "ステッパー", desc: "上下左右にだけ、個体ごとの歩幅（56〜84px）を素早く進んでは止まる。射撃なし",
    icon: '<path d="M-4 -12 H4 V-4 H12 V4 H4 V12 H-4 V4 H-12 V-4 H-4 Z" fill="none" stroke="#a06bff" stroke-width="2.6"/>',
    movement: "step", attack: "none", speed: [0, 0], rotMode: "none" // 移動は歩幅と時間で決まる（step部品側で計算）
  }
};

/* ============================================================
   敵図鑑（タイトル画面）：上の ENEMY_TYPES 定義から自動生成する。
   名前・アイコン・説明は定義の name / icon / desc、耐久（発数）と
   スコアは hp / score から換算するので、図鑑だけが古い数値に
   なることはない。ボスは config.js の BOSS_* から組み立てる。
   ============================================================ */
var ENEMY_ZUKAN_ORDER = ["square", "diamond", "hexagon", "darter", "splitter", "tank", "spiral", "guardian", "bomber", "froster", "sniper", "amp", "healer", "arc", "stepper"];
function zukanFmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function zukanMulText(v) { return v === Math.floor(v) ? v.toFixed(1) : String(v); }
function zukanFigureHtml(icon, name, stat, desc) {
  return '<figure><svg viewBox="-20 -20 40 40">' + icon + '</svg>' +
    '<figcaption><span class="lg-name">' + name + '</span>' +
    '<span class="lg-stat">' + stat + '</span>' +
    '<span class="lg-desc">' + desc + '</span></figcaption></figure>';
}
// スプリッター系統は図鑑では1項目にまとめる：系統全体（親1→子2→孫4→
// ひ孫8）を全て倒し切った場合の合計（発数・スコア）と、世代ごとの
// 内訳を、敵定義の nextType チェーンと hp / score から組み立てる。
function zukanSplitterHtml() {
  var t = ENEMY_TYPES.splitter;
  var counts = 1, totHits = 0, totScore = 0, parts = [], gens = 0;
  var cur = "splitter";
  while (cur) {
    var ct = ENEMY_TYPES[cur];
    var hits = Math.round(ct.hp / BULLET_DAMAGE);
    totHits += hits * counts;
    totScore += ct.score * counts;
    parts.push(hits + "発・" + ct.score + "点" + (counts > 1 ? "×" + counts : ""));
    gens++;
    counts *= 2;
    cur = ct.nextType || null;
  }
  var desc = "倒すと2体に分裂（全" + gens + "世代）。内訳：" + parts.join(" → ");
  return zukanFigureHtml(t.icon, t.name, "合計" + totHits + "発 ・ " + zukanFmtNum(totScore) + "点", desc);
}
function buildEnemyLegend() {
  var host = document.getElementById("enemy-legend");
  if (!host) return;
  var html = "";
  for (var i = 0; i < ENEMY_ZUKAN_ORDER.length; i++) {
    var key = ENEMY_ZUKAN_ORDER[i];
    if (key === "splitter") { html += zukanSplitterHtml(); continue; } // 系統は1項目に統合
    var t = ENEMY_TYPES[key];
    var hits = Math.round(t.hp / BULLET_DAMAGE); // 通常弾1発＝BULLET_DAMAGE ダメージ換算
    html += zukanFigureHtml(t.icon, t.name, hits + "発 ・ " + t.score + "点", t.desc);
  }
  // ボス《ペルマフロスト》：ステータスは BOSS_*（config.js）から組み立てる
  var bossStat = "本体HP" + BOSS_CORE_HP + " ・ 砲塔HP" + BOSS_TURRET_HP;
  var bossDesc = "砲塔2機残存で被ダメージ×" + zukanMulText(BOSS_BODY_DMG_MUL[2]) +
    "、1機で×" + zukanMulText(BOSS_BODY_DMG_MUL[1]) +
    "、0機で×" + zukanMulText(BOSS_BODY_DMG_MUL[0]) +
    "。砲塔は各" + zukanFmtNum(BOSS_SCORE_TURRET) + "点、処刑フェイズの残骸HP" + BOSS_EXEC_HP +
    "、撃破で" + zukanFmtNum(BOSS_SCORE_FINAL) + "点";
  html += zukanFigureHtml(BOSS_ZUKAN_ICON, "ボス《ペルマフロスト》", bossStat, bossDesc);
  host.insertAdjacentHTML("beforeend", html);
}
var BOSS_ZUKAN_ICON = '<polygon points="6,-14 14,-6 14,6 6,14 -6,14 -14,6 -14,-6 -6,-14" fill="none" stroke="#7fd8ff" stroke-width="3"/><circle cx="0" cy="0" r="3.5" fill="#7fd8ff"/>';
buildEnemyLegend();
