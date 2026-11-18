"use strict";
/* ============================================================
   演出と撃破まわり（fx.js）：演出オブジェクトの更新・プール再利用、
   撃破処理、ボマーの爆発、破片・衝撃波・火花の生成。
   上限と大きさの数値は config.js の設定表を参照する。
   ============================================================ */

// ---- 新敵の演出オブジェクト ----
// ヒーラーの回復ビーム {x1,y1,x2,y2,life,maxLife} と、ステッパーの
// 移動残像（ゴースト）{x,y,spr,life,maxLife}。どちらも短命で少数なので
// プール化はせず、寿命で除去するだけに留める（上限は発生側で抑える）。
var healBeams = [];
var stepperGhosts = [];
// カプセル取得時の光の筋 {x1,y1,life,maxLife,color}：取得位置から自機へ吸い込まれる
var pickupStreaks = [];
// ---- グリッド背景の演出オブジェクト（見た目のみ） ----
// 波紋 {x,y,color,life,maxLife,r}／歪み {x,y,r,amp,blastRadius,life,maxLife}／
// ボスの波動 {x,y,r,life,maxLife}／エネルギーの流れ {horiz,line,pos,dir,len,speed}
var gridRipples = [];
var gridDistortions = [];
var bossWaves = [];
var gridFlows = [];
var bossWaveEmitter = null; // {x,y,t,count}：登場後約1.5秒で最大3波を出す
var gridFlowTimer = 2.8;    // 次のエネルギーの流れまでの残り時間
var gridFxTime = 0;         // グリッド演出の経過時間（呼吸の位相に使う）
// グリッドの変位（歪み＋ボスの波動）を1点ぶん計算し、_gridOffX/Y へ返す
var _gridOffX = 0, _gridOffY = 0;
function computeGridOffset(x, y) {
  _gridOffX = 0; _gridOffY = 0;
  var i, dx, dy, d, fall, env, str;
  for (i = 0; i < gridDistortions.length; i++) {
    var dz = gridDistortions[i];
    dx = x - dz.x; dy = y - dz.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d >= dz.r || d < 0.01) continue;
    fall = 1 - d / dz.r;
    fall = fall * fall * (3 - 2 * fall); // 端で滑らかに0になる
    env = Math.max(dz.life, 0) / dz.maxLife; // 出た瞬間が最大で、時間で戻る
    str = dz.amp * env * fall;
    _gridOffX += dx / d * str;
    _gridOffY += dy / d * str;
  }
  for (i = 0; i < bossWaves.length; i++) {
    var wv = bossWaves[i];
    dx = x - wv.x; dy = y - wv.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) continue;
    var diff = d - wv.r;
    if (diff > BOSS_WAVE_BAND || diff < -BOSS_WAVE_BAND) continue;
    var k = 1 - Math.abs(diff) / BOSS_WAVE_BAND;
    var fade = Math.max(wv.life, 0) / wv.maxLife;
    // 波面で最大になる外向きの膨らみ＝線そのものが波打って見える
    str = BOSS_WAVE_AMP * k * k * fade;
    _gridOffX += dx / d * str;
    _gridOffY += dy / d * str;
  }
}
// 波紋を出す（上限を超える時は一番古いものを消す）
function spawnGridRipple(x, y, color) {
  if (gridRipples.length >= GRID_RIPPLE_MAX) gridRipples.shift();
  gridRipples.push({ x: x, y: y, color: color, life: GRID_RIPPLE_LIFE, maxLife: GRID_RIPPLE_LIFE, r: 0 });
}
// 歪みを出す：歪みの半径とたわみ量は爆発の規模（爆発半径）に比例する
function spawnGridDistortion(x, y, blastRadius) {
  if (gridDistortions.length >= GRID_DISTORT_MAX) gridDistortions.shift();
  var amp = GRID_DISTORT_REF_AMP * Math.pow(blastRadius / GRID_DISTORT_REF_R, GRID_DISTORT_AMP_EXP);
  var dur = GRID_DISTORT_TIME_MIN + clamp((blastRadius - GRID_DISTORT_REF_R) / (BOSS_FINAL_BLAST_R - GRID_DISTORT_REF_R), 0, 1) * (GRID_DISTORT_TIME_MAX - GRID_DISTORT_TIME_MIN);
  gridDistortions.push({ x: x, y: y, blastRadius: blastRadius, r: blastRadius * GRID_DISTORT_RATIO, amp: amp, life: dur, maxLife: dur });
}
// ボス登場時の波動を開始する（約1.5秒の間に最大3波を順に出す）
function spawnBossWaves(x, y) {
  bossWaveEmitter = { x: x, y: y, t: 0, count: 0 };
}
function spawnBossWave(x, y) {
  if (bossWaves.length >= BOSS_WAVE_MAX) bossWaves.shift();
  bossWaves.push({ x: x, y: y, r: 0, life: BOSS_WAVE_MAX_R / BOSS_WAVE_SPEED, maxLife: BOSS_WAVE_MAX_R / BOSS_WAVE_SPEED });
}
// エネルギーの流れを1本出す：カメラ範囲内のグリッド線（60px格子）に沿わせる
function spawnGridFlow() {
  if (gridFlows.length >= GRID_FLOW_MAX || !player) return;
  var horiz = Math.random() < 0.5;
  var len = rand(GRID_FLOW_LEN[0], GRID_FLOW_LEN[1]);
  var dir = Math.random() < 0.5 ? -1 : 1;
  if (horiz) {
    var ly = clamp(Math.round((player.y + rand(-VIEW_H / 2, VIEW_H / 2)) / 60) * 60, 0, WORLD_H);
    gridFlows.push({ horiz: true, line: ly, pos: dir > 0 ? player.x - VIEW_W / 2 - len : player.x + VIEW_W / 2, dir: dir, len: len, speed: GRID_FLOW_SPEED });
  } else {
    var lx = clamp(Math.round((player.x + rand(-VIEW_W / 2, VIEW_W / 2)) / 60) * 60, 0, WORLD_W);
    gridFlows.push({ horiz: false, line: lx, pos: dir > 0 ? player.y - VIEW_H / 2 - len : player.y + VIEW_H / 2, dir: dir, len: len, speed: GRID_FLOW_SPEED });
  }
}
// 被弾方向表示：最後に当たった方向（自機→発生源の角度）と残り表示時間
var damageDirAngle = 0, damageDirT = 0;
// ゲーム中のベスト更新バナー
var recordBannerT = 0, recordShown = false;
// アークの電気音の間引きタイマ
var arcCrackleT = 0;
// ステッパーの残像を1つ残す（上限内でのみ。スプライトは敵のものを共用）
function spawnStepperGhost(e) {
  if (stepperGhosts.length >= STEPPER_GHOST_MAX) return;
  stepperGhosts.push({ x: e.x, y: e.y, spr: e.spr, life: STEPPER_GHOST_LIFE, maxLife: STEPPER_GHOST_LIFE });
}

