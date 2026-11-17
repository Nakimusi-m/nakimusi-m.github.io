"use strict";
/* ============================================================
   子機（ドローン）（drones.js）
   共通基盤（追従・耐久・復帰）と役割ごとの処理（アタッカーの
   散弾／スナイパーの狙撃／ガードのシールド／ブースターのOD連動）、
   ドロップカプセル（取得・修理・代替報酬）とボス撃破報酬、
   子機HUDをここに集約する。
   数値は config.js の DRONE_* / CAPSULE_* を参照する。
   game.js から分離したもので、挙動・数値は従来どおり。
   ============================================================ */

// ---- 子機の状態と役割定義 ----
// ---- 子機（ドローン）用ステート ----
var drones = [];              // 所持中の子機 {role, x, y, hp, down, reviveT, fireTimer, aim}
var capsules = [];            // 漂っているドロップカプセル {x, y, role, life}
// 子機の役割定義（順序はボス報酬の優先順位にも使う）
var DRONE_ROLES = {
  attacker: { max: DRONE_ATTACKER_MAX, name: "アタッカー", color: "#ff8c1a" },
  guard: { max: DRONE_GUARD_MAX, name: "ガード", color: "#2d7bff" },
  booster: { max: DRONE_BOOSTER_MAX, name: "ブースター", color: "#ffc233" },
  sniper: { max: DRONE_SNIPER_MAX, name: "スナイパー", color: "#2ee6a0" }
};
var DRONE_ROLE_ORDER = ["attacker", "guard", "booster", "sniper"];

/* ============================================================
   子機（ドローン）
   役割ごとに指定位置へ追従し、アタッカーは散弾、ガードは
   シールド、ブースターはOD強化、スナイパーは長射程の狙撃を担う。
   全機が敵弾を体で防ぎ、
   HPが尽きると30秒の機能停止に入る（OD発動では回復しない）。
   数値は config.js の DRONE_* / CAPSULE_* を参照する。
   ============================================================ */
