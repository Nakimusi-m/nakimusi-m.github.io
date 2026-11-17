"use strict";
/* ============================================================
   移動・攻撃コンポーネント（components.js）
   名前付きの登録制：部品は registerMovement / registerAttack で
   名前を付けて登録し、敵の定義（enemies.js）は movement / attack
   欄にその名前を書くだけで組み合わせられる。
   部品の中のバランス数値は config.js の設定表を参照する。
   ============================================================ */

/* ============================================================
   移動コンポーネント
   敵は基準点(bx, by)が進み、表示位置(x, y)を各部品が決める。
   新しい動きは registerMovement("名前", function (e, dt) {...}) で
         登録するだけ。敵の定義（enemies.js）は名前で参照する。
   ============================================================ */
var Movement = {};
function registerMovement(name, fn) { Movement[name] = fn; }
  // 直進：生成時に決めた向きのまままっすぐ進む
registerMovement("straight", function (e, dt) {
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // 追跡：自機の方向へ進み続ける
registerMovement("chase", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    e.vx = dx / len * e.speed; e.vy = dy / len * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    // 分裂直後などに付けた外向きの押し出し（団子化防止）。時間で消える。
    if (e.driftTime > 0) {
      var ddt = Math.min(dt, e.driftTime);
      e.bx += e.driftVx * ddt;
      e.by += e.driftVy * ddt;
      e.driftTime -= dt;
    }
    e.x = e.bx; e.y = e.by;
});
  // ボマー専用の追跡：通常は自機へ向かうが、自爆のカウントダウン
  // （fuse）が始まると、爆発が近づくほど移動速度が大きく下がる。
  // fuse は 0.85秒から0へ減るので、進み具合 progress（0→1）の
  // 2乗に比例して減速させ、爆発直前には元の約1割まで落ちる。
  // これにより点滅が進むほど鈍くなり、逃げる余地が生まれる。
registerMovement("bomberChase", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    var effSpeed = e.speed;
    if (e.fuse >= 0) {
      var progress = clamp(1 - e.fuse / BOMBER_FUSE_TIME, 0, 1);
      effSpeed = e.speed * (1 - BOMBER_SLOW_FACTOR * progress * progress);
    }
    e.vx = dx / len * effSpeed; e.vy = dy / len * effSpeed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // ガーディアン専用の追跡：移動そのものは自機へ向かうが、盾の向き
  // （faceAngle）は角速度に上限を付けてゆっくり回す。旋回速度は
  // 従来の半分（turnSpeed）に抑えたので、自機が回り込めば盾が
  // 追いつかず、背後を取れる。
registerMovement("guardianChase", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var desired = Math.atan2(dy, dx);
    e.dirAngle = desired;
    var diffA = (desired - e.faceAngle) % (Math.PI * 2);
    if (diffA > Math.PI) diffA -= Math.PI * 2;
    if (diffA < -Math.PI) diffA += Math.PI * 2;
    var maxStep = e.turnSpeed * dt;
    if (diffA > maxStep) diffA = maxStep;
    else if (diffA < -maxStep) diffA = -maxStep;
    e.faceAngle += diffA;
    e.vx = dx / len * e.speed; e.vy = dy / len * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // 揺れ追跡：自機を追いながら、進行方向と直角にサイン波で揺れる
registerMovement("swayChase", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    e.vx = dx / len * e.speed; e.vy = dy / len * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.phase += dt * e.swayFreq;
    var off = Math.sin(e.phase) * e.swayAmp;
    e.x = e.bx + (-dy / len) * off;
    e.y = e.by + (dx / len) * off;
});
  // ダッシュ（ダーター）：普段は低速で追跡し、近づくと一瞬止まって
  // 光る予告のあと、その瞬間の自機方向へ高速で直進突進する。
registerMovement("dash", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.dashState === "approach") {
      e.dirAngle = Math.atan2(dy, dx);
      e.vx = dx / len * e.speed; e.vy = dy / len * e.speed;
      e.bx += e.vx * dt; e.by += e.vy * dt;
      if (e.dashCooldown > 0) e.dashCooldown -= dt;
      else if (len < DASH_TRIGGER_DIST) {
        e.dashState = "telegraph"; e.dashTimer = DASH_TELEGRAPH_TIME;
        e.vx = 0; e.vy = 0;
      }
    } else if (e.dashState === "telegraph") {
      // 予告中も自機を追い続け、突進開始の瞬間の方向へ飛ぶ
      e.dirAngle = Math.atan2(dy, dx);
      e.vx = 0; e.vy = 0;
      e.dashTimer -= dt;
      if (e.dashTimer <= 0) {
        e.dashState = "dashing"; e.dashTimer = DASH_TIME;
        // 突進速度も敵の移動速度として難易度倍率の対象にする
        e.dashVx = diffSpeed(Math.cos(e.dirAngle) * DASH_SPEED);
        e.dashVy = diffSpeed(Math.sin(e.dirAngle) * DASH_SPEED);
        e.vx = e.dashVx; e.vy = e.dashVy;
      }
    } else if (e.dashState === "dashing") {
      // 突進そのものも移動速度倍率（凍結エリア等）の対象にする
      var dmul = e.moveMul || 1;
      e.bx += e.dashVx * dt * dmul; e.by += e.dashVy * dt * dmul;
      e.dashTimer -= dt;
      if (e.dashTimer <= 0) { e.dashState = "recover"; e.dashTimer = DASH_RECOVER_TIME; }
    } else { // recover：突進後は少し鈍ってから再び接近する
      e.dirAngle = Math.atan2(dy, dx);
      e.vx = dx / len * e.speed * DASH_RECOVER_SPEED_MUL; e.vy = dy / len * e.speed * DASH_RECOVER_SPEED_MUL;
      e.bx += e.vx * dt; e.by += e.vy * dt;
      e.dashTimer -= dt;
      if (e.dashTimer <= 0) {
        e.dashState = "approach"; e.dashCooldown = rand(DASH_COOLDOWN[0], DASH_COOLDOWN[1]);
      }
    }
    e.x = e.bx; e.y = e.by;
});


  // 距離維持（スナイパー）：自機と約 SNIPER_RANGE の間合いを保つ。
  // 遠ければ近づき、近ければ下がり、間合いの中ではゆっくり横へ流れる。
