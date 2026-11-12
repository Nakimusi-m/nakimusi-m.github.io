"use strict";
/* 画面と描画解像度（view.js）
   動的解像度：フレーム時間が悪化したら描画解像度を段階的に下げ、
   軽くなったら戻す。論理座標は不変なので挙動・操作感は変わらない。
   DPR_STEPS は config.js の設定表にある。 */

var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var stage = document.getElementById("stage");

var view = { scale: 1, dpr: 1 };
var bgGrad = null;
// 動的解像度：フレーム時間が悪化したら描画解像度を段階的に下げ、
// 軽くなったら戻す。論理座標は不変なので挙動・操作感は変わらない。
var dprLevel = 0;
function resize() {
  var rect = stage.getBoundingClientRect();
  view.dpr = Math.min(window.devicePixelRatio || 1, DPR_STEPS[dprLevel]);
  canvas.width = Math.round(rect.width * view.dpr);
  canvas.height = Math.round(rect.height * view.dpr);
  view.scale = canvas.width / VIEW_W; // 論理→実ピクセル
  // 背景グラデーションはリサイズ時に作って使い回す（毎フレーム生成しない）
  bgGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bgGrad.addColorStop(0, "#060a1c");
  bgGrad.addColorStop(0.6, "#050914");
  bgGrad.addColorStop(1, "#04060f");
}
window.addEventListener("resize", resize);
