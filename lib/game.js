import { store } from './store.js';
import { QUESTIONS } from './questions.js';

export const CFG = {
  perMatch: 10,     // max questions per match
  winAt: 3,         // correct answers needed to win
  countdownMs: 3500,
  questionMs: 20000,
  revealMs: 6000,
};

// The main screen is the clock: only its polls (role=host) advance the game.
// Phones write answers to their own keys, so two phones never race on one record.
const GK = 'hvac:game';
const pKey = (id, p) => `hvac:${id}:p${p}`;
const aKey = (id, qi, p) => `hvac:${id}:a${qi}:p${p}`;
const GRACE = 400; // ms the host waits past the deadline for in-flight answers

const rid = () => Math.random().toString(36).slice(2, 8);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function newGame() {
  const g = {
    id: rid(),
    phase: 'lobby', // lobby | play | reveal | final
    order: shuffle(QUESTIONS.map((_, i) => i)).slice(0, CFG.perMatch),
    qi: -1,
    qStartAt: 0,
    revealAt: 0,
    results: {},
  };
  await store.set(GK, g);
  return g;
}
const getGame = async () => (await store.get(GK)) || newGame();

export function standings(g) {
  const s = { 1: { correct: 0, time: 0 }, 2: { correct: 0, time: 0 } };
  for (const r of Object.values(g.results)) {
    for (const p of [1, 2]) {
      const a = r[p];
      if (a && a.correct) { s[p].correct++; s[p].time += a.ms; }
    }
  }
  const decided = s[1].correct >= CFG.winAt || s[2].correct >= CFG.winAt;
  let winner = 0;
  if (s[1].correct !== s[2].correct) winner = s[1].correct > s[2].correct ? 1 : 2;
  else if (s[1].correct > 0) winner = s[1].time <= s[2].time ? 1 : 2;
  return { s, decided, winner };
}

function startQuestion(g, qi, now) {
  g.phase = 'play';
  g.qi = qi;
  g.qStartAt = now + CFG.countdownMs;
}
async function readAnswers(g) {
  const [a1, a2] = await store.mget([aKey(g.id, g.qi, 1), aKey(g.id, g.qi, 2)]);
  return { 1: a1, 2: a2 };
}
function toReveal(g, ans, now) {
  g.results[g.qi] = { 1: ans[1], 2: ans[2] };
  g.phase = 'reveal';
  g.revealAt = now;
}
function afterReveal(g, now) {
  if (standings(g).decided || g.qi + 1 >= g.order.length) g.phase = 'final';
  else startQuestion(g, g.qi + 1, now);
}

async function tick(g, now) {
  if (g.phase === 'play') {
    const ans = await readAnswers(g);
    if ((ans[1] && ans[2]) || now >= g.qStartAt + CFG.questionMs + GRACE) {
      toReveal(g, ans, now);
      return { changed: true, ans };
    }
    return { changed: false, ans };
  }
  if (g.phase === 'reveal' && now >= g.revealAt + CFG.revealMs) {
    afterReveal(g, now);
    return { changed: true, ans: g.phase === 'play' ? { 1: null, 2: null } : null };
  }
  return { changed: false, ans: null };
}

function questionView(g, withAnswer) {
  if (g.qi < 0) return null;
  const q = QUESTIONS[g.order[g.qi]];
  return { n: g.qi + 1, total: g.order.length, text: q.q, options: q.options, answer: withAnswer ? q.answer : undefined };
}

