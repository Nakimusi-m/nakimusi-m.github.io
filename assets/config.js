"use strict";
/* ============================================================
   NEON STRIKER 設定表（config.js）
   バランス数値はすべてここに集約する。「速さを○%変える」
   「耐久を上げる」といった調整は、この表と enemies.js の
   敵定義表の数値を変えるだけで済むようにしてある。
   ------------------------------------------------------------
   セクション目次（上から順に）：
     座標系／自機・弾・オーバードライブ基本性能／演出上限／
     入力／ボマー爆発／被弾ダメージ／OD倍率／ダーター／
     ボマー／フロスター凍結／スナイパー／アンプ／攻撃部品／
     交戦距離／スプリッター分裂／生成ディレクター／ヒーラー／
     アーク／ステッパー／難易度／
     難易度カーブ／ボス《ペルマフロスト》／子機（ドローン）／
     OD見直し（ブースター連動）／演出（リング・シェイク）
   難易度倍率の適用箇所は game.js の diffSpeed に集約してある。
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
  froster: 6, sniper: 7, amp: 8,
  healer: 10, arc: 6, stepper: 5,
  deadeye: 16, aegis: 20, cyclone: 24
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

// ---- 上位種（デッドアイ／イージス／サイクロン）の数値 ----
// 元の敵の出現抽選のうち、ELITE_UNLOCK_TIME 以降は ELITE_UPGRADE_PROB の
// 割合で対応する上位種に格上げされる（ボス戦中は通常湧き自体が止まる）。
var ELITE_UNLOCK_TIME = 150;     // 格上げが始まる経過時間（秒）
var ELITE_UPGRADE_PROB = 0.25;   // 格上げ確率（対象はスパイラル／ガーディアン／スナイパー）
// デッドアイ（スナイパー上位種）：間合い480、予告0.6秒、高速弾2連射。
// サイクル全体（予告＋連射間隔＋クールダウン）は元の約0.7倍で繰り返す：
// 元＝0.75＋2.4＝3.15秒 → 0.7倍＝2.205秒。0.6＋0.15＋1.455＝2.205秒に一致。
var DEADEYE_RANGE = 480;
var DEADEYE_TELEGRAPH_TIME = 0.6;
var DEADEYE_BURST_COUNT = 2;
var DEADEYE_BURST_INTERVAL = 0.15;
var DEADEYE_LOCK_TIME = 0.14;    // 発射前に照準が固定される時間（元の0.2の0.7倍）
var DEADEYE_COOLDOWN = 1.455;    // 発射後のクールダウン（サイクル全体が元の0.7倍になる値）
// ガーディアン系の盾：正面の半角（この角度内から当たった弾を防ぐ）。
// オリジナルは半角90°（正面半分）。イージスは角度が元の1.5倍＝半角135°。
var GUARDIAN_SHIELD_HALF = Math.PI / 2;
var AEGIS_SHIELD_HALF = Math.PI * 0.75;
// イージスの防御オーラ：半径内の他の敵の被ダメージを20%カット（重複なし）
var AEGIS_AURA_RADIUS = 200;
var AEGIS_AURA_CUT = 0.2;
// サイクロン（スパイラル上位種）：自機を中心に公転する。
var CYCLONE_ORBIT_RADIUS = 300;  // 公転半径（px）
var CYCLONE_ORBIT_PERIOD = 15;   // 公転周期（秒／1周）
// 公転の接線速度＝2π×半径÷周期≒125.7px/秒（難易度倍率は生成時に適用）
var CYCLONE_ORBIT_SPEED = Math.PI * 2 * CYCLONE_ORBIT_RADIUS / CYCLONE_ORBIT_PERIOD;
// 子機ドロップ率：元の4種（スパイラル／ガーディアン／スナイパー／アンプ）は20%。
// 上位種3体は確定（100%）。タンクはドロップなし。
var DRONE_DROP_PROB = 0.2;

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
// 四角小隊の出現位置の分散：メンバーは出現点からこの距離の範囲に散らし、
// 互いに SQUAD_MIN_DIST 以上離す（団子状に固まって出ないようにする）
var SQUAD_SPREAD_MIN = 70, SQUAD_SPREAD_MAX = 150;
var SQUAD_MIN_DIST = 64;
// 四角同士の分離：これより近づいた四角同士を弱く押し離し、追跡中も
// 団子状に密集し続けないようにする（追跡を邪魔しない弱さに抑える）
var SQUARE_SEP_DIST = 48;        // 分離が働く距離（四角の直径30＋余裕）
var SQUARE_SEP_SPEED = 110;      // 押し離しの速さ（重なりが深いほど強い）
var DARTER_GROUP = 3;            // ダーターの同時出現数
var DARTER_FAR_DIST = 280;       // ダーター同士の出現点の最小間隔
var NEW_MIX = { tank: 0.06, darter: 0.18, splitter: 0.30, spiral: 0.41, guardian: 0.53, bomber: 0.65, froster: 0.76, sniper: 0.88 }; // 新敵枠の内訳（累積）。残りはアンプ。タンクは従来どおりレア、他はほぼ均等

// ---- 新敵の出現配分 ----
// 新敵枠（newProb）のうち、この割合をヒーラー／アークが分け合う。
// 残りは従来の NEW_MIX の内訳どおりに振り分けるので、既存の敵同士の
// 比率は一切変わらない。解放は経過時間制：ヒーラー60秒〜／アーク90秒〜
// （各セクション参照）。ステッパーは基本の敵（下記）に移ったため、
// ここには含まない。
var NEW_TRIO_PROB = 0.3;
// ステッパーは四角・菱形と同じ「基本の敵」：開始直後から、基本枠の
// うちこの割合（絶対値）で出現する（時間による解放はなし）。
var STEPPER_PROB = 0.12;

// ---- ヒーラー（回復する敵）の数値 ----
// 1秒ごとに周囲の味方へ回復ビームを送る支援型。自機とは距離を保つ。
var HEALER_UNLOCK_TIME = 60;     // 出現が解放される経過時間（秒。中盤以降）
var HEALER_RANGE = 280;          // 回復ビームの届く半径
var HEALER_INTERVAL = 1.0;       // 回復の間隔（秒）。敵定義（enemies.js の healer.fireInterval）と同値に保つ
var HEALER_FRACTION = 0.2;       // 1回の回復量＝対象の最大HPの20%
var HEALER_MAX_TARGETS = 5;      // 1回に回復できる味方の最大数（近い順）
var HEALER_KEEP_MIN = 280;       // 自機と保つ距離の下限（これより近ければ下がる）
var HEALER_KEEP_MAX = 340;       // 自機と保つ距離の上限（これより遠ければ寄る）
var HEALER_BEAM_LIFE = 0.35;     // 回復ビームの表示時間（秒）

// ---- アーク（電気を帯びた敵）の数値 ----
// 3体セットで三角形を作り、回転＋伸縮しながら中心ごと自機へ迫る。
var ARC_UNLOCK_TIME = 90;        // 出現が解放される経過時間（秒。中盤〜終盤）
var ARC_GROUP_SIZE = 3;          // 1回の出現で出す個体数
var ARC_CENTER_SPEED = 75;       // 中心点の移動速度（敵定義 arc.speed と同値。難易度倍率は生成時に diffSpeed で適用）
var ARC_SOLO_SPEED = 110;        // 1体だけになった時の突撃速度（中心速度に対する比率で適用し、倍率を保つ）
var ARC_ROT_PERIOD = 2.8;        // 三角形の回転周期（秒／1回転）
var ARC_PULSE_PERIOD = 3.2;      // 三角形の伸縮周期（秒）
var ARC_RADIUS_MIN = 82.5;       // 伸縮：中心から各個体までの距離の下限（55の1.5倍。一辺およそ143px）
var ARC_RADIUS_MAX = 285;        // 伸縮：中心から各個体までの距離の上限（95の3倍。一辺およそ494px）
var ARC_ELEC_DMG = 10;           // 電気に触れた時のダメージ（被弾後無敵1秒は通常どおり適用）

// ---- ステッパー（カクカク移動する敵）の数値 ----
// 上下左右にだけ、決まった歩幅を素早く進んでは止まる、を繰り返す。
// 分類は四角・菱形と同じ基本の敵で、開始直後から出現する（上の
// STEPPER_PROB を参照。時間による解放はない）。
var STEPPER_STEP_MIN = 56;       // 歩幅の下限（px。個体ごとにスポーン時決定し固定）
var STEPPER_STEP_MAX = 84;       // 歩幅の上限（px）
var STEPPER_MOVE_TIME = 0.12;    // 1回の移動にかかる時間（秒。難易度倍率で短縮される）
var STEPPER_PAUSE_TIME = 0.45;   // 移動と移動の間の静止時間（秒）
var STEPPER_SIDE_PROB = 0.3;     // 方向決定で横へずれる確率（残りは自機へ近づく方向）
var STEPPER_GHOST_LIFE = 0.5;    // 移動時の残像（ゴースト）の表示時間（秒。軌跡が読み取れるよう従来の2倍）
var STEPPER_GHOST_INTERVAL = 0.03; // 残像を残す間隔（秒）
var STEPPER_GHOST_MAX = 48;      // 残像の同時発生上限（軽めに抑える）

// ---- 難易度（タイトル／リトライ画面で選択。デフォルトはノーマル） ----
// 効果は「敵の移動速度」と「敵弾の速度」への倍率のみ（ボスの移動・
// 砲塔弾・バースト・回転弾幕・氷結弾の飛翔速度にも同じ倍率が掛かる）。
// 出現間隔・HP・ダメージ量・自機性能・スコア計算は難易度で変えない。
var DIFFICULTY_DEFS = [
  { id: "veryeasy", label: "ベリーイージー", mul: 0.8 }, // 速度20%低下（減少量を半減：従来40%→20%）
  { id: "easy", label: "イージー", mul: 0.9 },           // 速度10%低下（減少量を半減：従来20%→10%）
  { id: "normal", label: "ノーマル", mul: 1.0 }          // 現状どおり
];

// ---- 難易度カーブ（computeDiff が参照） ----
var DIFF_RAMP_TIME = 120;        // 速さ・割合の上昇はこの秒数でほぼ上限（2分）
var DIFF_SPAWN_RAMP_TIME = 435;  // 出現間隔だけは緩やか：この秒数かけて下限へ（180秒時点の出現量が従来カーブの約半分になる）
var DIFF_SPAWN_START = 0.92, DIFF_SPAWN_DROP = 0.58; // 出現間隔 0.92s → 0.34s
var DIFF_SPEED_MUL_MAX = 0.55;   // 敵速の上昇 +55%
var DIFF_HEX_START = 0.10, DIFF_HEX_GAIN = 0.13;     // 射撃敵の割合
var DIFF_AIMED_RAMP_TIME = 90, DIFF_AIMED_MAX = 0.55; // 自機狙いの割合
var DIFF_NEW_START = 0.12, DIFF_NEW_GAIN = 0.16;     // 新敵の割合 12% → 28%

// ---- ボス「ペルマフロスト」 ----
// 時間制で登場する要塞ボス。本体（八角形）＋左右の大型砲塔2機。
// 登場スケジュール、段階ごとの攻撃、処刑フェイズの数値をここに集約する。
var BOSS_FIRST_TIME = 90;        // 初回登場（秒）。予告はこの3秒前から
var BOSS_INTERVAL = 120;         // 撃破後、次の登場までの間隔（秒）
var BOSS_WARN_TIME = 3;          // WARNING予告の長さ（秒）
var BOSS_BODY_R = 64;            // 本体の半径
var BOSS_TURRET_R = 40;          // 砲塔の半径（当たりやすく拡大。従来34）
var BOSS_TURRET_OFFSET = 104;    // 本体中心から砲塔中心までの距離
var BOSS_CORE_HP = 60;           // 本体HP（第1段階から削れ、第2段階へ持ち越す）
// 本体へのダメージ倍率：残っている砲塔の数で変わる（添字＝残存砲塔数）
// 2機残存で×0.25、1機で×0.5、0機（第2段階）で×1.0。
// 砲塔が残っていても本体を倒し切れる（HPの下限クランプは付けない）。
// そのまま処刑フェイズへ移行し、残っていた砲塔は無力化される（得点なし）。
var BOSS_BODY_DMG_MUL = [1.0, 0.5, 0.25];
var BOSS_TURRET_HP = 30;         // 砲塔HP（各）
var BOSS_EXEC_HP = 90;           // 処刑フェイズの裏HP
var BOSS_HP_MUL = 1.25;          // 2回目以降、登場ごとにHPがこの倍率で増える
var BOSS_SPEED = 54;             // 第1段階の移動速度
var BOSS_SPEED_P2 = 78;          // 第2段階は少し速くなる
var BOSS_KEEP_DIST = 380;        // 自機と保つ間合い
var BOSS_TURRET_FIRE_INTERVAL = 0.56; // 砲塔の拡散弾の発射間隔（秒）。バースト強化に合わせて発射レートを半分に（従来0.28）
var BOSS_TURRET_BULLET_SPEED = 255;   // 砲塔の弾速（従来の1.5倍）
var BOSS_TURRET_SWING_AMP = 0.7;      // 砲身スイングの振れ幅（rad、約±40°）
var BOSS_TURRET_SWING_PERIOD = 2.4;   // スイングの周期（秒）。左右で位相をずらす
// 砲塔の攻撃サイクル：拡散→チャージ（予告）→自機狙い5連バースト→拡散…
// 1門ごとに独立して回り、左右は半周期ずらして交互にバーストが来るようにする
var BOSS_TURRET_SPREAD_TIME = 2.6;  // 拡散フェイズの長さ（秒）
var BOSS_TURRET_CHARGE_TIME = 0.4;  // チャージ（発射停止・砲身が光る予告）の長さ（秒）
var BOSS_BURST_COUNT = 5;           // バーストの連射数
var BOSS_BURST_INTERVAL = 0.12;     // バースト各発の間隔（秒）
var BOSS_BURST_SPEED = 600;         // バースト弾の速さ（拡散弾の2倍超の高速弾。威力は拡散弾と同じ-5）
var BOSS_ICE_INTERVAL = 6.0;     // 第1段階の氷結弾の間隔（秒、遅め）
var BOSS_ICE_MIN_INTERVAL = 4.4; // 登場回数で短くなる下限（秒。第2段階の間隔より長く保つ）
var BOSS_ICE_P2_INTERVAL = 4.0;  // 第2段階の氷結弾の間隔（秒）。砲塔が無くなっても打ち続け、第1段階より短い
var BOSS_ICE_SCATTER_MIN = 130, BOSS_ICE_SCATTER_MAX = 230; // 氷結弾3発のうち2発は、目標点からこの距離だけランダムな向きに離れた点へ着弾する（向きは発ごとに独立）
var BOSS_ICE_RADIUS = 138;       // ボス氷結弾の凍結エリア半径（フロスターの230の60%）
var BOSS_ICE_SPEED = 330;        // 氷結弾の飛翔速度
var BOSS_ICE_DMG = 10;           // 氷結弾の直撃ダメージ
var BOSS_SUMMON_INTERVAL = 12;   // ダーター召喚の間隔（秒）
var BOSS_SUMMON_FIRST = 6;       // 登場後の初回召喚までの時間（秒）
var BOSS_SUMMON_COUNT = 5;       // 1回の召喚数
var BOSS_SUMMON_ALIVE_MAX = 2;   // 召喚ダーターがこの数以下なら召喚する
var BOSS_SPIRAL_INTERVAL = 0.24; // 第2段階の回転弾幕の発射間隔（秒）。バランス調整で従来の2倍
var BOSS_SPIRAL_SPEED = 322;     // 回転弾幕の弾速（従来の1.5倍。威力は拡散弾と同じ-5）
var BOSS_CHARGE_TELEGRAPH = 0.8; // 突進予告の長さ（秒）
var BOSS_CHARGE_SPEED = 285;     // 低速突進の速度
var BOSS_CHARGE_TIME = 0.85;     // 突進の持続（秒）
var BOSS_CHARGE_COOLDOWN = 3.4;  // 突進の間隔（秒）
var BOSS_SCORE_TURRET = 1000;    // 砲塔破壊のスコア
var BOSS_SCORE_FINAL = 5000;     // 処刑完了（大爆発）のスコア
var BOSS_HEAL = 20;              // 撃破報酬：自機HP回復量
var BOSS_EXEC_LIMIT = 12;        // 処刑フェイズでODタイマーを止める上限（秒）
var BOSS_QUIET_TIME = 3.5;       // 撃破後の静けさ（通常湧き再開まで、秒）
var BOSS_FINISH_FX_TIME = 0.8;   // 処刑完了時、大爆発の前に残骸の各所で小〜中爆発が連続する時間（秒）

// ---- 子機（ドローン） ----
// 役割ごとに複数機を所持できる（合計最大9機）。全機にHPがあり、
// 敵弾を体で防ぐが、尽きると機能停止し30秒で復帰する。
// OD発動では回復しない（修理はカプセル取得時の修理ルールで）。
var DRONE_HP = { attacker: 6, guard: 9, booster: 6, sniper: 6 }; // 役割ごとのHP（敵弾1発＝ダメージ1。ガードは3倍、他は従来の2倍）
var DRONE_REVIVE_TIME = 30;       // 機能停止から復帰までの時間（秒）
var DRONE_R = 10;                 // 子機の当たり判定半径
// 追従：所定の配置位置へ最高速度つきで移動する。最高速度は役割ごとに
// 差を持たせる（アタッカーが一番速く、ガードが一番遅い）。
// アタッカー320は自機の通常移動速度（308）を少しだけ上回るが、
// 近距離型として意図した値。ガード280は従来値283とほぼ同じで、
// 「少し遅れてついてくる」性格を残す。配置位置に近づくと距離に
// 比例して減速して滑らかに収まる。大きく引き離された時だけ上限を
// 上げて強めに寄せる（破綻防止、全役割共通）。
var DRONE_FOLLOW_SPEEDS = { attacker: 320, booster: 300, sniper: 290, guard: 280 }; // 役割ごとの追従の最高速度
var DRONE_FOLLOW_ARRIVE_R = 80;      // この距離以内では距離に比例して減速する
var DRONE_FOLLOW_CATCHUP_DIST = 420; // この距離を超えたら強めに寄せる
var DRONE_FOLLOW_CATCHUP_SPEED = 640; // 引き離された時の追従の最高速度
// アタッカー（オレンジ小三角／スパイラルがドロップ）
// 散弾型。配置は斜め前方の2枠のみ（後方2枠はスナイパーが使う）。
var DRONE_ATTACKER_MAX = 2;
var DRONE_ATTACKER_DIST = 58;     // 斜め前方の配置距離
var DRONE_ATTACKER_INTERVAL = 0.15; // 1機あたりの射撃間隔（秒）
var DRONE_ATTACKER_RANGE = 330;   // この距離内に敵がいるときだけ撃つ（従来380から短縮）
var DRONE_PELLETS = 5;            // 1射撃の粒数
var DRONE_PELLET_SPREAD = 0.42;   // 散弾の広がり（rad、約±24°）
var DRONE_PELLET_SPEED = 720;
var DRONE_PELLET_RANGE = 300;     // 粒の射程（飛距離で消える。従来360から短縮）
var DRONE_PELLET_DMG = 0.125;     // 粒1発のダメージ（従来0.25の半分）
// ガード（青い小盾／ガーディアンがドロップ）
var DRONE_GUARD_MAX = 2;
var DRONE_GUARD_DIST = 40;        // 斜め後方の配置距離（アタッカーより内側）
var DRONE_GUARD_SHIELD_R = 85;    // シールドの半径（106からさらに20%減≒84.8）
var DRONE_GUARD_CUT = 0.3;        // 圏内のガード1機につきダメージ30%カット
// シールドHP制：シールド自体に体力があり、敵弾1発で1減る（ボス弾も同じ）。
// 0になると割れて、DRONE_GUARD_SHIELD_REGEN 秒後に全回復で自動再展開する。
// ダメージ軽減が効くのはシールド展開中だけ。接触ダメージでは減らない。
var DRONE_GUARD_SHIELD_HP = 14;   // シールドの体力（敵弾14発で割れる。20から30%減）
var DRONE_GUARD_SHIELD_REGEN = 18; // 割れてから再展開までの時間（秒。従来6の3倍）
// ブースター（金の小リング／アンプがドロップ）
var DRONE_BOOSTER_MAX = 3;
var DRONE_BOOSTER_GAP = 30;       // 尾の間隔（px）。自機の向きの後ろ側に一列に連なる
// スナイパー（エメラルドの細長い菱形／敵スナイパーがドロップ）
// 配置は斜め後方の2枠。長射程の単発狙撃で、発射の少し前に
// 細い照準線を目標へ表示してから撃つ。貫通なし。
var DRONE_SNIPER_MAX = 2;
var DRONE_SNIPER_DIST = 58;       // 斜め後方の配置距離（アタッカーと同距離）
var DRONE_SNIPER_RANGE = 640;     // 射程：この距離内の最寄りの目標を狙う
var DRONE_SNIPER_DMG = 1.0;       // 1発のダメージ
var DRONE_SNIPER_INTERVAL = 1.1;  // 発射間隔（秒）
var DRONE_SNIPER_BULLET_SPEED = 900; // 弾速
var DRONE_SNIPER_BULLET_RANGE = 700; // 弾の飛距離（射程より少し長く）
var DRONE_SNIPER_AIM_TIME = 0.25; // 照準線を表示してから撃つまでの時間（秒）
// ドロップカプセル
var CAPSULE_LIFE = 10;            // カプセルの寿命（秒）。残り3秒で点滅
var CAPSULE_MAGNET_R = 70;        // 吸い寄せが始まる距離
var CAPSULE_PICKUP_R = 26;        // 取得判定の距離（自機中心から）
var CAPSULE_FALLBACK_SCORE = 300; // 満員かつ全機無傷の役割を拾った時の代替報酬（スコアのみ）
var BOSS_DRONE_FALLBACK_SCORE = 1000; // ボス報酬で全役割上限の時の代替スコア

// ---- オーバードライブ見直し（ブースター連動） ----
// ゲージ獲得：基本は現行の0.8倍。稼働ブースター1機につき+0.2倍（最大1.4倍）。
// 発動時間：8秒＋0.8秒×稼働ブースター数。ノズル：2＋稼働ブースター数。
// 連射・移動の上昇量：0機では現行の半分、3機で現行どおり（線形補間）。
// いずれも発動の瞬間の稼働ブースター数で固定される（ゲージ倍率のみ常時計算）。
var OD_GAIN_BASE_MUL = 0.8;
var OD_GAIN_PER_BOOSTER = 0.2;
var OD_TIME_PER_BOOSTER = 0.8;
var OD_FIRE_MUL_BASE = 0.9;       // ブースター0機：連射間隔×0.9（現行×0.8の半分の上昇）
var OD_MOVE_MUL_BASE = 1.125;     // ブースター0機：移動+12.5%（現行+25%の半分）

// ---- 演出強化パッケージ（見た目・音のみ。ゲーム数値は変えない） ----
var INTRO_TIME = 0.95;           // スタート時の READY→GO カウントイン（秒）
var INTRO_READY_TIME = 0.55;     // うち READY 表示の長さ（残りは GO）
var DYING_TIME = 0.8;            // ゲームオーバー時のスローモーション（秒）
var DYING_SCALE = 0.25;          // スローモーション中の時間倍率
var OVER_COUNT_TIME = 0.9;       // ゲームオーバー後のスコア・カウントアップ（秒）
var BIG_KILL_TYPES = { tank: 1, deadeye: 1, aegis: 1, cyclone: 1 }; // 大型撃破（ヒットストップ対象）
var BIG_KILL_HITSTOP = 0.045;    // 大型撃破のヒットストップ（秒）
var DMG_ARC_TIME = 0.55;         // 被弾方向の赤い弧の表示時間（秒）
var LOW_HP_THRESHOLD = 30;       // 低HPビネットが出るHP
var ARC_CRACKLE_RANGE = 350;     // アークの電気音が聞こえる距離
var ARC_CRACKLE_INTERVAL = [0.16, 0.3]; // 電気音の間引き間隔（ランダム範囲）
var DRONE_SPAWN_FX_TIME = 0.3;   // 新しい子機の組み上がり演出（秒）
var SHIELD_POP_TIME = 0.35;      // ガードのシールド再展開の膨らみ（秒）
var ENGINE_PARTICLE_RATE = 55;   // エンジン粒子の発生レート（個/秒・移動中のみ）
var RECORD_BANNER_TIME = 1.8;    // ゲーム中の NEW RECORD 表示（秒）

// ---- グリッド背景の演出（見た目のみ。ゲーム数値は変えない） ----
// 波紋：出来事の場所から光の輪がグリッド上を広がる
var GRID_RIPPLE_SPEED = 600;     // 輪の広がる速さ（px/秒）
var GRID_RIPPLE_MAX_R = 500;     // 輪の最大半径（px）
var GRID_RIPPLE_LIFE = 0.8;      // 輪の寿命（秒。600×0.8=480≒最大半径で消える）
var GRID_RIPPLE_MAX = 3;         // 同時に存在する輪の上限
// 歪み：大きな爆発の時だけグリッドがたわむ。規模（爆発半径）に比例する：
// 歪み半径＝爆発半径×1.8、たわみ量＝8×(爆発半径/130)^1.07、
// 持続＝爆発半径130で0.35秒→333で0.5秒の範囲で比例。
// 例：ボマー自爆（半径130）→歪み半径約234・たわみ約8px／
// ボス登場の衝撃波（半径250）→約450・約16px／
// 処刑の大爆発（半径333）→約600・約22px。
var GRID_DISTORT_RATIO = 1.8;    // 歪み半径＝爆発半径×この倍率
var GRID_DISTORT_REF_R = 130;    // たわみ量の基準になる爆発半径
var GRID_DISTORT_REF_AMP = 8;    // 基準爆発半径でのたわみ量（px）
var GRID_DISTORT_AMP_EXP = 1.07; // たわみ量の規模への追随（上の例に一致する指数）
var GRID_DISTORT_TIME_MIN = 0.35, GRID_DISTORT_TIME_MAX = 0.5; // 持続の範囲（秒）
var GRID_DISTORT_MAX = 4;        // 同時に存在する歪みの上限
var BOSS_SPAWN_BLAST_R = 250;    // ボス登場の衝撃波の規模（爆発半径換算）
var BOSS_FINAL_BLAST_R = 333;    // 処刑フェイズの大爆発の規模（爆発半径換算）
// ボス登場時の波動：登場から約1.5秒の間に最大3回、ボス中心に波が広がり、
// 通り道でグリッドの線そのものがうねって氷色に光る（波紋の輪とは別物）
var BOSS_WAVE_COUNT = 3;         // 波の回数
var BOSS_WAVE_INTERVAL = 0.5;    // 波と波の間隔（秒。3回で約1.5秒）
var BOSS_WAVE_SPEED = 430;       // 波の広がる速さ（px/秒）
var BOSS_WAVE_MAX_R = 640;       // 波の最大半径（px）
var BOSS_WAVE_AMP = 8;           // 線のうねりの最大量（px）
var BOSS_WAVE_BAND = 56;         // うねりが効く波面前後の幅（px）
var BOSS_WAVE_MAX = 3;           // 同時に存在する波の上限
// 光だまり：自機の周りでグリッドがほのかに明るくなる
var GRID_POOL_R = 220;           // 光だまりの半径（px）
var GRID_POOL_BOOST = 0.3;       // 中心での明るさの増加割合（通常の約3割増し）
// エネルギーの流れ：グリッドの線の上を光の筋が流れる
var GRID_FLOW_INTERVAL = [2.5, 4]; // 発生間隔（秒。ランダム範囲）
var GRID_FLOW_MAX = 2;           // 同時に流れる筋の上限
var GRID_FLOW_LEN = [120, 200];  // 筋の長さ（px。ランダム範囲）
var GRID_FLOW_SPEED = 300;       // 筋の流れる速さ（px/秒）
// 呼吸：グリッド全体の明るさのゆっくりした上下
var GRID_BREATHE_PERIOD = 6;     // 周期（秒）
var GRID_BREATHE_AMP = 0.1;      // 明るさの振れ幅（±10%）

// ---- 演出の数値（衝撃波リング・シェイク） ----
var RING_BASE_SPEED = 2600, RING_SPEED_PER_TIER = 800;  // 耐久1で2600、耐久3で3400
var RING_BASE_WIDTH = 25, RING_WIDTH_PER_TIER = 10;     // 耐久1で太さ25、耐久3で35
var RING_LIFE = 0.38;
var SHARD_SIZE_MUL = 10;         // 破片の大きさの倍率
var SHAKE_HP1 = 11, SHAKE_HP3 = 30; // 撃破シェイク：耐久1で11、耐久3で30
