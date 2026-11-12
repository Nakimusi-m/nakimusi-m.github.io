"use strict";
/* ============================================================
   サウンド（WebAudioの小さな電子音）
   ============================================================ */
var audioCtx = null, soundOn = true;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (err) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function tone(freqFrom, freqTo, dur, type, gain) {
  if (!soundOn || !audioCtx) return;
  var t = audioCtx.currentTime;
  var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}
// 爆発音は「電子音＋ノイズ」を重ねて厚みを出す。ノイズバッファは
// 一度だけ作って使い回す。コンボが伸びるほど音程が上がる。
var noiseBuf = null, lastExplAt = 0;
function getNoiseBuf() {
  if (noiseBuf || !audioCtx) return noiseBuf;
  var len = Math.floor(audioCtx.sampleRate * 0.4);
  noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  var d = noiseBuf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function noiseBurst(dur, cutoff, gain) {
  if (!soundOn || !audioCtx) return;
  var buf = getNoiseBuf();
  if (!buf) return;
  var t = audioCtx.currentTime;
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = rand(0.85, 1.15);
  var f = audioCtx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(120, t + dur);
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}
function sfxExplosion(big) {
  if (!soundOn || !audioCtx) return;
  // 同時多発時は音が重なりすぎるので最小間隔を空ける
  var now = performance.now();
  if (now - lastExplAt < 30) return;
  lastExplAt = now;
  var step = Math.min(comboCount, 24);
  var mul = 1 + step * 0.035; // コンボで少しずつ高く
  tone((big ? 300 : 430) * mul, 42, big ? 0.32 : 0.2, "square", big ? 0.11 : 0.06);
  tone((big ? 150 : 210) * mul, 36, big ? 0.36 : 0.22, "triangle", big ? 0.12 : 0.07);
  noiseBurst(big ? 0.34 : 0.2, big ? 950 : 1500, big ? 0.15 : 0.08);
  if (comboCount >= 2) tone(660 * mul, 880 * mul, 0.09, "sine", 0.045); // コンボのキラッという音
}
function sfxHit() { tone(200, 60, 0.22, "sawtooth", 0.12); }
// オーバードライブ発動：上昇するアルペジオで「解放」を知らせる
function sfxOverdriveStart() {
  if (!soundOn || !audioCtx) return;
  tone(523, 523, 0.09, "square", 0.07);
  setTimeout(function () { tone(659, 659, 0.09, "square", 0.07); }, 70);
  setTimeout(function () { tone(784, 784, 0.09, "square", 0.07); }, 140);
  setTimeout(function () { tone(1046, 1568, 0.22, "square", 0.08); noiseBurst(0.25, 2400, 0.06); }, 210);
}
// オーバードライブ終了：下降音で静かに知らせる
function sfxOverdriveEnd() {
  if (!soundOn || !audioCtx) return;
  tone(784, 392, 0.2, "triangle", 0.07);
}
function sfxEnemyShoot() { tone(880, 620, 0.07, "triangle", 0.02); }
// ボス登場予告の警報：2音のサイレンを繰り返す
function sfxWarning() {
  if (!soundOn || !audioCtx) return;
  tone(440, 440, 0.16, "square", 0.055);
  setTimeout(function () { tone(349, 349, 0.16, "square", 0.055); }, 180);
}
// バリア崩壊：下降音＋ノイズで「割れた」ことを知らせる
function sfxBarrierDown() {
  if (!soundOn || !audioCtx) return;
  tone(1200, 180, 0.35, "sawtooth", 0.07);
  noiseBurst(0.3, 2600, 0.09);
}
function sfxGameOver() {
  tone(392, 392, 0.16, "square", 0.08);
  setTimeout(function () { tone(311, 311, 0.16, "square", 0.08); }, 170);
  setTimeout(function () { tone(233, 110, 0.42, "square", 0.09); }, 340);
}
