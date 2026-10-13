const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp' };
const channelHandle = 'https://www.youtube.com/@LCTigerSportsLive';
let channelId = process.env.YOUTUBE_CHANNEL_ID || null;
const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;

function identifyChannel(html) {
  const matches = [
    /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    /<meta\s+itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/,
    /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/
  ];
  for (const pattern of matches) {
    const id = pattern.exec(html)?.[1];
    if (id && channelIdPattern.test(id)) {
      if (channelId !== id) console.log('Resolved YouTube channel from @LCTigerSportsLive:', id);
      channelId = id;
      return id;
    }
  }
  return null;
}
const validId = /^[A-Za-z0-9_-]{11}$/;
let liveCache = { expires: 0, data: { live: false, status: 'checking', streams: [] } };
let liveRequest = null;

function parseAssignedJSON(html, name) {
  const pattern = new RegExp('(?:var\\s+)?' + name + '\\s*=\\s*');
  const match = pattern.exec(html);
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

async function getYoutubePage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8500)
  });
  if (!response.ok) throw new Error('YouTube HTTP ' + response.status);
  const html = await response.text();
  if (url.startsWith(channelHandle)) identifyChannel(html);
  return html;
}

function liveFromPlayer(html) {
  const player = parseAssignedJSON(html, 'ytInitialPlayerResponse');
  const details = player?.videoDetails;
  const broadcast = player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (broadcast?.isLiveNow === true && validId.test(details?.videoId || '')) {
    return { live: true, status: 'live', videoId: details.videoId, title: details.title || 'Tiger Sports Live broadcast', source: 'player' };
  }
  return null;
}

function uniqueStreams(streams) {
  const seen = new Set();
  return streams.filter(stream => {
    if (!stream || !validId.test(stream.videoId || '') || seen.has(stream.videoId)) return false;
    seen.add(stream.videoId);
    return true;
  });
}

