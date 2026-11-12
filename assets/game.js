"use strict";
/* ============================================================
   NEON STRIKER 本体ロジック（game.js）
   敵の生成と出現ディレクター、ゲーム状態、毎フレームの更新、
   当たり判定、HUD、画面遷移と全画面まわり。
   数値は config.js、敵は enemies.js、部品は components.js、
   演出は fx.js、描画は render.js、入力は input.js を参照。
   ============================================================ */

var enemyUidSeq = 0; // 貫通弾が同じ敵を二度撃ちしないための通し番号
// 敵を生成する。出現位置と初期の向き（度）を指定できる。
function spawnEnemy(typeName, x, y, headingDeg, opts) {
  opts = opts || {};
  var t = ENEMY_TYPES[typeName];
  var rad = headingDeg * Math.PI / 180;
  var speed = (opts.speed != null ? opts.speed : rand(t.speed[0], t.speed[1])) * diff.speedMul;
  var e = {
    uid: ++enemyUidSeq,
    type: typeName, shape: t.shape, color: t.color,
    r: t.r, hp: t.hp, maxHp: t.hp, score: t.score,
    bx: x, by: y, x: x, y: y,
    vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed,
    speed: speed,
    dirAngle: rad,
    faceAngle: rad, // 盾などの正面の向き（ガーディアンは旋回上限付きで dirAngle とずれる）
    turnSpeed: t.turnSpeed || 0,
    splitNext: t.nextType || null, gen: t.gen || 0,
    driftVx: opts.driftX || 0, driftVy: opts.driftY || 0, driftTime: opts.driftTime || 0,
    phase: rand(0, Math.PI * 2),
    swayAmp: t.swayAmp ? rand(t.swayAmp[0], t.swayAmp[1]) : 0,
    swayFreq: t.swayFreq ? rand(t.swayFreq[0], t.swayFreq[1]) : 0,
    move: Movement[t.movement],
    spr: ENEMY_SPRITES[typeName].normal,
    sprFlash: ENEMY_SPRITES[typeName].flash,
    rotMode: t.rotMode || "spin",
    rotates: t.shape !== "diamond",
    dashState: "approach", dashTimer: 0, dashCooldown: rand(DASH_INITIAL_COOLDOWN[0], DASH_INITIAL_COOLDOWN[1]),
    dashVx: 0, dashVy: 0,
    spiralAngle: rand(0, Math.PI * 2),
    shieldFlash: 0,
    fuse: -1, blastDone: false,
    snipeState: null, snipeTimer: 0, snipeAngle: 0,
    buffTimer: 0, invulnTimer: 0, buffFrom: null, moveMul: 1, frosted: false,
    pulseT: 0, orbitDir: Math.random() < 0.5 ? -1 : 1,
    attackFn: Attack[opts.attack || t.attack],
    fireInterval: t.fireInterval ? rand(t.fireInterval[0], t.fireInterval[1]) : 0,
    fireTimer: rand(0.7, 1.4),
    rot: rand(0, Math.PI * 2),
    rotSpeed: typeName === "spiral" ? rand(1.8, 2.4) : rand(-0.7, 0.7),
    flash: 0,
    aimed: (opts.attack || t.attack) === "aimed"
  };
  enemies.push(e);
  return e;
}

// 自機の周囲・画面外のランダムな方向に出現位置を決める。
// ワールド外に出そうな時は反対側や内側へ寄せて必ず画面外に出す。
function spawnPoint() {
  for (var i = 0; i < 10; i++) {
    var a = Math.random() * Math.PI * 2;
    var x = player.x + Math.cos(a) * SPAWN_R;
    var y = player.y + Math.sin(a) * SPAWN_R;
    x = clamp(x, 26, WORLD_W - 26);
    y = clamp(y, 26, WORLD_H - 26);
    var dx = x - player.x, dy = y - player.y;
    // クランプの結果うっかり画面内に入ってしまったら引き直す
    if (Math.abs(dx) < VIEW_W / 2 + 24 && Math.abs(dy) < VIEW_H / 2 + 24) continue;
    return { x: x, y: y };
  }
  // 最後の手段：自機から一番遠いワールド四隅方向
  var cx = player.x < WORLD_W / 2 ? WORLD_W - 40 : 40;
  var cy = player.y < WORLD_H / 2 ? WORLD_H - 40 : 40;
  return { x: cx, y: cy };
}

// 既に選んだ出現点から minDist 以上離れた出現点を引く（ダーターの
// 3体同時出現用）。何度か引き直し、最後は最も離れた候補を返す。
function spawnPointFar(minDist, others) {
  var best = null, bestScore = -1;
  for (var i = 0; i < 8; i++) {
    var cand = spawnPoint();
    var md = Infinity;
    for (var j = 0; j < others.length; j++) {
      var ddx = cand.x - others[j].x, ddy = cand.y - others[j].y;
      var d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < md) md = d;
    }
    if (md >= minDist) return cand;
    if (md > bestScore) { bestScore = md; best = cand; }
  }
  return best;
}

// ---- 生成ディレクター：時間経過で少しずつ激しくなる ----
var director = { timer: 0.6 };
function directorUpdate(dt) {
  // ボス予告中・ボス戦中・撃破後の静けさの間は通常湧きを止める
  if (bossWarnT > 0 || boss || quietTimer > 0) { director.timer = 0.5; return; }
  director.timer -= dt;
  if (director.timer > 0) return;
  director.timer = diff.spawnInterval * rand(0.75, 1.25);

  var roll = Math.random();
  var hexP = diff.hexProb, diaP = DIA_PROB;
  var p = spawnPoint();
  var toPlayer = Math.atan2(player.y - p.y, player.x - p.x) * 180 / Math.PI;
  if (roll < diff.newProb) {
    // 新敵：既存3種が主役のまま時々混ざる。タンクはその中でもまれ。
    var nr = Math.random();
    if (nr < NEW_MIX.tank) spawnEnemy("tank", p.x, p.y, toPlayer + rand(-10, 10));
    else if (nr < NEW_MIX.darter) {
      // ダーターは1体では弱いので、互いに離れた3か所から3体同時に出現
      var dPts = [p];
      for (var di = 1; di < DARTER_GROUP; di++) dPts.push(spawnPointFar(DARTER_FAR_DIST, dPts));
      for (di = 0; di < DARTER_GROUP; di++) {
        var dTo = Math.atan2(player.y - dPts[di].y, player.x - dPts[di].x) * 180 / Math.PI;
        spawnEnemy("darter", dPts[di].x, dPts[di].y, dTo + rand(-18, 18));
      }
    }
    else if (nr < NEW_MIX.splitter) spawnEnemy("splitter", p.x, p.y, toPlayer + rand(-16, 16));
    else if (nr < NEW_MIX.spiral) spawnEnemy("spiral", p.x, p.y, toPlayer + rand(-14, 14));
    else if (nr < NEW_MIX.guardian) spawnEnemy("guardian", p.x, p.y, toPlayer + rand(-14, 14));
    else if (nr < NEW_MIX.bomber) spawnEnemy("bomber", p.x, p.y, toPlayer + rand(-18, 18));
    else if (nr < NEW_MIX.froster) spawnEnemy("froster", p.x, p.y, toPlayer + rand(-18, 18));
    else if (nr < NEW_MIX.sniper) spawnEnemy("sniper", p.x, p.y, toPlayer + rand(-14, 14));
    else spawnEnemy("amp", p.x, p.y, toPlayer + rand(-14, 14));
    return;
  }
  if (roll < hexP + diff.newProb) {
    // 六角形：攻撃コンポーネントは aimed / forward を生成時に選ぶ
    var atk = Math.random() < diff.aimedProb ? "aimed" : "forward";
    spawnEnemy("hexagon", p.x, p.y, toPlayer + rand(-14, 14), { attack: atk });
  } else if (roll < hexP + diff.newProb + diaP) {
    spawnEnemy("diamond", p.x, p.y, toPlayer + rand(-20, 20));
  } else if (Math.random() < SQUAD_PROB) {
    // 四角の小隊：出現点の周りに固まって押し寄せる
    var n = 3 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var ox = rand(-46, 46), oy = rand(-46, 46);
      spawnEnemy("square",
        clamp(p.x + ox, 24, WORLD_W - 24), clamp(p.y + oy, 24, WORLD_H - 24),
        toPlayer + rand(-16, 16));
    }
  } else {
    spawnEnemy("square", p.x, p.y, toPlayer + rand(-20, 20));
  }
}