registerMovement("keepDistance", function (e, dt) {
    var keepRange = e.keepRange || SNIPER_RANGE;
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    var radial = 0;
    if (len > keepRange + 30) radial = 1;
    else if (len < keepRange - 30) radial = -1;
    e.phase += dt * 0.6;
    var strafe = Math.sin(e.phase) * 0.35;
    e.vx = (dx / len * radial + (-dy / len) * strafe) * e.speed;
    e.vy = (dy / len * radial + (dx / len) * strafe) * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // 漂い（アンプ）：自機から少し離れた距離（AMP_RANGE）を保ちながら、
  // 接線方向へゆっくり周回する。個体ごとに周回方向（orbitDir）が違う。
registerMovement("drift", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    var radial = 0;
    if (len > AMP_RANGE + 50) radial = 1;
    else if (len < AMP_RANGE - 50) radial = -1;
    e.vx = (dx / len * radial * 0.8 + (-dy / len) * e.orbitDir * 0.55) * e.speed;
    e.vy = (dy / len * radial * 0.8 + (dx / len) * e.orbitDir * 0.55) * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // 距離維持（ヒーラー）：自機との距離を HEALER_KEEP_MIN〜MAX の帯に保つ。
  // 近ければ下がり、遠ければ寄り、帯の中では接線方向へゆっくり流れる。
  // 速度は遅め（敵定義 speed=60。難易度倍率は生成時に diffSpeed で適用済み）。
registerMovement("healerKeep", function (e, dt) {
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    var radial = 0;
    if (len > HEALER_KEEP_MAX) radial = 1;
    else if (len < HEALER_KEEP_MIN) radial = -1;
    e.phase += dt * 0.5;
    var strafe = radial === 0 ? Math.sin(e.phase) * 0.3 * e.orbitDir : e.orbitDir * 0.18;
    var radialMul = radial === 0 ? 0.3 : 1; // 帯の中ではゆっくり
    e.vx = (dx / len * radial * radialMul + (-dy / len) * strafe) * e.speed;
    e.vy = (dy / len * radial * radialMul + (dx / len) * strafe) * e.speed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.x = e.bx; e.y = e.by;
});
  // 公転（サイクロン）：自機を中心とした大きな円軌道を衛星のように回る。
  // 中心は常に自機の現在位置。出現後はまず軌道に乗るよう半径方向へ補正し、
  // 軌道上では接線方向へ進み続ける（自機へ突っ込む動きはしない）。
  // 公転方向（orbitDir）は個体ごとにランダム。接線速度は e.speed
  // （＝CYCLONE_ORBIT_SPEED に難易度倍率と時間カーブを適用済み）。
registerMovement("orbitPlayer", function (e, dt) {
    var dx = e.bx - player.x, dy = e.by - player.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var rx = dx / len, ry = dy / len; // 自機から見た半径方向
    var dir = e.orbitDir || 1;
    var tx = -ry * dir, ty = rx * dir; // 接線方向（公転方向）
    // 半径のずれを補正：外側なら内へ、内側なら外へ。ずれが大きいほど強く、
    // 接線速度を超えない範囲で寄せ、軌道に乗れば補正はほぼ消える。
    var err = len - CYCLONE_ORBIT_RADIUS;
    var radialSpeed = clamp(err * 1.6, -e.speed, e.speed); // 正＝内向きへの補正量
    e.vx = tx * e.speed - rx * radialSpeed;
    e.vy = ty * e.speed - ry * radialSpeed;
    e.bx += e.vx * dt;
    e.by += e.vy * dt;
    e.bx = clamp(e.bx, 20, WORLD_W - 20);
    e.by = clamp(e.by, 20, WORLD_H - 20);
    e.dirAngle = Math.atan2(e.vy, e.vx);
    e.x = e.bx; e.y = e.by;
});
  // 三角形編隊（アーク）：3体が共有する中心点（arc グループ）を自機へ
  // 進め、中心を軸に回転させながら、中心からの距離を周期的に伸縮させる
  // （回転と伸縮は別々の周期で独立に計算する）。中心の前進・回転・伸縮は
  // 1フレームに1回だけ（生存メンバーの先頭が担当し、elapsed で多重実行を
  // 防ぐ）。2体になっても中心の動きはそのまま続く。1体だけになれば
  // 電気は消え、その個体は少し速く真っすぐ自機へ突撃する（通常の追尾）。
registerMovement("arcOrbit", function (e, dt) {
    var g = e.arc;
    if (!g) { e.x = e.bx; e.y = e.by; return; }
    // このグループで生きているメンバーを数える
    var alive = [];
    for (var i = 0; i < enemies.length; i++) {
      var o = enemies[i];
      if (o.arc === g && !o.dead) alive.push(o);
    }
    if (alive.length <= 1) {
      // 単独：電気なしの突撃。中心速度に対する比率で速くし、生成時に
      // 掛かった難易度倍率（と現在の凍結等の倍率）をそのまま保つ。
      var dx = player.x - e.bx, dy = player.y - e.by;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      e.dirAngle = Math.atan2(dy, dx);
      var solo = e.speed * (ARC_SOLO_SPEED / ARC_CENTER_SPEED);
      e.vx = dx / len * solo; e.vy = dy / len * solo;
      e.bx += e.vx * dt; e.by += e.vy * dt;
      e.x = e.bx; e.y = e.by;
      return;
    }
    if (alive[0] === e && g.stampT !== elapsed) {
      g.stampT = elapsed;
      // 中心点：自機へまっすぐ進む（速度は担当個体の e.speed＝難易度倍率適用済み）
      var cdx = player.x - g.cx, cdy = player.y - g.cy;
      var clen = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      g.cx += cdx / clen * e.speed * dt;
      g.cy += cdy / clen * e.speed * dt;
      g.cx = clamp(g.cx, 20, WORLD_W - 20);
      g.cy = clamp(g.cy, 20, WORLD_H - 20);
      g.angle += dt * Math.PI * 2 / ARC_ROT_PERIOD; // 回転
      g.pulseT += dt;                                // 伸縮（回転とは独立）
    }
    var mid = (ARC_RADIUS_MIN + ARC_RADIUS_MAX) / 2;
    var ampR = (ARC_RADIUS_MAX - ARC_RADIUS_MIN) / 2;
    var radius = mid + Math.sin(g.pulseT * Math.PI * 2 / ARC_PULSE_PERIOD) * ampR;
    var a = g.angle + e.arcSlot * Math.PI * 2 / ARC_GROUP_SIZE;
    e.x = clamp(g.cx + Math.cos(a) * radius, 12, WORLD_W - 12);
    e.y = clamp(g.cy + Math.sin(a) * radius, 12, WORLD_H - 12);
    e.bx = e.x; e.by = e.y; // 単独化した時に追尾の起点がずれないよう同期する
    e.dirAngle = Math.atan2(player.y - e.y, player.x - e.x);
    e.vx = 0; e.vy = 0;
});
  // カクカク移動（ステッパー）：上下左右にだけ、個体ごとの歩幅
  // （stepDist）を素早く進んでは止まる、を繰り返す。方向は基本的に
  // 自機へ近づく軸を選び、STEPPER_SIDE_PROB の確率で横へずれる。
  // 1回の移動時間は難易度倍率（と凍結等の moveMul）で縮み、歩幅その
  // ものは変わらない。移動中は短い間隔で残像（ゴースト）を残す。
registerMovement("step", function (e, dt) {
    if (e.stepState === "move") {
      e.stepT += dt / e.stepDur;
      var t = e.stepT >= 1 ? 1 : e.stepT;
      var k = 1 - (1 - t) * (1 - t); // ease-out：素早く出て、歩幅の端で収まる
      e.bx = e.stepFromX + e.stepDirX * e.stepDistEff * k;
      e.by = e.stepFromY + e.stepDirY * e.stepDistEff * k;
      e.x = e.bx; e.y = e.by;
      e.ghostTimer -= dt;
      if (e.ghostTimer <= 0) { e.ghostTimer = STEPPER_GHOST_INTERVAL; spawnStepperGhost(e); }
      if (e.stepT >= 1) { e.stepState = "pause"; e.stepTimer = STEPPER_PAUSE_TIME; }
    } else {
      e.stepTimer -= dt;
      if (e.stepTimer <= 0) {
        var dir = stepperPickDir(e);
        // ワールド端では歩幅が壁で切り取られる（その分だけ短く進む）
        var tx = clamp(e.bx + dir.x * e.stepDist, 16, WORLD_W - 16);
        var ty = clamp(e.by + dir.y * e.stepDist, 16, WORLD_H - 16);
        var eff = Math.abs(tx - e.bx) + Math.abs(ty - e.by);
        if (eff < 4) { e.stepTimer = STEPPER_PAUSE_TIME * 0.5; }
        else {
          e.stepDirX = dir.x; e.stepDirY = dir.y;
          e.stepFromX = e.bx; e.stepFromY = e.by;
          e.stepDistEff = eff;
          e.stepState = "move"; e.stepT = 0;
          var mul = difficultyMul() * (e.moveMul || 1);
          e.stepDur = STEPPER_MOVE_TIME / Math.max(mul, 0.2) * (e.stepDist / eff);
          e.dirAngle = Math.atan2(dir.y, dir.x);
          e.ghostTimer = 0;
        }
      }
    }
    e.x = e.bx; e.y = e.by;
    e.vx = 0; e.vy = 0;
});
// ステッパーの方向決定：自機へ近づく4方向か、横へのずれか
function stepperPickDir(e) {
  var dx = player.x - e.bx, dy = player.y - e.by;
  if (Math.random() < STEPPER_SIDE_PROB) {
    // 横へずれる：自機への主軸と直角の方向へ（符号はランダム）
    var s = Math.random() < 0.5 ? 1 : -1;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: 0, y: s };
    return { x: s, y: 0 };
  }
  // 自機へ近づく：成分の大きい軸の方向へ
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy >= 0 ? 1 : -1 };
}
// アークの電気のリンク一覧：同じグループで生きている個体同士の全ペア。
// 3体なら3辺（三角形）、2体なら1辺（直線）、1体なら空（電気なし）。
// 当たり判定（game.js）と描画（render.js）の両方が使う。
function arcLinks() {
  var links = [];
  var groups = [];
  var i, j, e;
  for (i = 0; i < enemies.length; i++) {
    e = enemies[i];
    if (e.type === "arc" && !e.dead && e.arc && groups.indexOf(e.arc) < 0) groups.push(e.arc);
  }
  for (i = 0; i < groups.length; i++) {
    var members = [];
    for (j = 0; j < enemies.length; j++) {
      e = enemies[j];
      if (e.type === "arc" && !e.dead && e.arc === groups[i]) members.push(e);
    }
    for (var a = 0; a < members.length; a++) {
      for (var b = a + 1; b < members.length; b++) links.push([members[a], members[b]]);
    }
  }
  return links;
}


/* ============================================================
   攻撃コンポーネント
   一定間隔で呼ばれる。弾は撃った瞬間の向きでまっすぐ飛ぶ
   （自機狙いも追尾はしない）。
   ============================================================ */
var Attack = { none: null };
function registerAttack(name, fn) { Attack[name] = fn; }
  // 進行方向（自機のいる方）へ撃つ
registerAttack("forward", function (e) {
    spawnEnemyBullet(e.x, e.y, Math.cos(e.dirAngle), Math.sin(e.dirAngle), EBULLET_SPEED);
});
  // 撃つ瞬間の自機位置を狙う
registerAttack("aimed", function (e) {
    var dx = player.x - e.x, dy = player.y - e.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    spawnEnemyBullet(e.x, e.y, dx / len, dy / len, EBULLET_SPEED + AIMED_SPEED_BONUS);
});
  // 3方向拡散弾（タンク）：自機方向を中心に3方向へ。
  // 通常弾（自機HP-10）と同じ威力では強すぎるため、半分の-5にする。
registerAttack("spread", function (e) {
    var base = Math.atan2(player.y - e.y, player.x - e.x);
    for (var k = -1; k <= 1; k++) {
      var a = base + k * SPREAD_ANGLE;
      spawnEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), EBULLET_SPEED, SPREAD_DMG);
    }
});
  // 回転弾幕（スパイラル）：発射角が少しずつ回り、全方向へ渦状に撒く。
  // こちらも威力は控えめの-5にする。