function liveFromStreams(html) {
  const initial = parseAssignedJSON(html, 'ytInitialData');
  if (!initial) return null;
  const streams = [];
  const stack = [initial];
  let scanned = 0;
  while (stack.length && scanned++ < 60000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    const video = item.videoRenderer || item.gridVideoRenderer;
    if (video && validId.test(video.videoId || '')) {
      const overlays = video.thumbnailOverlays || [];
      const badges = [...(video.badges || []), ...(video.ownerBadges || [])];
      const liveOverlay = overlays.some(o => {
        const v = o.thumbnailOverlayTimeStatusRenderer || {};
        return v.style === 'LIVE' || v.style === 'LIVE_NOW';
      });
      const liveBadge = badges.some(b => {
        const v = b.metadataBadgeRenderer || {};
        return v.style === 'BADGE_STYLE_TYPE_LIVE_NOW' || (v.label || '').toUpperCase() === 'LIVE';
      });
      if (liveOverlay || liveBadge) {
        const title = video.title?.runs?.map(r => r.text).join('') || video.title?.simpleText || 'Tiger Sports Live broadcast';
        streams.push({ videoId: video.videoId, title, source: 'streams' });
      }
    }
    const lockup = item.lockupViewModel;
    if (lockup && validId.test(lockup.contentId || '') && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const badges = JSON.stringify(lockup);
      if (/BADGE_STYLE_TYPE_LIVE_NOW|"style":"LIVE"|"label":"LIVE"/.test(badges)) {
        const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || 'Tiger Sports Live broadcast';
        streams.push({ videoId: lockup.contentId, title, source: 'streams' });
      }
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return uniqueStreams(streams);
}

async function liveFromOfficialApi() {
  if (!process.env.YOUTUBE_API_KEY) return null;
  if (!channelIdPattern.test(channelId || '')) {
    const lookup = new URL('https://www.googleapis.com/youtube/v3/channels');
    lookup.searchParams.set('part', 'id');
    lookup.searchParams.set('forHandle', '@LCTigerSportsLive');
    lookup.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const found = await fetch(lookup, { signal: AbortSignal.timeout(8000) });
    if (!found.ok) throw new Error('YouTube channel lookup HTTP ' + found.status);
    const result = await found.json();
    channelId = result.items?.[0]?.id || null;
    if (!channelIdPattern.test(channelId || '')) throw new Error('Channel handle could not be resolved');
    console.log('Resolved channel through YouTube Data API:', channelId);
  }
  const query = new URL('https://www.googleapis.com/youtube/v3/search');
  query.searchParams.set('part', 'snippet');
  query.searchParams.set('channelId', channelId);
  query.searchParams.set('eventType', 'live');
  query.searchParams.set('type', 'video');
  query.searchParams.set('maxResults', '50');
  query.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  const response = await fetch(query, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('YouTube Data API HTTP ' + response.status);
  const result = await response.json();
  return uniqueStreams((result.items || [])
    .filter(v => v.snippet?.liveBroadcastContent === 'live')
    .map(v => ({ videoId: v.id?.videoId, title: v.snippet?.title || 'Tiger Sports Live broadcast', source: 'youtube-api' })));
}

async function liveFromRecentFeed() {
  if (!channelIdPattern.test(channelId || '')) return [];
  const feed = await getYoutubePage('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
  const ids = [...feed.matchAll(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/g)]
    .slice(0, 15).map(match => match[1]);
  const results = await Promise.allSettled(ids.map(async id => {
    const html = await getYoutubePage('https://www.youtube.com/watch?v=' + id);
    const live = liveFromPlayer(html);
    return live && live.videoId === id ? { videoId: live.videoId, title: live.title, source: 'recent-feed' } : null;
  }));
  return uniqueStreams(results.filter(r => r.status === 'fulfilled').map(r => r.value));
}

async function checkLive() {
  if (Date.now() < liveCache.expires) return liveCache.data;
  if (liveRequest) return liveRequest;
  liveRequest = (async () => {
    let streams = [];
    let status = 'unavailable';
    let source = 'unavailable';
    const override = process.env.LIVE_VIDEO_ID;
    if (override && validId.test(override)) {
      streams = [{ videoId: override, title: 'Tiger Sports Live broadcast', source: 'manual' }];
      status = 'live';
      source = 'manual';
    } else {
      if (process.env.YOUTUBE_API_KEY) {
        try {
          streams = await liveFromOfficialApi();
          status = streams.length ? 'live' : 'offline';
          source = 'youtube-api';
        } catch (error) { console.warn('Live API check:', error.message); }
      }
      if (source !== 'youtube-api') {
        // The public YouTube pages can change. Try multiple sources, deduplicating
        // by video ID so simultaneous games each get their own player.
        try {
          const html = await getYoutubePage(channelHandle + '/streams');
          streams.push(...(liveFromStreams(html) || []));
          status = 'offline';
          source = 'streams';
        } catch (error) { console.warn('YouTube streams check:', error.message); }
        try {
          const html = await getYoutubePage(channelHandle + '/live');
          const player = liveFromPlayer(html);
          if (player) streams.push({ videoId: player.videoId, title: player.title, source: 'player' });
        } catch (error) { console.warn('YouTube player check:', error.message); }
        if (channelIdPattern.test(channelId || '')) {
          try {
            const recent = await liveFromRecentFeed();
            streams.push(...recent);
          } catch (error) { console.warn('YouTube recent feed check:', error.message); }
        }
      }
    }
    streams = uniqueStreams(streams);
    if (streams.length) status = 'live';
    const first = streams[0];
    const data = {
      live: streams.length > 0, status, streams,
      ...(first ? { videoId: first.videoId, title: first.title } : {}),
      source
    };
    // Official API search consumes 100 quota units per check; cache for 15 minutes.
    const ttl = source === 'youtube-api' ? 15 * 60 * 1000 : streams.length ? 30000 : 45000;
    liveCache = { data, expires: Date.now() + ttl };
    console.log('Live check:', status, source, streams.map(v => v.videoId).join(','));
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
