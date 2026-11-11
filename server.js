const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp' };
const channelHandle = 'https://www.youtube.com/@LCTigerSportsLive';
let channelId = process.env.YOUTUBE_CHANNEL_ID || null;
let channelPinnedByKnownVideo = false;
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
      if (!channelPinnedByKnownVideo || channelId === id) channelId = id;
      return id;
    }
  }
  return null;
}
const validId = /^[A-Za-z0-9_-]{11}$/;
let liveCache = { expires: 0, data: { live: false, status: 'checking' } };
let liveRequest = null;
let officialApiCache = { data: null, expires: 0 };

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
  const currentlyPlayingLive = broadcast?.isLiveNow === true ||
    (details?.isLiveContent === true && player?.playabilityStatus?.status === 'OK' &&
     !broadcast?.endTimestamp && Boolean(player?.streamingData));
  if (currentlyPlayingLive && validId.test(details?.videoId || '')) {
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

// A known video is a discovery hint, never proof of a current live broadcast.
// The YouTube Data API verifies the status so an ended broadcast cannot stay LIVE.
function activeBroadcast(item, expectedChannel) {
  if (!item || !validId.test(item.id || '') || !item.snippet) return false;
  if (expectedChannel && item.snippet.channelId !== expectedChannel) return false;
  return item.snippet.liveBroadcastContent === 'live' &&
    !item.liveStreamingDetails?.actualEndTime;
}

async function getVideoMetadata(ids) {
  if (!process.env.YOUTUBE_API_KEY || !ids.length) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,liveStreamingDetails');
  url.searchParams.set('id', [...new Set(ids)].filter(id => validId.test(id)).slice(0, 50).join(','));
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  if (!url.searchParams.get('id')) return [];
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('YouTube videos API HTTP ' + response.status);
  return (await response.json()).items || [];
}

function liveFromMetadata(items, source) {
  const item = items.find(video => activeBroadcast(video, channelId));
  return item ? {
    live: true, status: 'live', videoId: item.id,
    title: item.snippet.title || 'Tiger Sports Live broadcast', source
  } : null;
}

async function liveFromKnownVideo() {
  const id = process.env.YOUTUBE_SEED_VIDEO_ID || process.env.LIVE_VIDEO_ID;
  if (!validId.test(id || '') || !process.env.YOUTUBE_API_KEY) return null;
  const items = await getVideoMetadata([id]);
  const video = items.find(item => item.id === id);
  // The broadcaster supplied this known game URL. Use its real channel ID
  // when a stale channel setting points to a different channel.
  if (video && channelIdPattern.test(video.snippet?.channelId || '') &&
      channelId !== video.snippet.channelId) {
    console.warn('Known video belongs to a different YouTube channel; updating runtime channel ID');
    channelId = video.snippet.channelId;
    channelPinnedByKnownVideo = true;
    uploadsPlaylistId = null;
    uploadsCache = { expires: 0, data: null };
    officialApiCache = { data: null, expires: 0 };
  }
  const live = liveFromMetadata(items, 'known-video-verified');
  console.log('Known video check:', live ? 'live' : 'not-live', id);
  return live;
}

let uploadsPlaylistId = null;
let uploadsCache = { expires: 0, data: null };
async function liveFromUploads() {
  if (!process.env.YOUTUBE_API_KEY || !channelIdPattern.test(channelId || '')) return null;
  if (Date.now() < uploadsCache.expires) return uploadsCache.data;
  if (!uploadsPlaylistId) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('id', channelId);
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('YouTube channels API HTTP ' + response.status);
    uploadsPlaylistId = (await response.json()).items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  }
  if (!uploadsPlaylistId) return null;
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('playlistId', uploadsPlaylistId);
  url.searchParams.set('maxResults', '30');
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('YouTube uploads API HTTP ' + response.status);
  const items = (await response.json()).items || [];
  const ids = items.map(item => item.contentDetails?.videoId).filter(id => validId.test(id || ''));
  const data = liveFromMetadata(await getVideoMetadata(ids), 'channel-uploads');
  uploadsCache = { data, expires: Date.now() + 90000 };
  console.log('Uploads live check:', ids.length, 'candidates,', data?.videoId || 'none');
  return data;
}

