"use strict";
/* ============================================================
   ボス「ペルマフロスト」（boss.js）
   状態機械（予告→登場→第1段階→第2段階→処刑→撃破演出→静けさ）、
   砲塔、氷結弾と凍結エリア、ボスバー表示をここに集約する。
   数値は config.js の BOSS_* / FROST_* を参照する。
   game.js から分離したもので、挙動・数値は従来どおり。
   ============================================================ */

// ---- ボスの状態 ----
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

// ---- 凍結エリア（フロスターとボスの氷結弾で共用） ----
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

// ---- ボス弾の生成（難易度倍率は diffSpeed 経由で適用） ----
// ボスの弾は連射が激しいため、発射音なしで直接積む
function spawnBossBullet(x, y, angle, speed, dmg) {
  var sp = diffSpeed(speed); // ボス弾（拡散・バースト・回転弾幕）にも同じ倍率
  enemyBullets.push({ x: x, y: y, vx: Math.cos(angle) * sp, vy: Math.sin(angle) * sp, r: 4.5, dmg: dmg });
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
      { side: -1, hp: turretMax, maxHp: turretMax, alive: true, wreck: false, x: 0, y: 0, aim: 0, fireTimer: 0.5, swingPhase: 0, flash: 0, mode: "spread", modeTimer: BOSS_TURRET_SPREAD_TIME, burstLeft: 0, burstTimer: 0 },
      { side: 1, hp: turretMax, maxHp: turretMax, alive: true, wreck: false, x: 0, y: 0, aim: 0, fireTimer: 0.65, swingPhase: Math.PI, flash: 0, mode: "spread", modeTimer: BOSS_TURRET_SPREAD_TIME - turretCycleHalf, burstLeft: 0, burstTimer: 0 }
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
      b.x += Math.cos(b.chargeAngle) * diffSpeed(BOSS_CHARGE_SPEED * frostMul) * dt;
      b.y += Math.sin(b.chargeAngle) * diffSpeed(BOSS_CHARGE_SPEED * frostMul) * dt;
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
    var speed = diffSpeed((b.phase === 2 ? BOSS_SPEED_P2 : BOSS_SPEED) * frostMul);
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
      iceShots.push({ x: b.x, y: b.y, sx: b.x, sy: b.y, tx: tg.x, ty: tg.y, t: 0, dur: Math.max(tdist / diffSpeed(BOSS_ICE_SPEED), 0.25) });
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
  tr.alive = false; tr.wreck = false; tr.hp = 0;
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

// 本体を倒し切った：処刑フェイズへ。ゲージ満タンでOD発動、タイマーは止まる。
// 砲塔が残ったまま本体を倒した場合、残っていた砲塔はこの時点で機能を
// 停止し、残骸の一部として本体に付いたまま無力化する。個別の破壊得点
// （BOSS_SCORE_TURRET）は付かず、destroyTurret は呼ばない（第2段階への
// 移行も起きない）。処刑完了の大爆発で本体と一緒に消える。
function enterExecution() {
  var b = boss;
  for (var wi = 0; wi < b.turrets.length; wi++) {
    var wtr = b.turrets[wi];
    if (wtr.alive) { wtr.alive = false; wtr.wreck = true; wtr.hp = 0; wtr.flash = 0; }
  }
  b.phase = "exec";
  b.execHp = b.execMax;
  b.execTimer = 0;
  enemyBullets = []; // 決着の瞬間に弾幕は消える
  odGauge = 100;
  if (!odActive) activateOverdrive(); else { odTimer = odDur; }
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
  grantBossDroneReward(); // 撃破報酬：子機+1（全役割上限なら+1,000点）
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

// 残っている砲塔の数（本体ダメージ倍率とバリアの濃さに使う）
function bossAliveTurretCount() {
  if (!boss) return 0;
  var n = 0;
  for (var i = 0; i < boss.turrets.length; i++) if (boss.turrets[i].alive) n++;
  return n;
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
    if (bl.pierce) bl.hitUids.bossBody = true; else bl.dead = true;
    b.flash = 0.09;
    if (b.phase === "exec") {
      spawnSparks(hit.x, hit.y, "#ffc233", 3);
      // サンドバッグ：撃たれるたびに震え、破片を落とす
      b.execHp -= bl.dmg;
      b.shakeT = 0.09;
      if (Math.random() < 0.4) burst(hit.x, hit.y, "#7fd8ff", 2);
      if (b.execHp <= 0) { startBossFinish(); return; }
    } else {
      // 本体は第1段階からダメージを受ける。ただし残っている砲塔の数で
      // 軽減される（2機×0.25／1機×0.5／0機×1.0）。削った分は第2段階へ
      // そのまま持ち越される。砲塔が残っていても倒し切ることができ、
      // HPが0になればそのまま処刑フェイズへ移行する（下限クランプなし）。
      var aliveT = bossAliveTurretCount();
      var dmgMul = BOSS_BODY_DMG_MUL[aliveT] != null ? BOSS_BODY_DMG_MUL[aliveT] : 1;
      if (b.phase === 1) b.shieldFlash = 0.16;
      // 軽減中は火花を小さめにして「通っているが軽減されている」手応えにする
      spawnSparks(hit.x, hit.y, "#7fd8ff", dmgMul < 1 ? 2 : 3);
      b.coreHp -= bl.dmg * dmgMul;
      if (b.coreHp <= 0) { enterExecution(); }
    }
  }
}


/* ============================================================
   ボスバー（HUD）：game.js の updateHud から呼ばれる
   ============================================================ */
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

