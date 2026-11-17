"use strict";
/* ============================================================
   サウンド（WebAudioの小さな電子音）
   ============================================================ */
var audioCtx = null, soundOn = true;
var masterVolume = 0.8; // 設定パネルの音量スライダー（0〜1）。効果音全体に掛かる
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
  g.gain.setValueAtTime(gain * masterVolume, t);
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
  g.gain.setValueAtTime(gain * masterVolume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start(t); src.stop(t + dur);
}
// 撃破音は敵の大きさで3段階：0=小（高く軽く）／1=中／2=大・上位種（低く重く）
function sfxExplosionTier(tier) {
  if (!soundOn || !audioCtx) return;
  var now = performance.now();
  if (now - lastExplAt < 30) return;
  lastExplAt = now;
  var step = Math.min(comboCount, 24);
  var mul = 1 + step * 0.035;
  if (tier >= 2) {
    tone(210 * mul, 34, 0.38, "square", 0.13);
    tone(105 * mul, 30, 0.42, "triangle", 0.14);
    noiseBurst(0.4, 750, 0.17);
  } else if (tier === 1) {
    tone(360 * mul, 40, 0.26, "square", 0.085);
    tone(180 * mul, 34, 0.28, "triangle", 0.09);
    noiseBurst(0.26, 1200, 0.11);
  } else {
    tone(620 * mul, 70, 0.14, "square", 0.045);
    tone(310 * mul, 60, 0.15, "triangle", 0.05);
    noiseBurst(0.13, 2100, 0.05);
  }
  if (comboCount >= 2) tone(660 * mul, 880 * mul, 0.09, "sine", 0.045);
}
function sfxExplosion(big) { sfxExplosionTier(big ? 2 : 0); }
// カプセル出現：短い電子音（小さな閃光に合わせる）
function sfxCapsuleSpawn() {
  if (!soundOn || !audioCtx) return;
  tone(1180, 1760, 0.08, "sine", 0.04);
}
// カプセル取得：役割ごとに音程を変える（アタッカー低め→スナイパー高め等）
var PICKUP_BASE = { attacker: 740, guard: 880, booster: 988, sniper: 1175 };
function sfxPickupRole(role) {
  if (!soundOn || !audioCtx) return;
  var base = PICKUP_BASE[role] || 880;
  tone(base, base, 0.07, "square", 0.055);
  setTimeout(function () { tone(base * 1.5, base * 1.5, 0.1, "square", 0.055); }, 55);
}
// 子機復帰：修理完了の柔らかい音
function sfxDroneRevive() {
  if (!soundOn || !audioCtx) return;
  tone(520, 780, 0.14, "sine", 0.05);
  setTimeout(function () { tone(780, 1040, 0.12, "sine", 0.04); }, 80);
}
// ベスト更新のファンファーレ（短い3音）
function sfxFanfare() {
  if (!soundOn || !audioCtx) return;
  tone(784, 784, 0.1, "square", 0.06);
  setTimeout(function () { tone(988, 988, 0.1, "square", 0.06); }, 90);
  setTimeout(function () { tone(1318, 1568, 0.2, "square", 0.07); }, 180);
}
// ボマーの爆破予告ビープ：予告の進み具合（0→1）で音程が上がる
function sfxBomberBeep(progress) {
  if (!soundOn || !audioCtx) return;
  var f = 880 + progress * 520;
  tone(f, f, 0.06, "square", 0.05);
}
// アークの電気音：距離が近いほど大きく（呼び出し側で間引く）
function sfxArcCrackle(dist) {
  if (!soundOn || !audioCtx) return;
  var k = clamp(1 - dist / ARC_CRACKLE_RANGE, 0, 1);
  if (k <= 0) return;
  noiseBurst(0.05, 3200, 0.012 + k * 0.035);
  tone(rand(1800, 2600), rand(900, 1400), 0.04, "sawtooth", 0.006 + k * 0.016);
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
// 子機カプセルの取得：軽い2音で「増えた」ことを知らせる
function sfxPickup() {
  if (!soundOn || !audioCtx) return;
  tone(880, 880, 0.07, "square", 0.06);
  setTimeout(function () { tone(1318, 1318, 0.1, "square", 0.06); }, 60);
}
// 子機の機能停止：短い下降音
function sfxDroneDown() {
  if (!soundOn || !audioCtx) return;
  tone(520, 160, 0.18, "triangle", 0.07);
}
// ガードのシールドが敵弾を受けた音：小さなチッという音（間引きつき）
var lastShieldHitAt = 0;
function sfxShieldHit() {
  if (!soundOn || !audioCtx) return;
  var now = performance.now();
  if (now - lastShieldHitAt < 70) return;
  lastShieldHitAt = now;
  tone(1500, 1100, 0.05, "sine", 0.025);
}
// ガードのシールドが割れた音：ガラスが砕けるような高音＋ノイズ
function sfxShieldBreak() {
  if (!soundOn || !audioCtx) return;
  tone(1700, 240, 0.28, "sawtooth", 0.06);
  noiseBurst(0.24, 3400, 0.09);
}
// ガードのシールド再展開：短い上昇音
function sfxShieldRestore() {
  if (!soundOn || !audioCtx) return;
  tone(660, 1180, 0.12, "sine", 0.045);
}
function sfxGameOver() {
  tone(392, 392, 0.16, "square", 0.08);
  setTimeout(function () { tone(311, 311, 0.16, "square", 0.08); }, 170);
  setTimeout(function () { tone(233, 110, 0.42, "square", 0.09); }, 340);
}
