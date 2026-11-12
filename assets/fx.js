"use strict";
/* ============================================================
   演出と撃破まわり（fx.js）：演出オブジェクトの更新・プール再利用、
   撃破処理、ボマーの爆発、破片・衝撃波・火花の生成。
   上限と大きさの数値は config.js の設定表を参照する。
   ============================================================ */

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
  odActive = true;
  odTimer = OD_DURATION;
  odGauge = 100;
  spawnRing(player.x, player.y, "#ffc233", 3);
  burst(player.x, player.y, "#ffc233", 22);
  gridPulse = 1;
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
    odGauge += OD_GAIN[e.type] || 4;
    if (odGauge >= 100) activateOverdrive();
  }
  var big = e.maxHp >= 3;
  // コンボ：短い間隔で倒し続けると伸びる（表示と音程のみ。スコア倍率は付けない）
  comboCount = comboTimer > 0 ? comboCount + 1 : 1;
  comboTimer = COMBO_WINDOW;
  comboPop = 1;
  // 撃破演出：形・色の破片、光の粉、衝撃波リング、火花
  spawnShards(e);
  burst(e.x, e.y, e.color, big ? 20 : 12);
  spawnRing(e.x, e.y, e.color, e.maxHp);
  spawnSparks(e.x, e.y, e.color, big ? 7 : 4);
  gridPulse = 1; // 背景グリッドが脈打つ
  // 画面シェイクも体力比例：耐久1で11、耐久3で30（従来どおり）、
  // それ以上は比例で伸ばすが上限を抑える。
  var shakeHp = clamp(e.maxHp, 0.25, 5);
  shake = Math.max(shake, SHAKE_HP1 + (shakeHp - 1) * (SHAKE_HP3 - SHAKE_HP1) / 2);
  if (big) {
    hitStop = e.maxHp >= 10 ? 0.08 : 0.06; // 一瞬だけ時を止める
  }
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({
    x: e.x, y: e.y - 8, text: "+" + e.score,
    life: 0.8, maxLife: 0.8, pop: 1, big: big, color: e.color
  });
  sfxExplosion(big);
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
    t.hp -= BOMBER_ENEMY_DMG;
    t.flash = 0.09;
    if (t.hp <= 0) killEnemy(t); // ボマーなら killEnemy 内でさらに誘爆
  }
  var pdx = player.x - e.x, pdy = player.y - e.y;
  if (state === "playing" && player.invincible <= 0 &&
      pdx * pdx + pdy * pdy <= (BOMBER_RADIUS + player.r) * (BOMBER_RADIUS + player.r)) {
    damagePlayer(BOMBER_PLAYER_DMG);
  }
  shake = Math.max(shake, 18);
  sfxExplosion(true);
}

// 敵の形・色そのままの破片になって砕け散る
function spawnShards(e) {
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
    s.shape = e.shape; s.color = e.color;
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

function damagePlayer(amount) {
  player.hp -= amount;
  player.invincible = PLAYER_INVINCIBLE_TIME;
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
