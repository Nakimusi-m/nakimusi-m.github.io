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

// 配列を前詰めで圧縮し、dead な要素だけを取り除く（新規確保なし）
function sweepDead(arr) {
  var w = 0;
  for (var r = 0; r < arr.length; r++) {
    if (!arr[r].dead) arr[w++] = arr[r];
  }
  arr.length = w;
}