// 演出オブジェクトの更新。除去は末尾との入れ替え（swap-remove）で
// O(1) にし、使い終わったオブジェクトはプールへ戻して再利用する。
function updateFx(dt) {
  var i, p, last;
  for (i = particles.length - 1; i >= 0; i--) {
    p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) {
      last = particles.pop();
      if (last !== p) particles[i] = last;
      particlePool.push(p);
    }
  }
  for (i = shards.length - 1; i >= 0; i--) {
    p = shards[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    p.rot += p.vr * dt;
    p.life -= dt;
    if (p.life <= 0) {
      last = shards.pop();
      if (last !== p) shards[i] = last;
      shardPool.push(p);
    }
  }
  for (i = rings.length - 1; i >= 0; i--) {
    p = rings[i];
    p.r += p.vr * dt;
    p.vr *= 0.9;
    p.life -= dt;
    if (p.life <= 0) {
      last = rings.pop();
      if (last !== p) rings[i] = last;
      ringPool.push(p);
    }
  }
  for (i = sparks.length - 1; i >= 0; i--) {
    p = sparks[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= dt;
    if (p.life <= 0) {
      last = sparks.pop();
      if (last !== p) sparks[i] = last;
      sparkPool.push(p);
    }
  }
  for (i = popups.length - 1; i >= 0; i--) {
    var t = popups[i];
    t.y -= 34 * dt; t.life -= dt;
    if (t.pop > 0) t.pop = Math.max(0, t.pop - dt / 0.22);
    if (t.life <= 0) popups.splice(i, 1);
  }
  // ヒーラーの回復ビームとステッパーの残像の寿命
  for (i = healBeams.length - 1; i >= 0; i--) {
    healBeams[i].life -= dt;
    if (healBeams[i].life <= 0) healBeams.splice(i, 1);
  }
  for (i = stepperGhosts.length - 1; i >= 0; i--) {
    stepperGhosts[i].life -= dt;
    if (stepperGhosts[i].life <= 0) stepperGhosts.splice(i, 1);
  }
  for (i = pickupStreaks.length - 1; i >= 0; i--) {
    pickupStreaks[i].life -= dt;
    if (pickupStreaks[i].life <= 0) pickupStreaks.splice(i, 1);
  }
  if (damageDirT > 0) damageDirT -= dt;
  if (recordBannerT > 0) recordBannerT -= dt;
  // グリッド背景の演出の更新（波紋・歪み・ボスの波動・エネルギーの流れ・呼吸）
  gridFxTime += dt;
  for (i = gridRipples.length - 1; i >= 0; i--) {
    gridRipples[i].life -= dt;
    gridRipples[i].r = Math.min((gridRipples[i].maxLife - Math.max(gridRipples[i].life, 0)) * GRID_RIPPLE_SPEED, GRID_RIPPLE_MAX_R);
    if (gridRipples[i].life <= 0) gridRipples.splice(i, 1);
  }
  for (i = gridDistortions.length - 1; i >= 0; i--) {
    gridDistortions[i].life -= dt;
    if (gridDistortions[i].life <= 0) gridDistortions.splice(i, 1);
  }
  if (bossWaveEmitter) {
    bossWaveEmitter.t += dt;
    while (bossWaveEmitter.count < BOSS_WAVE_COUNT && bossWaveEmitter.t >= bossWaveEmitter.count * BOSS_WAVE_INTERVAL) {
      spawnBossWave(bossWaveEmitter.x, bossWaveEmitter.y);
      bossWaveEmitter.count++;
    }
    if (bossWaveEmitter.count >= BOSS_WAVE_COUNT) bossWaveEmitter = null;
  }
  for (i = bossWaves.length - 1; i >= 0; i--) {
    bossWaves[i].r += BOSS_WAVE_SPEED * dt;
    bossWaves[i].life -= dt;
    if (bossWaves[i].life <= 0 || bossWaves[i].r >= BOSS_WAVE_MAX_R) bossWaves.splice(i, 1);
  }
  gridFlowTimer -= dt;
  if (gridFlowTimer <= 0) {
    spawnGridFlow();
    gridFlowTimer = rand(GRID_FLOW_INTERVAL[0], GRID_FLOW_INTERVAL[1]);
  }
  for (i = gridFlows.length - 1; i >= 0; i--) {
    var gf = gridFlows[i];
    gf.pos += gf.dir * gf.speed * dt;
    var camC = gf.horiz ? (player ? player.x : gf.pos) : (player ? player.y : gf.pos);
    var viewHalf = gf.horiz ? VIEW_W / 2 : VIEW_H / 2;
    if (gf.pos - gf.len > camC + viewHalf + 30 || gf.pos + gf.len < camC - viewHalf - 30) gridFlows.splice(i, 1);
  }
  // コンボの残り時間・ポップ、グリッド脈動、マズルの減衰
  if (state === "playing") {
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) comboCount = 0;
    }
    if (comboPop > 0) comboPop = Math.max(0, comboPop - dt / 0.25);
  }
  if (gridPulse > 0) gridPulse = Math.max(0, gridPulse - dt / 0.45);
  if (flashWhite > 0) flashWhite = Math.max(0, flashWhite - dt / 0.55);
  if (player && player.muzzle > 0) player.muzzle -= dt;
}

