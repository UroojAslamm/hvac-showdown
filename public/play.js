import { startBackground } from './bg3d.js';
import { LET, esc, fmt, ICON, anim, enter, json } from './common.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const P = Number(new URLSearchParams(location.search).get('p'));
const fx = startBackground($('#bg3d'), { phone: true });

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

if (![1, 2].includes(P)) {
  app.innerHTML = `<div class="screen center">
    <div class="label">Choose your side</div>
    <h1 class="big">Which player are you?</h1>
    <a class="pick p1" href="/play?p=1"><span class="pick-i">${ICON.snow}</span><span><b>Player 1</b><small>Team Cool</small></span></a>
    <a class="pick p2" href="/play?p=2"><span class="pick-i">${ICON.flame}</span><span><b>Player 2</b><small>Team Heat</small></span></a>
  </div>`;
} else {
  start();
}

function start() {
  document.body.classList.add('p' + P);
  $('#badge').innerHTML = `<span class="bi">${P === 1 ? ICON.snow : ICON.flame}</span><span>P${P}</span>`;

  let token = ls.get('hvac-tok-' + P);
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
    ls.set('hvac-tok-' + P, token);
  }

  let S = null, offset = 0, key = '', fails = 0, joinErr = '', joining = false;
  let local = null; // optimistic answer for the current question: { qi, choice, ms?, err? }
  let lastTag = '', lastScreen = '', lastCd = -1;
  const now = () => Date.now() + offset;
  const sub = () => (S.phase === 'play' ? (now() < S.qStartAt ? 'cd' : 'q') : S.phase);
  const buzz = (pat) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(pat); } catch {} };

  async function poll() {
    try {
      const r = await fetch(`/api/game?a=state&role=player&p=${P}&token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const s = await json(r);
      if (!r.ok) throw new Error(s.error);
      offset = s.serverNow - Date.now();
      if (S && S.id !== s.id) local = null; // new match
      S = s;
      fails = 0;
      $('#net').hidden = true;
      render();
    } catch {
      if (++fails > 3) $('#net').hidden = false;
    }
    setTimeout(poll, 500);
  }

  const myAnswer = () => S.me.answer || (local && local.qi === S.qi ? local : null);

  function render() {
    if (!S) return;
    const sb = sub();
    const a = sb === 'q' ? myAnswer() : null;
    const k = JSON.stringify([S.id, S.phase, sb, S.qi, S.me, S.players, S.result, S.standings, a, joinErr, joining]);
    if (k === key) return;
    // don't wipe the name field while the player is typing
    if (!S.me.joined && S.phase === 'lobby' && !S.me.slotTaken && document.activeElement?.id === 'name' && !joinErr && !joining) return;
    key = k;
    const screen = screenName(sb, a);
    app.innerHTML = view(sb, a);
    strip(sb);
    const nm = $('#name');
    if (nm) nm.value = ls.get('hvac-name') || '';
    document.body.classList.toggle('busy', sb === 'q' && !a);
    if (screen !== lastScreen) {
      lastScreen = screen;
      anim((g) => {
        enter(g, '#app .screen > *:not(.choices)', { y: 18, opacity: 0, duration: 0.35, ease: 'power3.out', stagger: 0.06 });
        enter(g, '#app .ch', { y: 16, opacity: 0, duration: 0.3, ease: 'back.out(1.6)', stagger: 0.05 });
        enter(g, '#app .stamp', { scale: 1.6, opacity: 0, duration: 0.45, ease: 'back.out(2)', delay: 0.05 });
      });
    }
    effects(sb);
  }

  function screenName(sb, a) {
    if (!S.me.joined) return 'join:' + (S.me.slotTaken ? 'taken' : S.phase);
    return `${sb}:${S.qi}:${a ? 'locked' : ''}`;
  }

  function strip(sb) {
    const el = $('#strip');
    const me = S.players[P], opp = S.players[P === 1 ? 2 : 1];
    if (!S.me.joined || sb === 'lobby') { el.hidden = true; return; }
    el.hidden = false;
    const q = S.question;
    el.innerHTML = `<div><span class="label">You</span><b>${esc(me?.name)}</b></div>
      <div><span class="label">Score</span><b>${S.standings[P].correct}/3</b></div>
      <div><span class="label">Rival</span><b>${S.standings[P === 1 ? 2 : 1].correct}/3</b></div>
      <div><span class="label">Q</span><b>${q ? q.n : '-'}/${q ? q.total : 10}</b></div>`;
    el.title = opp ? `vs ${opp.name}` : '';
  }

  function effects(sb) {
    const tag = `${S.id}:${S.phase}:${S.qi}:${sb}`;
    if (tag === lastTag) return;
    lastTag = tag;
    fx.shot(sb === 'cd' || sb === 'q' ? 'play' : sb === 'reveal' ? 'reveal' : sb === 'final' ? 'final' : 'lobby');
    if (sb === 'q') buzz(60);
    if (sb === 'reveal') {
      const r = S.result?.[P];
      buzz(r?.correct ? [80, 60, 80] : [300]);
      fx.react(r?.correct ? 'happy' : 'sad');
      if (r?.correct) fx.boost(3);
    }
    if (sb === 'final') { buzz(S.standings.winner === P ? [100, 50, 100, 50, 300] : [200]); fx.boost(4); fx.react(S.standings.winner === P ? 'party' : 'happy'); }
  }

  function view(sb, a) {
    const opp = S.players[P === 1 ? 2 : 1];
    const team = P === 1 ? 'Team Cool' : 'Team Heat';
    if (!S.me.joined) {
      if (S.me.slotTaken) {
        return `<div class="screen center"><div class="ic bad">${ICON.x}</div><h1 class="big">Player ${P} is taken</h1>
          <p class="mut">Someone already joined on this spot. Ask the host to remove them, or tap the other player's tag.</p></div>`;
      }
      if (S.phase !== 'lobby') {
        return `<div class="screen center"><div class="ic">${ICON.clock}</div><h1 class="big">Match in progress</h1>
          <p class="mut">Hang tight. You can join when the next match opens.</p></div>`;
      }
      return `<form class="screen join" id="joinForm" novalidate>
        <div class="panel">
          <div class="panel-h"><span class="label">Player ${P} · ${team}</span><span class="pi">${P === 1 ? ICON.snow : ICON.flame}</span></div>
          <h1 class="big">Join the showdown</h1>
          <label class="field-l" for="name">Your name</label>
          <input id="name" name="name" maxlength="16" autocomplete="given-name" autocapitalize="words" enterkeyhint="go" placeholder="e.g. Sara">
          ${joinErr ? `<p class="err" role="alert">${esc(joinErr)}</p>` : `<p class="help">Shown on the big screen. Max 16 characters.</p>`}
        </div>
        <button class="go" ${joining ? 'disabled' : ''}>${joining ? 'Joining…' : 'Join game'}</button>
      </form>`;
    }
    const me = S.players[P];
    if (sb === 'lobby') {
      return `<div class="screen center">
        <div class="stamp ok">${ICON.check}<span>Ready</span></div>
        <h1 class="big">You're in, ${esc(me?.name)}</h1>
        <dl class="spec">
          <div><dt>Side</dt><dd>P${P} · ${team}</dd></div>
          <div><dt>Opponent</dt><dd>${opp ? esc(opp.name) : 'Waiting…'}</dd></div>
          <div><dt>To win</dt><dd>First to 3 correct</dd></div>
        </dl>
        <p class="help">Questions appear here. Faster correct answers win ties.</p>
      </div>`;
    }
    if (sb === 'cd') {
      return `<div class="screen center"><div class="label">Question ${S.question.n} of ${S.question.total}</div>
        <div class="cd" id="cd">${Math.max(1, Math.ceil((S.qStartAt - now()) / 1000))}</div><p class="mut">Get ready</p></div>`;
    }
    if (sb === 'q') {
      const q = S.question;
      if (a) {
        if (a.err) return `<div class="screen center"><div class="ic bad">${ICON.clock}</div><h1 class="big">${esc(a.err)}</h1></div>`;
        return `<div class="screen center">
          <div class="label">Answer locked</div>
          <div class="locked o${a.choice}"><b>${LET[a.choice]}</b><span>${esc(q.options[a.choice])}</span></div>
          <p class="mut">${a.ms != null ? `Answered in <b>${fmt(a.ms)}</b>` : 'Sending…'}</p>
          <p class="help">Watch the big screen for the result</p>
        </div>`;
      }
      return `<div class="screen q">
        <div class="tb"><i id="tfill"></i></div>
        <h2 class="qt">${esc(q.text)}</h2>
        <div class="choices n${q.options.length}">
          ${q.options.map((o, i) => `<button class="ch o${i}" data-c="${i}"><b>${LET[i]}</b><span>${esc(o)}</span></button>`).join('')}
        </div>
      </div>`;
    }
    if (sb === 'reveal') {
      const r = S.result?.[P];
      const q = S.question;
      const right = `<dl class="spec"><div><dt>Answer</dt><dd>${LET[q.answer]} · ${esc(q.options[q.answer])}</dd></div><div><dt>Your score</dt><dd>${S.standings[P].correct} / 3</dd></div></dl>`;
      if (!r) return `<div class="screen center bottom"><div class="stamp">${ICON.clock}<span>Time's up</span></div>${right}</div>`;
      if (r.correct) return `<div class="screen center bottom"><div class="stamp ok">${ICON.check}<span>Correct</span></div><p class="mut">+1 in <b>${fmt(r.ms)}</b></p>${right}</div>`;
      return `<div class="screen center bottom"><div class="stamp bad">${ICON.x}<span>Wrong</span></div>${right}</div>`;
    }
    if (sb === 'final') {
      const w = S.standings.winner;
      const st = S.standings[P];
      const stats = `<dl class="spec"><div><dt>Correct</dt><dd>${st.correct}</dd></div><div><dt>Total time</dt><dd>${fmt(st.time)}</dd></div></dl>`;
      if (w === P) return `<div class="screen center bottom"><div class="stamp win">${ICON.trophy}<span>Winner</span></div><h1 class="big">Well played, ${esc(me?.name)}</h1>${stats}<p class="help">Head to the ASHRAE desk</p></div>`;
      return `<div class="screen center bottom"><div class="stamp">${ICON.medal}<span>${w === 0 ? 'Draw' : 'Runner-up'}</span></div><h1 class="big">Good game, ${esc(me?.name)}</h1>${stats}<p class="help">Head to the ASHRAE desk</p></div>`;
    }
    return '';
  }

  // ---- actions ----
  app.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim();
    if (!name) { joinErr = 'Enter your name to join.'; key = ''; render(); $('#name')?.focus(); return; }
    ls.set('hvac-name', name);
    $('#name').blur();
    joining = true; joinErr = ''; render();
    try { navigator.wakeLock?.request('screen').catch(() => {}); } catch {}
    try {
      const r = await fetch('/api/game?a=join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: P, name, token }) }).then(json);
      if (!r.ok) joinErr = { taken: 'That spot is taken. Ask the host to free it.', started: 'Match already started. Wait for the next one.' }[r.error] || r.error;
    } catch { joinErr = 'Network error. Check your connection and try again.'; }
    joining = false;
    key = '';
    render();
  });

  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c]');
    if (!b || !S || sub() !== 'q' || myAnswer()) return;
    const choice = Number(b.dataset.c);
    const qi = S.qi;
    local = { qi, choice };
    buzz(30);
    render();
    try {
      const r = await fetch('/api/game?a=answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: P, token, qi, choice }) }).then(json);
      if (local?.qi !== qi) return;
      if (r.ok) local.ms = r.ms;
      else if (r.error === 'late' || r.error === 'closed') local.err = 'Too late';
      else if (r.error !== 'already') local = null;
    } catch { local = null; }
    key = '';
    render();
  });

  (function frame() {
    if (S) {
      const sb = sub();
      if (sb === 'cd') {
        const el = $('#cd');
        const n = Math.max(1, Math.ceil((S.qStartAt - now()) / 1000));
        if (el && el.textContent !== String(n)) el.textContent = n;
        if (n !== lastCd) { lastCd = n; anim((g) => g.fromTo('#cd', { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'expo.out' })); }
      }
      if (sb === 'q') {
        const f = $('#tfill');
        const left = Math.max(0, S.qStartAt + S.cfg.questionMs - now());
        if (f) { f.style.transform = `scaleX(${left / S.cfg.questionMs})`; f.classList.toggle('low', left < 5000); }
      }
      render(); // catches the countdown -> question switch without waiting for a poll
    }
    requestAnimationFrame(frame);
  })();

  poll();
}
