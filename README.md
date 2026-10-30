# Tiger Sports Live

Liberty Center Tigers live sports website, deployed from the `main` branch to Railway.

## Run locally

- Node.js 20 or newer
- `npm start` starts the site on `PORT` (default: 3000)
- `npm test` runs dependency-free HTTP smoke tests

## Public endpoints

- `/` — website
- `/api/live` — best-effort YouTube live broadcast detection; status may be `unavailable` when upstream checks fail
- `/api/health` (also `/health`) — independent liveness check; no YouTube dependency
- `/api/v1/teams` — versioned, read-only team directory in `public/data/teams.json`

The website currently has static roster pages. The team directory is a first step toward a shared API for Android and iOS; roster details, scores, and schedules are **not yet available through the API**.

## Railway environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Assigned automatically by Railway |
| `YOUTUBE_CHANNEL_ID` | Recommended | Known channel ID to avoid channel resolution ambiguity |
| `YOUTUBE_API_KEY` | Optional but recommended | Additional YouTube verification; keep this secret in Railway |
| `LIVE_VIDEO_ID` | Optional | Temporary override for an active broadcast |

Never commit API keys or other secrets to GitHub. The fallback YouTube page detection can operate without an API key but is not guaranteed to detect every live broadcast.

## Mobile roadmap

Maintain the Node.js backend as the shared data source. Build Android and iOS clients against versioned endpoints for teams, games, schedules, and stream state. Add authentication and notification infrastructure only when needed.

## Deployment checks

1. Railway deployment reaches SUCCESS.
2. `/api/health` returns `{"status":"ok"}` (plus other fields).
3. Homepage, logo, `/api/v1/teams`, and `/api/live` respond.
4. Test livestream detection during a **real active broadcast**; an offline response alone does not prove detection works.

## Press Row Hoops fan-page integration

Set `PRESSROW_LIVE_URL` as a Railway service variable to the **public fan page link** copied from Press Row Hoops → Broadcast → Live Fan Page. Example shape: `https://hoops.pressrowapps.com/live/<game-link>`.

- `/api/v1/pressrow` returns the configured, validated public game URL (or `configured: false`).
- The Game Day section shows a link to the public live scoring page and an optional in-page iframe.
- If Press Row blocks iframe embedding, the direct link still works. Use the official embed code from the Press Row Broadcast dialog for full embed compatibility.
- **This is a single-game link, not a permanent season-wide scoring feed.** Replace the Railway variable for each new game.
- This does not yet provide structured scores, push notifications or Live Activities; those require a supported data API or data feed.
- Do not place account passwords, private data-feed tokens or administrative URLs in `PRESSROW_LIVE_URL`.