// 撃破演出の大きさは最大体力に比例させる。基準は既存の敵：
// 耐久1＝現行の小リング／揺れ11、耐久3＝現行の大リング／揺れ30とし、
// その間を比例でつなぎ、それ以上は画面を覆わない上限で抑える。
function fxHp(hp) { return clamp(hp, 0.25, 6); }

// オーバードライブ発動：満タンの瞬間に自動で切り替わる。
// 自機の周りに金色のリングと光を広げ、効果音でも知らせる。
function activateOverdrive() {
  // 発動の瞬間の稼働ブースター数で、その回の時間・ノズル数・上昇量を固定する
  snapshotOverdrive();
  odActive = true;
  odTimer = odDur;
  odGauge = 100;
  // 子機はOD発動では回復しない（修理はカプセル取得時の修理ルールのみ）
  spawnRing(player.x, player.y, "#ffc233", 3);
  burst(player.x, player.y, "#ffc233", 22);
  gridPulse = 1;
  spawnGridRipple(player.x, player.y, "#ffc233"); // OD発動：金色の波紋がグリッドを広がる
  sfxOverdriveStart();
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  score += e.score;
  // オーバードライブのゲージ：撃破で貯まる（発動中は貯まらない）。
  // 満タンになった瞬間に自動発動する。
  // ボス戦中は一切貯まらない（bossGaugeLocked は game.js。召喚ダーター
  // なども対象外で、満タンになるのはボス本体を倒し切った時だけ）。
  if (!odActive && !bossGaugeLocked()) {
    // ゲージ獲得量：基本0.8倍＋稼働ブースター1機につき+0.2倍（常時計算）
    odGauge += (OD_GAIN[e.type] || 4) * (OD_GAIN_BASE_MUL + OD_GAIN_PER_BOOSTER * activeBoosterCount());
    if (odGauge >= 100) activateOverdrive();
  }
  // 子機カプセルのドロップ（ボス戦中は発生しない）：
  // 元の4種（スパイラル→アタッカー、ガーディアン→ガード、アンプ→
  // ブースター、スナイパー→スナイパー）は DRONE_DROP_PROB（20%）。
  // 上位種3体（サイクロン→アタッカー、イージス→ガード、デッドアイ→
  // スナイパー）は確定（100%）。タンクはドロップしない。
  if (!boss) {
    if (e.type === "cyclone") spawnCapsule(e.x, e.y, "attacker");
    else if (e.type === "aegis") spawnCapsule(e.x, e.y, "guard");
    else if (e.type === "deadeye") spawnCapsule(e.x, e.y, "sniper");
    else if (Math.random() < DRONE_DROP_PROB) {
      if (e.type === "spiral") spawnCapsule(e.x, e.y, "attacker");
      else if (e.type === "guardian") spawnCapsule(e.x, e.y, "guard");
      else if (e.type === "amp") spawnCapsule(e.x, e.y, "booster");
      else if (e.type === "sniper") spawnCapsule(e.x, e.y, "sniper");
    }
  }
  var big = e.maxHp >= 3;
  var isBigKill = !!BIG_KILL_TYPES[e.type]; // タンク・上位種3体
  // コンボ：短い間隔で倒し続けると伸びる（表示と音程のみ。スコア倍率は付けない）
  comboCount = comboTimer > 0 ? comboCount + 1 : 1;
  comboTimer = COMBO_WINDOW;
  comboPop = 1;
  // 撃破演出：形・色の破片、光の粉、衝撃波リング、火花。
  // 破片は敵の色に合わせ、オーバードライブ中の撃破は金色にする。
  spawnShards(e, odActive ? "#ffc233" : null);
  burst(e.x, e.y, odActive ? "#ffc233" : e.color, big ? 20 : 12);
  spawnRing(e.x, e.y, e.color, e.maxHp);
  spawnSparks(e.x, e.y, e.color, big ? 7 : 4);
  gridPulse = 1; // 背景グリッドが脈打つ
  // 画面シェイクも体力比例：耐久1で11、耐久3で30（従来どおり）、
  // それ以上は比例で伸ばすが上限を抑える。
  var shakeHp = clamp(e.maxHp, 0.25, 5);
  shake = Math.max(shake, SHAKE_HP1 + (shakeHp - 1) * (SHAKE_HP3 - SHAKE_HP1) / 2);
  if (isBigKill) {
    // 大きな敵：小さな衝撃波（白い輪）＋短いヒットストップ
    hitStop = BIG_KILL_HITSTOP;
    spawnRing(e.x, e.y, "#ffffff", 2);
    spawnGridRipple(e.x, e.y, e.color); // 大型撃破：敵の色の波紋がグリッドを広がる
  } else if (big) {
    hitStop = e.maxHp >= 10 ? 0.08 : 0.06; // 一瞬だけ時を止める
  }
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({
    x: e.x, y: e.y - 8, text: "+" + e.score,
    life: 0.8, maxLife: 0.8, pop: 1, big: big, color: e.color
  });
  // 撃破音は大きさで3段階（小=高く軽く／中／大・上位種=低く重く）
  sfxExplosionTier(isBigKill || e.maxHp >= 6 ? 2 : (e.maxHp >= 2 ? 1 : 0));
  // ゲーム中のベスト更新：ベスト（前回記録）を超えた瞬間に一度だけ知らせる
  if (!recordShown && best > 0 && score > best && state === "playing") {
    recordShown = true;
    recordBannerT = RECORD_BANNER_TIME;
    sfxFanfare();
  }
  // 分裂：世代制。親→子→孫→ひ孫（splitlet）まで2体ずつに分かれ、
  // ひ孫で終わる。子は親の位置に重ねず、自機方向と直角の両側へ
  // 34pxずつ離して出し、外向きの押し出しも付けて団子にならないようにする。
  if (e.splitNext) {
    var toPr = Math.atan2(player.y - e.y, player.x - e.x);
    var perpX = -Math.sin(toPr), perpY = Math.cos(toPr);
    for (var si = -1; si <= 1; si += 2) {
      spawnEnemy(e.splitNext,
        clamp(e.x + perpX * si * SPLIT_OFFSET, 24, WORLD_W - 24),
        clamp(e.y + perpY * si * SPLIT_OFFSET, 24, WORLD_H - 24),
        toPr * 180 / Math.PI + si * 26,
        { driftX: perpX * si * SPLIT_DRIFT_SPEED, driftY: perpY * si * SPLIT_DRIFT_SPEED, driftTime: SPLIT_DRIFT_TIME });
    }
  }
  // ボマーを倒した時は爆発で周囲の敵を巻き込む（誘爆の連鎖あり）
  if (e.type === "bomber") bomberBlast(e);
  // フロスターを倒した時はその場で起爆し、凍結エリアを残す
  if (e.type === "froster") frosterBlast(e);
  // アンプを倒すと、そのアンプが付与したバフはすべて即座に解除される
  if (e.type === "amp") clearAmpBuffs(e);
}