async function liveFromOfficialApi() {
  if (!process.env.YOUTUBE_API_KEY) return null;
  if (officialApiCache.data && Date.now() < officialApiCache.expires) return officialApiCache.data;
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
  console.log('YouTube API live search count:', (result.items || []).length);
  const found = (result.items || []).find(v => validId.test(v.id?.videoId || '') && v.snippet?.liveBroadcastContent === 'live');
  const data = found ? { live: true, status: 'live', videoId: found.id.videoId, title: found.snippet.title, source: 'youtube-api' } : { live: false, status: 'offline', source: 'youtube-api' };
  officialApiCache = { data, expires: Date.now() + 20 * 60 * 1000 };
  return data;
}

async function liveFromChannelVideoMetadata(html) {
  if (!process.env.YOUTUBE_API_KEY) return null;
  const initial = parseAssignedJSON(html, 'ytInitialData');
  if (!initial) return null;
  const ids = new Set();
  const stack = [initial];
  let scanned = 0;
  while (stack.length && ids.size < 30 && scanned++ < 60000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const id = node.videoRenderer?.videoId || node.gridVideoRenderer?.videoId ||
      node.lockupViewModel?.contentId;
    if (validId.test(id || '')) ids.add(id);
    for (const value of Object.values(node))
      if (value && typeof value === 'object') stack.push(value);
  }
  if (!ids.size) return null;
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,liveStreamingDetails');
  url.searchParams.set('id', [...ids].join(','));
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('YouTube video status HTTP ' + response.status);
  const result = await response.json();
  const live = (result.items || []).find(v => v.snippet?.channelId === channelId &&
    v.snippet?.liveBroadcastContent === 'live' &&
    v.liveStreamingDetails?.actualStartTime && !v.liveStreamingDetails?.actualEndTime);
  console.log('Video metadata live check:', ids.size, 'candidates,', live?.id || 'none');
  return live ? { live: true, status: 'live', videoId: live.id,
    title: live.snippet.title || 'Tiger Sports Live broadcast', source: 'youtube-video-metadata' } : null;
}

async function liveFromChannelVideos(html) {
  const initial = parseAssignedJSON(html, 'ytInitialData');
  if (!initial) return null;
  const ids = new Set();
  const stack = [initial];
  while (stack.length && ids.size < 10) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;
    const id = node.videoRenderer?.videoId || node.gridVideoRenderer?.videoId || node.lockupViewModel?.contentId;
    if (validId.test(id || '')) ids.add(id);
    for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
  }
  console.log('Channel candidate video IDs:', [...ids].join(',') || 'none');
  const results = await Promise.allSettled([...ids].map(async id => {
    const page = await getYoutubePage('https://www.youtube.com/watch?v=' + id);
    if ([...ids].indexOf(id) < 10) {
      const p = parseAssignedJSON(page, 'ytInitialPlayerResponse');
      console.log('Watch video diagnostic:', id, 'status:', p?.playabilityStatus?.status,
        'liveContent:', p?.videoDetails?.isLiveContent,
        'liveNow:', p?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow);
    }
    return liveFromPlayer(page);
  }));
  console.log('Candidate verification:', results.length, 'live:', results.filter(r => r.status === 'fulfilled' && r.value).length, 'errors:', results.filter(r => r.status === 'rejected').slice(0, 4).map(r => r.reason?.message || String(r.reason)).join(' | '));
  return results.find(result => result.status === 'fulfilled' && result.value)?.value || null;
}