/* ============================================================
   ゲーム状態
   ============================================================ */
var state = "title"; // title | playing | paused | over
var player, bullets, enemyBullets, enemies, particles, popups, stars;
var shards, rings, sparks;
var frostZones = []; // フロスターの凍結エリア {x, y, r, life, maxLife}

// 凍結エリア内かどうか。エリアが重なっても倍率は変わらないので真偽だけ返す
function inFrost(x, y) {
  for (var i = 0; i < frostZones.length; i++) {
    var z = frostZones[i];
    var dx = x - z.x, dy = y - z.y;
    if (dx * dx + dy * dy <= z.r * z.r) return true;
  }
  return false;
}
var score, best = 0, elapsed, shake;
var diff;
// ---- 演出用ステート ----
var hitStop = 0;      // 六角形撃破時の一瞬の停止（秒）
var gridPulse = 0;    // 撃破に合わせたグリッドの脈動 0..1
var flashWhite = 0;   // 画面全体の白フラッシュ 0..1（ボス大爆発用。fx.js で減衰）
// ---- オーバードライブ用ステート ----
var odGauge = 0;      // 充電ゲージ 0..100
var odActive = false; // 発動中かどうか
var odTimer = 0;      // 発動中の残り時間（秒）
var comboCount = 0, comboTimer = 0, comboPop = 0;
var COMBO_WINDOW = 2.2; // この秒数以内に倒し続けるとコンボが伸びる
// ---- ボス「ペルマフロスト」用ステート ----
var boss = null;              // 戦闘中のボス本体オブジェクト（いなければ null）
var bossWarnT = 0;            // WARNING予告の残り時間（秒）
var bossNextTime = BOSS_FIRST_TIME; // 次にボスが登場する経過時間（秒）
var bossSpawnCount = 0;       // 登場回数（HP倍率・氷結弾間隔の計算に使う）
var bossKills = 0;            // 撃破数（撃破ごとに難易度が1段上がる）
var quietTimer = 0;           // 撃破後の静けさの残り時間（秒）
var odFrozen = false;         // 処刑中はオーバードライブのタイマーを止める
var iceShots = [];            // 飛行中の氷結弾 {x,y,tx,ty,t,dur}
var warnSfxT = 0;             // 警報音の間引きタイマ
var bossBarShatterT = 0;      // ボスバーの「砕ける」演出の残り時間
// ボス戦中（処刑フェイズを除く）はオーバードライブゲージが一切貯まらない
function bossGaugeLocked() { return !!(boss && boss.phase !== "exec"); }
// ---- 演出オブジェクトの上限と再利用プール（軽量化） ----
// 同時発生数を絞り、使い終わったオブジェクトはプールへ戻して
// 使い回すことで、激しい場面でも確保・GCの負荷を一定に保つ。
var particlePool = [], shardPool = [], ringPool = [], sparkPool = [];

function computeDiff() {
  // 経過時間で難易度を上げる（敵速・割合は2分でほぼ上限）。
  // 出現間隔だけは専用の緩やかなカーブ（DIFF_SPAWN_RAMP_TIME）で下げる：
  // 180秒時点の出現量が従来カーブの約半分になる。数値は config.js の DIFF_* を参照
  var k = Math.min(elapsed / DIFF_RAMP_TIME, 1);
  var sk = Math.min(elapsed / DIFF_SPAWN_RAMP_TIME, 1);
  diff = {
    spawnInterval: DIFF_SPAWN_START - DIFF_SPAWN_DROP * sk, // 0.92s → 0.34s（緩やかに435秒かけて）
    speedMul: 1 + DIFF_SPEED_MUL_MAX * k,               // 敵速 +55%
    hexProb: DIFF_HEX_START + DIFF_HEX_GAIN * k,        // 射撃敵の割合増
    aimedProb: Math.min(elapsed / DIFF_AIMED_RAMP_TIME, 1) * DIFF_AIMED_MAX, // 自機狙いの割合増
    newProb: DIFF_NEW_START + DIFF_NEW_GAIN * k         // 新敵の割合 12% → 28%（既存3種が主役のまま時々混ざる）
  };
  // ボスを倒すたびに難易度が1段上がる（出現が速く、敵も速くなる）
  if (bossKills > 0) {
    diff.spawnInterval *= Math.pow(0.93, bossKills);
    diff.speedMul += 0.07 * bossKills;
  }
}

function resetGame() {
  player = {
    x: WORLD_W / 2, y: WORLD_H / 2, r: 12,
    angle: -Math.PI / 2,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    fireTimer: 0, invincible: 0, muzzle: 0, frosted: false
  };
  bullets = []; enemyBullets = []; enemies = [];
  particles = []; popups = [];
  shards = []; rings = []; sparks = [];
  frostZones = [];
  comboCount = 0; comboTimer = 0; comboPop = 0;
  hitStop = 0; gridPulse = 0; flashWhite = 0;
  odGauge = 0; odActive = false; odTimer = 0;
  boss = null; bossWarnT = 0; bossNextTime = BOSS_FIRST_TIME;
  bossSpawnCount = 0; bossKills = 0; quietTimer = 0;
  odFrozen = false; iceShots = []; warnSfxT = 0; bossBarShatterT = 0;
  score = 0; elapsed = 0; shake = 0;
  director.timer = 0.6;
  leftStick.active = false; rightStick.active = false;
  mouseDown = false;
  computeDiff();
  updateHud();
}

function makeStars() {
  stars = [];
  for (var i = 0; i < 240; i++) {
    stars.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, s: rand(0.6, 2.1) });
  }
}

/* ============================================================
   弾
   ============================================================ */
function spawnEnemyBullet(x, y, dx, dy, speed, dmg) {
  enemyBullets.push({ x: x, y: y, vx: dx * speed, vy: dy * speed, r: 4.5, dmg: dmg || ENEMY_BULLET_DMG });
  sfxEnemyShoot();
}
// ボスの弾は連射が激しいため、発射音なしで直接積む
function spawnBossBullet(x, y, angle, speed, dmg) {
  enemyBullets.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 4.5, dmg: dmg });
}

/* ============================================================
   ボス「ペルマフロスト」
   本体（八角形の氷の要塞）＋左右の大型砲塔2機の複合ボス。
   第1段階：砲塔が拡散→チャージ→バーストのサイクル、本体はバリア無敵で氷結弾（1発は自機位置へ正確に、2発は周囲へ散布）。
   第2段階：砲塔を両方壊すとバリアが割れ、回転弾幕＋低速突進＋氷結弾（間隔は短くなる）。
   本体を倒し切ると処刑フェイズ（機能停止した残骸をODで撃ち込む）。
   数値はすべて config.js の BOSS_* を参照する。
   ============================================================ */