// フロスターの起爆：ダメージはなく、代わりに凍結エリアを残す。
// 自爆（カウントダウン満了）でも撃墜でも、こちらを通って発生する。
// エリア内の自機と敵はすべて移動速度が FROST_SLOW 倍になる。
function frosterBlast(e) {
  if (e.blastDone) return;
  e.blastDone = true;
  frostZones.push({ x: e.x, y: e.y, r: FROST_RADIUS, life: FROST_DURATION, maxLife: FROST_DURATION });
  burst(e.x, e.y, e.color, 20);
  spawnRing(e.x, e.y, e.color, 2);
  spawnSparks(e.x, e.y, e.color, 8);
  gridPulse = 1;
  sfxExplosion(false);
}

// アンプが倒れた時、そのアンプのバフを付けた敵からバフを外す
function clearAmpBuffs(amp) {
  for (var i = 0; i < enemies.length; i++) {
    var o = enemies[i];
    if (o.buffFrom === amp) {
      o.buffTimer = 0;
      o.invulnTimer = 0;
      o.buffFrom = null;
    }
  }
}

// ボマーの大爆発：範囲内の敵にダメージを与え（ボマーは誘爆）、
// 自機が範囲内なら通常の衝突（-25）より大きい-35のダメージ。
function bomberBlast(e) {
  if (e.blastDone) return;
  e.blastDone = true;
  burst(e.x, e.y, e.color, 26);
  spawnRing(e.x, e.y, e.color, 3); // 爆発の輪は大リング相当
  spawnSparks(e.x, e.y, e.color, 9);
  gridPulse = 1;
  spawnGridDistortion(e.x, e.y, BOMBER_RADIUS); // 爆発の規模（半径130）に比例した歪み
  // まず巻き込む敵を確定させてから処理する（分裂で増えた敵を
  // 同じ爆発で巻き込まないため）
  var targets = [];
  for (var i = 0; i < enemies.length; i++) {
    var o = enemies[i];
    if (o === e || o.dead) continue;
    var dx = o.x - e.x, dy = o.y - e.y;
    if (dx * dx + dy * dy <= BOMBER_RADIUS * BOMBER_RADIUS) targets.push(o);
  }
  for (i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.dead) continue;
    t.hp -= BOMBER_ENEMY_DMG * aegisDamageMul(t); // イージスのオーラ圏内は20%カット
    t.flash = 0.09;
    if (t.hp <= 0) killEnemy(t); // ボマーなら killEnemy 内でさらに誘爆
  }
  var pdx = player.x - e.x, pdy = player.y - e.y;
  if (state === "playing" && player.invincible <= 0 &&
      pdx * pdx + pdy * pdy <= (BOMBER_RADIUS + player.r) * (BOMBER_RADIUS + player.r)) {
    damagePlayer(BOMBER_PLAYER_DMG, e.x, e.y);
  }
  shake = Math.max(shake, 18);
  sfxExplosion(true);
}

