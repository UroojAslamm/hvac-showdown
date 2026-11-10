import { startBackground } from './bg3d.js';
import { LET, esc, fmt, ICON, tone, anim, enter, json } from './common.js';

const $ = (s) => document.querySelector(s);
const KEY = new URLSearchParams(location.search).get('key') || '';
const fx = startBackground($('#bg3d'));

let S = null, offset = 0, renderKey = '', prevSub = null, lastCd = -1, failures = 0;
const prevPips = { 1: 0, 2: 0 };
const now = () => Date.now() + offset;
const sub = () => (!S ? null : S.phase === 'play' ? (now() < S.qStartAt ? 'cd' : 'q') : S.phase);

// ---------- network ----------
async function poll() {
  try {
    const r = await fetch('/api/game?a=state&role=host', { cache: 'no-store' });
    const s = await json(r);
    if (!r.ok) throw new Error(s.error);
    offset = s.serverNow - Date.now();
    S = s;
    failures = 0;
    $('#conn').hidden = true;
    $('#warn').hidden = !s.storageWarning;
    check();
  } catch {
    if (++failures > 3) $('#conn').hidden = false;
  }
  setTimeout(poll, 450);
}

async function act(action, extra = {}) {
  tone(1, 0.01, 'sine', 0.0001); // unlock audio on first click
  try {
    const r = await fetch('/api/game?a=host', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, key: KEY, ...extra }),
    });
    const j = await json(r);
    if (!j.ok) toast(j.error);
  } catch { toast('Network error'); }
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- render ----------
function check() {
  if (!S) return;
  const sb = sub();
  const key = JSON.stringify([S.id, S.phase, sb, S.qi, S.players, S.answered, S.result, S.standings]);
  if (key === renderKey) return;
  renderKey = key;
  const stageChanged = sb !== prevSub;
  transition(sb);
  render(sb, stageChanged);
}

function transition(sb) {
  if (sb === prevSub) {
    if (sb === 'q') { fx.boost(0.6); tone(520, 0.08, 'triangle', 0.05); } // someone locked in
    return;
  }
  fx.shot(sb === 'cd' || sb === 'q' ? 'play' : sb);
  if (sb === 'cd') { fx.boost(0.8); lastCd = -1; }
  if (sb === 'q') { fx.boost(1.2); tone(880, 0.18, 'square', 0.05); }
  if (sb === 'reveal') {
    fx.boost(2.5);
    const anyRight = [1, 2].some((p) => S.result?.[p]?.correct);
    fx.react(anyRight ? 'happy' : 'sad');
    if (anyRight) { tone(660, 0.12, 'triangle', 0.08); tone(990, 0.25, 'triangle', 0.08, 0.12); }
    else tone(180, 0.35, 'sawtooth', 0.05);
  }
  if (sb === 'final') {
    fx.boost(4);
    fx.react('party');
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.09, i * 0.14));
    confetti(S.standings.winner);
  }
  if (sb === 'lobby') { clearConfetti(); prevPips[1] = prevPips[2] = 0; }
  prevSub = sb;
}

function render(sb, stageChanged) {
  for (const p of [1, 2]) {
    const el = $('#card' + p);
    el.innerHTML = card(p, sb);
    el.classList.toggle('locked', sb === 'q' && !!S.answered?.[p]);
    el.classList.toggle('right', sb === 'reveal' && !!S.result?.[p]?.correct);
    el.classList.toggle('wrong', sb === 'reveal' && !S.result?.[p]?.correct);
    el.classList.toggle('winner', sb === 'final' && S.standings.winner === p);
    el.classList.toggle('empty', S.phase === 'lobby' && !S.players[p]);
  }
  const st = $('#stage');
  st.className = 'stage s-' + sb;
  st.innerHTML = stage(sb);
  $('#hud').innerHTML = hud(sb);
  const both = S.players[1] && S.players[2];
  $('#bStart').disabled = !(S.phase === 'lobby' && both);
  $('#bNext').disabled = !(S.phase === 'play' || S.phase === 'reveal');
  motion(sb, stageChanged);
  frame();
}

