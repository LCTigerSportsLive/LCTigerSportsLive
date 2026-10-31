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
| `LIVE_VIDEO_ID` | Optional (legacy) | Known video ID hint; verified against YouTube API before showing LIVE |

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

## Livestream detection (2026-10-30)

- `YOUTUBE_SEED_VIDEO_ID` can hold the last broadcaster-supplied YouTube video ID as a **verified hint**, not a forced live override. The legacy `LIVE_VIDEO_ID` works the same way.
- Every candidate is checked with the YouTube videos API for `liveBroadcastContent: live` and absence of an end timestamp. Ended games are never deliberately labeled live just because an override is set.
- Detection also checks channel live redirects, public stream listings, the channel's latest uploads playlist, and the public RSS feed. The channel uploads and RSS candidates are verified through the YouTube API.
- YouTube search results remain cached for 20 minutes to respect API quota, while cheaper discovery paths refresh within roughly 45–90 seconds.
- **Limitation:** new unlisted or private videos may not appear in public channel listings or search. For fully automatic discovery of unlisted streams, the broadcaster needs an authenticated YouTube Live Streaming API integration or an event/URL push from the streaming workflow.

## Press Row Gridiron football scoring feed

- Set the full `PRESSROW_GRIDIRON_FEED_URL` as a **Railway service environment variable**, not in client-side JavaScript or GitHub. It must be a `https://gridiron.pressrowapps.com/api/broadcast/feed/.../data.json` URL.
- `GET /api/v1/pressrow/gridiron` fetches the JSON feed server-side and returns a short-lived, cache-controlled proxy response. It does not reveal the original feed URL.
- The Game Day section displays football teams, scores, quarter, game clock and field situation from the Press Row `snapshot` object. It refreshes approximately every 15 seconds while the page is visible.
- The prior basketball fan-page integration is retained at `/api/v1/pressrow` and the `PRESSROW_LIVE_URL` variable, but is no longer displayed in Game Day.
- This feed appears to be a specific broadcast's snapshot. To switch games, update `PRESSROW_GRIDIRON_FEED_URL` with the next broadcast feed URL.
- If the feed cannot be reached, the app displays an unavailable status rather than inventing or displaying stale scores as live.