// 敵の形・色そのままの破片になって砕け散る（colorOverride があればその色で）
function spawnShards(e, colorOverride) {
  var n = e.maxHp >= 3 ? 8 : 6;
  for (var i = 0; i < n; i++) {
    if (shards.length >= MAX_SHARDS) return;
    var a = Math.random() * Math.PI * 2, sp = rand(60, 300);
    var s = obtain(shardPool);
    s.x = e.x; s.y = e.y;
    s.vx = Math.cos(a) * sp + e.vx * 0.3;
    s.vy = Math.sin(a) * sp + e.vy * 0.3;
    s.rot = rand(0, Math.PI * 2); s.vr = rand(-6, 6);
    s.life = s.maxLife = rand(0.35, 0.6);
    // 破片の大きさは従来の10倍（みのるん指定）を基準に最大体力へ比例。
    // 係数は耐久1で1.0、耐久3で1.2（既存の見た目がほぼ変わらない範囲）、
    // 耐久10でも上限側（体力6相当）で抑える。
    s.size = rand(e.r * 0.3, e.r * 0.55) * SHARD_SIZE_MUL * (0.9 + 0.1 * fxHp(e.maxHp));
    s.shape = e.shape; s.color = colorOverride || e.color;
    shards.push(s);
  }
}

// 衝撃波リング：広がる速さ（＝届く大きさ）と太さは最大体力に比例。
// 耐久1＝従来の小（2600／太さ25）、耐久3＝従来の大（3400／太さ35）
// に正確に合わせ、その間と先を比例で伸縮。タンク（耐久10）でも
// 体力6相当を上限とし、画面を覆い尽くさないようにする。
function spawnRing(x, y, color, maxHp) {
  if (rings.length >= MAX_RINGS) return;
  var t = (fxHp(maxHp) - 1) / 2; // 耐久1で0、耐久3で1
  var r = obtain(ringPool);
  r.x = x; r.y = y; r.color = color;
  r.r = 6; r.vr = RING_BASE_SPEED + t * RING_SPEED_PER_TIER;
  r.life = r.maxLife = RING_LIFE;
  r.width = RING_BASE_WIDTH + t * RING_WIDTH_PER_TIER;
  rings.push(r);
}

