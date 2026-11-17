"use strict";
/* 小さな共通関数（utils.js） */

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
// 角度の最短差分（スムーズな旋回用）
function angleLerp(a, b, t) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function obtain(pool) { return pool.length ? pool.pop() : {}; }

// 点(px, py)と線分(x1, y1)-(x2, y2)の最短距離（アークの電気の当たり判定用）
function distToSegment(px, py, x1, y1, x2, y2) {
  var sx = x2 - x1, sy = y2 - y1;
  var len2 = sx * sx + sy * sy;
  var t = len2 > 0 ? ((px - x1) * sx + (py - y1) * sy) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var cx = x1 + sx * t, cy = y1 + sy * t;
  var dx = px - cx, dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

// 配列を前詰めで圧縮し、dead な要素だけを取り除く（新規確保なし）
function sweepDead(arr) {
  var w = 0;
  for (var r = 0; r < arr.length; r++) {
    if (!arr[r].dead) arr[w++] = arr[r];
  }
  arr.length = w;
}
