# HVAC Showdown: ASHRAE RIT Dubai

A 1v1 HVAC quiz. The main screen (PC/projector) shows everything; two players answer on their own phones.

- Up to **10 random questions** per match, drawn from 14.
- **Both players can score** on every question. Your answer time counts only when you're right.
- **First to 3 correct wins.** If both hit 3 on the same question, or no one gets to 3, the lower total answer time wins.
- End screen shows the **Winner** and **Runner-up**.

There are no npm dependencies. You only need Node 18 or newer.

## Run locally

```bash
npm install
npm start
```

- Main screen: http://localhost:3000
- Phones (on the same Wi-Fi): the terminal prints `http://<your-ip>:3000/play?p=1` and `?p=2`.
  If phones can't connect, allow Node through Windows Firewall (Private networks).

## Deploy to Vercel

1. Import this folder into Vercel (`npx vercel` or drag it into the dashboard). Framework preset: **Other**. No build command is needed.
2. **Required:** go to Vercel → your project → **Storage** → **Create / Connect** → **Upstash for Redis** (free tier), connect it to the project, then **redeploy**.
   Vercel runs the API as separate serverless instances that don't share memory, so the phones and the main screen sync through Redis.
   The env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are added automatically. If they're missing, the main screen shows a red warning.
3. Optional: set the env var `HOST_KEY=something` and open the main screen as `https://your-app.vercel.app/?key=something`, so random people can't press Start or Skip.

## NFC tags and QR codes

Write a **URL record** to each tag (for example with the free "NFC Tools" app):

- Player 1 tag: `https://your-app.vercel.app/play?p=1`
- Player 2 tag: `https://your-app.vercel.app/play?p=2`

The main screen shows matching QR codes in the lobby as the backup for phones without NFC.

## Running the event

| Key | Action |
| --- | --- |
| Space | Start the match (lobby) / new match (end screen) |
| → | Skip ahead (reveal now / next question) |
| N | New match |
| F | Fullscreen |

- If the wrong person joins a slot, click **remove player** under their card in the lobby.
- Questions advance automatically: 3.5s countdown, 20s to answer (ends early once both have answered), 6s reveal.
- Only one match runs at a time. Keep exactly one main screen open, because that screen drives the game clock.

## Edit content

- Questions and answers: `lib/questions.js` (`answer` is the 0-based option index)
- Timings, questions per match, points to win: `CFG` in `lib/game.js`
- 3D rooftop unit backdrop: `public/bg3d.js` (three.js + GSAP from CDN; the game still works if they fail to load)
- Logo: `public/ashrae-logo.png`
