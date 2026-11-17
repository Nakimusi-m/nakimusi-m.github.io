"use strict";
/* ============================================================
   描画（render.js）：カメラ、背景グリッド、敵・自機・弾、
   ミニマップ、スティック表示。形の頂点計算は sprites.js。
   ============================================================ */

// 弾の残光を色グループごとに2パスでまとめて描く（影なし・軽量）
function drawBulletTrails(gold, outerColor, innerColor) {
  // 残光の長さは弾速にそのまま比例させず、金弾（弾速3倍）でも
  // レーザーのように伸びすぎないよう固定長＋少しだけ長めにする
  var outerLen = gold ? 52 : 35, innerLen = gold ? 34 : 20;
  var i, tb, any = false, ux, uy, spd;
  ctx.beginPath();
  for (i = 0; i < bullets.length; i++) {
    tb = bullets[i];
    if (tb.drone) continue; // 子機の散弾の粒には残光を付けない
    if (!!tb.gold !== gold) continue;
    any = true;
    spd = Math.sqrt(tb.vx * tb.vx + tb.vy * tb.vy) || 1;
    ux = tb.vx / spd; uy = tb.vy / spd;
    ctx.moveTo(tb.x - ux * outerLen, tb.y - uy * outerLen);
    ctx.lineTo(tb.x - ux * 7, tb.y - uy * 7);
  }
  if (!any) return;
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  for (i = 0; i < bullets.length; i++) {
    tb = bullets[i];
    if (tb.drone) continue;
    if (!!tb.gold !== gold) continue;
    spd = Math.sqrt(tb.vx * tb.vx + tb.vy * tb.vy) || 1;
    ux = tb.vx / spd; uy = tb.vy / spd;
    ctx.moveTo(tb.x - ux * innerLen, tb.y - uy * innerLen);
    ctx.lineTo(tb.x - ux * 6, tb.y - uy * 6);
  }
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ============================================================
   描画
   カメラは自機を常に中心に捉える。自機がワールド端に寄っても
   中心は変えず、外側は暗く描いて境界が見えるようにする。
   ============================================================ */
function draw() {
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // 背景（グラデーションは resize 時に作成済みのものを使い回す）
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  var camX = player.x, camY = player.y;
  var shX = shake > 0 ? rand(-shake, shake) : 0;
  var shY = shake > 0 ? rand(-shake, shake) : 0;

  ctx.save();
  ctx.translate(VIEW_W / 2 - camX + shX, VIEW_H / 2 - camY + shY);

  // ワールドの床
  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // グリッド（画面内だけ描く）
  var gx0 = Math.max(0, Math.floor((camX - VIEW_W / 2) / 60) * 60);
  var gx1 = Math.min(WORLD_W, camX + VIEW_W / 2 + 60);
  var gy0 = Math.max(0, Math.floor((camY - VIEW_H / 2) / 60) * 60);
  var gy1 = Math.min(WORLD_H, camY + VIEW_H / 2 + 60);
  ctx.strokeStyle = "rgba(34, 230, 255, " + (0.07 + gridPulse * 0.16) + ")";
  ctx.lineWidth = 1 + gridPulse * 0.6;
  ctx.beginPath();
  for (var gx = gx0; gx <= gx1; gx += 60) { ctx.moveTo(gx, Math.max(0, camY - VIEW_H / 2)); ctx.lineTo(gx, Math.min(WORLD_H, camY + VIEW_H / 2)); }
  for (var gy = gy0; gy <= gy1; gy += 60) { ctx.moveTo(Math.max(0, camX - VIEW_W / 2), gy); ctx.lineTo(Math.min(WORLD_W, camX + VIEW_W / 2), gy); }
  ctx.stroke();

  // パララックス遠層グリッド：カメラの動きに少し遅れて流れる大きな格子で
  // 奥行きを出す（本グリッドより大きく・薄く、雰囲気は変えない）
  var pgOffX = camX * 0.15, pgOffY = camY * 0.15;
  var pgx0 = Math.floor((camX - VIEW_W / 2 - pgOffX) / 120) * 120 + pgOffX;
  var pgy0 = Math.floor((camY - VIEW_H / 2 - pgOffY) / 120) * 120 + pgOffY;
  ctx.strokeStyle = "rgba(34, 230, 255, 0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var pgx = pgx0; pgx <= camX + VIEW_W / 2 + 4; pgx += 120) { ctx.moveTo(pgx, camY - VIEW_H / 2); ctx.lineTo(pgx, camY + VIEW_H / 2); }
  for (var pgy = pgy0; pgy <= camY + VIEW_H / 2 + 4; pgy += 120) { ctx.moveTo(camX - VIEW_W / 2, pgy); ctx.lineTo(camX + VIEW_W / 2, pgy); }
  ctx.stroke();

  // 星（2層パララックス：遠層はカメラの55%、近層は85%で流れ、奥行きが出る）
  ctx.fillStyle = "rgba(160, 220, 255, 0.75)";
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var spar = s.par != null ? s.par : 1;
    var sex = s.x + camX * (1 - spar), sey = s.y + camY * (1 - spar);
    if (Math.abs(sex - camX) > VIEW_W / 2 + 6 || Math.abs(sey - camY) > VIEW_H / 2 + 6) continue;
    ctx.globalAlpha = (0.25 + s.s * 0.3) * (spar < 0.7 ? 0.55 : 1);
    ctx.fillRect(sex, sey, s.s, s.s * 2.2);
  }
  ctx.globalAlpha = 1;

  // ワールド境界
  ctx.strokeStyle = "rgba(34, 230, 255, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, WORLD_W - 3, WORLD_H - 3);
  ctx.strokeStyle = "rgba(255, 45, 120, 0.25)";
  ctx.lineWidth = 9;
  ctx.strokeRect(6, 6, WORLD_W - 12, WORLD_H - 12);

  // 凍結エリア（フロスター）：半透明のアイスブルーの円＋氷の縁。
  // 消える直前（残り1.2秒を切る）から薄くなっていく。
  for (i = 0; i < frostZones.length; i++) {
    var fz = frostZones[i];
    ctx.save();
    ctx.globalAlpha = Math.min(fz.life / 1.2, 1);
    ctx.fillStyle = "rgba(127, 216, 255, 0.13)";
    ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(190, 240, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(190, 240, 255, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.r * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ヒーラーの回復ビーム：ギザギザの折れ線（稲妻状）＋回復先に小さな
  // 十字（寿命で薄れる）。色は回復と分かる緑系のまま。中点は直線に
  // 対して垂直にずらし、毎フレーム乱数でちらつかせて放電らしくする。
  for (i = 0; i < healBeams.length; i++) {
    var hb = healBeams[i];
    var ha = Math.max(hb.life / hb.maxLife, 0);
    var hdx = hb.x2 - hb.x1, hdy = hb.y2 - hb.y1;
    var hlen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
    var hpx = -hdy / hlen, hpy = hdx / hlen;
    var hsegs = 6, hpts = [];
    for (var hs = 0; hs <= hsegs; hs++) {
      var ht = hs / hsegs;
      var hoff = (hs === 0 || hs === hsegs) ? 0 : rand(-5, 5);
      hpts.push([hb.x1 + hdx * ht + hpx * hoff, hb.y1 + hdy * ht + hpy * hoff]);
    }
    ctx.save();
    ctx.globalAlpha = ha * 0.85;
    ctx.strokeStyle = "#6dffb8";
    ctx.lineWidth = 2;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(hpts[0][0], hpts[0][1]);
    for (hs = 1; hs < hpts.length; hs++) ctx.lineTo(hpts[hs][0], hpts[hs][1]);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hb.x2 - 5, hb.y2); ctx.lineTo(hb.x2 + 5, hb.y2);
    ctx.moveTo(hb.x2, hb.y2 - 5); ctx.lineTo(hb.x2, hb.y2 + 5);
    ctx.stroke();
    ctx.restore();
  }

  // ドロップカプセル
  drawCapsules();

  // カプセル取得の光の筋：取得位置から自機へ吸い込まれる線と光点
  for (i = 0; i < pickupStreaks.length; i++) {
    var ps = pickupStreaks[i];
    var pk2 = 1 - Math.max(ps.life, 0) / ps.maxLife; // 0→1で自機へ寄る
    var pmx = ps.x1 + (player.x - ps.x1) * pk2, pmy = ps.y1 + (player.y - ps.y1) * pk2;
    ctx.save();
    ctx.globalAlpha = (1 - pk2) * 0.85;
    ctx.strokeStyle = ps.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ps.x1, ps.y1); ctx.lineTo(player.x, player.y); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(pmx, pmy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ボス本体と砲塔
  if (boss) drawBoss();

  // 氷結弾（ボス両段階）：飛行中の氷弾と、着弾点のマーカー
  for (i = 0; i < iceShots.length; i++) {
    var ish = iceShots[i];
    var ik = Math.min(ish.t / ish.dur, 1);
    ctx.save();
    ctx.strokeStyle = "rgba(190, 240, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(ish.tx, ish.ty, 56 - 34 * ik, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(127, 216, 255, 0.35)";
    ctx.beginPath(); ctx.arc(ish.x, ish.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#eaf9ff";
    ctx.beginPath(); ctx.arc(ish.x, ish.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 敵弾（事前描画スプライトを貼るだけ）
  for (i = 0; i < enemyBullets.length; i++) {
    var eb = enemyBullets[i];
    ctx.drawImage(SPR.ebullet.c, eb.x - SPR.ebullet.w / 2, eb.y - SPR.ebullet.h / 2, SPR.ebullet.w, SPR.ebullet.h);
  }

  // 自機の弾の残光（トレイル）：全弾分をバッチ描画でまとめる。
  // 通常弾はシアン、オーバードライブ弾は金色で色分けする。
  if (bullets.length) {
    ctx.lineCap = "round";
    drawBulletTrails(false, "rgba(34, 230, 255, 0.16)", "rgba(170, 245, 255, 0.5)");
    drawBulletTrails(true, "rgba(255, 194, 51, 0.2)", "rgba(255, 240, 179, 0.55)");
  }
  // 自機の弾（向きに合わせて回転。発動中の弾は金色で大きく描く）
  for (i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    if (b.drone) { // 子機の弾（淡いシアン〜白＝味方弾）
      if (b.snipe) { // スナイパーの狙撃弾：少し大きめの粒＋短い残光
        ctx.save();
        ctx.strokeStyle = "rgba(170, 245, 255, 0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
        var pw = SPR.pellet.w * 1.5, ph = SPR.pellet.h * 1.5;
        ctx.drawImage(SPR.pellet.c, b.x - pw / 2, b.y - ph / 2, pw, ph);
      } else { // アタッカーの散弾の粒
        ctx.drawImage(SPR.pellet.c, b.x - SPR.pellet.w / 2, b.y - SPR.pellet.h / 2, SPR.pellet.w, SPR.pellet.h);
      }
      continue;
    }
    var bspr = b.gold ? SPR.bulletGold : SPR.bullet;
    var bw = bspr.w * b.sizeMul, bh = bspr.h * b.sizeMul;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.drawImage(bspr.c, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  // ステッパーの残像（ゴースト）：本体より下に残し、直線移動の軌跡を
  // くっきり読み取れるよう、約0.5秒・やや濃いめに表示する
  for (i = 0; i < stepperGhosts.length; i++) {
    var gh = stepperGhosts[i];
    if (Math.abs(gh.x - camX) > VIEW_W / 2 + 40 || Math.abs(gh.y - camY) > VIEW_H / 2 + 40) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(gh.life / gh.maxLife, 0) * 0.55;
    ctx.drawImage(gh.spr.c, gh.x - gh.spr.w / 2, gh.y - gh.spr.h / 2, gh.spr.w, gh.spr.h);
    ctx.restore();
  }

  // アークの電気：個体同士を稲妻状に揺れる線で結ぶ（毎フレーム乱数で
  // 中点をずらし、放電らしくちらつかせる）。3体で三角形、2体で直線。
  var arcLn = arcLinks();
  for (i = 0; i < arcLn.length; i++) {
    var la2 = arcLn[i][0], lb2 = arcLn[i][1];
    if (Math.abs((la2.x + lb2.x) / 2 - camX) > VIEW_W / 2 + 120 || Math.abs((la2.y + lb2.y) / 2 - camY) > VIEW_H / 2 + 120) continue;
    var ldx = lb2.x - la2.x, ldy = lb2.y - la2.y;
    var llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
    var lpx = -ldy / llen, lpy = ldx / llen;
    var lsegs = 7, lpts = [];
    for (var ls = 0; ls <= lsegs; ls++) {
      var lt = ls / lsegs;
      var loff = (ls === 0 || ls === lsegs) ? 0 : rand(-7, 7);
      lpts.push([la2.x + ldx * lt + lpx * loff, la2.y + ldy * lt + lpy * loff]);
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255, 214, 64, 0.35)";
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(lpts[0][0], lpts[0][1]);
    for (ls = 1; ls < lpts.length; ls++) ctx.lineTo(lpts[ls][0], lpts[ls][1]);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 251, 224, 0.9)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // 敵
  for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i]);

  // 子機（シールド→本体の順）
  drawDrones();

  // 自機（ゲームオーバー確定後とスローモーション中は砕けて消えている）
  if (state !== "over" && state !== "dying") drawPlayer();

  // パーティクル（光の粉）
  for (i = 0; i < particles.length; i++) {
    var p = particles[i];
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // 破片：倒した敵の形・色のまま砕け散る（影なしの線描きで軽く）
  for (i = 0; i < shards.length; i++) {
    var sh = shards[i];
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.rot);
    ctx.globalAlpha = Math.max(sh.life / sh.maxLife, 0);
    ctx.strokeStyle = sh.color;
    // 10倍になった破片でも輪郭が埋もれないよう、大きさに応じて線も太くする
    ctx.lineWidth = 2 + sh.size * 0.045;
    pathOn(ctx, shapePoints({ shape: sh.shape, r: sh.size, rot: 0 }));
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 火花：短い線が飛ぶ
  ctx.lineCap = "round";
  for (i = 0; i < sparks.length; i++) {
    var sk = sparks[i];
    ctx.globalAlpha = Math.max(sk.life / sk.maxLife, 0);
    ctx.strokeStyle = sk.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sk.x, sk.y);
    ctx.lineTo(sk.x - sk.vx * 0.03, sk.y - sk.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 衝撃波リング：広がりながら薄くなる
  for (i = 0; i < rings.length; i++) {
    var rg = rings[i];
    ctx.globalAlpha = Math.max(rg.life / rg.maxLife, 0) * 0.9;
    ctx.strokeStyle = rg.color;
    ctx.lineWidth = rg.width * (rg.life / rg.maxLife) + 0.5;
    ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // スコアポップ：出た瞬間に大きく弾けてから通常サイズへ
  ctx.textAlign = "center";
  for (i = 0; i < popups.length; i++) {
    var t = popups[i];
    var baseSize = t.huge ? 30 : (t.big ? 17 : 13);
    ctx.font = "700 " + Math.round(baseSize + t.pop * (t.huge ? 18 : 10)) + "px Orbitron, monospace";
    ctx.globalAlpha = Math.min(t.life / 0.4, 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // 白フラッシュ（ボス大爆発の瞬間）：画面全体を一瞬白く染める
  if (flashWhite > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(flashWhite, 1) * 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  // 被弾方向の弧：当たった方向の画面端に赤い弧を短時間出す（自機は常に中央）
  if (damageDirT > 0 && (state === "playing" || state === "dying")) {
    var dda = Math.max(damageDirT, 0) / DMG_ARC_TIME;
    var dcx = VIEW_W / 2 + Math.cos(damageDirAngle) * (VIEW_W * 0.36);
    var dcy = VIEW_H / 2 + Math.sin(damageDirAngle) * (VIEW_H * 0.36);
    ctx.save();
    ctx.translate(dcx, dcy);
    ctx.rotate(damageDirAngle);
    ctx.globalAlpha = dda * 0.85;
    ctx.strokeStyle = "#ff4040";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.shadowColor = "#ff4040";
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 0, 30, -0.7, 0.7); ctx.stroke();
    ctx.restore();
  }

  // ゲーム中のベスト更新バナー：一度だけ中央上部に出す
  if (recordBannerT > 0 && state === "playing") {
    var rba = Math.min(recordBannerT / 0.35, 1) * Math.min((RECORD_BANNER_TIME - recordBannerT) / 0.2 + 0.2, 1);
    ctx.save();
    ctx.globalAlpha = clamp(rba, 0, 1);
    ctx.textAlign = "center";
    ctx.font = "900 30px Orbitron, monospace";
    ctx.fillStyle = "#ffc233";
    ctx.shadowColor = "#ffc233";
    ctx.shadowBlur = 16;
    ctx.fillText("NEW RECORD", VIEW_W / 2, 74);
    ctx.restore();
  }

  // スタートのカウントイン：READY（前半）→ GO（後半）、合計1秒以内
  if (introT > 0 && state === "playing") {
    var introElapsed = INTRO_TIME - introT;
    var isReady = introElapsed < INTRO_READY_TIME;
    var segT = isReady ? introElapsed / INTRO_READY_TIME : (introElapsed - INTRO_READY_TIME) / (INTRO_TIME - INTRO_READY_TIME);
    ctx.save();
    ctx.globalAlpha = segT < 0.7 ? 1 : 1 - (segT - 0.7) / 0.3;
    ctx.textAlign = "center";
    ctx.font = "900 " + Math.round(38 + segT * 6) + "px Orbitron, monospace";
    ctx.fillStyle = isReady ? "#22e6ff" : "#3dff7a";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillText(isReady ? "READY" : "GO", VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.restore();
  }

  // ボスが画面外にいる時は、画面端に方向矢印で居場所を示す
  if (boss && (state === "playing" || state === "paused")) {
    var bsx = boss.x - camX + VIEW_W / 2, bsy = boss.y - camY + VIEW_H / 2;
    if (bsx < -70 || bsx > VIEW_W + 70 || bsy < -70 || bsy > VIEW_H + 70) {
      var bang = Math.atan2(boss.y - camY, boss.x - camX);
      var ax = clamp(bsx, 30, VIEW_W - 30), ay = clamp(bsy, 30, VIEW_H - 30);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(bang);
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(performance.now() / 180);
      ctx.fillStyle = "#7fd8ff";
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-4, 0); ctx.lineTo(-9, 9);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // WARNING予告（ボス登場の約3秒前）：画面中央に警告表示
  if (bossWarnT > 0 && state === "playing") {
    var wblink = Math.floor(performance.now() / 320) % 2 === 0;
    ctx.save();
    ctx.fillStyle = "rgba(255, 40, 40, 0.13)";
    ctx.fillRect(0, 0, VIEW_W, 30);
    ctx.fillRect(0, VIEW_H - 30, VIEW_W, 30);
    ctx.globalAlpha = wblink ? 1 : 0.45;
    ctx.textAlign = "center";
    ctx.font = "900 46px Orbitron, monospace";
    ctx.fillStyle = "#ff4040";
    ctx.shadowColor = "#ff4040";
    ctx.shadowBlur = 18;
    ctx.fillText("WARNING", VIEW_W / 2, VIEW_H / 2 - 6);
    ctx.shadowBlur = 0;
    ctx.font = "700 14px Orbitron, monospace";
    ctx.fillStyle = "#ffb0a8";
    ctx.fillText("PERMAFROST APPROACHING", VIEW_W / 2, VIEW_H / 2 + 24);
    ctx.restore();
  }

  // コンボ表示（画面固定・左上に小さく半透明）：伸びるほど色が熱く
  // なり、出た瞬間は弾む。スコア倍率は付けず、表示と効果音の音程
  // だけが変わる。左上のHUD群の下に寄せて、視界の邪魔をしない。
  if (comboCount >= 2 && comboTimer > 0 && (state === "playing" || state === "paused")) {
    var calpha = (comboTimer < 0.4 ? comboTimer / 0.4 : 1) * 0.8;
    var csize = 16 + comboPop * 8;
    ctx.save();
    ctx.globalAlpha = calpha;
    ctx.textAlign = "left";
    ctx.font = "900 " + Math.round(csize) + "px Orbitron, monospace";
    ctx.fillStyle = comboCount >= 10 ? "#ff2d78" : (comboCount >= 5 ? "#ffc233" : "#22e6ff");
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillText(comboCount + " COMBO", 10, 132);
    ctx.shadowBlur = 0;
    // 残り時間バー
    var bw = 76 * (comboTimer / COMBO_WINDOW);
    ctx.globalAlpha = calpha * 0.8;
    ctx.fillRect(10, 140, bw, 2.5);
    ctx.restore();
  }

  // 画面固定の表示（ミニマップとスティック）
  if (state === "playing" || state === "paused") drawMinimap();
  if (state === "playing") {
    drawStick(leftStick, "#22e6ff");
    drawStick(rightStick, "#ff2d78");
  }
}

// ミニマップ：ワールド全体と自機・敵・カメラ範囲の位置関係。
// 右上のHUD行（経過時間・設定ボタン）の下に、小さく・半透明で置く。
// HUDはCSSピクセル固定なので、画面が小さいときは論理座標での開始位置を
// 下げて、歯車ボタンや時間表示に重ならないようにする。
function drawMinimap() {
  var mw = 100, mh = 56;
  var cssScale = view.scale / view.dpr; // 論理座標→CSSピクセルの倍率
  var mx = VIEW_W - mw - 10;
  var my = Math.max(46, Math.ceil(44 / cssScale));
  var sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "rgba(4, 10, 24, 0.5)";
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = "rgba(34, 230, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
  // カメラ範囲
  ctx.strokeStyle = "rgba(232, 246, 255, 0.35)";
  ctx.strokeRect(mx + (player.x - VIEW_W / 2) * sx, my + (player.y - VIEW_H / 2) * sy, VIEW_W * sx, VIEW_H * sy);
  // 敵（ドットの色は敵の色に合わせる。タンクは少し大きく）
  for (var i = 0; i < enemies.length; i++) {
    ctx.fillStyle = enemies[i].color;
    var ds = enemies[i].type === "tank" ? 4 : 2;
    ctx.fillRect(mx + enemies[i].x * sx - ds / 2, my + enemies[i].y * sy - ds / 2, ds, ds);
  }
  // ボス（大きな点）
  if (boss) {
    ctx.fillStyle = boss.phase === 2 ? "#ff8a7a" : "#bfefff";
    ctx.fillRect(mx + boss.x * sx - 3, my + boss.y * sy - 3, 6, 6);
  }
  // カプセル（小さな点。色は役割色、ランダムは白銀）
  for (i = 0; i < capsules.length; i++) {
    ctx.fillStyle = capsules[i].role === "random" ? "#e8ecf2" : DRONE_ROLES[capsules[i].role].color;
    ctx.fillRect(mx + capsules[i].x * sx - 1.5, my + capsules[i].y * sy - 1.5, 3, 3);
  }
  // 自機
  ctx.fillStyle = "#22e6ff";
  ctx.beginPath();
  ctx.arc(mx + player.x * sx, my + player.y * sy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ボス「ペルマフロスト」の描画：左右の砲塔→本体（八角形）→バリアの順。
// 処刑フェイズの残骸は暗く点滅し、撃たれた直後は震える。
function drawBoss() {
  var b = boss;
  var exec = b.phase === "exec" || b.phase === "finish"; // 撃破演出中も残骸の見た目
  var ox = 0, oy = 0;
  if (b.shakeT > 0) { ox = rand(-3.5, 3.5); oy = rand(-3.5, 3.5); }
  var flicker = exec && Math.floor(performance.now() / 130) % 3 === 0;
  var i, tr;

  // 第2段階の突進予告：進行方向（自機）へ赤い破線
  if (b.phase === 2 && b.chargeState === "tele") {
    var ta = Math.atan2(player.y - b.y, player.x - b.x);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 64, 64, 0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(ta) * 340, b.y + Math.sin(ta) * 340);
    ctx.stroke();
    ctx.restore();
  }

  // 砲塔（生きているもの＋処刑フェイズで無力化された残骸）。
  // 残骸の砲塔は暗く沈み、砲身は力なく垂れたまま光らない。
  for (i = 0; i < b.turrets.length; i++) {
    tr = b.turrets[i];
    if (!tr.alive && !tr.wreck) continue;
    if (tr.wreck) {
      ctx.save();
      ctx.translate(tr.x + ox, tr.y + oy);
      ctx.globalAlpha = flicker ? 0.4 : 0.75;
      ctx.strokeStyle = "#5d7d94";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(127, 216, 255, 0.05)";
      ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(120, 160, 190, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.rotate(tr.aim + 0.7); // 力なく傾いた砲身
      ctx.fillStyle = "#4a657c";
      ctx.fillRect(6, -5, BOSS_TURRET_R + 14, 10);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(tr.x + ox, tr.y + oy);
    ctx.shadowColor = "#7fd8ff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = tr.flash > 0 ? "#ffffff" : "#7fd8ff";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(127, 216, 255, 0.16)";
    ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(191, 239, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, BOSS_TURRET_R * 0.55, 0, Math.PI * 2); ctx.stroke();
    // 砲身
    ctx.rotate(tr.aim);
    ctx.fillStyle = tr.flash > 0 ? "#ffffff" : "#bfefff";
    ctx.fillRect(6, -5, BOSS_TURRET_R + 14, 10);
    // チャージ中は砲口が明滅して光る（バースト発射の予告）
    if (tr.mode === "charge") {
      var cpulse = 0.55 + 0.45 * Math.sin(performance.now() / 45);
      ctx.fillStyle = "rgba(255, 214, 106, " + cpulse.toFixed(3) + ")";
      ctx.shadowColor = "#ffd76a";
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(BOSS_TURRET_R + 16, 0, 5 + 4 * cpulse, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff3cf";
      ctx.beginPath(); ctx.arc(BOSS_TURRET_R + 16, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#eaf9ff";
    ctx.beginPath(); ctx.arc(tr.x + ox, tr.y + oy, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // 本体：大型の八角形の氷の要塞
  ctx.save();
  ctx.translate(b.x + ox, b.y + oy);
  ctx.rotate(b.rot);
  if (flicker) ctx.globalAlpha = 0.45;
  var bodyPts = shapePoints({ shape: "octagon", r: b.r, rot: 0 });
  ctx.shadowColor = "#7fd8ff";
  ctx.shadowBlur = exec ? 0 : 18;
  ctx.strokeStyle = b.flash > 0 ? "#ffffff" : (exec ? "#5d7d94" : "#7fd8ff");
  ctx.lineWidth = 3.5;
  pathOn(ctx, bodyPts);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = exec ? "rgba(127, 216, 255, 0.06)" : "rgba(127, 216, 255, 0.16)";
  pathOn(ctx, bodyPts);
  ctx.fill();
  // 内側の八角形
  ctx.strokeStyle = exec ? "rgba(120, 160, 190, 0.4)" : "rgba(191, 239, 255, 0.5)";
  ctx.lineWidth = 2;
  pathOn(ctx, shapePoints({ shape: "octagon", r: b.r * 0.68, rot: 0 }));
  ctx.stroke();
  ctx.restore();

  // コア（回転しない中心の光）。第2段階では赤く点滅し、処刑中は弱く明滅
  ctx.save();
  ctx.translate(b.x + ox, b.y + oy);
  if (exec) {
    ctx.fillStyle = Math.floor(performance.now() / 200) % 2 === 0 ? "#7a4a3a" : "#4a3430";
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    // ひび割れ
    ctx.strokeStyle = "rgba(10, 16, 26, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-40, -18); ctx.lineTo(-12, -4); ctx.lineTo(-20, 22);
    ctx.moveTo(34, -30); ctx.lineTo(10, -6); ctx.lineTo(26, 18);
    ctx.moveTo(-6, 40); ctx.lineTo(2, 12);
    ctx.stroke();
  } else if (b.phase === 2) {
    var coreR = 13 + Math.sin(b.t * 9) * 2.5;
    ctx.fillStyle = Math.sin(b.t * 9) > 0 ? "#ff5040" : "#ffb03a";
    ctx.shadowColor = "#ff5040";
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff0d8";
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else {
    var coreR2 = 12 + Math.sin(b.t * 3.2) * 2;
    ctx.fillStyle = "#bfefff";
    ctx.shadowColor = "#7fd8ff";
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, coreR2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // バリア（第1段階のみ）：本体を覆う氷の殻だが、無敵ではない。
  // 砲塔が減るほど薄く・細く・弱々しく描く（2機＝濃い／1機＝半分ほど）。
  // 本体へ当たった直後は強く光る。
  if (b.phase === 1) {
    var aliveT = 0;
    for (i = 0; i < b.turrets.length; i++) if (b.turrets[i].alive) aliveT++;
    var barrierMul = aliveT >= 2 ? 1 : 0.48;
    ctx.save();
    ctx.translate(b.x, b.y);
    var ba = (0.4 + 0.14 * Math.sin(b.t * 3)) * barrierMul + (b.shieldFlash > 0 ? 0.45 * barrierMul : 0);
    ctx.strokeStyle = "rgba(170, 228, 255, " + Math.min(ba, 0.9) + ")";
    ctx.lineWidth = (b.shieldFlash > 0 ? 4 : 2.5) * barrierMul + 0.4;
    ctx.beginPath(); ctx.arc(0, 0, b.r + 17, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(170, 228, 255, " + Math.min(ba * 0.6, 0.6) + ")";
    ctx.lineWidth = 5 * barrierMul + 0.5;
    ctx.setLineDash([30, 20]);
    ctx.lineDashOffset = -b.t * 34;
    ctx.beginPath(); ctx.arc(0, 0, b.r + 17, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // 処刑フェイズの残り裏HP（残骸の上に小さな金バー）
  if (b.phase === "exec") {
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(b.x - 44, b.y - b.r - 16, 88, 4);
    ctx.fillStyle = "#ffc233";
    ctx.fillRect(b.x - 44, b.y - b.r - 16, 88 * Math.max(b.execHp, 0) / b.execMax, 4);
  }
}

// ドロップカプセル：役割色の輪＋中身の印。残り3秒を切ると点滅する。
// タンクのランダムカプセルは白銀色で「？」表示（中身は拾うまで不明）。
function drawCapsules() {
  for (var i = 0; i < capsules.length; i++) {
    var c = capsules[i];
    if (Math.abs(c.x - player.x) > VIEW_W / 2 + 40 || Math.abs(c.y - player.y) > VIEW_H / 2 + 40) continue;
    if (c.life < 3 && Math.floor(performance.now() / 140) % 2 === 0) continue; // 点滅
    var bobY = Math.sin(performance.now() / 300 + c.phase) * 3;
    var col = c.role === "random" ? "#e8ecf2" : DRONE_ROLES[c.role].color;
    ctx.save();
    ctx.translate(c.x, c.y + bobY);
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    if (c.role === "random") {
      ctx.fillStyle = "#e8ecf2";
      ctx.font = "700 11px Orbitron, monospace";
      ctx.textAlign = "center";
      ctx.fillText("?", 0, 4);
    } else if (c.role === "attacker") {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(4, 3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
    } else if (c.role === "guard") {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0.5, 4.2, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 1, 2, 0, Math.PI * 2); ctx.fill();
    } else if (c.role === "sniper") {
      // 細長い菱形（他役割と形でも区別する）
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3.4, 0); ctx.lineTo(0, 6); ctx.lineTo(-3.4, 0); ctx.closePath(); ctx.fill();
    } else { // booster
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

// 子機：ガードのシールド（薄い円）を先に描き、本体を役割の形で描く。
// 全子機共通の味方マーカーとして、細いシアンの円リング＋中心の白いコアを
// 付ける（機能停止中はリングがグレーになる）。「シアンの輪＝味方」が
// 一目で分かるようにし、敵のダーターと似たアタッカーとの区別にもなる。
// 機能停止中はグレーで半透明になり、復帰までの円形ゲージを添える。
function drawDrones() {
  var i, d;
  // スナイパーの照準線：発射までの間、目標へ細い線を引く
  for (i = 0; i < drones.length; i++) {
    d = drones[i];
    if (d.role !== "sniper" || d.down) continue;
    var ap = droneSniperAimPos(d);
    if (!ap) continue;
    ctx.save();
    ctx.strokeStyle = "rgba(150, 255, 215, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(ap.x, ap.y); ctx.stroke();
    ctx.restore();
  }
  for (i = 0; i < drones.length; i++) {
    d = drones[i];
    if (d.role !== "guard" || d.down || d.shieldDown) continue; // 割れている間は泡なし
    // 再展開直後は泡が小さく膨らんで戻る（shieldPopT の間だけ半径を補間）
    var shieldR = DRONE_GUARD_SHIELD_R;
    if (d.shieldPopT > 0) {
      var popK = 1 - d.shieldPopT / SHIELD_POP_TIME; // 0→1
      var popEase = 1 - (1 - popK) * (1 - popK);
      shieldR = DRONE_GUARD_SHIELD_R * (0.5 + 0.5 * popEase);
    }
    ctx.save();
    ctx.fillStyle = "rgba(45, 123, 255, 0.05)";
    ctx.beginPath(); ctx.arc(d.x, d.y, shieldR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(140, 190, 255, " + (d.shieldFlash > 0 ? 0.75 : 0.26) + ")";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(d.x, d.y, shieldR, 0, Math.PI * 2); ctx.stroke();
    // シールド残量ゲージ：縁に沿って、残っている割合だけ明るい円弧を引く
    var sfrac = Math.max(d.shieldHp, 0) / DRONE_GUARD_SHIELD_HP;
    if (sfrac > 0) {
      ctx.strokeStyle = sfrac <= 0.3 ? "rgba(255, 120, 120, 0.9)" : "rgba(190, 228, 255, 0.85)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(d.x, d.y, shieldR, -Math.PI / 2, -Math.PI / 2 + sfrac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (i = 0; i < drones.length; i++) {
    d = drones[i];
    // 味方マーカー：細いリング（稼働時シアン／停止時グレー）
    ctx.save();
    ctx.strokeStyle = d.down ? "rgba(138, 151, 168, 0.75)" : "rgba(34, 230, 255, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(d.x, d.y, 14.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // 組み上がり演出：出現直後の約0.3秒、役割色の輪が広がって収束する
    if (d.spawnFxT > 0) {
      var sfk = 1 - d.spawnFxT / DRONE_SPAWN_FX_TIME; // 0→1
      ctx.save();
      ctx.globalAlpha = (1 - sfk) * 0.9;
      ctx.strokeStyle = DRONE_ROLES[d.role].color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 6 + sfk * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    var col = d.down ? "#8a97a8" : DRONE_ROLES[d.role].color;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.down) ctx.globalAlpha = 0.45;
    ctx.shadowColor = col;
    ctx.shadowBlur = d.down ? 0 : 10;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    if (d.role === "attacker") {
      ctx.rotate(d.aim + Math.PI / 2);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha *= 0.18;
      ctx.fill();
      ctx.globalAlpha = d.down ? 0.45 : 1;
    } else if (d.role === "guard") {
      ctx.rotate(player.angle + Math.PI / 2);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 2, 4.6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = d.down ? "#8a97a8" : "#9fd0ff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, 7.6, -Math.PI * 0.82, -Math.PI * 0.18); ctx.stroke();
    } else if (d.role === "sniper") {
      // 細長い菱形〜矢型（照準方向を向く）
      ctx.rotate(d.aim);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-3, 4.6); ctx.lineTo(-8, 0); ctx.lineTo(-3, -4.6); ctx.closePath(); ctx.stroke();
      ctx.globalAlpha *= 0.18;
      ctx.fill();
      ctx.globalAlpha = d.down ? 0.45 : 1;
    } else { // booster：金の小リング
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 味方マーカーの中心：小さな白いコア（全子機共通）
    ctx.fillStyle = d.down ? "#aeb9c6" : "#ffffff";
    ctx.beginPath(); ctx.arc(0, 0, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 傷ついた子機は上に小さなHPバー
    if (!d.down && d.hp < d.maxHp) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(d.x - 8, d.y - 15, 16, 2.5);
      ctx.fillStyle = DRONE_ROLES[d.role].color;
      ctx.fillRect(d.x - 8, d.y - 15, 16 * Math.max(d.hp, 0) / d.maxHp, 2.5);
    }
    // 機能停止中：復帰までの円形ゲージ
    if (d.down) {
      var prog = 1 - Math.max(d.reviveT, 0) / DRONE_REVIVE_TIME;
      ctx.save();
      ctx.strokeStyle = "rgba(200, 214, 230, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#d7e6f5";
      ctx.beginPath(); ctx.arc(d.x, d.y, 13, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // シールド再展開待ち：ガードの周りに復旧の円ゲージ（満ちたら再展開）
    if (d.role === "guard" && d.shieldDown && !d.down) {
      var sProg = 1 - Math.max(d.shieldRegenT, 0) / DRONE_GUARD_SHIELD_REGEN;
      ctx.save();
      ctx.strokeStyle = "rgba(140, 190, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#9fd0ff";
      ctx.beginPath(); ctx.arc(d.x, d.y, 19, -Math.PI / 2, -Math.PI / 2 + sProg * Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

function drawStick(st, color) {
  if (!st.active) return;
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(st.ox, st.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(st.ox + st.dx * Math.min(st.mag, 1) * (STICK_R - 16), st.oy + st.dy * Math.min(st.mag, 1) * (STICK_R - 16), 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  // 画面外の敵は描かない
  if (Math.abs(e.x - player.x) > VIEW_W / 2 + 60 || Math.abs(e.y - player.y) > VIEW_H / 2 + 60) return;
  // ダーターの突進予告中は点滅させる
  var telegraph = e.type === "darter" && e.dashState === "telegraph";
  var blink = telegraph && Math.floor(performance.now() / 80) % 2 === 0;
  // ボマー／フロスターの起爆カウントダウン中も点滅させる
  var fuseBlink = (e.type === "bomber" || e.type === "froster") && e.fuse >= 0 && Math.floor(performance.now() / 90) % 2 === 0;
  // グロー込みで事前描画したスプライトを、回転だけ付けて貼る
  var spr = (e.flash > 0 || blink || fuseBlink) ? e.sprFlash : e.spr;
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.rotMode === "face") ctx.rotate(((e.type === "guardian" || e.type === "aegis") && e.faceAngle != null ? e.faceAngle : e.dirAngle) + Math.PI / 2); // 進行方向を向く（ガーディアン系は盾の向き）
  else if (e.rotMode === "spin") ctx.rotate(e.rot);
  ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  ctx.restore();
  // アンプのバフ中は体がピンクに光る
  if (e.buffTimer > 0) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 95, 200, 0.16)";
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255, 95, 200, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.25, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // アンプのパルスの波紋：付与範囲（AMP_PULSE_RADIUS）まで広がる
  if (e.pulseT > 0) {
    var pk = 1 - e.pulseT / 0.4;
    ctx.save();
    ctx.globalAlpha = (1 - pk) * 0.55;
    ctx.strokeStyle = "#ff5fc8";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, AMP_PULSE_RADIUS * pk, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // ダメージ無効化中は白いシールドの輪（オーバードライブ弾だけが貫通する）
  if (e.invulnTimer > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 凍結エリア内で遅くなっている敵には薄く霜が付く
  if (e.frosted) {
    ctx.save();
    ctx.fillStyle = "rgba(170, 228, 255, 0.20)";
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(190, 240, 255, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.1, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 自機狙い型は黄色いリングで見分ける
  if (e.aimed) {
    ctx.drawImage(SPR.ring.c, e.x - SPR.ring.w / 2, e.y - SPR.ring.h / 2, SPR.ring.w, SPR.ring.h);
  }
  // ダーター予告：突進方向の照準線
  if (telegraph) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 140, 26, 0.65)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.dirAngle) * 150, e.y + Math.sin(e.dirAngle) * 150);
    ctx.stroke();
    ctx.restore();
  }
  // ガーディアン系：盾が弾を防いだ直後は正面アークを強く光らせる
  // （アークの幅は shieldHalf に合わせる：イージスは元の1.5倍）
  if ((e.type === "guardian" || e.type === "aegis") && e.shieldFlash > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(190, 225, 255, " + Math.min(e.shieldFlash / 0.16, 1) + ")";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    var gShieldA = e.faceAngle != null ? e.faceAngle : e.dirAngle;
    var gHalf = e.type === "aegis" ? (e.shieldHalf != null ? e.shieldHalf : 1.65) : 1.1;
    ctx.arc(e.x, e.y, e.r + 5, gShieldA - gHalf, gShieldA + gHalf);
    ctx.stroke();
    ctx.restore();
  }
  // イージスの防御オーラ：範囲（半径200）を薄く示す
  if (e.type === "aegis") {
    ctx.save();
    ctx.fillStyle = "rgba(61, 139, 255, 0.045)";
    ctx.beginPath(); ctx.arc(e.x, e.y, AEGIS_AURA_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(140, 190, 255, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.arc(e.x, e.y, AEGIS_AURA_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // ボマー：自爆が近づくと範囲の輪が縮んでいく
  if (e.type === "bomber" && e.fuse >= 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 42, 42, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, BOMBER_RADIUS * (0.35 + 0.65 * Math.max(e.fuse, 0) / BOMBER_FUSE_TIME), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // フロスター：起爆が近づくと凍結エリア予定範囲の輪が縮んでいく
  if (e.type === "froster" && e.fuse >= 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(127, 216, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, FROST_RADIUS * (0.35 + 0.65 * Math.max(e.fuse, 0) / BOMBER_FUSE_TIME), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // スナイパー系の照準線：予告中は細い線で示し、照準が固定される
  // 最後のロック時間は少し濃く・太くなる（デッドアイも同じ仕組み）
  if ((e.type === "sniper" || e.type === "deadeye") && e.snipeState === "aim") {
    var sLocked = e.snipeTimer <= (e.type === "deadeye" ? DEADEYE_LOCK_TIME : SNIPE_LOCK_TIME);
    ctx.save();
    ctx.strokeStyle = sLocked ? "rgba(182, 255, 46, 0.85)" : "rgba(182, 255, 46, 0.38)";
    ctx.lineWidth = sLocked ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.snipeAngle) * 720, e.y + Math.sin(e.snipeAngle) * 720);
    ctx.stroke();
    ctx.restore();
  }
  // 六角形とタンクの残りHP
  if ((e.type === "hexagon" || e.type === "tank") && e.hp < e.maxHp) {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 3);
    ctx.fillStyle = e.type === "tank" ? "#e8ecf2" : "#ff4040";
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * (e.hp / e.maxHp), 3);
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle + Math.PI / 2); // スプライトは上向き基準
  // エンジンの炎（ゆらめくので毎フレーム描く。影なしの単純な三角形）
  var flame = 8 + Math.sin(performance.now() / 55) * 3;
  ctx.fillStyle = odActive ? "rgba(255, 194, 51, 0.6)" : "rgba(34, 230, 255, 0.55)";
  ctx.beginPath();
  ctx.moveTo(-4.5, 12); ctx.lineTo(0, 12 + flame); ctx.lineTo(4.5, 12);
  ctx.closePath(); ctx.fill();
  // 機体は事前描画スプライト。被弾直後は点滅（半透明）
  if (player.invincible > 0 && state === "playing" && Math.floor(player.invincible * 14) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  // 発動中は金色の機体スプライトに切り替わる
  var pspr = odActive ? SPR.playerGold : SPR.player;
  ctx.drawImage(pspr.c, -pspr.w / 2, -pspr.h / 2, pspr.w, pspr.h);
  // マズルフラッシュ：発射直後だけ、各銃口に事前描画スプライトを貼る
  if (player.muzzle > 0 && state === "playing") {
    ctx.globalAlpha = Math.min(player.muzzle / 0.05, 1);
    ctx.globalCompositeOperation = "lighter";
    var ms = SPR.muzzle.w * (0.85 + (0.05 - player.muzzle) * 3);
    var mpos = odActive ? odMuzzles : MUZZLE_POS;
    for (var mi = 0; mi < mpos.length; mi++) {
      ctx.drawImage(SPR.muzzle.c, mpos[mi][0] - ms / 2, mpos[mi][1] - ms / 2, ms, ms);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  // 無敵中はシールドリング
  if (player.invincible > 0 && state === "playing") {
    ctx.save();
    ctx.strokeStyle = "rgba(34, 230, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 凍結エリア内では機体に薄く霜が付く
  if (player.frosted && state === "playing") {
    ctx.save();
    ctx.fillStyle = "rgba(170, 228, 255, 0.18)";
    ctx.beginPath(); ctx.arc(player.x, player.y, 21, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(190, 240, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, 21, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
