"use strict";
/* ============================================================
   入力（input.js）：ツインスティックとマウス／キーボード。
   左スティック：移動 / 右スティック：旋回＋射撃。
   スティックは触れた位置が原点になるフローティング式。
   デッドゾーン等の数値は config.js の設定表を参照する。
   ============================================================ */

function newStick() {
  return { active: false, pointerId: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
}
var leftStick = newStick(), rightStick = newStick();
var keys = {};
// PC用：マウス位置で照準、押している間 射撃
var mouseX = VIEW_W / 2, mouseY = VIEW_H / 2 - 120, mouseDown = false, mouseSeen = false;

function stickVector(st) {
  if (!st.active || st.mag <= STICK_DEAD) return null;
  var m = Math.min(st.mag, 1);
  return { x: st.dx * m, y: st.dy * m };
}
// 現在の照準方向。右スティック優先、次にマウス、最後に移動方向。
function currentAim(moveVec) {
  if (rightStick.active && rightStick.mag > AIM_DEAD) {
    return { angle: Math.atan2(rightStick.dy, rightStick.dx), firing: true };
  }
  if (mouseSeen) {
    return { angle: Math.atan2(mouseY - VIEW_H / 2, mouseX - VIEW_W / 2), firing: mouseDown };
  }
  if (keys[" "]) return { angle: player.angle, firing: true };
  if (moveVec) return { angle: Math.atan2(moveVec.y, moveVec.x), firing: false };
  return { angle: player.angle, firing: false };
}

/* ============================================================
   入力：ツインスティック
   タッチ／ペン：左半分に触れると左スティック（移動）、
   右半分に触れると右スティック（旋回＋射撃）がその場に現れる。
   マウス：位置で照準、押している間 射撃。移動はキーボード。
   ============================================================ */
function toView(clientX, clientY) {
  var rect = stage.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (VIEW_W / rect.width),
    y: (clientY - rect.top) * (VIEW_H / rect.height)
  };
}
function stickTouch(st, pos) {
  var dx = pos.x - st.ox, dy = pos.y - st.oy;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) { st.dx = 0; st.dy = 0; st.mag = 0; return; }
  st.dx = dx / len; st.dy = dy / len;
  st.mag = len / STICK_R;
}
function stickRelease(st) {
  st.active = false; st.pointerId = null; st.dx = 0; st.dy = 0; st.mag = 0;
}
canvas.addEventListener("pointerdown", function (ev) {
  var pos = toView(ev.clientX, ev.clientY);
  if (ev.pointerType === "mouse") {
    mouseSeen = true; mouseDown = true; mouseX = pos.x; mouseY = pos.y;
  } else {
    var st = pos.x < VIEW_W / 2 ? leftStick : rightStick;
    if (st.active) return;
    st.active = true; st.pointerId = ev.pointerId;
    st.ox = pos.x; st.oy = pos.y; st.dx = 0; st.dy = 0; st.mag = 0;
  }
  try { canvas.setPointerCapture(ev.pointerId); } catch (err) {}
  ev.preventDefault();
});
canvas.addEventListener("pointermove", function (ev) {
  var pos = toView(ev.clientX, ev.clientY);
  if (ev.pointerType === "mouse") {
    mouseSeen = true; mouseX = pos.x; mouseY = pos.y;
    return;
  }
  if (leftStick.active && leftStick.pointerId === ev.pointerId) stickTouch(leftStick, pos);
  if (rightStick.active && rightStick.pointerId === ev.pointerId) stickTouch(rightStick, pos);
});
function endPointer(ev) {
  if (ev.pointerType === "mouse") { mouseDown = false; return; }
  if (leftStick.pointerId === ev.pointerId) stickRelease(leftStick);
  if (rightStick.pointerId === ev.pointerId) stickRelease(rightStick);
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });

// PC向け：矢印キー / WASD で移動、スペースで正面へ射撃
window.addEventListener("keydown", function (ev) {
  keys[ev.key.toLowerCase()] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(ev.key.toLowerCase()) >= 0) ev.preventDefault();
});
window.addEventListener("keyup", function (ev) { keys[ev.key.toLowerCase()] = false; });
