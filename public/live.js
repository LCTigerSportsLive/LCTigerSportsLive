(() => {
  const panel = document.getElementById('game-day-live');
  const status = document.getElementById('live-status');
  const player = document.getElementById('live-player');
  const title = document.getElementById('live-stream-title');
  if (!panel || !status || !player || !title) return;
  let currentId = null;
  let running = false;

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
          player.src = 'https://www.youtube-nocookie.com/embed/' + data.videoId + '?autoplay=0&rel=0';
        }
        title.textContent = data.title || 'Tiger Sports Live broadcast';
        player.hidden = false;
        status.textContent = '● LIVE NOW — Watch the broadcast below';
        panel.classList.add('is-live');
      } else if (data.status === 'unavailable') {
        // If YouTube blocks status checks, offer its channel-level player instead
        // of hiding the viewing window completely.
        if (currentId !== 'channel-fallback') {
          currentId = 'channel-fallback';
          player.src = 'https://www.youtube.com/embed/live_stream?channel=UCHteYhHnv-6VrSc9ImSs62g';
        }
        player.hidden = false;
        title.textContent = 'Tiger Sports Live';
        panel.classList.remove('is-live');
        status.textContent = 'Live status could not be confirmed. Try the player below, or use WATCH LIVE to open YouTube directly.';
      } else {
        currentId = null;
        player.removeAttribute('src');
        player.hidden = true;
        title.textContent = 'Tiger Sports Live';
        panel.classList.remove('is-live');
        status.textContent = 'No broadcast is live right now. This player will appear automatically when we go live.';
      }
    } catch {
      status.textContent = 'Live status check failed. Use WATCH LIVE to open YouTube directly.';
    } finally {
      running = false;
    }
  }

  refreshLive();
  setInterval(refreshLive, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
})();