function droneCount(role) {
  var n = 0;
  for (var i = 0; i < drones.length; i++) if (drones[i].role === role) n++;
  return n;
}
// 稼働中（機能停止でない）ブースターの数。ODの強化計算に使う
function activeBoosterCount() {
  var n = 0;
  for (var i = 0; i < drones.length; i++) if (drones[i].role === "booster" && !drones[i].down) n++;
  return n;
}
function addDrone(role) {
  var idx = droneCount(role);
  drones.push({
    role: role, x: player.x, y: player.y,
    hp: DRONE_HP[role], maxHp: DRONE_HP[role], down: false, reviveT: 0,
    fireTimer: 0.25 + idx * 0.13, // 複数機は発射タイミングをずらす
    aim: player.angle,
    // ガードのシールドHP制（他役割では未使用）：満タンで展開し、
    // 0になると割れて shieldRegenT 秒後に全回復で自動再展開する
    shieldHp: DRONE_GUARD_SHIELD_HP, shieldDown: false, shieldRegenT: 0, shieldFlash: 0,
    // スナイパーの照準ステート（他役割では未使用）：照準中は目標を保持する
    snipeState: null, snipeTarget: null, snipeTimer: 0
  });
}
// 点(x, y)を覆っている、シールド展開中のガードの数（ダメージカットの計算用）。
// シールドが割れている間は軽減も切れるので数に入れない。
function guardCoverCount(x, y) {
  var n = 0;
  for (var i = 0; i < drones.length; i++) {
    var d = drones[i];
    if (d.role !== "guard" || d.down || d.shieldDown) continue;
    var dx = x - d.x, dy = y - d.y;
    if (dx * dx + dy * dy <= DRONE_GUARD_SHIELD_R * DRONE_GUARD_SHIELD_R) n++;
  }
  return n;
}
// ガードのシールドが敵弾を1発受けた：シールドHPが1減り、
// 0になると割れる（演出＋音）。再展開までのタイマーは updateDrones が進める。
function hitGuardShield(d) {
  if (d.shieldDown) return;
  d.shieldHp -= 1;
  d.shieldFlash = 0.14;
  spawnSparks(d.x, d.y, "#9fd0ff", 2);
  sfxShieldHit();
  if (d.shieldHp <= 0) {
    d.shieldHp = 0;
    d.shieldDown = true;
    d.shieldRegenT = DRONE_GUARD_SHIELD_REGEN;
    burst(d.x, d.y, "#9fd0ff", 16);
    spawnRing(d.x, d.y, "#9fd0ff", 2);
    sfxShieldBreak();
  }
}
// 子機が敵弾を受けた：弾1発＝ダメージ1（ガード圏内ならカット適用）。
// HPが尽きると機能停止し、30秒後に自動復帰する。
function damageDrone(d) {
  if (d.down) return;
  var cutMul = 1 - DRONE_GUARD_CUT * guardCoverCount(d.x, d.y);
  d.hp -= cutMul;
  spawnSparks(d.x, d.y, DRONE_ROLES[d.role].color, 3);
  if (d.hp <= 0) {
    d.hp = 0; d.down = true; d.reviveT = DRONE_REVIVE_TIME;
    burst(d.x, d.y, "#8a97a8", 8);
    sfxDroneDown();
  }
}
// OD発動の瞬間に、その回の時間・連射・移動・ノズル数を固定する
function snapshotOverdrive() {
  var b = activeBoosterCount();
  odDur = OD_DURATION + OD_TIME_PER_BOOSTER * b;
  var frac = b / DRONE_BOOSTER_MAX; // 0機で半分、3機で現行どおりへ線形補間
  odFireMul = OD_FIRE_MUL_BASE + (OD_FIRE_INTERVAL_MUL - OD_FIRE_MUL_BASE) * frac;
  odMoveMul = OD_MOVE_MUL_BASE + (OD_MOVE_SPEED_MUL - OD_MOVE_MUL_BASE) * frac;
  var n = 2 + b; // ノズル数：2＋稼働ブースター数（最大5）
  if (n === 2) { odOffsets = [-7, 7]; odForwards = [20, 20]; }
  else if (n === 3) { odOffsets = [-11, 0, 11]; odForwards = [13, 20, 13]; }
  else if (n === 4) { odOffsets = OD_NOZZLE_OFFSETS; odForwards = OD_NOZZLE_FORWARD; }
  else { odOffsets = [-14, -7, 0, 7, 14]; odForwards = [12, 18, 20, 18, 12]; }
  odMuzzles = [];
  for (var i = 0; i < odOffsets.length; i++) odMuzzles.push([odOffsets[i], -odForwards[i] - 2]);
}
// 役割ごとの指定位置（基準は自機の向き）。idx は同役割内の順番。
function droneSlotTarget(d, idx) {
  var ca = Math.cos(player.angle), sa = Math.sin(player.angle);
  var px = -sa, py = ca; // 進行方向と直角
  var f, s;
  if (d.role === "attacker") {
    // 斜め前方2枠のみ：前方左・前方右の順に埋まる
    var diag = DRONE_ATTACKER_DIST / Math.SQRT2;
    f = diag;
    s = (idx % 2 === 0) ? -diag : diag;
  } else if (d.role === "sniper") {
    // 斜め後方2枠：後方左・後方右の順に埋まる
    var sdiag = DRONE_SNIPER_DIST / Math.SQRT2;
    f = -sdiag;
    s = (idx % 2 === 0) ? -sdiag : sdiag;
  } else { // guard：斜め後方2か所
    var gdiag = DRONE_GUARD_DIST / Math.SQRT2;
    f = -gdiag;
    s = (idx === 0) ? -gdiag : gdiag;
  }
  return { x: player.x + ca * f + px * s, y: player.y + sa * f + py * s };
}
// ブースターの目標点：自機の向いている方向（照準方向）の後ろ側に、
// (idx+1)機分離れて一列に並ぶ点。自機が向きを変えると尾も後ろ側へ
// 回り込む（追従は速度上限付きなので、多少の遅れとたわみが出る）。
function boosterTailTarget(idx) {
  var want = (idx + 1) * DRONE_BOOSTER_GAP;
  return { x: player.x - Math.cos(player.angle) * want, y: player.y - Math.sin(player.angle) * want };
}
// 子機を目標点へ「ある程度の速度」で移動させる。
// 最高速度は役割ごとに異なる（DRONE_FOLLOW_SPEEDS：アタッカー320／
// ブースター300／スナイパー290／ガード280）。目標に近づくと距離に
// 比例して減速し、滑らかに収まる。大きく引き離された時だけ上限を
// DRONE_FOLLOW_CATCHUP_SPEED まで上げ（全役割共通）、置き去りに
// なって破綻しないようにする。
function moveDroneTo(d, tx, ty, dt) {
  var dx = tx - d.x, dy = ty - d.y;
  var dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.5) return;
  var followSpeed = DRONE_FOLLOW_SPEEDS[d.role] || DRONE_FOLLOW_SPEEDS.booster;
  var cap = dist > DRONE_FOLLOW_CATCHUP_DIST ? DRONE_FOLLOW_CATCHUP_SPEED : followSpeed;
  var spd = Math.min(cap, dist * (followSpeed / DRONE_FOLLOW_ARRIVE_R));
  var step = Math.min(dist, spd * dt);
  d.x += dx / dist * step;
  d.y += dy / dist * step;
}
function updateDrones(dt) {
  var roleIdx = { attacker: 0, guard: 0, booster: 0, sniper: 0 };
  for (var i = 0; i < drones.length; i++) {
    var d = drones[i];
    var idx = roleIdx[d.role]++;
    // 機能停止中は復帰タイマーを進める（追従だけは続ける）
    if (d.down) {
      d.reviveT -= dt;
      if (d.reviveT <= 0) { d.down = false; d.hp = d.maxHp; burst(d.x, d.y, DRONE_ROLES[d.role].color, 6); }
    }
    // ---- ガードのシールド：割れている間は再展開タイマーを進める ----
    if (d.role === "guard") {
      if (d.shieldFlash > 0) d.shieldFlash -= dt;
      if (d.shieldDown) {
        d.shieldRegenT -= dt;
        if (d.shieldRegenT <= 0) {
          d.shieldDown = false;
          d.shieldHp = DRONE_GUARD_SHIELD_HP; // 全回復で自動再展開
          spawnRing(d.x, d.y, "#9fd0ff", 1);
          sfxShieldRestore();
        }
      }
    }
    // ---- 指定位置への追従（役割ごとの最高速度つき移動） ----
    var tgt = d.role === "booster" ? boosterTailTarget(idx) : droneSlotTarget(d, idx);
    moveDroneTo(d, tgt.x, tgt.y, dt);
    d.x = clamp(d.x, 8, WORLD_W - 8); d.y = clamp(d.y, 8, WORLD_H - 8);
    // ---- アタッカーの散弾（全機共通） ----
    if (d.role === "attacker" && !d.down) {
      d.fireTimer -= dt;
      if (d.fireTimer <= 0) {
        d.fireTimer = DRONE_ATTACKER_INTERVAL;
        droneAttackerFire(d);
      }
    }
    // ---- スナイパーの狙撃（照準→発射のステートマシン） ----
    if (d.role === "sniper" && !d.down) {
      updateDroneSniper(d, dt);
    } else if (d.role === "sniper") {
      d.snipeState = null; d.snipeTarget = null; // 機能停止中は照準を解除
    }
  }
}
// 子機の共通目標探索：射程内の最寄りの敵（ボスの砲塔・本体も含む）を
// {kind, ref, x, y} で返す。スナイパーは照準中も目標を追い続けるため、
// 位置は ref から都度引き直せる形で保持する。
function findDroneTarget(d, range) {
  var bestT = null, bestD2 = range * range;
  var i, dx, dy, d2;
  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead) continue;
    dx = e.x - d.x; dy = e.y - d.y; d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; bestT = { kind: "enemy", ref: e, x: e.x, y: e.y }; }
  }
  if (boss && boss.phase !== "finish") {
    for (i = 0; i < boss.turrets.length; i++) {
      var tr = boss.turrets[i];
      if (!tr.alive) continue;
      dx = tr.x - d.x; dy = tr.y - d.y; d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestT = { kind: "turret", ref: tr, x: tr.x, y: tr.y }; }
    }
    // 本体は第1段階からダメージが通るので、常に照準候補に入れる
    dx = boss.x - d.x; dy = boss.y - d.y; d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; bestT = { kind: "boss", ref: boss, x: boss.x, y: boss.y }; }
  }
  return bestT;
}
// 保持中の目標の現在位置を返す。目標が倒れた・消えた場合は null
// （スナイパーは照準を中止して狙い直す）。
function droneTargetPos(t) {
  if (!t) return null;
  if (t.kind === "enemy") {
    if (t.ref.dead) return null;
    return { x: t.ref.x, y: t.ref.y };
  }
  if (t.kind === "turret") {
    if (!t.ref.alive) return null;
    return { x: t.ref.x, y: t.ref.y };
  }
  // boss
  if (!boss || boss.phase === "finish") return null;
  return { x: boss.x, y: boss.y };
}
// 描画側（照準線）が使う：スナイパーの現在の照準先
function droneSniperAimPos(d) {
  if (d.snipeState !== "aim") return null;
  return droneTargetPos(d.snipeTarget);
}
// アタッカー：最寄りの敵（ボスの砲塔・本体も含む）へ散弾5粒
function droneAttackerFire(d) {
  var bestT = findDroneTarget(d, DRONE_ATTACKER_RANGE);
  if (!bestT) return;
  var base = Math.atan2(bestT.y - d.y, bestT.x - d.x);
  d.aim = base;
  for (var pk = -2; pk <= 2; pk++) {
    var a = base + pk * (DRONE_PELLET_SPREAD / 2);
    bullets.push({
      x: d.x + Math.cos(a) * 12, y: d.y + Math.sin(a) * 12,
      vx: Math.cos(a) * DRONE_PELLET_SPEED, vy: Math.sin(a) * DRONE_PELLET_SPEED,
      angle: a, r: 2.2, dmg: DRONE_PELLET_DMG,
      pierce: false, gold: false, sizeMul: 0.7, hitUids: null,
      drone: true, rangeLeft: DRONE_PELLET_RANGE
    });
  }
}
// スナイパー：射程内の最寄りの目標へ照準線を DRONE_SNIPER_AIM_TIME 秒
// 表示してから単発を撃つ。照準中に目標が倒れたら撃たずに狙い直す。
// 射程内に目標がいない時は撃たない（短い間隔で探し直すだけ）。
function updateDroneSniper(d, dt) {
  if (d.snipeState === "aim") {
    var pos = droneTargetPos(d.snipeTarget);
    if (!pos) { // 照準中に目標が倒れた：中止して狙い直しへ
      d.snipeState = null; d.snipeTarget = null;
      d.fireTimer = 0.2;
      return;
    }
    d.aim = Math.atan2(pos.y - d.y, pos.x - d.x); // 照準線は目標を追い続ける
    d.snipeTimer -= dt;
    if (d.snipeTimer <= 0) {
      var a = Math.atan2(pos.y - d.y, pos.x - d.x);
      bullets.push({
        x: d.x + Math.cos(a) * 13, y: d.y + Math.sin(a) * 13,
        vx: Math.cos(a) * DRONE_SNIPER_BULLET_SPEED, vy: Math.sin(a) * DRONE_SNIPER_BULLET_SPEED,
        angle: a, r: 2.6, dmg: DRONE_SNIPER_DMG,
        pierce: false, gold: false, sizeMul: 0.9, hitUids: null,
        drone: true, snipe: true, rangeLeft: DRONE_SNIPER_BULLET_RANGE
      });
      d.snipeState = null; d.snipeTarget = null;
      d.fireTimer = DRONE_SNIPER_INTERVAL;
    }
    return;
  }
  d.fireTimer -= dt;
  if (d.fireTimer <= 0) {
    var t = findDroneTarget(d, DRONE_SNIPER_RANGE);
    if (t) {
      d.snipeState = "aim"; d.snipeTarget = t; d.snipeTimer = DRONE_SNIPER_AIM_TIME;
      d.aim = Math.atan2(t.y - d.y, t.x - d.x);
    } else {
      d.fireTimer = 0.15; // 目標なし：少し待って探し直す
    }
  }
}
// ---- ドロップカプセル ----
function spawnCapsule(x, y, role) {
  capsules.push({ x: x, y: y, role: role, life: CAPSULE_LIFE, phase: rand(0, Math.PI * 2) });
}
function updateCapsules(dt) {
  for (var i = capsules.length - 1; i >= 0; i--) {
    var c = capsules[i];
    c.life -= dt;
    if (c.life <= 0) { capsules.splice(i, 1); continue; }
    var dx = player.x - c.x, dy = player.y - c.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < CAPSULE_MAGNET_R) {
      // 近づくと吸い寄せられる（近いほど速く）
      var sp = 210 + (CAPSULE_MAGNET_R - dist) * 9;
      c.x += dx / dist * sp * dt; c.y += dy / dist * sp * dt;
    }
    if (dist < CAPSULE_PICKUP_R) {
      pickupCapsule(c);
      capsules.splice(i, 1);
    }
  }
}
// カプセル取得時の処理（役割ごとに次の優先順位）：
// 1. 空きスロットがある → 新しい子機が1機増える
// 2. 満員で機能停止中の子機がいる → 復帰までの残り時間が一番長い
//    子機が、その場で完全修理される（HP全回復＋即座に稼働再開）
// 3. 満員で停止中はいないが傷ついた子機がいる → HPの残りが一番
//    少ない子機が完全修理される（HP全回復）
// 4. 満員で全機が無傷 → 代替報酬+300点（スコアのみ、HP回復はなし）
function pickupCapsule(c) {
  var role = c.role;
  if (role === "random") role = DRONE_ROLE_ORDER[Math.floor(Math.random() * DRONE_ROLE_ORDER.length)];
  var text = null, color = DRONE_ROLES[role].color;
  if (droneCount(role) < DRONE_ROLES[role].max) {
    addDrone(role);
    text = DRONE_ROLES[role].name + " +1";
  } else {
    var repair = null, i, d;
    // 優先2：停止中の中で、復帰までの残り時間（reviveT）が一番長い機
    for (i = 0; i < drones.length; i++) {
      d = drones[i];
      if (d.role === role && d.down && (!repair || d.reviveT > repair.reviveT)) repair = d;
    }
    // 優先3：稼働中の中で、HPの残りが一番少ない機
    if (!repair) {
      for (i = 0; i < drones.length; i++) {
        d = drones[i];
        if (d.role === role && !d.down && d.hp < d.maxHp && (!repair || d.hp < repair.hp)) repair = d;
      }
    }
    if (repair) {
      repair.hp = repair.maxHp;
      repair.down = false;
      repair.reviveT = 0;
      burst(repair.x, repair.y, color, 8);
      spawnRing(repair.x, repair.y, color, 1);
      text = DRONE_ROLES[role].name + " 修理完了";
    } else {
      score += CAPSULE_FALLBACK_SCORE;
      text = "+" + CAPSULE_FALLBACK_SCORE;
      color = "#e8f6ff";
    }
  }
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({ x: player.x, y: player.y - 26, text: text, life: 0.9, maxLife: 0.9, pop: 1, big: true, color: color });
  sfxPickup();
  updateHud();
}
// ボス撃破報酬の子機+1：まだ持っていない役割を優先し、
// 次に機数の少ない役割（同数なら attacker→guard→booster→sniper の順）。
// 全役割が上限なら +1,000点。
function grantBossDroneReward() {
  var role = null, i, cnt;
  for (i = 0; i < DRONE_ROLE_ORDER.length; i++) {
    if (droneCount(DRONE_ROLE_ORDER[i]) === 0) { role = DRONE_ROLE_ORDER[i]; break; }
  }
  if (!role) {
    var bestCnt = Infinity;
    for (i = 0; i < DRONE_ROLE_ORDER.length; i++) {
      cnt = droneCount(DRONE_ROLE_ORDER[i]);
      if (cnt < DRONE_ROLES[DRONE_ROLE_ORDER[i]].max && cnt < bestCnt) { bestCnt = cnt; role = DRONE_ROLE_ORDER[i]; }
    }
  }
  if (!role) {
    score += BOSS_DRONE_FALLBACK_SCORE;
    if (popups.length >= MAX_POPUPS) popups.shift();
    popups.push({ x: player.x, y: player.y - 40, text: "+" + BOSS_DRONE_FALLBACK_SCORE, life: 1.0, maxLife: 1.0, pop: 1, big: true, color: "#e8f6ff" });
    return;
  }
  addDrone(role);
  if (popups.length >= MAX_POPUPS) popups.shift();
  popups.push({ x: player.x, y: player.y - 40, text: DRONE_ROLES[role].name + " +1", life: 1.1, maxLife: 1.1, pop: 1, big: true, color: DRONE_ROLES[role].color });
  sfxPickup();
}


