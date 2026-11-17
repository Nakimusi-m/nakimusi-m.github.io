"use strict";
/* ============================================================
   タイトル画面の背景演出（titlebg.js）
   ボスを除く通常敵12種の図形が、それぞれの色（少し暗く・薄く）で
   ゆっくり回転しながら上から降ってくるアニメーションをループさせる。
   図形は装飾専用で、クリックは一切妨げない（pointer-events: none）。
   形と色は敵定義（enemies.js の ENEMY_TYPES）の icon / color を
   そのまま使うので、敵の見た目が変われば背景も追随する。
   ============================================================ */
(function buildFallingShapes() {
  var host = document.getElementById("falling-layer");
  if (!host || typeof ENEMY_TYPES === "undefined") return;
  // ボス（八角形）とスプリッターの分裂世代は含めない：通常敵12種のみ
  var FALL_TYPES = ["square", "diamond", "hexagon", "darter", "splitter", "tank", "spiral", "guardian", "bomber", "froster", "sniper", "amp"];
  var COUNT = 22;
  var html = "";
  for (var i = 0; i < COUNT; i++) {
    var t = ENEMY_TYPES[FALL_TYPES[i % FALL_TYPES.length]];
    if (!t) continue;
    var left = (2 + Math.random() * 94).toFixed(1);
    var size = Math.round(22 + Math.random() * 34);       // 22〜56px
    var dur = (10 + Math.random() * 11).toFixed(1);       // 10〜21秒でゆっくり落下
    var delay = (-Math.random() * 21).toFixed(1);         // 負の遅延で最初から画面全体に散らす
    var op = (0.13 + Math.random() * 0.17).toFixed(2);    // 薄く（0.13〜0.30）
    var sway = (Math.random() * 26 - 13).toFixed(0);      // 左右の揺れ幅
    html += '<span class="fall-shape" style="left:' + left + '%;width:' + size + 'px;height:' + size +
      'px;opacity:' + op + ';--sway:' + sway + 'px;animation-duration:' + dur + 's;animation-delay:' + delay + 's">' +
      '<svg viewBox="-20 -20 40 40">' + t.icon + '</svg></span>';
  }
  host.innerHTML = html;
})();