// 登場スケジュール：予告→出現を管理する
function bossDirector(dt) {
  if (quietTimer > 0) quietTimer -= dt;
  if (!boss && bossWarnT <= 0 && quietTimer <= 0 && elapsed >= bossNextTime - BOSS_WARN_TIME) {
    bossWarnT = BOSS_WARN_TIME;
    warnSfxT = 0;
  }
  if (bossWarnT > 0) {
    warnSfxT -= dt;
    if (warnSfxT <= 0) { warnSfxT = 0.65; sfxWarning(); }
    bossWarnT -= dt;
    if (bossWarnT <= 0) { bossWarnT = 0; spawnBoss(); }
  }
}

function spawnBoss() {
  bossSpawnCount++;
  var mul = Math.pow(BOSS_HP_MUL, bossSpawnCount - 1);
  var p = spawnPoint();
  var turretMax = Math.round(BOSS_TURRET_HP * mul);
  var coreMax = Math.round(BOSS_CORE_HP * mul);
  // 砲塔サイクル（拡散＋チャージ＋バースト）の半周期。右砲塔はこれだけ位相をずらす
  var turretCycleHalf = (BOSS_TURRET_SPREAD_TIME + BOSS_TURRET_CHARGE_TIME + BOSS_BURST_INTERVAL * (BOSS_BURST_COUNT - 1)) / 2;
  boss = {
    x: clamp(p.x, 110, WORLD_W - 110), y: clamp(p.y, 110, WORLD_H - 110),
    r: BOSS_BODY_R, t: 0, rot: rand(0, Math.PI * 2), faceAngle: 0,
    phase: 1, // 1: 砲塔戦（バリア） / 2: 本体戦 / "exec": 処刑フェイズ
    coreHp: coreMax, coreMax: coreMax,
    execHp: 0, execMax: Math.round(BOSS_EXEC_HP * mul), execTimer: 0,
    totalMax: coreMax + turretMax * 2,
    turrets: [
      { side: -1, hp: turretMax, maxHp: turretMax, alive: true, x: 0, y: 0, aim: 0, fireTimer: 0.5, swingPhase: 0, flash: 0, mode: "spread", modeTimer: BOSS_TURRET_SPREAD_TIME, burstLeft: 0, burstTimer: 0 },
      { side: 1, hp: turretMax, maxHp: turretMax, alive: true, x: 0, y: 0, aim: 0, fireTimer: 0.65, swingPhase: Math.PI, flash: 0, mode: "spread", modeTimer: BOSS_TURRET_SPREAD_TIME - turretCycleHalf, burstLeft: 0, burstTimer: 0 }
    ],
    iceTimer: 2.2,
    iceInterval: Math.max(BOSS_ICE_MIN_INTERVAL, BOSS_ICE_INTERVAL * Math.pow(0.93, bossSpawnCount - 1)),
    summonTimer: BOSS_SUMMON_FIRST,
    spiralTimer: 0, spiralAngle: rand(0, Math.PI * 2),
    chargeState: "idle", chargeTimer: 0, chargeCooldown: 2.2, chargeAngle: 0,
    flash: 0, shieldFlash: 0, shakeT: 0, strafeDir: Math.random() < 0.5 ? -1 : 1, strafeT: rand(2, 4)
  };
  updateBossTurretPos();
  // 登場の衝撃波：残っていた通常敵をすべて消滅させる（スコアは入らない）
  for (var i = 0; i < enemies.length; i++) {
    if (!enemies[i].dead) { burst(enemies[i].x, enemies[i].y, enemies[i].color, 8); enemies[i].dead = true; }
  }
  enemyBullets = [];
  spawnRing(boss.x, boss.y, "#7fd8ff", 6);
  burst(boss.x, boss.y, "#7fd8ff", 26);
  shake = Math.max(shake, 20);
  // ボス戦開始：オーバードライブを強制終了し、ゲージを0にする（正面勝負）
  if (odActive) sfxOverdriveEnd();
  odActive = false; odTimer = 0; odGauge = 0; odFrozen = false;
  sfxExplosion(true);
}

// 砲塔の位置は本体の向き（自機方向）の左右に付ける
function updateBossTurretPos() {
  if (!boss) return;
  var px = -Math.sin(boss.faceAngle), py = Math.cos(boss.faceAngle);
  var fx = Math.cos(boss.faceAngle), fy = Math.sin(boss.faceAngle);
  for (var i = 0; i < boss.turrets.length; i++) {
    var tr = boss.turrets[i];
    tr.x = boss.x + px * tr.side * BOSS_TURRET_OFFSET + fx * 8;
    tr.y = boss.y + py * tr.side * BOSS_TURRET_OFFSET + fy * 8;
  }
}

