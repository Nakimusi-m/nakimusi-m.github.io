"use strict";
/* ============================================================
   メインループと起動（main.js）：必ず最後に読み込む。
   動的解像度の再判定もここで行う（DPR_STEPS は config.js）。
   ============================================================ */

/* ============================================================
   メインループ
   ============================================================ */
var lastTime = 0;
var frameEma = 16.7, dprCheck = 0; // フレーム時間の移動平均(ms)と再判定タイマ
function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTime) lastTime = ts;
  var rawDt = (ts - lastTime) / 1000;
  var dt = Math.min(rawDt, 0.033);
  lastTime = ts;
  // 動的解像度：平均フレーム時間が悪ければ描画解像度を1段下げ、
  // 十分軽ければ1段戻す（0.8秒ごとに判定し、頻繁な切替を避ける）
  if (rawDt > 0 && rawDt < 0.25) {
    frameEma = frameEma * 0.95 + rawDt * 1000 * 0.05;
    dprCheck -= rawDt;
    if (dprCheck <= 0) {
      dprCheck = 0.8;
      if (frameEma > 19 && dprLevel < DPR_STEPS.length - 1) { dprLevel++; resize(); frameEma = 16.7; }
      else if (frameEma < 10.5 && dprLevel > 0) { dprLevel--; resize(); frameEma = 16.7; }
    }
  }
  if (hitStop > 0) {
    // ヒットストップ中は世界を止めて描画だけ行う（一瞬の手応え）
    hitStop -= rawDt;
    draw();
  } else {
    if (state !== "paused") update(dt);
    draw();
  }
}

makeStars();
resetGame();
resize();
requestAnimationFrame(loop);
