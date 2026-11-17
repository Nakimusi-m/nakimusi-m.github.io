"use strict";
/* ============================================================
   NEON STRIKER 本体ロジック（game.js）
   敵の生成と出現ディレクター、ゲーム状態、毎フレームの更新、
   当たり判定、HUD、画面遷移と全画面まわり。
   数値は config.js、敵は enemies.js、部品は components.js、
   演出は fx.js、描画は render.js、入力は input.js を参照。
   ボス戦は boss.js、子機は drones.js に分離してある。
   難易度倍率は下の difficultyMul / diffSpeed に集約する。
   ============================================================ */

var enemyUidSeq = 0; // 貫通弾が同じ敵を二度撃ちしないための通し番号
// 敵を生成する。出現位置と初期の向き（度）を指定できる。
function spawnEnemy(typeName, x, y, headingDeg, opts) {
  opts = opts || {};
  var t = ENEMY_TYPES[typeName];
  var rad = headingDeg * Math.PI / 180;
  var speed = diffSpeed((opts.speed != null ? opts.speed : rand(t.speed[0], t.speed[1])) * diff.speedMul);
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
// ---- 難易度（タイトル／リトライ画面でのみ変更でき、プレイ中は固定） ----
var difficulty = "normal"; // デフォルトはノーマル
// 現在の難易度の速度倍率（敵の移動速度と敵弾の速度にだけ掛かる）
function difficultyMul() {
  for (var di = 0; di < DIFFICULTY_DEFS.length; di++) {
    if (DIFFICULTY_DEFS[di].id === difficulty) return DIFFICULTY_DEFS[di].mul;
  }
  return 1;
}
// 難易度倍率の適用はこの1か所に集約する：敵・敵弾・ボス関連の
// 「速さ」は、生成・更新の入口で必ず diffSpeed を通して倍率を掛ける。
// 倍率そのものの定義は DIFFICULTY_DEFS（config.js）と difficultyMul。
function diffSpeed(baseSpeed) { return baseSpeed * difficultyMul(); }
var player, bullets, enemyBullets, enemies, particles, popups, stars;
var shards, rings, sparks;
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
// ---- オーバードライブの発動中スナップショット ----
// 発動の瞬間の稼働ブースター数で固定される値（発動中にブースターが
// 停止しても、その回の時間・ノズル数・上昇量は変わらない）。
var odDur = OD_DURATION;      // その回の持続時間
var odFireMul = OD_FIRE_MUL_BASE;  // その回の連射間隔倍率
var odMoveMul = OD_MOVE_MUL_BASE;  // その回の移動速度倍率
var odOffsets = NOZZLE_OFFSETS, odForwards = NOZZLE_FORWARD, odMuzzles = MUZZLE_POS;
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
  drones = []; capsules = [];
  odDur = OD_DURATION; odFireMul = OD_FIRE_MUL_BASE; odMoveMul = OD_MOVE_MUL_BASE;
  odOffsets = NOZZLE_OFFSETS; odForwards = NOZZLE_FORWARD; odMuzzles = MUZZLE_POS;
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
  var sp = diffSpeed(speed); // 敵弾の速度にも難易度倍率が掛かる
  enemyBullets.push({ x: x, y: y, vx: dx * sp, vy: dy * sp, r: 4.5, dmg: dmg || ENEMY_BULLET_DMG });
  sfxEnemyShoot();
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
  updateDrones(dt);
  updateCapsules(dt);

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
    // オーバードライブ中は移動速度も上がる（上昇量は発動時のブースター数で固定）
    var moveSpeed = PLAYER_SPEED * (odActive ? odMoveMul : 1);
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
    // オーバードライブ中は連射間隔が短くなる（短縮量は発動時のブースター数で固定）
    player.fireTimer = FIRE_INTERVAL * (odActive ? odFireMul : 1);
    player.muzzle = 0.05; // 銃口フラッシュの表示時間
    var ca = Math.cos(player.angle), sa = Math.sin(player.angle);
    // ノズル：通常は左右2本、発動中は左右2対＝4本。
    // 進行方向と直角にずらした位置から同時に発射する。
    var px = -sa, py = ca;
    var offsets = odActive ? odOffsets : NOZZLE_OFFSETS;
    var forwards = odActive ? odForwards : NOZZLE_FORWARD;
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
    // 子機の散弾の粒は射程（飛距離）で消える
    if (b.rangeLeft != null) {
      b.rangeLeft -= Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
      if (b.rangeLeft <= 0) b.dead = true;
    }
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

  // 当たり判定：敵弾 × ガードのシールド（展開中の泡に触れた弾は
  // 消え、シールドが1発分を受ける。ボス弾も同じく1発＝1。
  // 泡の中の自機・子機にはその弾は当たらない）
  for (i = enemyBullets.length - 1; i >= 0; i--) {
    eb = enemyBullets[i];
    if (eb.dead) continue;
    for (var gi = 0; gi < drones.length; gi++) {
      var gd = drones[gi];
      if (gd.role !== "guard" || gd.down || gd.shieldDown) continue;
      dx = eb.x - gd.x; dy = eb.y - gd.y; rr = DRONE_GUARD_SHIELD_R + eb.r;
      if (dx * dx + dy * dy < rr * rr) {
        eb.dead = true;
        hitGuardShield(gd);
        break;
      }
    }
  }

  // 当たり判定：敵弾 × 子機（稼働中の子機は体で弾を防ぐ。
  // 機能停止中の子機は防げず、敵本体とは当たり判定なし＝すり抜ける）
  for (i = enemyBullets.length - 1; i >= 0; i--) {
    eb = enemyBullets[i];
    if (eb.dead) continue;
    for (var di2 = 0; di2 < drones.length; di2++) {
      var dr = drones[di2];
      if (dr.down) continue;
      dx = eb.x - dr.x; dy = eb.y - dr.y; rr = DRONE_R + eb.r - 1;
      if (dx * dx + dy * dy < rr * rr) {
        eb.dead = true;
        damageDrone(dr);
        break;
      }
    }
  }

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
  droneRow: document.getElementById("drone-row"),
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
    el.hpNum.textContent = Math.round(pct); // ガードのカットで小数のHPになるため表示は丸める
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
    odPct = Math.round(odTimer / odDur * 100);
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
  updateDroneRow();
  updateBossBar();
}
/* ============================================================
   画面遷移
   ============================================================ */