function bossUpdate(dt) {
  if (!boss) return;
  var b = boss;
  b.t += dt;
  b.rot += dt * 0.16;
  if (b.flash > 0) b.flash -= dt;
  if (b.shieldFlash > 0) b.shieldFlash -= dt;
  if (b.shakeT > 0) b.shakeT -= dt;
  for (var ti = 0; ti < b.turrets.length; ti++) if (b.turrets[ti].flash > 0) b.turrets[ti].flash -= dt;

  // 処刑フェイズ：機能停止。動かず撃たず、ODタイマー停止の上限だけ数える
  if (b.phase === "exec") {
    b.execTimer += dt;
    if (b.execTimer >= BOSS_EXEC_LIMIT && odFrozen) odFrozen = false; // 上限でタイマー再開
    return;
  }

  // 撃破演出フェイズ：残骸の各所で小〜中爆発が連続して起こり、
  // BOSS_FINISH_FX_TIME が過ぎたら finishBoss の大爆発で締める（段階式）
  if (b.phase === "finish") {
    b.finishT += dt;
    b.finishNext -= dt;
    if (b.finishNext <= 0 && b.finishT < BOSS_FINISH_FX_TIME) {
      b.finishNext = rand(0.08, 0.16);
      var fxx = b.x + rand(-52, 52), fxy = b.y + rand(-52, 52);
      burst(fxx, fxy, Math.random() < 0.5 ? "#ffc233" : "#7fd8ff", 10);
      spawnSparks(fxx, fxy, "#ffffff", 5);
      if (Math.random() < 0.5) spawnRing(fxx, fxy, "#ffc233", 2);
      shake = Math.max(shake, 9);
      sfxExplosion(false);
    }
    if (b.finishT >= BOSS_FINISH_FX_TIME) finishBoss();
    return;
  }

  var dx = player.x - b.x, dy = player.y - b.y;
  var dist = Math.sqrt(dx * dx + dy * dy) || 1;
  b.faceAngle = Math.atan2(dy, dx);
  var frostMul = inFrost(b.x, b.y) ? FROST_SLOW : 1;

  // ---- 移動：間合いを保って漂う。第2段階の突進中は専用の動き ----
  var charging = false;
  if (b.phase === 2) {
    if (b.chargeState === "tele") {
      b.chargeTimer -= dt;
      if (b.chargeTimer <= 0) {
        b.chargeState = "dash"; b.chargeTimer = BOSS_CHARGE_TIME;
        b.chargeAngle = Math.atan2(player.y - b.y, player.x - b.x); // 予告の終わりに方向を固定
      }
    } else if (b.chargeState === "dash") {
      charging = true;
      b.x += Math.cos(b.chargeAngle) * BOSS_CHARGE_SPEED * frostMul * dt;
      b.y += Math.sin(b.chargeAngle) * BOSS_CHARGE_SPEED * frostMul * dt;
      b.chargeTimer -= dt;
      if (b.chargeTimer <= 0) { b.chargeState = "recover"; b.chargeTimer = 1.0; }
    } else if (b.chargeState === "recover") {
      b.chargeTimer -= dt;
      if (b.chargeTimer <= 0) { b.chargeState = "idle"; b.chargeCooldown = BOSS_CHARGE_COOLDOWN * rand(0.85, 1.2); }
    } else {
      b.chargeCooldown -= dt;
      if (b.chargeCooldown <= 0 && dist < 560) { b.chargeState = "tele"; b.chargeTimer = BOSS_CHARGE_TELEGRAPH; }
    }
  }
  if (!charging) {
    var speed = (b.phase === 2 ? BOSS_SPEED_P2 : BOSS_SPEED) * frostMul;
    if (b.chargeState === "tele" || b.chargeState === "recover") speed *= 0.25; // 予告・硬直中はほぼ止まる
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafeT = rand(2, 4); b.strafeDir *= -1; }
    var radial = 0;
    if (dist > BOSS_KEEP_DIST + 40) radial = 1;
    else if (dist < BOSS_KEEP_DIST - 40) radial = -1;
    var strafe = b.strafeDir * 0.45;
    var ux = dx / dist, uy = dy / dist;
    b.x += (ux * radial + -uy * strafe) * speed * dt;
    b.y += (uy * radial + ux * strafe) * speed * dt;
  }
  b.x = clamp(b.x, 86, WORLD_W - 86);
  b.y = clamp(b.y, 86, WORLD_H - 86);
  updateBossTurretPos();

  // ---- 砲塔：拡散→チャージ→バーストのサイクルを1門ずつ独立に回す ----
  for (ti = 0; ti < b.turrets.length; ti++) {
    var tr = b.turrets[ti];
    if (!tr.alive) continue;
    var base = Math.atan2(player.y - tr.y, player.x - tr.x);
    var inRange = dist < ATTACK_RANGE + 160;
    if (tr.mode === "charge") {
      // チャージ：発射を止め、砲身は自機を向いて光る（描画側で砲口が発光）
      tr.aim = base;
      tr.modeTimer -= dt;
      if (tr.modeTimer <= 0) { tr.mode = "burst"; tr.burstLeft = BOSS_BURST_COUNT; tr.burstTimer = 0; }
    } else if (tr.mode === "burst") {
      // バースト：各発を撃つ瞬間の自機位置へ狙い、高速弾を5連射
      tr.aim = base;
      tr.burstTimer -= dt;
      if (tr.burstTimer <= 0 && tr.burstLeft > 0) {
        if (inRange) {
          spawnBossBullet(tr.x + Math.cos(base) * (BOSS_TURRET_R + 4), tr.y + Math.sin(base) * (BOSS_TURRET_R + 4),
            base, BOSS_BURST_SPEED, SPREAD_DMG);
        }
        tr.burstLeft--;
        tr.burstTimer = BOSS_BURST_INTERVAL;
        if (tr.burstLeft <= 0) { tr.mode = "spread"; tr.modeTimer = BOSS_TURRET_SPREAD_TIME; tr.fireTimer = BOSS_TURRET_FIRE_INTERVAL; }
      }
    } else {
      // 拡散：自機方向を中心にスイングしながら3方向へ撒く
      tr.aim = base + Math.sin(b.t * Math.PI * 2 / BOSS_TURRET_SWING_PERIOD + tr.swingPhase) * BOSS_TURRET_SWING_AMP;
      tr.fireTimer -= dt;
      if (tr.fireTimer <= 0 && inRange) {
        tr.fireTimer = BOSS_TURRET_FIRE_INTERVAL;
        for (var pk = -1; pk <= 1; pk++) {
          spawnBossBullet(tr.x + Math.cos(tr.aim) * (BOSS_TURRET_R + 4), tr.y + Math.sin(tr.aim) * (BOSS_TURRET_R + 4),
            tr.aim + pk * 0.13, BOSS_TURRET_BULLET_SPEED, SPREAD_DMG);
        }
      }
      tr.modeTimer -= dt;
      if (tr.modeTimer <= 0) { tr.mode = "charge"; tr.modeTimer = BOSS_TURRET_CHARGE_TIME; }
    }
  }

  // ---- 本体：氷結弾（両段階共通。着弾点に半径60%の凍結エリアを作る） ----
  // 1回の発射で3発：1発は発射時点の自機位置へ正確に着弾し、残り2発は自機位置から
  // ランダムな向きに130〜230px離れた点へ着弾する（2発の向きは互いに独立）。
  // 第1段階は遅めの間隔（6秒）で、砲塔が無くなった第2段階でも止まらず、
  // むしろ短い間隔（4秒）で撃ち続ける。
  b.iceTimer -= dt;
  if (b.iceTimer <= 0) {
    b.iceTimer = b.phase === 1 ? b.iceInterval : BOSS_ICE_P2_INTERVAL;
    var iceTargets = [{ x: player.x, y: player.y }];
    for (var io = 0; io < 2; io++) {
      var ira = rand(0, Math.PI * 2), ird = rand(BOSS_ICE_SCATTER_MIN, BOSS_ICE_SCATTER_MAX);
      iceTargets.push({
        x: clamp(player.x + Math.cos(ira) * ird, 20, WORLD_W - 20),
        y: clamp(player.y + Math.sin(ira) * ird, 20, WORLD_H - 20)
      });
    }
    for (var it = 0; it < iceTargets.length; it++) {
      var tg = iceTargets[it];
      var tdx = tg.x - b.x, tdy = tg.y - b.y;
      var tdist = Math.sqrt(tdx * tdx + tdy * tdy);
      iceShots.push({ x: b.x, y: b.y, sx: b.x, sy: b.y, tx: tg.x, ty: tg.y, t: 0, dur: Math.max(tdist / BOSS_ICE_SPEED, 0.25) });
    }
    tone(300, 700, 0.18, "sine", 0.04);
  }

  if (b.phase === 2) {
    // ---- 本体・第2段階：回転弾幕（両方向へ渦状に撒く） ----
    b.spiralTimer -= dt;
    if (b.spiralTimer <= 0 && dist < ATTACK_RANGE + 160) {
      b.spiralTimer = BOSS_SPIRAL_INTERVAL;
      b.spiralAngle += SPIRAL_ANGLE_STEP;
      spawnBossBullet(b.x, b.y, b.spiralAngle, BOSS_SPIRAL_SPEED, SPIRAL_DMG);
      spawnBossBullet(b.x, b.y, b.spiralAngle + Math.PI, BOSS_SPIRAL_SPEED, SPIRAL_DMG);
    }
  }

  // ---- ダーター召喚（両段階共通）：残りが少なければ5体を周囲へ ----
  b.summonTimer -= dt;
  if (b.summonTimer <= 0) {
    b.summonTimer = BOSS_SUMMON_INTERVAL;
    var aliveSummoned = 0;
    for (var si = 0; si < enemies.length; si++) if (enemies[si].summoned && !enemies[si].dead) aliveSummoned++;
    if (aliveSummoned <= BOSS_SUMMON_ALIVE_MAX) {
      for (var sn = 0; sn < BOSS_SUMMON_COUNT; sn++) {
        var sa = (sn / BOSS_SUMMON_COUNT) * Math.PI * 2 + rand(-0.3, 0.3);
        var sx = clamp(b.x + Math.cos(sa) * 150, 30, WORLD_W - 30);
        var sy = clamp(b.y + Math.sin(sa) * 150, 30, WORLD_H - 30);
        var se = spawnEnemy("darter", sx, sy, Math.atan2(player.y - sy, player.x - sx) * 180 / Math.PI);
        se.summoned = true; // ゲージはボス戦中ロックされるため対象外（スコアのみ）
        burst(sx, sy, "#ff8c1a", 5);
      }
    }
  }
}

