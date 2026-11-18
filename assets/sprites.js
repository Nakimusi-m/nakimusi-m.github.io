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
    // 上位種の装甲（確定デザイン）：元の図形はそのままに、各辺の中央へ
    // 四角い装甲板が辺をまたいで乗る形。板は辺の長さの半分ほどで、
    // 本体より一段濃い色に縁だけネオンに光らせ、「後付けの装甲」感を
    // 出す。角は覆わず鋭いまま残す。板はスプライトの一部として描く
    // ため、本体と一緒に回転する（当たり判定・大きさは不変）。
    function darkerShade(hex, f) {
      var n = parseInt(hex.slice(1), 16);
      var rr = Math.round(((n >> 16) & 255) * f), gg = Math.round(((n >> 8) & 255) * f), bb = Math.round((n & 255) * f);
      return "rgb(" + rr + "," + gg + "," + bb + ")";
    }
    function drawArmorPlate(cx, cy, size, angle) {
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      g.shadowColor = t.color; g.shadowBlur = 7;
      g.fillStyle = flash ? "#ffffff" : darkerShade(t.color, 0.45); // 本体より一段濃い板
      g.globalAlpha = flash ? 0.9 : 0.88;
      g.fillRect(-size / 2, -size / 2, size, size);
      g.globalAlpha = 1;
      g.lineWidth = 2;
      g.strokeStyle = main; // 縁だけネオンに光る
      g.strokeRect(-size / 2, -size / 2, size, size);
      g.restore();
    }
    function drawEliteArmor() {
      if (!t.elite) return;
      var ai, a1, a2;
      if (t.shape === "aegis") {
        // イージス：本体（円）の下半分・側面の縁に板を置き、さらに
        // 正面の盾の縁にも四角を並べて「要塞の壁」のように見せる
        var bodyR = t.r * 0.72;
        var bodyAngles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, Math.PI];
        for (ai = 0; ai < bodyAngles.length; ai++) {
          a1 = bodyAngles[ai];
          drawArmorPlate(Math.cos(a1) * bodyR, 5 + Math.sin(a1) * bodyR, t.r * 0.34, a1 + Math.PI / 2);
        }
        var shieldR = t.r * 1.05;
        var shieldAngles = [-Math.PI * 0.94, -Math.PI * 0.75, -Math.PI / 2, -Math.PI * 0.25, -Math.PI * 0.06];
        for (ai = 0; ai < shieldAngles.length; ai++) {
          a2 = shieldAngles[ai];
          drawArmorPlate(Math.cos(a2) * shieldR, Math.sin(a2) * shieldR, t.r * 0.4, a2 + Math.PI / 2);
        }
        return;
      }
      // デッドアイ（矢じり）／サイクロン（星＝渦の腕）：図形の各辺の
      // 中央に、辺をまたいで板を乗せる。デッドアイは小さめの四角で
      // 装甲化した矢じりに、サイクロンは腕の辺に付けて歯車めかせる。
      var pts2 = shapePoints({ shape: t.shape, r: t.r, rot: 0 });
      var sizeMul = t.shape === "arrowhead" ? 0.38 : 0.45; // 辺の長さに対する板の大きさ
      for (ai = 0; ai < pts2.length; ai++) {
        var p1 = pts2[ai], p2 = pts2[(ai + 1) % pts2.length];
        var edx = p2[0] - p1[0], edy = p2[1] - p1[1];
        var elen = Math.sqrt(edx * edx + edy * edy);
        if (elen < 0.01) continue;
        drawArmorPlate((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, elen * sizeMul, Math.atan2(edy, edx));
      }
    }
    // フロスター（snowflake）も他の敵と共通の描き方にする：
    // shapePoints の12点星型（氷の結晶のシルエット）を、輪郭線＋
    // 半透明の塗り＋中心点で描く。枝線だけの線画にはしない。
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
    if (t.shape === "healer") {
      // ヒーラー：濃いマゼンタの体にトゲ状の縁取り＋黒い十字。
      // 白緑の丸だった頃は味方（子機）に見えたため、色と縁の形で
      // 「敵の支援役」と読める姿にした。十字のモチーフ自体は残し、
      // 回復役であることは伝わるようにする。
      var spikes = 12, hpts = [], hi2, ha2, hr2;
      for (hi2 = 0; hi2 < spikes * 2; hi2++) {
        ha2 = hi2 * Math.PI / spikes - Math.PI / 2;
        hr2 = hi2 % 2 === 0 ? t.r * 1.04 : t.r * 0.8; // 外側のトゲと内側の谷を交互に
        hpts.push([Math.cos(ha2) * hr2, Math.sin(ha2) * hr2]);
      }
      g.shadowColor = t.color;
      g.shadowBlur = 14;
      g.lineWidth = 2.5;
      g.strokeStyle = main;
      pathOn(g, hpts);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = t.color;
      g.globalAlpha = 0.28;
      pathOn(g, hpts);
      g.fill();
      g.globalAlpha = 1;
      // 黒い十字（被弾フラッシュ時も黒のままにして敵らしさを保つ）
      g.strokeStyle = flash ? "#3a0d26" : "#180510";
      g.lineWidth = 4.2;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, -t.r * 0.5); g.lineTo(0, t.r * 0.5);
      g.moveTo(-t.r * 0.5, 0); g.lineTo(t.r * 0.5, 0);
      g.stroke();
      return;
    }
    if (t.shape === "guardian" || t.shape === "aegis") {
      // 本体（少し後ろの円＝半月形の胴）と、正面（上）の盾アーク。
      // イージスは盾の角度が元の1.5倍（半角135°）まで広い。
      var isAegis = t.shape === "aegis";
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
      g.beginPath();
      if (isAegis) g.arc(0, 0, t.r * 1.05, -Math.PI * 1.25, Math.PI * 0.25);
      else g.arc(0, 0, t.r * 1.05, -Math.PI * 0.82, -Math.PI * 0.18);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = main;
      g.beginPath(); g.arc(0, 5, 3, 0, Math.PI * 2); g.fill();
      drawEliteArmor();
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
    drawEliteArmor();
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
SPR.pellet = makeSprite(20, 20, function (g) { // 子機アタッカーの散弾の粒（味方弾：淡いシアン〜白）
  g.shadowColor = "#22e6ff"; g.shadowBlur = 8;
  g.fillStyle = "#dffaff";
  g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(0, 0, 1.4, 0, Math.PI * 2); g.fill();
});
SPR.ebullet = makeSprite(38, 38, function (g) { // 敵弾（敵弾共通：赤〜マゼンタ系。色だけで敵弾と分かるように統一）
  g.shadowColor = "#ff2d78"; g.shadowBlur = 12;
  g.fillStyle = "#ff3b6b";
  g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#ffd6e2";
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
  } else if (e.shape === "cross") {
    // 十字（プラス）型：12点の輪郭
    var w = r * 0.38;
    pts = [[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]];
  } else if (e.shape === "circle" || e.shape === "guardian" || e.shape === "aegis" || e.shape === "orb" || e.shape === "healer") {
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
    // 氷の結晶の外形（スプライト・破片共通）：6方向に尖った12点の星型
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
  } else if (e.shape === "octagon") {
    // 八角形（ボス本体の破片用）
    for (i = 0; i < 8; i++) {
      a = e.rot + i * Math.PI / 4;
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