export async function getState({ role, p, token }) {
  const now = Date.now();
  const g = await getGame();
  let ans = null;
  if (role === 'host') {
    const t = await tick(g, now);
    if (t.changed) await store.set(GK, g);
    ans = t.ans;
  }
  if (g.phase === 'play' && !ans) ans = await readAnswers(g);
  const [p1, p2] = await store.mget([pKey(g.id, 1), pKey(g.id, 2)]);
  const raw = { 1: p1, 2: p2 };
  const st = standings(g);
  const shown = g.phase === 'reveal' || g.phase === 'final';

  const out = {
    serverNow: now,
    id: g.id,
    phase: g.phase,
    qi: g.qi,
    qStartAt: g.qStartAt,
    revealAt: g.revealAt,
    cfg: CFG,
    question: questionView(g, shown),
    players: { 1: p1 ? { name: p1.name } : null, 2: p2 ? { name: p2.name } : null },
    standings: { 1: st.s[1], 2: st.s[2], winner: g.phase === 'final' ? st.winner : 0 },
    storageWarning: !store.shared && !!process.env.VERCEL,
  };
  if (g.phase === 'play') out.answered = { 1: !!ans?.[1], 2: !!ans?.[2] };
  if (shown && g.qi >= 0) out.result = g.results[g.qi] || null;

  if (role === 'player') {
    p = Number(p);
    const mine = raw[p];
    const joined = !!mine && mine.token === token;
    const a = g.phase === 'play' && joined ? ans?.[p] : null;
    out.me = { joined, slotTaken: !!mine && !joined, answer: a ? { choice: a.choice, ms: a.ms } : null };
  }
  return out;
}

export async function join({ p, name, token }) {
  p = Number(p);
  if (![1, 2].includes(p) || !token) return { ok: false, error: 'bad-request' };
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16) || `Player ${p}`;
  const g = await getGame();
  const key = pKey(g.id, p);
  const cur = await store.get(key);
  if (cur) {
    if (cur.token !== token) return { ok: false, error: 'taken' };
    await store.set(key, { name, token });
    return { ok: true };
  }
  if (g.phase !== 'lobby') return { ok: false, error: 'started' };
  const ok = await store.setnx(key, { name, token });
  return ok ? { ok: true } : { ok: false, error: 'taken' };
}

export async function answer({ p, token, qi, choice }) {
  const now = Date.now();
  p = Number(p);
  const g = await getGame();
  const pl = await store.get(pKey(g.id, p));
  if (!pl || pl.token !== token) return { ok: false, error: 'not-joined' };
  if (g.phase !== 'play' || g.qi !== Number(qi)) return { ok: false, error: 'closed' };
  if (now < g.qStartAt) return { ok: false, error: 'early' };
  if (now > g.qStartAt + CFG.questionMs) return { ok: false, error: 'late' };
  const q = QUESTIONS[g.order[g.qi]];
  choice = Number(choice);
  if (!(choice >= 0 && choice < q.options.length)) return { ok: false, error: 'bad-choice' };
  const rec = { choice, ms: now - g.qStartAt, correct: choice === q.answer };
  const ok = await store.setnx(aKey(g.id, g.qi, p), rec);
  return ok ? { ok: true, ms: rec.ms } : { ok: false, error: 'already' };
}

export async function hostAction({ action, key, p }) {
  if (process.env.HOST_KEY && key !== process.env.HOST_KEY) return { ok: false, error: 'bad host key' };
  const now = Date.now();
  const g = await getGame();
  if (action === 'new') { await newGame(); return { ok: true }; }
  if (action === 'kick') { await store.del(pKey(g.id, Number(p))); return { ok: true }; }
  if (action === 'start') {
    if (g.phase !== 'lobby') return { ok: false, error: 'already started' };
    const [p1, p2] = await store.mget([pKey(g.id, 1), pKey(g.id, 2)]);
    if (!p1 || !p2) return { ok: false, error: 'need both players' };
    startQuestion(g, 0, now);
  } else if (action === 'next') {
    if (g.phase === 'play') toReveal(g, await readAnswers(g), now);
    else if (g.phase === 'reveal') afterReveal(g, now);
    else return { ok: false, error: 'nothing to skip' };
  } else return { ok: false, error: 'unknown action' };
  await store.set(GK, g);
  return { ok: true };
}