// 氷結弾の飛行と着弾：着弾点に凍結エリア。飛行中に自機へ触れれば直撃-10
function updateIceShots(dt) {
  for (var i = iceShots.length - 1; i >= 0; i--) {
    var s = iceShots[i];
    s.t += dt;
    var k = Math.min(s.t / s.dur, 1);
    s.x = s.sx + (s.tx - s.sx) * k;
    s.y = s.sy + (s.ty - s.sy) * k;
    var pdx = player.x - s.x, pdy = player.y - s.y;
    if (player.invincible <= 0 && pdx * pdx + pdy * pdy < (player.r + 11) * (player.r + 11)) {
      damagePlayer(BOSS_ICE_DMG);
      landIceShot(s);
      iceShots.splice(i, 1);
      continue;
    }
    if (k >= 1) { landIceShot(s); iceShots.splice(i, 1); }
  }
}
function landIceShot(s) {
  // ボスの氷結弾のエリアはフロスターより小さい（半径60%）。持続・減速は共通
  frostZones.push({ x: s.tx, y: s.ty, r: BOSS_ICE_RADIUS, life: FROST_DURATION, maxLife: FROST_DURATION });
  burst(s.tx, s.ty, "#7fd8ff", 16);
  spawnRing(s.tx, s.ty, "#7fd8ff", 2);
  sfxExplosion(false);
}

// 砲塔の破壊：スコアのみ（ゲージは増えない）。両方壊れると第2段階へ
function destroyTurret(tr) {
  tr.alive = false; tr.hp = 0;
  score += BOSS_SCORE_TURRET;
  burst(tr.x, tr.y, "#7fd8ff", 22);
  spawnRing(tr.x, tr.y, "#7fd8ff", 4);
  spawnSparks(tr.x, tr.y, "#d8f6ff", 9);
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({ x: tr.x, y: tr.y - 10, text: "+" + BOSS_SCORE_TURRET, life: 0.8, maxLife: 0.8, pop: 1, big: true, color: "#7fd8ff" });
  shake = Math.max(shake, 16);
  gridPulse = 1;
  sfxExplosion(true);
  if (boss && !boss.turrets[0].alive && !boss.turrets[1].alive && boss.phase === 1) {
    // バリア崩壊 → 本体露出。第2段階の攻撃に切り替わる
    boss.phase = 2;
    boss.chargeState = "idle"; boss.chargeCooldown = 2.4;
    boss.spiralTimer = 0.6;
    boss.iceTimer = Math.min(boss.iceTimer, 1.2); // 氷結弾は第2段階の短い間隔へ早めに移行する
    spawnRing(boss.x, boss.y, "#bfefff", 6);
    burst(boss.x, boss.y, "#bfefff", 24);
    if (popups.length >= MAX_POPUPS) popups.shift();
    popups.push({ x: boss.x, y: boss.y - 84, text: "BARRIER DOWN", life: 1.1, maxLife: 1.1, pop: 1, big: true, color: "#bfefff" });
    sfxBarrierDown();
  }
}

// 本体を倒し切った：処刑フェイズへ。ゲージ満タンでOD発動、タイマーは止まる
function enterExecution() {
  var b = boss;
  b.phase = "exec";
  b.execHp = b.execMax;
  b.execTimer = 0;
  enemyBullets = []; // 決着の瞬間に弾幕は消える
  odGauge = 100;
  if (!odActive) activateOverdrive(); else { odTimer = OD_DURATION; }
  odFrozen = true;
  bossBarShatterT = 0.6; // ボスバーは砕けて消える
  var bossWrapEl = document.getElementById("boss-wrap");
  if (bossWrapEl) bossWrapEl.className = "shatter";
  hitStop = 0.09;
  shake = Math.max(shake, 24);
  spawnRing(b.x, b.y, "#ffc233", 6);
  burst(b.x, b.y, "#7fd8ff", 30);
  sfxExplosion(true);
}

// 処刑の残骸を撃ち切った瞬間：いきなり大爆発させず、まず残骸の各所で
// 小爆発が連続する「finish」フェイズへ入る（bossUpdate 側で進行）。
// BOSS_FINISH_FX_TIME が過ぎたら finishBoss の大爆発で締める。
function startBossFinish() {
  var b = boss;
  b.phase = "finish";
  b.finishT = 0;
  b.finishNext = 0;
  enemyBullets = [];
  shake = Math.max(shake, 14);
  sfxExplosion(false);
}

// 処刑完了：大爆発＋5,000点＋HP20回復。静けさの後に通常戦が戻る
function finishBoss() {
  var b = boss;
  score += BOSS_SCORE_FINAL;
  player.hp = Math.min(player.maxHp, player.hp + BOSS_HEAL);
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({ x: b.x, y: b.y - 20, text: "+" + BOSS_SCORE_FINAL, life: 1.3, maxLife: 1.3, pop: 1, big: true, huge: true, color: "#ffc233" });
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({ x: player.x, y: player.y - 26, text: "HP +" + BOSS_HEAL, life: 1.0, maxLife: 1.0, pop: 1, big: true, color: "#3dff7a" });
  flashWhite = 1; // 画面全体の白フラッシュ（fx.js で減衰、render.js で描画）
  for (var i = 0; i < 4; i++) burst(b.x + rand(-46, 46), b.y + rand(-46, 46), i === 0 ? "#ffc233" : "#7fd8ff", 24);
  spawnRing(b.x, b.y, "#ffc233", 6);
  spawnRing(b.x, b.y, "#ffffff", 6);
  spawnRing(b.x, b.y, "#7fd8ff", 6);
  spawnSparks(b.x, b.y, "#ffffff", 16);
  shake = 52; hitStop = 0.16; gridPulse = 1;
  sfxExplosion(true);
  // 残っていた召喚ダーターも大爆発で消える（静けさを取り戻す）
  for (var ci = 0; ci < enemies.length; ci++) {
    if (enemies[ci].summoned && !enemies[ci].dead) { burst(enemies[ci].x, enemies[ci].y, enemies[ci].color, 6); enemies[ci].dead = true; }
  }
  boss = null;
  bossKills++;
  quietTimer = BOSS_QUIET_TIME;
  bossNextTime = elapsed + BOSS_INTERVAL;
  odFrozen = false; // 処刑後もODが残っていれば通常タイマーで継続する
  updateHud();
}

// 自機の弾の線分と円の当たり判定（ボス各部用）。当たった点を返す
function bulletSegHit(b, x, y, rr) {
  var bx0 = b.px != null ? b.px : b.x, by0 = b.py != null ? b.py : b.y;
  var segX = b.x - bx0, segY = b.y - by0;
  var segLen2 = segX * segX + segY * segY;
  var segT = segLen2 > 0 ? ((x - bx0) * segX + (y - by0) * segY) / segLen2 : 0;
  segT = segT < 0 ? 0 : (segT > 1 ? 1 : segT);
  var hitX = bx0 + segX * segT, hitY = by0 + segY * segT;
  var dx = hitX - x, dy = hitY - y;
  if (dx > rr || dx < -rr || dy > rr || dy < -rr) return null;
  if (dx * dx + dy * dy < rr * rr) return { x: hitX, y: hitY };
  return null;
}