async function liveFromRecentFeed() {
  if (!channelIdPattern.test(channelId || '') || !process.env.YOUTUBE_API_KEY) return null;
  const feed = await getYoutubePage('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
  const ids = [...feed.matchAll(/<yt:videoId>([A-Za-z0-9_-]{11})/g)]
    .slice(0, 15).map(match => match[1]);
  if (!ids.length) return null;
  return liveFromMetadata(await getVideoMetadata(ids), 'recent-feed');
}

async function checkLive() {
  if (Date.now() < liveCache.expires) return liveCache.data;
  if (liveRequest) return liveRequest;
  liveRequest = (async () => {
    let data = { live: false, status: 'unavailable' };
    // First check the last known video, but only mark it live after API verification.
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const known = await liveFromKnownVideo();
        if (known) data = known;
      } catch (error) { console.warn('Known video verification:', error.message); }
      if (!data.live) {
        try { data = await liveFromOfficialApi(); }
        catch (error) { console.warn('Live API check:', error.message); }
      }
    }
    if (!data.live) {
        // The channel /live URL exposes the current player directly when broadcasting.
        // Check it before channel listings to avoid unnecessary watch-page requests.
        try {
          const livePage = await getYoutubePage(channelHandle + '/live');
          const activePlayer = liveFromPlayer(livePage);
          if (activePlayer) data = activePlayer;
        } catch (error) { console.warn('YouTube live page check:', error.message); }
        // Some YouTube responses omit the live player on handle URLs.
        // Retry through the resolved canonical channel URL before checking listings.
        if (!data.live && channelIdPattern.test(channelId || '')) {
          try {
            const canonicalPage = await getYoutubePage('https://www.youtube.com/channel/' + channelId + '/live');
            const canonicalPlayer = liveFromPlayer(canonicalPage);
            console.log('Canonical live check:', canonicalPlayer?.videoId || 'no live player');
            if (canonicalPlayer) data = canonicalPlayer;
          } catch (error) { console.warn('Canonical channel live check:', error.message); }
        }
        if (!data.live) try {
          const streams = await getYoutubePage(channelHandle + '/streams');
          data = liveFromStreams(streams) || { live: false, status: 'unavailable' };
          if (!data.live && process.env.YOUTUBE_API_KEY) {
            try {
              const verified = await liveFromChannelVideoMetadata(streams);
              if (verified) data = verified;
            } catch (error) { console.warn('YouTube video metadata check:', error.message); }
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
            const uploads = await liveFromUploads();
            if (uploads) data = uploads;
          } catch (error) { console.warn('YouTube uploads check:', error.message); }
        }
        if (!data.live && channelIdPattern.test(channelId || '')) {
          try {
            const recent = await liveFromRecentFeed();
            if (recent) data = recent;
          } catch (error) { console.warn('YouTube recent feed check:', error.message); }
        }
    }
    // Never preserve a previously live video when the latest verification says offline.
    // The short response cache below limits flicker without showing ended games as live.
    // YouTube Data API search consumes quota; poll less frequently when it is used.
    const ttl = data.live ? 30000 : 45000;
    liveCache = { data, expires: Date.now() + ttl };
    console.log('Live check:', data.status, data.source || 'unavailable', data.videoId || '');
    return data;
  })();
  try { return await liveRequest; } finally { liveRequest = null; }
}

// Press Row's feed contains a snapshot, not a definitive game-running flag.
// Treat recent, in-period scorekeeper activity as an active game. The panel
// stays hidden for stale, pregame, final or unavailable feeds.
function pressrowGameActive(feed, now = Date.now()) {
  // Hoops broadcasts expose an authoritative live flag and status.
  // Do not infer a game from scores or from the presence of a JSON response.
  if (feed && typeof feed === 'object' && !Array.isArray(feed) &&
      (typeof feed.live === 'boolean' || 'asOf' in feed)) {
    const state = String(feed.status || '').trim().toLowerCase();
    return feed.live === true && /^(live|in.progress|in_progress|active)$/.test(state);
  }
  const snapshot = feed?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') return false;
  const state = String(snapshot.gameStatus ?? snapshot.status ?? feed.gameStatus ?? feed.status ?? '').trim().toLowerCase();
  if (/final|finish|complet|end|cancel|postpon|suspend|pregame|pre-game|scheduled|not.started/.test(state)) return false;
  const quarter = Number(snapshot.quarter);
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 20) return false;
  const rawUpdated = feed.updatedAt;
  const numeric = Number(rawUpdated);
  const timestamp = Number.isFinite(numeric) && numeric > 0
    ? (numeric < 1e11 ? numeric * 1000 : numeric)
    : Date.parse(rawUpdated);
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  if (age < -2 * 60 * 1000 || age > 25 * 60 * 1000) return false;
  // A recently edited scoreboard can be active even if the clock is paused
  // for halftime, a timeout or overtime.
  return true;
}