// 命中・撃破時の小さな火花（短い線で描く）
function spawnSparks(x, y, color, n) {
  for (var i = 0; i < n; i++) {
    if (sparks.length >= MAX_SPARKS) return;
    var a = Math.random() * Math.PI * 2, sp = rand(60, 260);
    var s = obtain(sparkPool);
    s.x = x; s.y = y;
    s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
    s.life = s.maxLife = rand(0.1, 0.24);
    s.color = color;
    sparks.push(s);
  }
}

// srcX/srcY はダメージの発生源（任意）。渡されれば被弾方向の弧を出す。
function damagePlayer(amount, srcX, srcY) {
  // ガード子機のシールド：自機が圏内にいる間、ガード1機につき30%カット
  var cutMul = 1 - DRONE_GUARD_CUT * guardCoverCount(player.x, player.y);
  if (cutMul < 1) amount = Math.round(amount * cutMul * 10) / 10;
  player.hp -= amount;
  player.invincible = PLAYER_INVINCIBLE_TIME;
  if (srcX != null && srcY != null) {
    damageDirAngle = Math.atan2(srcY - player.y, srcX - player.x);
    damageDirT = DMG_ARC_TIME;
  }
  shake = 7;
  sfxHit();
  if (player.hp <= 0) {
    player.hp = 0;
    burst(player.x, player.y, "#22e6ff", 30);
    sfxGameOver();
    gameOver();
  }
  updateHud();
}

