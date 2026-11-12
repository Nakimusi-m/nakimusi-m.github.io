"use strict";
/* ============================================================
   スプライト事前描画（sprites.js）
   ============================================================ */

/* ============================================================
   スプライト事前描画（高速化の要）
   shadowBlur は Canvas で最も重い処理のひとつで、敵・弾の
   1つ1つに毎フレーム使うと数が増えた途端にカクつく。
   そこで起動時に「グロー込みの見た目」をオフスクリーンへ
   描いておき、毎フレームは drawImage で貼るだけにする。
   ============================================================ */
var SS = 3; // スプライトのスーパサンプル倍率（論理pxあたり）
function makeSprite(w, h, drawFn) {
  var c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w * SS));
  c.height = Math.max(2, Math.round(h * SS));
  var g = c.getContext("2d");
  g.scale(SS, SS);
  g.translate(w / 2, h / 2);
  drawFn(g);
  return { c: c, w: w, h: h };
}
function pathOn(g, points) {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (var i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
}
function buildEnemySprite(t, flash) {
  var half = Math.ceil(t.r * 1.45) + 20; // 形の最大半径 + グロー分
  var pts = shapePoints({ shape: t.shape, r: t.r, rot: 0 });
  return makeSprite(half * 2, half * 2, function (g) {
    var main = flash ? "#ffffff" : t.color;
    if (t.shape === "snowflake") {
      // 雪の結晶：中心から6本の枝と、枝の中ほどの小枝
      g.shadowColor = t.color;
      g.shadowBlur = 14;
      g.lineWidth = 2.5;
      g.lineCap = "round";
      g.strokeStyle = main;
      g.beginPath();
      for (var fi = 0; fi < 6; fi++) {
        var fa = fi * Math.PI / 3;
        var fx2 = Math.cos(fa), fy2 = Math.sin(fa);
        g.moveTo(0, 0);
        g.lineTo(fx2 * t.r, fy2 * t.r);
        var bx2 = fx2 * t.r * 0.55, by2 = fy2 * t.r * 0.55, bl = t.r * 0.34;
        g.moveTo(bx2, by2);
        g.lineTo(bx2 + Math.cos(fa - 0.7) * bl, by2 + Math.sin(fa - 0.7) * bl);
        g.moveTo(bx2, by2);
        g.lineTo(bx2 + Math.cos(fa + 0.7) * bl, by2 + Math.sin(fa + 0.7) * bl);
      }
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = main;
      g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
      return;
    }
    if (t.shape === "ring") {
      // リング（ドーナツ型）：太い輪と中心の小さな芯
      g.shadowColor = t.color;
      g.shadowBlur = 14;
      g.lineWidth = 6.5;
      g.strokeStyle = main;
      g.beginPath(); g.arc(0, 0, t.r * 0.72, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = main;
      g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
      return;
    }
    if (t.shape === "guardian") {
      // 本体（少し後ろの円＝半月形の胴）と、正面（上）の盾アーク
      g.shadowColor = t.color;
      g.shadowBlur = 14;
      g.lineWidth = 2.5;
      g.strokeStyle = main;
      g.beginPath(); g.arc(0, 5, t.r * 0.72, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = t.color;
      g.globalAlpha = 0.16;
      g.beginPath(); g.arc(0, 5, t.r * 0.72, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.shadowColor = "#2d7bff";
      g.shadowBlur = 12;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.strokeStyle = flash ? "#ffffff" : "#9fd0ff";
      g.beginPath(); g.arc(0, 0, t.r * 1.05, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = main;
      g.beginPath(); g.arc(0, 5, 3, 0, Math.PI * 2); g.fill();
      return;
    }
    g.shadowColor = t.color;
    g.shadowBlur = 14;
    g.lineWidth = 2.5;
    g.strokeStyle = main;
    pathOn(g, pts);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = t.color;
    g.globalAlpha = 0.16;
    pathOn(g, pts);
    g.fill();
    g.globalAlpha = 1;
    if (t.shape === "circle") {
      // 円形の敵（タンク／ボマー／小丸）は内輪で見分ける
      g.strokeStyle = main;
      g.lineWidth = 2;
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(0, 0, t.r * 0.5, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = main;
    g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
  });
}
var ENEMY_SPRITES = {};
for (var typeKey in ENEMY_TYPES) {
  ENEMY_SPRITES[typeKey] = {
    normal: buildEnemySprite(ENEMY_TYPES[typeKey], false),
    flash: buildEnemySprite(ENEMY_TYPES[typeKey], true)
  };
}
var SPR = {};
SPR.bullet = makeSprite(28, 40, function (g) { // 自機の弾（中心=弾の位置、右向き基準）
  g.shadowColor = "#22e6ff"; g.shadowBlur = 10;
  g.fillStyle = "#aef7ff";
  g.beginPath();
  var x = -8, y = -2, w = 13, h = 4, r = 2;
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath(); g.fill();
});
SPR.bulletGold = makeSprite(28, 40, function (g) { // オーバードライブ中の自機の弾（金色）
  g.shadowColor = "#ffc233"; g.shadowBlur = 10;
  g.fillStyle = "#ffe9a8";
  g.beginPath();
  var x = -8, y = -2, w = 13, h = 4, r = 2;
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath(); g.fill();
});
SPR.ebullet = makeSprite(38, 38, function (g) { // 敵弾
  g.shadowColor = "#ff7a1a"; g.shadowBlur = 12;
  g.fillStyle = "#ffb03a";
  g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#fff3d6";
  g.beginPath(); g.arc(0, 0, 4.5 * 0.45, 0, Math.PI * 2); g.fill();
});
SPR.ring = makeSprite(24, 24, function (g) { // 自機狙い型の目印リング
  g.strokeStyle = "#ffc233"; g.lineWidth = 1.6;
  g.beginPath(); g.arc(0, 0, 7.5, 0, Math.PI * 2); g.stroke();
});
SPR.player = makeSprite(76, 76, function (g) { // 自機（上向き基準、炎は別描画）
  g.shadowColor = "#22e6ff"; g.shadowBlur = 16;
  g.lineWidth = 2.5; g.strokeStyle = "#22e6ff";
  g.beginPath();
  g.moveTo(0, -17); g.lineTo(13, 12); g.lineTo(0, 6); g.lineTo(-13, 12);
  g.closePath();
  g.stroke();
  g.fillStyle = "rgba(34, 230, 255, 0.2)";
  g.fill();
  g.shadowBlur = 0;
  // ツインノズル：機首の左右に2本の銃口を描く
  g.strokeStyle = "#aef7ff"; g.lineWidth = 2; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-5.5, -8); g.lineTo(-5.5, -15);
  g.moveTo(5.5, -8); g.lineTo(5.5, -15);
  g.stroke();
  g.fillStyle = "#d9fbff";
  g.beginPath(); g.arc(0, -3, 3.2, 0, Math.PI * 2); g.fill();
});
SPR.playerGold = makeSprite(76, 76, function (g) { // オーバードライブ中の自機（金色・ノズル4本）
  g.shadowColor = "#ffc233"; g.shadowBlur = 16;
  g.lineWidth = 2.5; g.strokeStyle = "#ffc233";
  g.beginPath();
  g.moveTo(0, -17); g.lineTo(13, 12); g.lineTo(0, 6); g.lineTo(-13, 12);
  g.closePath();
  g.stroke();
  g.fillStyle = "rgba(255, 194, 51, 0.25)";
  g.fill();
  g.shadowBlur = 0;
  // ノズル4本：内側の対＋外側の対
  g.strokeStyle = "#fff0b3"; g.lineWidth = 2; g.lineCap = "round";
  g.beginPath();
  g.moveTo(-11, -4); g.lineTo(-11, -11);
  g.moveTo(-3.7, -9); g.lineTo(-3.7, -16);
  g.moveTo(3.7, -9); g.lineTo(3.7, -16);
  g.moveTo(11, -4); g.lineTo(11, -11);
  g.stroke();
  g.fillStyle = "#fff6d8";
  g.beginPath(); g.arc(0, -3, 3.2, 0, Math.PI * 2); g.fill();
});
SPR.muzzle = makeSprite(34, 34, function (g) { // マズルフラッシュ（上向き基準）
  var grad = g.createRadialGradient(0, 0, 0, 0, 0, 15);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.35, "rgba(120,240,255,0.75)");
  grad.addColorStop(1, "rgba(34,230,255,0)");
  g.fillStyle = grad;
  g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(190,250,255,0.9)"; g.lineWidth = 2; g.lineCap = "round";
  g.beginPath();
  g.moveTo(0, -3); g.lineTo(0, -16);
  g.moveTo(-3, -1); g.lineTo(-11, -8);
  g.moveTo(3, -1); g.lineTo(11, -8);
  g.stroke();
});

// 敵の形の頂点（中心基準）。スプライト事前描画と破片描画で使う。
// 敵の形の頂点（中心基準）。スプライト事前描画でのみ使う。
function shapePoints(e) {
  var r = e.r, pts = [], i, a;
  if (e.shape === "square") {
    var c = Math.cos(e.rot), s = Math.sin(e.rot);
    var base = [[-r, -r], [r, -r], [r, r], [-r, r]];
    for (i = 0; i < 4; i++) pts.push([base[i][0] * c - base[i][1] * s, base[i][0] * s + base[i][1] * c]);
  } else if (e.shape === "diamond") {
    pts = [[0, -r * 1.25], [r * 0.85, 0], [0, r * 1.25], [-r * 0.85, 0]];
  } else if (e.shape === "triangle") {
    pts = [[0, -r * 1.25], [r * 1.05, r * 0.9], [-r * 1.05, r * 0.9]];
  } else if (e.shape === "pentagon") {
    for (i = 0; i < 5; i++) {
      a = e.rot - Math.PI / 2 + i * Math.PI * 2 / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else if (e.shape === "circle" || e.shape === "guardian") {
    for (i = 0; i < 20; i++) {
      a = i * Math.PI / 10;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else if (e.shape === "star") {
    for (i = 0; i < 10; i++) {
      a = e.rot - Math.PI / 2 + i * Math.PI / 5;
      var rr2 = i % 2 === 0 ? r : r * 0.5;
      pts.push([Math.cos(a) * rr2, Math.sin(a) * rr2]);
    }
  } else if (e.shape === "snowflake") {
    // 雪の結晶の外形（破片描画用）：6方向に尖った12点の星型
    for (i = 0; i < 12; i++) {
      a = e.rot - Math.PI / 2 + i * Math.PI / 6;
      var rs = i % 2 === 0 ? r : r * 0.42;
      pts.push([Math.cos(a) * rs, Math.sin(a) * rs]);
    }
  } else if (e.shape === "arrowhead") {
    // 細長い矢じり（上向き基準）
    pts = [[0, -r * 1.7], [r * 0.62, r * 0.85], [0, r * 0.35], [-r * 0.62, r * 0.85]];
  } else if (e.shape === "ring") {
    for (i = 0; i < 20; i++) {
      a = i * Math.PI / 10;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  } else { // hexagon
    for (i = 0; i < 6; i++) {
      a = e.rot + i * Math.PI / 3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  return pts;
}
