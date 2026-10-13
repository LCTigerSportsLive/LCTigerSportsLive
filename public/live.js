(() => {
  const panel = document.getElementById('game-day-live');
  const status = document.getElementById('live-status');
  const player = document.getElementById('live-player');
  const title = document.getElementById('live-stream-title');
  if (!panel || !status || !player || !title) return;

  const channelPlayer = 'https://www.youtube.com/embed/live_stream?channel=UCHteYhHnv-6VrSc9ImSs62g';
  let currentId = 'channel';
  let running = false;

  // The channel-level player stays on screen even when the separate live
  // detector cannot read YouTube's stream listing.
  player.src = channelPlayer;
  player.hidden = false;

  function showChannelPlayer() {
    if (currentId !== 'channel') {
      currentId = 'channel';
      player.src = channelPlayer;
    }
    player.hidden = false;
    title.textContent = 'Tiger Sports Live';
    panel.classList.remove('is-live');
  }

  async function refreshLive() {
    if (running || document.hidden) return;
    running = true;
    try {
      const response = await fetch('/api/live', { cache: 'no-store' });
      if (!response.ok) throw new Error('Live status unavailable');
      const data = await response.json();
      if (data.live && /^[A-Za-z0-9_-]{11}$/.test(data.videoId || '')) {
        if (currentId !== data.videoId) {
          currentId = data.videoId;
          player.src = 'https://www.youtube.com/embed/' + data.videoId + '?autoplay=0&rel=0';
        }
        title.textContent = data.title || 'Tiger Sports Live broadcast';
        player.hidden = false;
        status.textContent = '● LIVE NOW — Watch the broadcast below';
        panel.classList.add('is-live');
      } else {
        showChannelPlayer();
        status.textContent = 'Live player for our YouTube channel. If YouTube does not play the broadcast here, select WATCH LIVE above.';
      }
    } catch {
      showChannelPlayer();
      status.textContent = 'Live player for our YouTube channel. If playback is unavailable, select WATCH LIVE above.';
    } finally {
      running = false;
    }
  }

  refreshLive();
  setInterval(refreshLive, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
})();