// 上昇する粒子（子機の復帰演出用）。上限内でのみ出す
function burstRising(x, y, color, n) {
  for (var i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) return;
    var p = obtain(particlePool);
    p.x = x + rand(-9, 9); p.y = y + rand(-6, 6);
    p.vx = rand(-16, 16); p.vy = rand(-95, -45);
    p.life = rand(0.35, 0.6); p.maxLife = 0.6;
    p.size = rand(1.5, 3); p.color = color;
    particles.push(p);
  }
}
// エンジン粒子：移動中、進行方向と逆へ小さな光を1つ出す（呼び出し側で間引く）
function spawnEngineParticle(mx, my) {
  if (particles.length >= MAX_PARTICLES) return;
  var p = obtain(particlePool);
  var back = Math.atan2(-my, -mx) + rand(-0.35, 0.35);
  var sp = rand(45, 95);
  p.x = player.x + Math.cos(back) * 13; p.y = player.y + Math.sin(back) * 13;
  p.vx = Math.cos(back) * sp; p.vy = Math.sin(back) * sp;
  p.life = rand(0.22, 0.38); p.maxLife = 0.38;
  p.size = rand(1.4, 2.8); p.color = odActive ? "#ffc233" : "#22e6ff";
  particles.push(p);
}

function burst(x, y, color, n) {
  for (var i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) return;
    var a = Math.random() * Math.PI * 2, sp = rand(40, 240);
    var p = obtain(particlePool);
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.life = rand(0.3, 0.75); p.maxLife = 0.75;
    p.size = rand(1.5, 3.5); p.color = color;
    particles.push(p);
  }
}
