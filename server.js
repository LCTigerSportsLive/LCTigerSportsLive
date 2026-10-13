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
let liveCache = { expires: 0, data: { live: false, status: 'checking' } };
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
  if (url.startsWith(channelHandle)) {
    identifyChannel(html);
    if (url.endsWith('/live') || url.endsWith('/streams')) {
      const player = parseAssignedJSON(html, 'ytInitialPlayerResponse');
      console.log('YouTube diagnostic:', url.endsWith('/live') ? 'live' : 'streams',
        'redirect:', response.url.slice(0, 160),
        'bytes:', html.length,
        'player:', Boolean(player?.videoDetails?.videoId),
        'isLiveNow:', player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow,
        'isLiveContent:', player?.videoDetails?.isLiveContent);
    }
  }
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

function liveFromStreams(html) {
  const initial = parseAssignedJSON(html, 'ytInitialData');
  if (!initial) return null;
  const stack = [initial];
  let scanned = 0;
  while (stack.length && scanned++ < 60000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    // YouTube can use videoRenderer, gridVideoRenderer or lockupViewModel.
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
        return { live: true, status: 'live', videoId: video.videoId, title, source: 'streams' };
      }
    }
    // Also handle YouTube's newer lockup card representation.
    const lockup = item.lockupViewModel;
    if (lockup && validId.test(lockup.contentId || '') && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const serialized = JSON.stringify(lockup);
      if (/BADGE_STYLE_TYPE_LIVE_NOW|"style":"LIVE"|"label":"LIVE"/.test(serialized)) {
        const title = lockup.metadata?.lockupMetadataViewModel?.title?.content || 'Tiger Sports Live broadcast';
        return { live: true, status: 'live', videoId: lockup.contentId, title, source: 'streams' };
      }
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return { live: false, status: 'offline', source: 'streams' };
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
  query.searchParams.set('maxResults', '5');
  query.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  const response = await fetch(query, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('YouTube Data API HTTP ' + response.status);
  const result = await response.json();
  const found = (result.items || []).find(v => validId.test(v.id?.videoId || '') && v.snippet?.liveBroadcastContent === 'live');
  return found ? { live: true, status: 'live', videoId: found.id.videoId, title: found.snippet.title, source: 'youtube-api' } : { live: false, status: 'offline', source: 'youtube-api' };
}

async function liveFromChannelVideos(html) {
  const initial = parseAssignedJSON(html, 'ytInitialData');
  if (!initial) return null;
  const ids = new Set();
  const stack = [initial];
  while (stack.length && ids.size < 12) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;
    const id = node.videoRenderer?.videoId || node.gridVideoRenderer?.videoId || node.lockupViewModel?.contentId;
    if (validId.test(id || '')) ids.add(id);
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
  }
  const results = await Promise.allSettled([...ids].map(async id => {
    const page = await getYoutubePage('https://www.youtube.com/watch?v=' + id);
    return liveFromPlayer(page);
  }));
  return results.find(result => result.status === 'fulfilled' && result.value)?.value || null;
}

async function liveFromRecentFeed() {
  if (!channelIdPattern.test(channelId || '')) return null;
  const feed = await getYoutubePage('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
  const ids = [...feed.matchAll(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/g)]
    .slice(0, 6).map(match => match[1]);
  if (!ids.length) return null;
  const results = await Promise.allSettled(ids.map(async id => {
    const html = await getYoutubePage('https://www.youtube.com/watch?v=' + id);
    const live = liveFromPlayer(html);
    return live && live.videoId === id ? { ...live, source: 'recent-feed' } : null;
  }));
  return results.find(r => r.status === 'fulfilled' && r.value)?.value || null;
}

async function checkLive() {
  if (Date.now() < liveCache.expires) return liveCache.data;
  if (liveRequest) return liveRequest;
  liveRequest = (async () => {
    let data = { live: false, status: 'unavailable' };
    const override = process.env.LIVE_VIDEO_ID;
    if (override && validId.test(override)) {
      data = { live: true, status: 'live', videoId: override, title: 'Tiger Sports Live broadcast', source: 'manual' };
    } else {
      if (process.env.YOUTUBE_API_KEY) {
        try { data = await liveFromOfficialApi(); }
        catch (error) { console.warn('Live API check:', error.message); }
      }
      if (data.status === 'unavailable' || (!data.live && data.source !== 'youtube-api')) {
        try {
          const streams = await getYoutubePage(channelHandle + '/streams');
          data = liveFromStreams(streams) || { live: false, status: 'unavailable' };
          if (!data.live) {
            const verified = await liveFromChannelVideos(streams);
            if (verified) data = verified;
          }
        } catch (error) { console.warn('YouTube streams check:', error.message); }
        if (!data.live) {
          try {
            const html = await getYoutubePage(channelHandle + '/live');
            const player = liveFromPlayer(html);
            if (player) data = player;
          } catch (error) { console.warn('YouTube player check:', error.message); }
        }
        if (!data.live && channelIdPattern.test(channelId || '')) {
          try {
            const recent = await liveFromRecentFeed();
            if (recent) data = recent;
          } catch (error) { console.warn('YouTube recent feed check:', error.message); }
        }
      }
    }
    // YouTube Data API search consumes quota; poll less frequently when it is used.
    const ttl = data.source === 'youtube-api' ? 15 * 60 * 1000 : data.live ? 30000 : 45000;
    liveCache = { data, expires: Date.now() + ttl };
    console.log('Live check:', data.status, data.source || 'unavailable', data.videoId || '');
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
}).listen(port, () => { console.log('Tiger Sports Live on ' + port); checkLive().catch(error => console.warn('Startup live check:', error.message)); });