/* ============================================================
   子機HUD：game.js の updateHud から呼ばれる
   ============================================================ */
// 子機HUD：HP／ODバーの下に、役割アイコン＋機数（×n）を小さく出す。
// 機能停止中の機数はグレーで「停止×n」として添える。変化時のみDOM更新。
var droneRowCache = "";
var DRONE_ICONS = {
  attacker: '<svg viewBox="-10 -10 20 20"><path d="M0 -7 L5.5 5 L-5.5 5 Z" fill="none" stroke="#ff8c1a" stroke-width="2.4"/></svg>',
  guard: '<svg viewBox="-10 -10 20 20"><circle cx="0" cy="2" r="4.5" fill="none" stroke="#2d7bff" stroke-width="2.2"/><path d="M-7 -3 A7.6 7.6 0 0 1 7 -3" fill="none" stroke="#9fd0ff" stroke-width="3"/></svg>',
  booster: '<svg viewBox="-10 -10 20 20"><circle cx="0" cy="0" r="5.5" fill="none" stroke="#ffc233" stroke-width="3.4"/></svg>',
  sniper: '<svg viewBox="-10 -10 20 20"><path d="M0 -8 L4 0 L0 8 L-4 0 Z" fill="none" stroke="#2ee6a0" stroke-width="2.2"/></svg>'
};
function updateDroneRow() {
  if (!el.droneRow) return;
  var html = "";
  for (var ri = 0; ri < DRONE_ROLE_ORDER.length; ri++) {
    var role = DRONE_ROLE_ORDER[ri];
    var cnt = 0, down = 0;
    for (var i = 0; i < drones.length; i++) {
      if (drones[i].role === role) { cnt++; if (drones[i].down) down++; }
    }
    if (cnt === 0) continue;
    html += '<span class="drone-chip">' + DRONE_ICONS[role] + '<span class="drone-cnt">×' + cnt + '</span></span>';
    if (down > 0) html += '<span class="drone-chip down">停止×' + down + '</span>';
  }
  if (html === droneRowCache) return;
  droneRowCache = html;
  el.droneRow.innerHTML = html;
  el.droneRow.hidden = html === "";
}