// Press Row Gridiron feed: fetch server-side so the bearer-like feed URL is not
// embedded in public HTML/JavaScript. Cache briefly to limit provider traffic.
let pressrowFeedCache = { expires: 0, data: null };
let pressrowFeedRequest = null;
function configuredPressrowFeed() {
  const raw = process.env.PRESSROW_GRIDIRON_FEED_URL || process.env.PRESSROW_HOOPS_FEED_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const gridiron = ['pressrowgridiron.com', 'gridiron.pressrowapps.com'].includes(url.hostname) &&
      /^\/api\/broadcast\/feed\/[A-Za-z0-9._-]+\/data[.]json$/.test(url.pathname);
    const hoops = url.hostname === 'pressrowhoops.com' &&
      /^\/api\/broadcast\/live\/[A-Za-z0-9_-]+[.]json$/.test(url.pathname);
    if (url.protocol !== 'https:' || (!gridiron && !hoops) ||
        url.search || url.hash || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}
async function getPressrowFeed() {
  const url = configuredPressrowFeed();
  if (!url) return { configured: false, connected: false, error: 'Feed not configured' };
  if (pressrowFeedCache.data && Date.now() < pressrowFeedCache.expires) return pressrowFeedCache.data;
  if (pressrowFeedRequest) return pressrowFeedRequest;
  pressrowFeedRequest = (async () => {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error('Press Row HTTP ' + response.status);
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize > 1024 * 1024) throw new Error('Feed too large');
      const raw = await response.text();
      if (raw.length > 1024 * 1024) throw new Error('Feed too large');
      const feed = JSON.parse(raw);
      if (!feed || typeof feed !== 'object') throw new Error('Unexpected feed format');
      const activeGame = pressrowGameActive(feed);
      const hoops = new URL(url).hostname === 'pressrowhoops.com';
      const data = { configured: true, connected: true, provider: hoops ? 'pressrow-hoops' : 'pressrow-gridiron', sport: hoops ? 'basketball' : 'football',
        fetchedAt: new Date().toISOString(), activeGame, feed };
      pressrowFeedCache = { data, expires: Date.now() + 15000 };
      console.log('Press Row feed freshness:', { fetchedAt: data.fetchedAt, sourceUpdatedAt: feed.updatedAt ?? null, gameStatus: feed.snapshot?.gameStatus ?? feed.snapshot?.status ?? feed.gameStatus ?? feed.status ?? null, activeGame });
      console.log('Press Row feed connected:', Array.isArray(feed) ? 'array' : Object.keys(feed).slice(0, 20).join(', '));
      if (!Array.isArray(feed)) for (const [key, value] of Object.entries(feed).slice(0, 16)) console.log('Press Row schema', key, Array.isArray(value) ? 'array[' + value.length + ']' : value && typeof value === 'object' ? Object.keys(value).slice(0, 25).join(',') : typeof value);
      for (const side of ['homeTeam', 'awayTeam']) if (feed.snapshot?.[side] && typeof feed.snapshot[side] === 'object') console.log('Press Row team schema', side, Object.keys(feed.snapshot[side]).slice(0, 20).join(','));
      console.log('Press Row feed status:', { provider: data.provider, activeGame, status: feed.status, live: feed.live });
      return data;
    } catch (error) {
      console.warn('Press Row feed fetch:', error.message);
      // Avoid displaying an old score as live after the upstream connection fails.
      return { configured: true, connected: false, provider: 'pressrow',
        error: 'Live score feed temporarily unavailable' };
    }
  })();
  try { return await pressrowFeedRequest; } finally { pressrowFeedRequest = null; }
}