// 当たり判定：自機の弾 × ボス（砲塔→本体の順）
function bossBulletCollisions() {
  if (!boss) return;
  var b = boss;
  if (b.phase === "finish") return; // 大爆発の演出中はもう何にも当たらない
  for (var i = 0; i < bullets.length; i++) {
    var bl = bullets[i];
    if (bl.dead) continue;
    var j, tr, hit;
    // 砲塔（生きているものだけ）
    for (j = 0; j < b.turrets.length; j++) {
      tr = b.turrets[j];
      if (!tr.alive) continue;
      if (bl.pierce && bl.hitUids["tur" + j]) continue;
      hit = bulletSegHit(bl, tr.x, tr.y, BOSS_TURRET_R + bl.r);
      if (hit) {
        if (bl.pierce) bl.hitUids["tur" + j] = true; else bl.dead = true;
        tr.hp -= bl.dmg; tr.flash = 0.09;
        spawnSparks(hit.x, hit.y, "#7fd8ff", 3);
        if (tr.hp <= 0) destroyTurret(tr);
        break;
      }
    }
    if (bl.dead) continue;
    // 本体（貫通弾は1発につき1回だけ当たる）
    if (bl.pierce && bl.hitUids.bossBody) continue;
    hit = bulletSegHit(bl, b.x, b.y, b.r + bl.r);
    if (!hit) continue;
    if (b.phase === 1) {
      // バリア：どの弾も弾かれて消える（貫通弾も通らない）
      bl.dead = true;
      b.shieldFlash = 0.16;
      spawnSparks(hit.x, hit.y, "#bfefff", 4);
      continue;
    }
    if (bl.pierce) bl.hitUids.bossBody = true; else bl.dead = true;
    b.flash = 0.09;
    spawnSparks(hit.x, hit.y, b.phase === "exec" ? "#ffc233" : "#7fd8ff", 3);
    if (b.phase === "exec") {
      // サンドバッグ：撃たれるたびに震え、破片を落とす
      b.execHp -= bl.dmg;
      b.shakeT = 0.09;
      if (Math.random() < 0.4) burst(hit.x, hit.y, "#7fd8ff", 2);
      if (b.execHp <= 0) { startBossFinish(); return; }
    } else {
      b.coreHp -= bl.dmg;
      if (b.coreHp <= 0) { enterExecution(); }
    }
  }
}

/* ============================================================
   更新
   ============================================================ */
