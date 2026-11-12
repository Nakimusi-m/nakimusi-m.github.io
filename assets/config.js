"use strict";
/* ============================================================
   NEON STRIKER 設定表（config.js）
   バランス数値はすべてここに集約する。「速さを○%変える」
   「耐久を上げる」といった調整は、この表と enemies.js の
   敵定義表の数値を変えるだけで済むようにしてある。
   ============================================================ */

// ---- 座標系 ----
// 画面（カメラが写す範囲）の論理サイズ
var VIEW_W = 960, VIEW_H = 540;
// ワールド全体：カメラ範囲の面積4倍（縦横2倍ずつ）
var WORLD_W = VIEW_W * 2, WORLD_H = VIEW_H * 2;
// 敵の出現距離（画面の対角半分より少し外側）
var SPAWN_R = Math.sqrt(VIEW_W * VIEW_W + VIEW_H * VIEW_H) / 2 + 70;

// 動的解像度の段階（view.js が参照）
var DPR_STEPS = [2, 1.5, 1.25, 1];

// ---- 自機・弾・オーバードライブの基本性能 ----
var EBULLET_SPEED = 250;
var PLAYER_SPEED = 308;
var PLAYER_BULLET_SPEED = 640;
// 自機の射撃仕様：ツインノズル（2本同時発射）・連射速度2倍・1発のダメージ1/4
var FIRE_INTERVAL = 0.0725; // 発射間隔（従来0.145sの半分）
var BULLET_DAMAGE = 0.25;   // 1発のダメージ（従来1の1/4。敵HPは小数で管理）
var NOZZLE_OFFSET = 7;      // ノズルの左右間隔（進行方向と直角方向のずれ）
var NOZZLE_OFFSETS = [-NOZZLE_OFFSET, NOZZLE_OFFSET];
// ---- オーバードライブ ----
// 敵を倒すとゲージが貯まり、満タンで自動発動。約8秒間だけ攻撃が
// 強化される（ノズル4本・ダメージ2倍・貫通・連射約20%短縮・弾大型化・
// 移動速度約+25%・ガーディアンの盾も貫通）。発動中は貯まらず、
// ゲージは残り時間表示になり、終了で0に戻る。
var OD_DURATION = 8;        // 持続時間（秒）
var OD_BULLET_SPEED_MUL = 3; // 発動中は弾速が通常の3倍（640→1920）
var OD_NOZZLE_OFFSETS = [-11, -3.7, 3.7, 11]; // 発動中は左右2対＝4本
// 各ノズルの前方オフセット（機体中心から機首方向への距離）。
// 端の2本だけ少し後ろ（20→13）から出すことで、4発が横一列に
// 揃わず、内側の対が少し前に出た立体感のある並びになる。
var NOZZLE_FORWARD = [20, 20];
var OD_NOZZLE_FORWARD = [13, 20, 20, 13];
// マズルフラッシュの貼り位置（自機ローカル座標：銃口の先）
var MUZZLE_POS = [[-7, -20], [7, -20]];
var OD_MUZZLE_POS = [[-11, -16], [-3.7, -21], [3.7, -21], [11, -16]];
// 撃破時のゲージ増加量（敵の大きさに比例。スプリッターは世代ごとに小さく）
var OD_GAIN = {
  square: 4, diamond: 5, hexagon: 12, darter: 5,
  splitter: 8, splitter2: 6, splitter3: 4, splitlet: 3,
  tank: 30, spiral: 12, guardian: 10, bomber: 6,
  froster: 6, sniper: 7, amp: 8
};

// ---- 演出オブジェクトの同時発生上限（軽量化） ----
var MAX_PARTICLES = 220, MAX_SHARDS = 110, MAX_RINGS = 24, MAX_SPARKS = 90, MAX_POPUPS = 24;

// ---- ツインスティック入力 ----
var STICK_R = 56;      // スティックの最大傾き（論理px）
var STICK_DEAD = 0.16; // 移動のデッドゾーン
var AIM_DEAD = 0.3;    // 照準・射撃のデッドゾーン

// ---- ボマーの爆発 ----
var BOMBER_RADIUS = 130, BOMBER_PLAYER_DMG = 35, BOMBER_ENEMY_DMG = 3;

// ---- 自機・被弾ダメージ ----
var PLAYER_MAX_HP = 100;
var ENEMY_BULLET_DMG = 10; // 敵弾の基本ダメージ（拡散弾・回転弾幕は半分の5）
var SPREAD_DMG = 5, SPIRAL_DMG = 5;
var CONTACT_DMG = 25;      // 敵本体との衝突ダメージ
var PLAYER_INVINCIBLE_TIME = 1.0; // 被弾後の無敵時間（秒）

// ---- オーバードライブの倍率（基本性能は上の表、発動中の倍率はここ） ----
var OD_MOVE_SPEED_MUL = 1.25;    // 移動速度 約+25%
var OD_FIRE_INTERVAL_MUL = 0.8;  // 連射間隔 約20%短縮
var OD_DAMAGE_MUL = 2;           // ダメージ2倍
var OD_BULLET_R = 5, BULLET_R = 3.2; // 弾の当たり判定半径（発動中／通常）
var OD_BULLET_SIZE_MUL = 1.6;    // 発動中の弾の見た目の大きさ

// ---- ダーター（dash部品）の数値 ----
var DASH_TRIGGER_DIST = 175;     // この距離まで近づくと予告に入る
var DASH_TELEGRAPH_TIME = 0.45;  // 予告の長さ（秒）
var DASH_SPEED = 1180;           // 突進速度
var DASH_TIME = 0.36;            // 突進の持続（秒）
var DASH_RECOVER_TIME = 0.65;    // 突進後の硬直（秒）
var DASH_RECOVER_SPEED_MUL = 0.4;
var DASH_COOLDOWN = [0.5, 1.1];        // 再突進までの間隔（ランダム範囲）
var DASH_INITIAL_COOLDOWN = [0.4, 1.0]; // 出現直後の初回クールダウン

