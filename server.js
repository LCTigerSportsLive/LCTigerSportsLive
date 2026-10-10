const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp' };
const channelLiveUrl = 'https://www.youtube.com/@LCTigerSportsLive/live';
let liveCache = { expires: 0, data: { live: false, status: 'checking' } };
let liveRequest = null;

// YouTube's /live page resolves to the active stream when one is broadcasting.
// Check the player metadata, not just the URL: /live can also show a replay.
function extractPlayerResponse(html) {
  const match = /(?:var\s+)?ytInitialPlayerResponse\s*=\s*/.exec(html);
  if (!match) return null;
  const start = html.indexOf('{', match.index + match[0].length);
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

async function checkLive() {
  if (Date.now() < liveCache.expires) return liveCache.data;
  if (liveRequest) return liveRequest;
  liveRequest = (async () => {
    let data = { live: false, status: 'offline' };
    try {
      const response = await fetch(channelLiveUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TigerSportsLive/1.0)', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(9000)
      });
      if (!response.ok) throw new Error('YouTube returned ' + response.status);
      const html = await response.text();
      const player = extractPlayerResponse(html);
      if (!player) throw new Error('YouTube player data unavailable');
      const details = player.videoDetails || {};
      const broadcast = player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
      const videoId = details.videoId;
      if (broadcast?.isLiveNow === true && /^[A-Za-z0-9_-]{11}$/.test(videoId || '')) {
        data = { live: true, status: 'live', videoId, title: details.title || 'Tiger Sports Live broadcast' };
      }
    } catch (error) {
      console.warn('Live status check:', error.message);
      data = { live: false, status: 'unavailable' };
    }
    liveCache = { data, expires: Date.now() + (data.live ? 45000 : 60000) };
    return data;
  })();
  try { return await liveRequest; } finally { liveRequest = null; }
}

http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/api/live') {
    const data = await checkLive();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(data));
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(__dirname, 'public', '.' + requested);
  const root = path.resolve(__dirname, 'public');
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  });
}).listen(port, () => console.log('Tiger Sports Live on ' + port));