function update(dt) {
  if (state !== "playing") { updateFx(dt); return; }

  elapsed += dt;
  computeDiff();
  bossDirector(dt);
  directorUpdate(dt);
  bossUpdate(dt);
  updateIceShots(dt);
  if (bossBarShatterT > 0) bossBarShatterT -= dt;

  // 凍結エリアの寿命（残り時間を使い切ったら消える）
  for (var fi = frostZones.length - 1; fi >= 0; fi--) {
    frostZones[fi].life -= dt;
    if (frostZones[fi].life <= 0) frostZones.splice(fi, 1);
  }

  // オーバードライブの残り時間。尽きたら強化が終わり、ゲージは0へ。
  // 処刑フェイズ中はタイマーを止める（上限つき。bossUpdate 側で解除）。
  if (odActive && !odFrozen) {
    odTimer -= dt;
    if (odTimer <= 0) {
      odTimer = 0; odActive = false; odGauge = 0;
      sfxOverdriveEnd();
    }
  }

  if (player.invincible > 0) player.invincible -= dt;

  // ---- 移動：左スティック or キーボード ----
  var moveVec = stickVector(leftStick);
  if (!moveVec) {
    var kx = 0, ky = 0;
    if (keys["arrowleft"] || keys["a"]) kx -= 1;
    if (keys["arrowright"] || keys["d"]) kx += 1;
    if (keys["arrowup"] || keys["w"]) ky -= 1;
    if (keys["arrowdown"] || keys["s"]) ky += 1;
    if (kx || ky) {
      var kl = Math.sqrt(kx * kx + ky * ky);
      moveVec = { x: kx / kl, y: ky / kl };
    }
  }
  // 自機も凍結エリア内では遅くなる（弾の速さは変わらない）
  player.frosted = inFrost(player.x, player.y);
  if (moveVec) {
    // オーバードライブ中は移動速度も少し上がる（約+25%）
    var moveSpeed = PLAYER_SPEED * (odActive ? OD_MOVE_SPEED_MUL : 1);
    if (player.frosted) moveSpeed *= FROST_SLOW;
    player.x = clamp(player.x + moveVec.x * moveSpeed * dt, player.r, WORLD_W - player.r);
    player.y = clamp(player.y + moveVec.y * moveSpeed * dt, player.r, WORLD_H - player.r);
  }

  // ---- 旋回と射撃：右スティック or マウス ----
  // 旋回はキビキビ速く：右スティックで狙っている間は遅れなく
  // その向きへ向き直り、傾けている間ずっと撃ち続ける。
  var aim = currentAim(moveVec);
  if (rightStick.active && rightStick.mag > AIM_DEAD) {
    player.angle = aim.angle; // スティックの向きへ即座に旋回
  } else if (mouseSeen) {
    player.angle = angleLerp(player.angle, aim.angle, Math.min(1, dt * 34));
  } else {
    player.angle = angleLerp(player.angle, aim.angle, Math.min(1, dt * 18));
  }
  player.fireTimer -= dt;
  if (aim.firing && player.fireTimer <= 0) {
    // オーバードライブ中は連射間隔がさらに約20%短くなる
    player.fireTimer = FIRE_INTERVAL * (odActive ? OD_FIRE_INTERVAL_MUL : 1);
    player.muzzle = 0.05; // 銃口フラッシュの表示時間
    var ca = Math.cos(player.angle), sa = Math.sin(player.angle);
    // ノズル：通常は左右2本、発動中は左右2対＝4本。
    // 進行方向と直角にずらした位置から同時に発射する。
    var px = -sa, py = ca;
    var offsets = odActive ? OD_NOZZLE_OFFSETS : NOZZLE_OFFSETS;
    var forwards = odActive ? OD_NOZZLE_FORWARD : NOZZLE_FORWARD;
    // 発動中は弾速3倍。端の弾は forwards が小さい分だけ後ろから出る
    var bulletSpeed = PLAYER_BULLET_SPEED * (odActive ? OD_BULLET_SPEED_MUL : 1);
    for (var ni = 0; ni < offsets.length; ni++) {
      bullets.push({
        x: player.x + ca * forwards[ni] + px * offsets[ni],
        y: player.y + sa * forwards[ni] + py * offsets[ni],
        vx: ca * bulletSpeed, vy: sa * bulletSpeed,
        angle: player.angle,
        // 発動中は弾が大きくなり、ダメージ2倍、敵を貫通する
        r: odActive ? OD_BULLET_R : BULLET_R,
        dmg: odActive ? BULLET_DAMAGE * OD_DAMAGE_MUL : BULLET_DAMAGE,
        pierce: odActive, gold: odActive,
        sizeMul: odActive ? OD_BULLET_SIZE_MUL : 1,
        hitUids: odActive ? {} : null
      });
    }
  }

  // 自機の弾（削除は dead フラグを立て、最後に一括除去する）
  // 移動前の位置（px, py）も残す：オーバードライブ中の弾速3倍では
  // 1フレームの移動量が小さい敵の直径を超え、点判定だけだと
  // すり抜けるため、当たり判定は移動の線分で行う。
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -20 || b.x > WORLD_W + 20 || b.y < -20 || b.y > WORLD_H + 20) b.dead = true;
  }

  // 敵：移動コンポーネント + 攻撃コンポーネント
  for (i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    if (e.dead) continue; // 誘爆などで既に倒れた敵は動かさない
    // アンプのバフ／ダメージ無効化／パルス波紋の残り時間
    if (e.buffTimer > 0) e.buffTimer -= dt;
    if (e.invulnTimer > 0) e.invulnTimer -= dt;
    if (e.pulseT > 0) e.pulseT -= dt;
    // 移動速度の倍率：アンプのバフ（+20%）と凍結エリア（×0.45）を合成し、
    // 移動部品を呼ぶ間だけ e.speed へ反映する（部品側の数式は従来どおり。
    // 突進など e.speed を使わない動きは moveMul を部品側で参照する）。
    e.frosted = inFrost(e.x, e.y);
    e.moveMul = (e.buffTimer > 0 ? AMP_SPEED_BUFF_MUL : 1) * (e.frosted ? FROST_SLOW : 1);
    var baseSpeed = e.speed;
    e.speed = baseSpeed * e.moveMul;
    e.move(e, dt);
    e.speed = baseSpeed;
    e.rot += e.rotSpeed * dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.shieldFlash > 0) e.shieldFlash -= dt;
    var pdx = e.x - player.x, pdy = e.y - player.y;
    var distP = Math.sqrt(pdx * pdx + pdy * pdy);
    if (e.attackFn && distP < ATTACK_RANGE) {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = e.fireInterval;
        e.attackFn(e, dt);
      }
    }
    // ボマー／フロスターの起爆：近づくと点滅カウントダウンのあと起爆
    // （スコアは入らない）。ボマーは範囲ダメージ、フロスターは凍結エリア。
    if ((e.type === "bomber" || e.type === "froster") && !e.dead) {
      if (e.fuse < 0 && distP < BOMBER_TRIGGER_DIST) e.fuse = BOMBER_FUSE_TIME;
      if (e.fuse >= 0) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          e.dead = true;
          spawnShards(e);
          if (e.type === "bomber") bomberBlast(e); else frosterBlast(e);
          continue;
        }
      }
    }
    // 自機から遠く離れた敵、ワールドの外に出た敵は消す
    if (distP > DESPAWN_DIST || e.x < -70 || e.x > WORLD_W + 70 || e.y < -70 || e.y > WORLD_H + 70) e.dead = true;
  }

  // 敵の弾
  for (i = enemyBullets.length - 1; i >= 0; i--) {
    var eb = enemyBullets[i];
    eb.x += eb.vx * dt; eb.y += eb.vy * dt;
    if (eb.x < -16 || eb.x > WORLD_W + 16 || eb.y < -16 || eb.y > WORLD_H + 16) eb.dead = true;
  }

  // 当たり判定：自機の弾 × 敵
  for (i = bullets.length - 1; i >= 0; i--) {
    b = bullets[i];
    if (b.dead) continue;
    for (var j = enemies.length - 1; j >= 0; j--) {
      e = enemies[j];
      if (e.dead) continue;
      // 線分（前フレーム位置→現在位置）に最も近い点で判定する
      var segX = b.x - (b.px != null ? b.px : b.x), segY = b.y - (b.py != null ? b.py : b.y);
      var segLen2 = segX * segX + segY * segY;
      var segT = segLen2 > 0 ? ((e.x - (b.px != null ? b.px : b.x)) * segX + (e.y - (b.py != null ? b.py : b.y)) * segY) / segLen2 : 0;
      segT = segT < 0 ? 0 : (segT > 1 ? 1 : segT);
      var hitX = (b.px != null ? b.px : b.x) + segX * segT, hitY = (b.py != null ? b.py : b.y) + segY * segT;
      var dx = hitX - e.x, dy = hitY - e.y, rr = e.r + b.r;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue; // 粗い振り落とし
      if (dx * dx + dy * dy < rr * rr) {
        // 貫通弾（オーバードライブ中）は、同じ敵を二度撃ちしない
        if (b.pierce && b.hitUids[e.uid]) continue;
        // ガーディアンの正面ガード：進行方向の正面側から当たった弾は
        // 盾で無効化される。背後側から当たった弾だけが通る。
        // ただし貫通弾は盾ごと貫いてダメージが通る。
        if (e.type === "guardian" && !b.pierce) {
          // 盾の向きは旋回上限付きの faceAngle 基準（移動方向とは独立）
          var shieldA = e.faceAngle != null ? e.faceAngle : e.dirAngle;
          var front = dx * Math.cos(shieldA) + dy * Math.sin(shieldA);
          if (front > 0) {
            b.dead = true;
            e.shieldFlash = 0.16;
            spawnSparks(hitX, hitY, "#9fd0ff", 3);
            break;
          }
        }
        // アンプのダメージ無効化：無効化中の敵に当たった通常弾は
        // 消滅し、ダメージは入らない（盾と同じ扱い）。ただし貫通弾
        // （オーバードライブ中）は無効化を貫いて通常どおり通る。
        if (e.invulnTimer > 0 && !b.pierce) {
          b.dead = true;
          spawnSparks(hitX, hitY, "#ffffff", 3);
          break;
        }
        if (b.pierce) b.hitUids[e.uid] = true; // この敵にはもう当たらない
        else b.dead = true;
        e.hp -= b.dmg; // 通常弾は BULLET_DAMAGE（0.25）、発動中は2倍
        e.flash = 0.09; // 命中フラッシュ（白いスプライトへ切替）
        spawnSparks(hitX, hitY, e.color, 3); // 命中時の小さな火花
        if (e.hp <= 0) killEnemy(e);
        if (!b.pierce) break;
        // 貫通弾は消えずに飛び続け、後ろの敵にも当たる
      }
    }
  }

  // 当たり判定：自機の弾 × ボス（砲塔・本体・バリア・処刑中の残骸）
  bossBulletCollisions();

  // 当たり判定：自機 × 敵弾 / 敵本体
  if (player.invincible <= 0) {
    var damaged = false;
    for (i = enemyBullets.length - 1; i >= 0; i--) {
      eb = enemyBullets[i];
      if (eb.dead) continue;
      dx = eb.x - player.x; dy = eb.y - player.y; rr = player.r + eb.r - 2;
      if (dx * dx + dy * dy < rr * rr) {
        eb.dead = true;
        damagePlayer(eb.dmg || ENEMY_BULLET_DMG); // 通常弾-10、拡散弾・回転弾幕は-5
        damaged = true;
        break;
      }
    }
    if (!damaged) {
      for (j = enemies.length - 1; j >= 0; j--) {
        e = enemies[j];
        if (e.dead) continue;
        dx = e.x - player.x; dy = e.y - player.y; rr = player.r + e.r - 3;
        if (dx * dx + dy * dy < rr * rr) {
          if (e.type === "bomber") {
            // ボマーへの接触はそのまま爆発（範囲ダメージは爆発側で処理）
            e.dead = true;
            spawnShards(e);
            bomberBlast(e);
          } else if (e.type === "froster") {
            // フロスターへの接触：倒れてその場で起爆し、凍結エリアを残す
            e.dead = true;
            spawnShards(e);
            frosterBlast(e);
            damagePlayer(CONTACT_DMG);
          } else {
            burst(e.x, e.y, e.color, 12);
            e.dead = true;
            damagePlayer(CONTACT_DMG);
          }
          break;
        }
      }
    }
    // 自機 × ボス本体・砲塔（処刑中・撃破演出中の残骸は無害で当たらない）
    if (!damaged && boss && boss.phase !== "exec" && boss.phase !== "finish" && player.invincible <= 0) {
      var bdx = boss.x - player.x, bdy = boss.y - player.y, brr = player.r + boss.r - 3;
      if (bdx * bdx + bdy * bdy < brr * brr) {
        damagePlayer(CONTACT_DMG);
      } else {
        for (var bti = 0; bti < boss.turrets.length; bti++) {
          var btr = boss.turrets[bti];
          if (!btr.alive) continue;
          var tdx = btr.x - player.x, tdy = btr.y - player.y, trr = player.r + BOSS_TURRET_R - 3;
          if (tdx * tdx + tdy * tdy < trr * trr) { damagePlayer(CONTACT_DMG); break; }
        }
      }
    }
  }

  // dead フラグの付いた要素を一括除去する。要素が多い時に
  // splice を繰り返すと配列シフトが積み重なって重くなるため。
  sweepDead(enemies); sweepDead(bullets); sweepDead(enemyBullets);

  updateFx(dt);
  // シェイクの減衰：大きな揺れでもダラダラ続かず、鋭く収まるよう指数減衰に。
  // （従来の線形減衰のまま振幅だけ上げると、揺れが長引きすぎて酔いやすい）
  if (shake > 0) {
    shake *= Math.exp(-7.5 * dt);
    if (shake < 0.15) shake = 0;
  }
  updateHud();
}

/* ============================================================
   HUD
   ============================================================ */
