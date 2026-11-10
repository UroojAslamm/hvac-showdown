import { getState, join, answer, hostAction } from '../lib/game.js';

// Single endpoint: /api/game?a=state|join|answer|host
export default async function handler(req, res) {
  const send = (code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    let body = req.body;
    if (typeof body === 'string') body = body ? JSON.parse(body) : {};
    body = body || {};
    switch (q.get('a')) {
      case 'state':
        return send(200, await getState({ role: q.get('role'), p: q.get('p'), token: q.get('token') }));
      case 'join': return send(200, await join(body));
      case 'answer': return send(200, await answer(body));
      case 'host': return send(200, await hostAction(body));
      default: return send(404, { ok: false, error: 'unknown action' });
    }
  } catch (e) {
    console.error(e);
    return send(500, { ok: false, error: e.message });
  }
}
