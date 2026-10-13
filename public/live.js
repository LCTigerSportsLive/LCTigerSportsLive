(() => {
  const panel = document.getElementById('game-day-live');
  const status = document.getElementById('live-status');
  const players = document.getElementById('live-players');
  const heading = document.getElementById('live-stream-title');
  if (!panel || !status || !players || !heading) return;

  const validId = /^[A-Za-z0-9_-]{11}$/;
  let displayedIds = '';
  let running = false;

  function makeStreamCard(stream) {
    const card = document.createElement('article');
    card.className = 'live-stream-card';
    card.dataset.videoId = stream.videoId;

    const title = document.createElement('h4');
    title.className = 'live-stream-card-title';
    title.textContent = stream.title || 'Tiger Sports Live broadcast';

    const player = document.createElement('iframe');
    player.className = 'live-player-frame';
    player.title = stream.title || 'Tiger Sports Live livestream';
    player.loading = 'lazy';
    player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allowFullscreen = true;
    player.src = 'https://www.youtube.com/embed/' + stream.videoId + '?autoplay=0&rel=0';

    const watch = document.createElement('a');
    watch.className = 'live-stream-watch';
    watch.href = 'https://www.youtube.com/watch?v=' + stream.videoId;
    watch.target = '_blank';
    watch.rel = 'noopener noreferrer';
    watch.textContent = 'Watch on YouTube ↗';

    card.append(title, player, watch);
    return card;
  }

  function renderStreams(streams) {
    const unique = [];
    const seen = new Set();
    for (const stream of streams) {
      if (!validId.test(stream?.videoId || '') || seen.has(stream.videoId)) continue;
      seen.add(stream.videoId);
      unique.push(stream);
    }
    const nextIds = unique.map(v => v.videoId).join(',');
    // Preserve existing iframes when a status poll returns the same broadcasts.
    // Reloading an iframe would interrupt anyone watching a live game.
    if (nextIds !== displayedIds) {
      const existing = new Map([...players.children].map(card => [card.dataset.videoId, card]));
      players.replaceChildren(...unique.map(stream => existing.get(stream.videoId) || makeStreamCard(stream)));
      displayedIds = nextIds;
    }
    for (const stream of unique) {
      const card = [...players.children].find(c => c.dataset.videoId === stream.videoId);
      if (card) {
        card.querySelector('.live-stream-card-title').textContent = stream.title || 'Tiger Sports Live broadcast';
      }
    }
    players.hidden = unique.length === 0;
    panel.classList.toggle('is-live', unique.length > 0);
    heading.textContent = unique.length > 1 ? 'Live Tiger Sports Broadcasts' : 'Tiger Sports Live';
    return unique.length;
  }

  async function refreshLive() {
    if (running || document.hidden) return;
    running = true;
    try {
      const response = await fetch('/api/live', { cache: 'no-store' });
      if (!response.ok) throw new Error('Live status unavailable');
      const data = await response.json();
      const streams = Array.isArray(data.streams) ? data.streams
        : data.live && validId.test(data.videoId || '') ? [{ videoId: data.videoId, title: data.title }] : [];
      const count = renderStreams(streams);
      status.textContent = count > 1
        ? '🔴 ' + count + ' LIVE BROADCASTS — Choose the game you want to watch'
        : count === 1
          ? '🔴 LIVE NOW — Watch the broadcast below'
          : data.status === 'unavailable'
            ? 'Unable to confirm live status. Select WATCH LIVE to check YouTube.'
            : 'No live broadcasts detected. This section updates automatically when we go live.';
    } catch {
      // A temporary status outage must not interrupt a viewer's active player.
      status.textContent = 'Live status is temporarily unavailable. Select WATCH LIVE to check YouTube.';
    } finally {
      running = false;
    }
  }

  refreshLive();
  setInterval(refreshLive, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
})();