// GSAP choreography for each state
function motion(sb, stageChanged) {
  anim((g) => {
    // only tween elements whose resting transform isn't set in CSS (enter() hands styles back to CSS)
    if (stageChanged) {
      enter(g, '#stage .enter', { y: 24, opacity: 0, duration: 0.4, ease: 'power3.out', stagger: 0.07 });
      if (sb === 'q') enter(g, '#stage .opt', { y: 20, opacity: 0, duration: 0.35, ease: 'back.out(1.6)', stagger: 0.06, delay: 0.1 });
    }
    for (const p of [1, 2]) {
      const n = S.standings[p].correct;
      if (n > prevPips[p]) enter(g, `#card${p} .seg.on:nth-child(${n})`, { scale: 0, duration: 0.5, ease: 'back.out(3)', delay: 0.2 });
      prevPips[p] = n;
    }
    if (sb === 'q') enter(g, '.pcard.locked .pstatus', { scale: 0.85, duration: 0.25, ease: 'back.out(3)' });
    if (sb === 'reveal' && stageChanged) {
      enter(g, '.pb', { y: -10, opacity: 0, duration: 0.3, stagger: 0.1, delay: 0.35, ease: 'power2.out' });
      enter(g, '.pcard.right .pstatus, .pcard.wrong .pstatus', { scale: 0.7, opacity: 0, duration: 0.35, delay: 0.25, ease: 'back.out(2)' });
    }
    if (sb === 'final' && stageChanged) enter(g, '.wname', { yPercent: 60, opacity: 0, duration: 0.8, ease: 'back.out(1.4)', delay: 0.2 });
  });
}

const qrCache = {};
function qr(p) {
  const url = `${location.origin}/play?p=${p}`;
  if (qrCache[url]) return qrCache[url];
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M');
  q.addData(url);
  q.make();
  return (qrCache[url] = q.createDataURL(8, 2));
}

function card(p, sb) {
  const pl = S.players[p];
  const st = S.standings[p];
  const team = p === 1 ? 'TEAM COOL' : 'TEAM HEAT';
  let status = '', cls = '', icon = '';
  if (S.phase === 'lobby') { status = pl ? 'READY' : 'WAITING TO JOIN'; cls = pl ? 'ok' : 'wait'; icon = pl ? ICON.check : ''; }
  else if (sb === 'cd') status = 'GET READY';
  else if (sb === 'q') { const a = S.answered?.[p]; status = a ? 'LOCKED IN' : 'THINKING'; cls = a ? 'lock' : 'think'; icon = a ? ICON.check : ''; }
  else if (sb === 'reveal') {
    const r = S.result?.[p];
    if (!r) { status = 'NO ANSWER'; cls = 'bad'; icon = ICON.clock; }
    else if (r.correct) { status = `CORRECT · ${fmt(r.ms)}`; cls = 'ok'; icon = ICON.check; }
    else { status = 'WRONG'; cls = 'bad'; icon = ICON.x; }
  } else if (sb === 'final') {
    const w = S.standings.winner;
    status = w === p ? 'WINNER' : w === 0 ? 'DRAW' : 'RUNNER-UP';
    cls = w === p ? 'win' : '';
    icon = w === p ? ICON.trophy : '';
  }
  const segs = [0, 1, 2].map((i) => `<i class="seg ${i < st.correct ? 'on' : ''}"></i>`).join('');
  let body;
  if (S.phase === 'lobby') {
    body = pl
      ? `<div class="ready-mark">${p === 1 ? ICON.snow : ICON.flame}</div><button class="kick" data-kick="${p}">Remove player</button>`
      : `<div class="qr"><img src="${qr(p)}" width="200" height="200" alt="QR code to join as Player ${p}"></div>
         <div class="qr-k"><span class="nfc">${ICON.nfc}</span><span>Tap the NFC tag<br>or scan to join</span></div>`;
  } else {
    body = `<div class="score">
        <div class="score-n">${st.correct}<small>/3</small></div>
        <div class="segs">${segs}</div>
      </div>
      <dl class="spec">
        <div><dt>Correct</dt><dd>${st.correct}</dd></div>
        <div><dt>Total time</dt><dd>${fmt(st.time)}</dd></div>
      </dl>`;
  }
  return `<div class="pc-head"><span class="label">P${p} · ${team}</span><span class="pc-ic">${p === 1 ? ICON.snow : ICON.flame}</span></div>
    <div class="pname">${pl ? esc(pl.name) : '—'}</div>
    <div class="pstatus ${cls}">${icon ? `<span class="si">${icon}</span>` : ''}${status}</div>
    ${body}`;
}