var ovTitle = document.getElementById("ov-title");
var ovOver = document.getElementById("ov-over");
var ovPause = document.getElementById("ov-pause");
var ovHowto = document.getElementById("ov-howto");
var ovZukan = document.getElementById("ov-zukan");
var ovSettings = document.getElementById("ov-settings");
var hudEl = document.getElementById("hud");
// HUDはタイトル画面では隠し、プレイ中だけ出す（タイトルをすっきり見せる）
function syncHudVisibility() {
  if (hudEl) hudEl.style.display = state === "title" ? "none" : "";
}
function hideAllPanels() {
  ovHowto.hidden = true; ovZukan.hidden = true; ovSettings.hidden = true;
}

function startGame() {
  ensureAudio();
  resetGame();
  state = "playing";
  settingsPaused = false;
  ovTitle.hidden = true; ovOver.hidden = true; ovPause.hidden = true;
  hideAllPanels();
  syncHudVisibility();
}
function goToTitle() {
  settingsPaused = false;
  hideAllPanels();
  ovOver.hidden = true; ovPause.hidden = true;
  state = "title";
  resetGame();
  ovTitle.hidden = false;
  syncHudVisibility();
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
/* ============================================================
   専用パネル（操作方法／敵図鑑／設定）
   タイトル画面右下のボタンと、ゲーム中右上の歯車ボタンから開く。
   設定パネルはタイトルとゲーム中で共通。ゲーム中に開いている間は
   ゲームを一時停止し、閉じると再開する。
   ============================================================ */
document.getElementById("btn-open-howto").addEventListener("click", function () { ovHowto.hidden = false; });
document.getElementById("btn-open-zukan").addEventListener("click", function () { ovZukan.hidden = false; });
var panelClosers = document.querySelectorAll(".panel-close[data-close]");
for (var pci = 0; pci < panelClosers.length; pci++) {
  (function (btn) {
    btn.addEventListener("click", function () {
      document.getElementById(btn.getAttribute("data-close")).hidden = true;
    });
  })(panelClosers[pci]);
}
var settingsPaused = false; // 設定を開いたことで一時停止したかどうか
function openSettings(fromGame) {
  document.getElementById("settings-game-actions").hidden = !fromGame;
  if (fromGame && state === "playing") {
    state = "paused";
    settingsPaused = true;
    stickRelease(leftStick); stickRelease(rightStick);
    mouseDown = false;
  } else {
    settingsPaused = false;
  }
  ovSettings.hidden = false;
}
function closeSettings() {
  ovSettings.hidden = true;
  if (settingsPaused && state === "paused") {
    settingsPaused = false;
    ensureAudio();
    state = "playing";
  }
}
document.getElementById("btn-open-settings-title").addEventListener("click", function () { openSettings(false); });
document.getElementById("btn-settings").addEventListener("click", function () {
  if (ovSettings.hidden) openSettings(state === "playing" || state === "paused");
  else closeSettings();
});
document.getElementById("btn-close-settings").addEventListener("click", closeSettings);
document.getElementById("btn-restart").addEventListener("click", function () { startGame(); });
document.getElementById("btn-to-title").addEventListener("click", function () { goToTitle(); });
// 設定タブ（音量／画面・その他）の切り替え
function selectSettingsTab(name) {
  var btns = document.querySelectorAll(".stab-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("selected", btns[i].getAttribute("data-tab") === name);
  }
  document.getElementById("pane-volume").hidden = name !== "volume";
  document.getElementById("pane-display").hidden = name !== "display";
}
var stabBtns = document.querySelectorAll(".stab-btn");
for (var sti = 0; sti < stabBtns.length; sti++) {
  (function (btn) {
    btn.addEventListener("click", function () { selectSettingsTab(btn.getAttribute("data-tab")); });
  })(stabBtns[sti]);
}
// 音量タブ：スライダーで masterVolume（audio.js）を調整し、ミュートもここで行う
var volRange = document.getElementById("vol-range");
var volValue = document.getElementById("vol-value");
var btnMute = document.getElementById("btn-mute");
function syncVolumeUi() {
  var pct = Math.round(masterVolume * 100);
  volRange.value = pct;
  volValue.textContent = pct + "%";
  btnMute.textContent = soundOn ? "サウンド：ON" : "サウンド：OFF（ミュート中）";
}
volRange.addEventListener("input", function () {
  masterVolume = Number(volRange.value) / 100;
  if (masterVolume > 0 && !soundOn) soundOn = true;
  syncVolumeUi();
});
btnMute.addEventListener("click", function () {
  soundOn = !soundOn;
  if (soundOn) ensureAudio();
  syncVolumeUi();
});
syncVolumeUi();
syncHudVisibility();
/* ============================================================
   難易度セレクタ（タイトル画面とリトライ画面の両方に置く）
   選択は両画面で同期する。プレイ中はどちらの画面も出ないため、
   難易度はそのプレイの間ずっと固定される。
   ============================================================ */
function setDifficulty(id) {
  difficulty = id;
  var btns = document.querySelectorAll(".diff-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("selected", btns[i].getAttribute("data-diff") === id);
  }
}
var diffBtns = document.querySelectorAll(".diff-btn");
for (var dbi = 0; dbi < diffBtns.length; dbi++) {
  (function (btn) {
    btn.addEventListener("click", function () { setDifficulty(btn.getAttribute("data-diff")); });
  })(diffBtns[dbi]);
}
setDifficulty(difficulty); // 初期表示（デフォルト＝ノーマル）を選択状態にする
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
  var label = document.getElementById("fs-settings-label");
  if (label) label.textContent = fs ? "全画面を終了" : "全画面にする（横向き固定）";
  var btn = document.getElementById("btn-fs-settings");
  if (btn) btn.setAttribute("aria-label", fs ? "全画面を終了" : "全画面（横向き固定）");
}
function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) {
      var p = screen.orientation.lock("landscape");
      if (p && p.catch) p.catch(function () {});
    }
  } catch (err) { /* 未対応端末では無視 */ }
}
// タイトル画面中央のボタンと、設定パネルのボタンで共用
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
document.getElementById("btn-fs-settings").addEventListener("click", toggleFullscreen);
document.getElementById("btn-fs-title").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", function () { updateFsIcon(); resize(); });
document.addEventListener("webkitfullscreenchange", function () { updateFsIcon(); resize(); });

document.addEventListener("visibilitychange", function () {
  if (document.hidden && state === "playing") pauseGame();
});
