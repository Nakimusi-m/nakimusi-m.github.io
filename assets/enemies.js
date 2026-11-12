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
    movement: "chase", attack: "none", speed: [90, 122], rotMode: "spin"
  },
  diamond: { // 菱形：揺れながら追跡・撃たない（移動速度-20%／耐久は半分の0.5／揺れ幅は約2倍に拡大）
    shape: "diamond", color: "#b26bff", r: 13, hp: 0.5, score: 150,
    movement: "swayChase", attack: "none", speed: [77, 104],
    swayAmp: [48, 84], swayFreq: [2.2, 3.2], rotMode: "face"
  },
  hexagon: { // 六角形：ゆっくり追跡・撃ってくる・硬い
    shape: "hexagon", color: "#ff4040", r: 19, hp: 3, score: 300,
    movement: "chase", attack: "aimed", speed: [60, 84],
    fireInterval: [1.5, 2.1], rotMode: "spin"
  },
  darter: { // ダーター：小さな三角。近づくと予告のあと高速突進
    // 基本移動速度（接近時）は従来から40%下げた。突進速度は従来の2倍のまま（dash側で1180）。予告時間は不変。
    shape: "triangle", color: "#ff8c1a", r: 12, hp: 0.5, score: 120,
    movement: "dash", attack: "none", speed: [194, 254], rotMode: "face"
  },
  splitter: { // スプリッター（第0世代）：五角形。倒すと2体に分裂し、最大3世代まで続く
    // 耐久は従来の2倍の4（命中16発分）。移動速度は従来から約30%下げた。
    shape: "pentagon", color: "#3dff7a", r: 17, hp: 4, score: 250,
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 0, nextType: "splitter2"
  },
  splitter2: { // スプリッター第1世代：少し小さく、耐久2
    shape: "pentagon", color: "#55ff8c", r: 14, hp: 2, score: 150,
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 1, nextType: "splitter3"
  },
  splitter3: { // スプリッター第2世代：さらに小さく、耐久1
    shape: "pentagon", color: "#74ffab", r: 12, hp: 1, score: 80,
    movement: "chase", attack: "none", speed: [55, 71], rotMode: "spin",
    gen: 2, nextType: "splitlet"
  },
  splitlet: { // スプリッター第3世代（最終）：小丸。ここで分裂は終わる
    shape: "circle", color: "#7dff9e", r: 9, hp: 0.25, score: 50,
    movement: "chase", attack: "none", speed: [138, 168], rotMode: "none",
    gen: 3
  },
  tank: { // タンク：大きな円。高耐久で3方向拡散弾（威力は控えめ）
    shape: "circle", color: "#e8ecf2", r: 28, hp: 10, score: 800,
    movement: "chase", attack: "spread", speed: [38, 52],
    fireInterval: [0.9, 1.2], rotMode: "none" // 発射間隔は従来の半分（レート2倍）。弾の威力（-5）は不変
  },
  spiral: { // スパイラル：星形。回転弾幕（威力は控えめ）
    shape: "star", color: "#ffd51f", r: 17, hp: 3, score: 400,
    movement: "chase", attack: "spiral", speed: [62, 80],
    fireInterval: [0.13, 0.17], rotMode: "spin"
  },
  guardian: { // ガーディアン：正面の盾で正面からの弾を防ぐ
    // 盾の旋回速度（turnSpeed, rad/秒）は従来の半分に抑え、回り込めるようにした
    shape: "guardian", color: "#2d7bff", r: 17, hp: 2, score: 350,
    movement: "guardianChase", attack: "none", speed: [72, 94], rotMode: "face",
    turnSpeed: 2.6
  },
  bomber: { // ボマー：丸。近づくと点滅して自爆し、周囲を巻き込む（耐久は2倍の2／移動速度は20%上げた）
    shape: "circle", color: "#ff2a2a", r: 15, hp: 2, score: 200,
    movement: "bomberChase", attack: "none", speed: [110, 142], rotMode: "none"
  },
  froster: { // フロスター：雪の結晶。ボマーと同じ挙動・速さで起爆するが、ダメージはなく凍結エリアを残す
    shape: "snowflake", color: "#7fd8ff", r: 16, hp: 2, score: 200,
    movement: "bomberChase", attack: "none", speed: [110, 142], rotMode: "spin"
  },
  sniper: { // スナイパー：細長い矢じり。間合いを保ち（距離維持）、照準線で予告してから高速弾を撃つ（狙撃）
    shape: "arrowhead", color: "#b6ff2e", r: 14, hp: 1.5, score: 250,
    movement: "keepDistance", attack: "snipe", speed: [150, 178], rotMode: "face"
  },
  amp: { // アンプ：ピンクのリング。攻撃せず漂い、パルスで周囲の敵を強化する支援型（自身はバフを受けない）
    shape: "ring", color: "#ff5fc8", r: 16, hp: 2.5, score: 300,
    movement: "drift", attack: "pulse", speed: [70, 88], rotMode: "spin",
    fireInterval: [2.8, 2.8] // パルスの間隔（AMP_PULSE_INTERVAL と同値）
  }
};