function stage(sb) {
  const q = S.question;
  if (sb === 'lobby') {
    const both = S.players[1] && S.players[2];
    return `<div class="lobby">
      <div class="label enter">RIT Dubai · ASHRAE Student Branch presents</div>
      <h1 class="mega enter">HVAC<br>SHOWDOWN</h1>
      <dl class="spec wide enter">
        <div><dt>Format</dt><dd>1 v 1 · Cool vs Heat</dd></div>
        <div><dt>Questions</dt><dd>Up to 10</dd></div>
        <div><dt>To win</dt><dd>First to 3 correct</dd></div>
        <div><dt>Tiebreak</dt><dd>Fastest total time</dd></div>
      </dl>
      <div class="cta enter ${both ? 'go' : ''}">${both ? 'Both players ready · Press START' : 'Players: tap the NFC tag or scan your QR code'}</div>
    </div>`;
  }
  if (sb === 'cd') {
    return `<div class="count">
      <div class="label enter">Question ${q.n} of ${q.total}</div>
      <div class="count-n" id="cd">${Math.max(1, Math.ceil((S.qStartAt - now()) / 1000))}</div>
      <div class="label enter">Eyes on your phone</div>
    </div>`;
  }
  if (sb === 'q' || sb === 'reveal') {
    const rev = sb === 'reveal';
    const opts = q.options.map((o, i) => {
      let badges = '';
      if (rev) {
        for (const p of [1, 2]) {
          const r = S.result?.[p];
          if (r && r.choice === i) badges += `<span class="pb p${p} ${r.correct ? 'ok' : 'no'}">P${p} · ${fmt(r.ms)}</span>`;
        }
      }
      const cls = rev ? (i === q.answer ? 'right' : 'dim') : '';
      return `<div class="opt o${i} ${cls}"><b>${LET[i]}</b><span class="ot">${esc(o)}</span>${rev && i === q.answer ? `<em class="tick">${ICON.check}<span>Correct</span></em>` : ''}<div class="who">${badges}</div></div>`;
    }).join('');
    return `<div class="qwrap">
      <div class="qhead enter"><span class="label">Question ${String(q.n).padStart(2, '0')} / ${String(q.total).padStart(2, '0')}</span>${rev ? '' : '<span class="label" id="tsec"></span>'}</div>
      <h2 class="qtext enter">${esc(q.text)}</h2>
      <div class="opts n${q.options.length}">${opts}</div>
      ${rev ? `<div class="reveal-k enter">${revealLine()}</div>` : `<div class="tbar enter"><i id="tfill"></i></div>`}
    </div>`;
  }
  if (sb === 'final') {
    const w = S.standings.winner;
    if (!w) return `<div class="final"><div class="label enter">Full time</div><h1 class="wname">IT'S A DRAW</h1></div>`;
    const l = w === 1 ? 2 : 1;
    const ws = S.standings[w], ls = S.standings[l];
    return `<div class="final">
      <div class="trophy enter">${ICON.trophy}</div>
      <div class="label enter">Winner</div>
      <h1 class="wname p${w}">${esc(S.players[w]?.name || 'Player ' + w)}</h1>
      <dl class="spec wide enter">
        <div><dt>Winner</dt><dd>${esc(S.players[w]?.name || '')} · ${ws.correct} correct · ${fmt(ws.time)}</dd></div>
        <div><dt>Runner-up</dt><dd>${esc(S.players[l]?.name || '')} · ${ls.correct} correct · ${fmt(ls.time)}</dd></div>
      </dl>
    </div>`;
  }
  return '';
}