// Find the next scheduled public YouTube broadcast on Tiger Sports Live.
// YouTube's upcoming search is channel-scoped; videos metadata supplies the start time.
let nextYoutubeCache = { expires: 0, data: null };
async function getNextScheduledYoutubeEvent() {
  if (nextYoutubeCache.data && Date.now() < nextYoutubeCache.expires) return nextYoutubeCache.data;
  const fallback = { available: false, channelUrl: channelHandle + '/streams' };
  if (!process.env.YOUTUBE_API_KEY) return fallback;
  try {
    if (!channelIdPattern.test(channelId || '')) {
      const lookup = new URL('https://www.googleapis.com/youtube/v3/channels');
      lookup.searchParams.set('part', 'id');
      lookup.searchParams.set('forHandle', '@LCTigerSportsLive');
      lookup.searchParams.set('key', process.env.YOUTUBE_API_KEY);
      const response = await fetch(lookup, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Channel lookup HTTP ' + response.status);
      channelId = (await response.json()).items?.[0]?.id || null;
    }
    if (!channelIdPattern.test(channelId || '')) throw new Error('YouTube channel unavailable');
    const query = new URL('https://www.googleapis.com/youtube/v3/search');
    query.searchParams.set('part', 'snippet');
    query.searchParams.set('channelId', channelId);
    query.searchParams.set('eventType', 'upcoming');
    query.searchParams.set('type', 'video');
    query.searchParams.set('maxResults', '25');
    query.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const response = await fetch(query, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Upcoming YouTube search HTTP ' + response.status);
    const ids = (await response.json()).items?.map(item => item.id?.videoId).filter(id => validId.test(id || '')) || [];
    const videos = await getVideoMetadata(ids);
    const now = Date.now();
    const upcoming = videos.filter(item =>
      item.snippet?.channelId === channelId &&
      item.snippet?.liveBroadcastContent === 'upcoming' &&
      !item.liveStreamingDetails?.actualStartTime &&
      !item.liveStreamingDetails?.actualEndTime &&
      Number.isFinite(Date.parse(item.liveStreamingDetails?.scheduledStartTime)) &&
      Date.parse(item.liveStreamingDetails.scheduledStartTime) > now - 15 * 60000
    ).sort((a,b) => Date.parse(a.liveStreamingDetails.scheduledStartTime) - Date.parse(b.liveStreamingDetails.scheduledStartTime))[0];
    const result = upcoming ? { available: true, event: {
      title: upcoming.snippet.title || 'Upcoming Tiger Sports Live broadcast',
      start: upcoming.liveStreamingDetails.scheduledStartTime,
      videoId: upcoming.id,
      url: 'https://www.youtube.com/watch?v=' + upcoming.id
    }, channelUrl: fallback.channelUrl } : fallback;
    nextYoutubeCache = { data: result, expires: Date.now() + 60 * 1000 };
    return result;
  } catch (error) {
    console.warn('Upcoming YouTube event:', error.message);
    nextYoutubeCache = { data: fallback, expires: Date.now() + 60000 };
    return fallback;
  }
}

http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  // Lightweight liveness check: does not depend on YouTube availability.
  if (pathname === '/api/health' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ status: 'ok', service: 'tiger-sports-live', uptimeSeconds: Math.floor(process.uptime()) }));
  }
  // Stable, read-only team directory for future iOS and Android clients.
  if (pathname === '/api/v1/teams') {
    return fs.readFile(path.join(__dirname, 'public', 'data', 'teams.json'), (error, bytes) => {
      if (error) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ error: 'Team directory temporarily unavailable' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      res.end(bytes);
    });
  }
  // Press Row fan-page URL is configured per game in Railway; no scoring credentials are exposed.
  if (pathname === '/api/v1/pressrow') {
    const raw = process.env.PRESSROW_LIVE_URL || '';
    let url = null;
    try {
      const candidate = new URL(raw);
      if (candidate.protocol === 'https:' &&
          candidate.hostname === 'hoops.pressrowapps.com' &&
          candidate.pathname.startsWith('/live/') && /^[A-Za-z0-9._-]+$/.test(candidate.pathname.slice(6)) &&
          !candidate.username && !candidate.password) url = candidate.toString();
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ configured: Boolean(url), sport: 'basketball', provider: 'pressrow-hoops', url }));
  }
  if (pathname === '/api/v1/pressrow/gridiron') {
    const data = await getPressrowFeed();
    res.writeHead(data.connected ? 200 : 503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(JSON.stringify(data));
  }
  if (pathname === '/api/next-game') {
    const data = await getNextScheduledYoutubeEvent();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(data));
  }
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
}).listen(port, () => { console.log('Tiger Sports Live on ' + port); checkLive().catch(error => console.warn('Startup live check:', error.message)); getPressrowFeed().catch(error => console.warn('Startup Press Row check:', error.message)); });