var el = {
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  time: document.getElementById("time"),
  hpFill: document.getElementById("hp-fill"),
  hpNum: document.getElementById("hp-num"),
  odFill: document.getElementById("od-fill"),
  odNum: document.getElementById("od-num"),
  odWrap: document.getElementById("core-wrap"),
  odGlow: document.getElementById("od-glow"),
  bossWrap: document.getElementById("boss-wrap"),
  bossFill: document.getElementById("boss-fill"),
  bossPhase: document.getElementById("boss-phase")
};
function fmtTime(sec) {
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}
// HUDは毎フレーム呼ばれるが、DOMへ触るのは値が変わった時だけ。
// 毎フレームの textContent / style 書き込みはレイアウト再計算を招く。
var hudCache = { score: -1, best: -1, timeSec: -1, hp: -1, band: "", low: null, odPct: -1, odText: "", odMode: null };
function updateHud() {
  if (score !== hudCache.score) { hudCache.score = score; el.score.textContent = score; }
  if (best !== hudCache.best) { hudCache.best = best; el.best.textContent = best; }
  var tsec = Math.floor(elapsed);
  if (tsec !== hudCache.timeSec) { hudCache.timeSec = tsec; el.time.textContent = fmtTime(elapsed); }
  var pct = Math.max(player.hp, 0);
  if (pct !== hudCache.hp) {
    hudCache.hp = pct;
    el.hpFill.style.width = pct + "%";
    el.hpNum.textContent = pct;
  }
  var band = pct <= 25 ? "low" : (pct <= 55 ? "mid" : "");
  if (band !== hudCache.band) { hudCache.band = band; el.hpFill.className = band; }
  var low = state === "playing" && pct <= 25;
  if (low !== hudCache.low) { hudCache.low = low; stage.classList.toggle("lowhp", low); }
  // オーバードライブ：充電中は貯まり具合（%）を表示し、満タンが
  // 近づくと明滅。発動中はゲージが残り時間表示に切り替わり、
  // 画面の縁の金色グローもここで出し入れする。
  var odPct, odText, odMode;
  if (odActive) {
    odPct = Math.round(odTimer / OD_DURATION * 100);
    odText = odTimer.toFixed(1) + "s";
    odMode = "active";
  } else {
    odPct = Math.floor(odGauge);
    odText = odPct + "%";
    odMode = odGauge >= 80 ? "nearfull" : "";
  }
  if (odPct !== hudCache.odPct) { hudCache.odPct = odPct; el.odFill.style.width = odPct + "%"; }
  if (odText !== hudCache.odText) { hudCache.odText = odText; el.odNum.textContent = odText; }
  if (odMode !== hudCache.odMode) {
    hudCache.odMode = odMode;
    el.odWrap.className = odMode;
    el.odGlow.className = odActive ? "on" : "";
  }
  updateBossBar();
}
// ボスバー：砲塔＋本体の残量合算を1本で示す。処刑突入時は砕ける演出を
// 優先し、演出が終わったら隠す。値が変わった時だけDOMへ触る。
var bossBarCache = { pct: -1, phase: "", visible: null };
function updateBossBar() {
  var show = !!boss && boss.phase !== "exec" && boss.phase !== "finish";
  if (bossBarShatterT > 0) show = true; // 砕ける演出の間は出し続ける
  if (!boss && bossBarShatterT <= 0) show = false;
  if (show !== bossBarCache.visible) {
    bossBarCache.visible = show;
    el.bossWrap.hidden = !show;
    if (show) el.bossWrap.className = boss && boss.phase === 2 ? "phase2" : "";
  }
  if (!show || !boss) return;
  if (bossBarShatterT > 0) return; // 砕ける演出中はクラス・値を触らない
  var cur = Math.max(boss.coreHp, 0);
  for (var i = 0; i < boss.turrets.length; i++) cur += Math.max(boss.turrets[i].hp, 0);
  var pct = Math.round(cur / boss.totalMax * 100);
  if (pct !== bossBarCache.pct) { bossBarCache.pct = pct; el.bossFill.style.width = pct + "%"; }
  var ph = boss.phase === 2 ? "PHASE 2" : "PHASE 1";
  if (ph !== bossBarCache.phase) {
    bossBarCache.phase = ph;
    el.bossPhase.textContent = ph;
    el.bossWrap.className = boss.phase === 2 ? "phase2" : "";
  }
}

/* ============================================================
   画面遷移
   ============================================================ */
var ovTitle = document.getElementById("ov-title");
var ovOver = document.getElementById("ov-over");
var ovPause = document.getElementById("ov-pause");

function startGame() {
  ensureAudio();
  resetGame();
  state = "playing";
  ovTitle.hidden = true; ovOver.hidden = true; ovPause.hidden = true;
}
function gameOver() {
  state = "over";
  odActive = false; odTimer = 0; odGauge = 0; // 金色グロー等を残さない
  stickRelease(leftStick); stickRelease(rightStick);
  var isRecord = score > best;
  if (isRecord) best = score;
  document.getElementById("final-score").textContent = score;
  document.getElementById("final-best").textContent = best;
  document.getElementById("final-time").textContent = fmtTime(elapsed);
  document.getElementById("new-record").hidden = !isRecord;
  ovOver.hidden = false;
  updateHud();
}
function pauseGame() {
  if (state !== "playing") return;
  state = "paused";
  stickRelease(leftStick); stickRelease(rightStick);
  mouseDown = false;
  ovPause.hidden = false;
}
function resumeGame() {
  if (state !== "paused") return;
  ensureAudio();
  state = "playing";
  ovPause.hidden = true;
}
document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-retry").addEventListener("click", startGame);
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-pause").addEventListener("click", function () {
  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
});
/* ============================================================
   全画面＋横向き固定
   ボタンを押すとステージを全画面にし、対応端末では画面の
   向きを横向きにロックする。全画面中にもう一度押すと解除。
   全画面・向きロックに未対応の端末（iPhone Safari等）では
   何も起きないよう、失敗はすべて静かに握りつぶす。
   ============================================================ */
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFsIcon() {
  var fs = isFullscreen();
  document.getElementById("ic-fs-expand").style.display = fs ? "none" : "";
  document.getElementById("ic-fs-shrink").style.display = fs ? "" : "none";
  document.getElementById("btn-fs").setAttribute("aria-label", fs ? "全画面を終了" : "全画面（横向き固定）");
}
function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      var p = screen.orientation.lock("landscape");
      if (p && p.catch) p.catch(function () {});
    }
  } catch (err) { /* 未対応端末では無視 */ }
}
// 右上のアイコンボタンと、タイトル画面の「全画面で遊ぶ」ボタンで共用
function toggleFullscreen() {
  if (isFullscreen()) {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (err) {}
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) { try { exit.call(document); } catch (err) {} }
    return;
  }
  var req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (!req) { lockLandscape(); return; } // 全画面未対応でも向きロックだけ試す
  var result;
  try { result = req.call(stage, { navigationUI: "hide" }); }
  catch (err) {
    try { result = req.call(stage); } catch (err2) { result = null; }
  }
  if (result && result.then) result.then(lockLandscape, lockLandscape);
  else setTimeout(lockLandscape, 60);
}
document.getElementById("btn-fs").addEventListener("click", toggleFullscreen);
document.getElementById("btn-fs-title").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", function () { updateFsIcon(); resize(); });
document.addEventListener("webkitfullscreenchange", function () { updateFsIcon(); resize(); });

document.getElementById("btn-sound").addEventListener("click", function () {
  soundOn = !soundOn;
  document.getElementById("ic-sound-on").style.display = soundOn ? "" : "none";
  document.getElementById("ic-sound-off").style.display = soundOn ? "none" : "";
  if (soundOn) ensureAudio();
});
document.addEventListener("visibilitychange", function () {
  if (document.hidden && state === "playing") pauseGame();
});