registerAttack("spiral", function (e) {
    e.spiralAngle = (e.spiralAngle || 0) + SPIRAL_ANGLE_STEP;
    spawnEnemyBullet(e.x, e.y, Math.cos(e.spiralAngle), Math.sin(e.spiralAngle), EBULLET_SPEED + SPIRAL_SPEED_DELTA, SPIRAL_DMG);
});
  // 二重螺旋（サイクロン）：発射角が少しずつ回り、対向する2方向へ同時に撒く。
  // 自転の向き（spiralDir）は個体ごとにランダムで、公転方向とは独立。
  // 弾速・威力（-5）は元のスパイラルと同じ。発射間隔は敵定義側で元の約0.8倍。
registerAttack("doubleSpiral", function (e) {
    var dir = e.spiralDir || 1;
    e.spiralAngle = (e.spiralAngle || 0) + SPIRAL_ANGLE_STEP * dir;
    spawnEnemyBullet(e.x, e.y, Math.cos(e.spiralAngle), Math.sin(e.spiralAngle), EBULLET_SPEED + SPIRAL_SPEED_DELTA, SPIRAL_DMG);
    spawnEnemyBullet(e.x, e.y, Math.cos(e.spiralAngle + Math.PI), Math.sin(e.spiralAngle + Math.PI), EBULLET_SPEED + SPIRAL_SPEED_DELTA, SPIRAL_DMG);
});
  // 狙撃（スナイパー）：照準線で予告してから高速弾を1発撃つ。
  // 予告の間は snipeAngle が自機を追うが、発射の SNIPE_LOCK_TIME 秒前
  // からはその向きで固定される（動けば避けられる）。状態遷移を進める
  // ため、予告中は fireTimer を小さく保って毎フレーム呼ばれ続ける。