// ---- ボマーの数値 ----
var BOMBER_FUSE_TIME = 0.85;     // 自爆カウントダウンの長さ（秒）
var BOMBER_SLOW_FACTOR = 0.9;    // 爆発直前に元の速さの約1割まで落ちる
var BOMBER_TRIGGER_DIST = 95;    // この距離まで近づくと点滅開始

// ---- フロスターの凍結エリア ----
// 起爆（自爆・撃墜どちらでも）で発生し、持続時間の間残る。
// 中にいる自機と敵はすべて移動速度が FROST_SLOW 倍になる
// （ダーターの突進も含む。弾の速さ・発射間隔は変わらない）。
// エリアが重なっても倍率は変わらない（重複しない）。
var FROST_RADIUS = 230;          // 凍結エリアの半径（ボマーの爆発半径より大きい）
var FROST_DURATION = 6;          // 持続時間（秒）
var FROST_SLOW = 0.45;           // エリア内の移動速度倍率

// ---- スナイパーの数値 ----
var SNIPER_RANGE = 430;          // 自機と保つ間合い（距離維持部品）
var SNIPE_TELEGRAPH_TIME = 0.75; // 照準線の予告時間（秒）
var SNIPE_LOCK_TIME = 0.2;       // 発射の何秒前から照準が固定されるか（この間は自機を追わない）
var SNIPER_BULLET_SPEED_MUL = 2.2; // 狙撃弾は通常の敵弾の約2.2倍速（ダメージは通常弾と同じ-10）
var SNIPE_COOLDOWN = 2.4;        // 発射後のクールダウン（秒）

// ---- アンプの数値 ----
var AMP_RANGE = 330;             // 自機からこの距離あたりを漂う（drift部品）
var AMP_PULSE_INTERVAL = 2.8;    // パルスの間隔（秒）。敵定義（enemies.js の amp.fireInterval）と同値に保つ
var AMP_PULSE_RADIUS = 260;      // パルスの届く半径
var AMP_SPEED_BUFF_MUL = 1.2;    // バフ中の移動速度 +20%
var AMP_SPEED_BUFF_TIME = 3;     // 速度バフの持続（秒）
var AMP_INVULN_TIME = 0.5;       // ダメージ無効化の持続（秒）。通常弾は消滅し、オーバードライブ弾だけ貫通する

// ---- 攻撃部品の数値 ----
var AIMED_SPEED_BONUS = 25;      // 自機狙い弾は基本速度+25
var SPREAD_ANGLE = 0.3;          // 拡散弾の広がり（rad）
var SPIRAL_ANGLE_STEP = 0.62;    // 回転弾幕の発射角の進み（rad）
var SPIRAL_SPEED_DELTA = -30;    // 回転弾幕の弾速は基本速度-30

// ---- 交戦距離 ----
var ATTACK_RANGE = 660;          // 敵が撃ち始める距離
var DESPAWN_DIST = 1150;         // 自機からこの距離を超えた敵は消す

// ---- スプリッター分裂の数値 ----
var SPLIT_OFFSET = 34;           // 子を親から左右へ離す距離（団子化防止）
var SPLIT_DRIFT_SPEED = 130;     // 分裂直後の外向きの押し出し速度
var SPLIT_DRIFT_TIME = 0.5;      // 押し出しの持続（秒）

// ---- 生成ディレクターの配分 ----
var DIA_PROB = 0.34;             // 既存枠のうち菱形の割合
var SQUAD_PROB = 0.3;            // 四角が小隊で出る確率
var DARTER_GROUP = 3;            // ダーターの同時出現数
var DARTER_FAR_DIST = 280;       // ダーター同士の出現点の最小間隔
var NEW_MIX = { tank: 0.06, darter: 0.18, splitter: 0.30, spiral: 0.41, guardian: 0.53, bomber: 0.65, froster: 0.76, sniper: 0.88 }; // 新敵枠の内訳（累積）。残りはアンプ。タンクは従来どおりレア、他はほぼ均等

// ---- 難易度カーブ（computeDiff が参照） ----
var DIFF_RAMP_TIME = 120;        // この秒数でほぼ上限（2分）
var DIFF_SPAWN_START = 0.92, DIFF_SPAWN_DROP = 0.58; // 出現間隔 0.92s → 0.34s
var DIFF_SPEED_MUL_MAX = 0.55;   // 敵速の上昇 +55%
var DIFF_HEX_START = 0.10, DIFF_HEX_GAIN = 0.13;     // 射撃敵の割合
var DIFF_AIMED_RAMP_TIME = 90, DIFF_AIMED_MAX = 0.55; // 自機狙いの割合
var DIFF_NEW_START = 0.12, DIFF_NEW_GAIN = 0.16;     // 新敵の割合 12% → 28%

// ---- 演出の数値（衝撃波リング・シェイク） ----
var RING_BASE_SPEED = 2600, RING_SPEED_PER_TIER = 800;  // 耐久1で2600、耐久3で3400
var RING_BASE_WIDTH = 25, RING_WIDTH_PER_TIER = 10;     // 耐久1で太さ25、耐久3で35
var RING_LIFE = 0.38;
var SHARD_SIZE_MUL = 10;         // 破片の大きさの倍率
var SHAKE_HP1 = 11, SHAKE_HP3 = 30; // 撃破シェイク：耐久1で11、耐久3で30