function revealLine() {
  const r = S.result || {};
  const names = [1, 2].filter((p) => r[p]?.correct).map((p) => esc(S.players[p]?.name || 'P' + p));
  if (names.length === 2) return 'Both correct · +1 each';
  if (names.length === 1) return `${names[0]} scores`;
  return 'Nobody got that one';
}

function hud(sb) {
  if (S.phase === 'lobby' || !S.question) return `<div class="hud-cell"><span class="label">Status</span><b>READY</b></div>`;
  if (sb === 'final') return `<div class="hud-cell"><span class="label">Match</span><b>COMPLETE</b></div>`;
  return `<div class="hud-cell"><span class="label">Question</span><b>${S.question.n}<small>/${S.question.total}</small></b></div>
    <div class="hud-cell"><span class="label">Time</span><b id="htime">${sb === 'q' ? '' : '—'}</b></div>`;
}

function frame() {
  if (!S) return;
  const sb = sub();
  if (sb !== prevSub) check();
  if (sb === 'cd') {
    const n = Math.max(1, Math.ceil((S.qStartAt - now()) / 1000));
    const el = $('#cd');
    if (el && el.textContent !== String(n)) el.textContent = n;
    if (n !== lastCd) {
      lastCd = n;
      tone(440, 0.08, 'square', 0.04);
      anim((g) => g.fromTo('#cd', { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'expo.out' }));
    }
  }
  if (sb === 'q') {
    const left = Math.max(0, S.qStartAt + S.cfg.questionMs - now());
    const f = $('#tfill');
    if (f) { f.style.transform = `scaleX(${left / S.cfg.questionMs})`; f.classList.toggle('low', left < 5000); }
    const secs = Math.ceil(left / 1000) + 's';
    const h = $('#htime');
    if (h && h.textContent !== secs) h.textContent = secs;
    const t = $('#tsec');
    if (t && t.textContent !== secs + ' left') t.textContent = secs + ' left';
  }
}
(function loop() { frame(); requestAnimationFrame(loop); })();

// ---------- confetti (flat paper strips) ----------
const cv = $('#confetti'), cx = cv.getContext('2d');
let bits = [];
function confetti(w) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#ffd23f', '#ff8fc8', '#6ee7a0', '#4cc3ff', w === 2 ? '#ff6b3d' : '#2fa4ff'];
  const start = !bits.length;
  for (let i = 0; i < 200; i++) {
    bits.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 300, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 18, vy: -Math.random() * 18 - 6, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, s: 6 + Math.random() * 8, c: cols[i % cols.length] });
  }
  if (start) requestAnimationFrame(drawConfetti);
}
function drawConfetti() {
  cx.clearRect(0, 0, cv.width, cv.height);
  bits = bits.filter((b) => b.y < cv.height + 40);
  for (const b of bits) {
    b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
    cx.save(); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c; cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); cx.restore();
  }
  if (bits.length) requestAnimationFrame(drawConfetti);
}
function clearConfetti() { bits = []; cx.clearRect(0, 0, cv.width, cv.height); }

// ---------- controls ----------
const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
const newMatch = () => {
  if (S && (S.phase === 'play' || S.phase === 'reveal') && !confirm('End this match and start a new one?')) return;
  act('new');
};
$('#bStart').onclick = () => act('start');
$('#bNext').onclick = () => act('next');
$('#bNew').onclick = newMatch;
$('#bFs').onclick = fs;
document.addEventListener('click', (e) => {
  const k = e.target.closest('[data-kick]');
  if (k) act('kick', { p: Number(k.dataset.kick) });
});
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); if (S?.phase === 'lobby') act('start'); else if (S?.phase === 'final') newMatch(); }
  if (e.key === 'ArrowRight') act('next');
  if (e.key === 'n' || e.key === 'N') newMatch();
  if (e.key === 'f' || e.key === 'F') fs();
});

poll();