registerAttack("snipe", function (e, dt) {
    dt = dt || 0.016;
    if (e.snipeState !== "aim") {
      e.snipeState = "aim";
      e.snipeTimer = SNIPE_TELEGRAPH_TIME;
      e.snipeAngle = Math.atan2(player.y - e.y, player.x - e.x);
      e.fireTimer = 0.001;
      return;
    }
    e.snipeTimer -= dt;
    if (e.snipeTimer > SNIPE_LOCK_TIME) {
      e.snipeAngle = Math.atan2(player.y - e.y, player.x - e.x);
    }
    if (e.snipeTimer <= 0) {
      spawnEnemyBullet(e.x, e.y, Math.cos(e.snipeAngle), Math.sin(e.snipeAngle), EBULLET_SPEED * SNIPER_BULLET_SPEED_MUL);
      e.snipeState = "cool";
      e.fireTimer = SNIPE_COOLDOWN;
    } else {
      e.fireTimer = 0.001;
    }
});
  // 狙撃・上位（デッドアイ）：予告0.6秒のあと高速弾を0.15秒間隔で2連射。
  // サイクル全体が元の約0.7倍になるよう、クールダウンは DEADEYE_COOLDOWN。
registerAttack("deadsnipe", function (e, dt) {
    dt = dt || 0.016;
    if (e.snipeState === "burst") {
      e.snipeTimer -= dt;
      e.fireTimer = 0.001;
      if (e.snipeTimer <= 0) {
        if (e.burstLeft > 0) {
          spawnEnemyBullet(e.x, e.y, Math.cos(e.snipeAngle), Math.sin(e.snipeAngle), EBULLET_SPEED * SNIPER_BULLET_SPEED_MUL);
          e.burstLeft--;
          e.snipeTimer = DEADEYE_BURST_INTERVAL;
        }
        if (e.burstLeft <= 0) { e.snipeState = "cool"; e.fireTimer = DEADEYE_COOLDOWN; }
      }
      return;
    }
    if (e.snipeState !== "aim") {
      e.snipeState = "aim";
      e.snipeTimer = DEADEYE_TELEGRAPH_TIME;
      e.snipeAngle = Math.atan2(player.y - e.y, player.x - e.x);
      e.fireTimer = 0.001;
      return;
    }
    e.snipeTimer -= dt;
    if (e.snipeTimer > DEADEYE_LOCK_TIME) {
      e.snipeAngle = Math.atan2(player.y - e.y, player.x - e.x);
    }
    if (e.snipeTimer <= 0) {
      spawnEnemyBullet(e.x, e.y, Math.cos(e.snipeAngle), Math.sin(e.snipeAngle), EBULLET_SPEED * SNIPER_BULLET_SPEED_MUL);
      e.burstLeft = DEADEYE_BURST_COUNT - 1;
      e.snipeState = "burst";
      e.snipeTimer = DEADEYE_BURST_INTERVAL;
      e.fireTimer = 0.001;
    } else {
      e.fireTimer = 0.001;
    }
});
// イージスの防御オーラ：対象の敵が、いずれかのイージス（自身を除く）の
// 半径 AEGIS_AURA_RADIUS 内にいれば被ダメージ倍率 1-AEGIS_AURA_CUT を返す。
// 複数のイージスが重なってもカットは重複しない（最初に見つけた時点で確定）。
// ボスは enemies に含まれないため自然に対象外。
function aegisDamageMul(target) {
  for (var i = 0; i < enemies.length; i++) {
    var o = enemies[i];
    if (o === target || o.dead || o.type !== "aegis") continue;
    var dx = target.x - o.x, dy = target.y - o.y;
    if (dx * dx + dy * dy <= AEGIS_AURA_RADIUS * AEGIS_AURA_RADIUS) return 1 - AEGIS_AURA_CUT;
  }
  return 1;
}
  // パルス（アンプ）：周囲の敵へ「移動速度+20%（3秒）」と「パルスの
  // 瞬間のダメージ無効化（0.5秒）」を付与する。対象はアンプ自身と
  // 他のアンプを除くすべての敵（タンク・ボマー・フロスター等も含む）。
  // 付与元（buffFrom）を覚えておき、そのアンプが倒れた瞬間に解除する。
