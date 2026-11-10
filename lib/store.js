// Tiny key-value store.
// With Upstash Redis env vars set (Vercel Marketplace adds KV_REST_API_URL / KV_REST_API_TOKEN),
// state is shared across serverless instances. Without them it falls back to process memory,
// which is fine for `npm start` on one machine but will NOT sync on Vercel.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 6 * 3600; // seconds

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

const parse = (v) => (v == null ? null : JSON.parse(v));
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

const mem = new Map();
const memGet = (k) => {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp < Date.now()) { mem.delete(k); return null; }
  return e.v;
};
const memSet = (k, v) => mem.set(k, { v: clone(v), exp: Date.now() + TTL * 1000 });

export const store = URL_ && TOKEN
  ? {
      shared: true,
      get: async (k) => parse(await redis(['GET', k])),
      set: async (k, v) => { await redis(['SET', k, JSON.stringify(v), 'EX', TTL]); },
      setnx: async (k, v) => (await redis(['SET', k, JSON.stringify(v), 'NX', 'EX', TTL])) === 'OK',
      mget: async (ks) => (await redis(['MGET', ...ks])).map(parse),
      del: async (k) => { await redis(['DEL', k]); },
    }
  : {
      shared: false,
      get: async (k) => clone(memGet(k)),
      set: async (k, v) => { memSet(k, v); },
      setnx: async (k, v) => { if (memGet(k) != null) return false; memSet(k, v); return true; },
      mget: async (ks) => ks.map((k) => clone(memGet(k))),
      del: async (k) => { mem.delete(k); },
    };
