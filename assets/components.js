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
        e.dashVx = Math.cos(e.dirAngle) * DASH_SPEED;
        e.dashVy = Math.sin(e.dirAngle) * DASH_SPEED;
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
    var dx = player.x - e.bx, dy = player.y - e.by;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    e.dirAngle = Math.atan2(dy, dx);
    var radial = 0;
    if (len > SNIPER_RANGE + 30) radial = 1;
    else if (len < SNIPER_RANGE - 30) radial = -1;
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