registerAttack("pulse", function (e) {
    e.pulseT = 0.4; // 描画用の波紋タイマ（render.js が広がる輪を描く）
    for (var i = 0; i < enemies.length; i++) {
      var o = enemies[i];
      if (o === e || o.dead || o.type === "amp") continue;
      var dx = o.x - e.x, dy = o.y - e.y;
      if (dx * dx + dy * dy <= AMP_PULSE_RADIUS * AMP_PULSE_RADIUS) {
        o.buffTimer = AMP_SPEED_BUFF_TIME;
        o.invulnTimer = AMP_INVULN_TIME;
        o.buffFrom = e;
      }
    }
});
  // 回復（ヒーラー）：周囲 HEALER_RANGE 以内で傷ついている味方を近い順に
  // 最大 HEALER_MAX_TARGETS 体まで選び、それぞれの最大HPの
  // HEALER_FRACTION（20%）を回復する（最大HPは超えない）。対象は
  // enemies にいる通常敵のみ：ボス本体・砲塔は enemies に含まれない
  // ため自然に対象外となり、自分自身も除く。他のヒーラーは対象に含む。
  // 回復した相手へはビーム（healBeams）と緑の火花で見た目にも示す。
registerAttack("heal", function (e) {
    var cands = [];
    for (var i = 0; i < enemies.length; i++) {
      var o = enemies[i];
      if (o === e || o.dead || o.hp >= o.maxHp) continue;
      var dx = o.x - e.x, dy = o.y - e.y;
      var d2 = dx * dx + dy * dy;
      if (d2 <= HEALER_RANGE * HEALER_RANGE) cands.push({ o: o, d2: d2 });
    }
    cands.sort(function (a, b) { return a.d2 - b.d2; });
    var n = Math.min(cands.length, HEALER_MAX_TARGETS);
    for (var j = 0; j < n; j++) {
      var t = cands[j].o;
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * HEALER_FRACTION);
      healBeams.push({ x1: e.x, y1: e.y, x2: t.x, y2: t.y, life: HEALER_BEAM_LIFE, maxLife: HEALER_BEAM_LIFE });
      spawnSparks(t.x, t.y, "#6dffb8", 2);
    }
});

