(() => {
  const panel = document.getElementById('game-day-live');
  const status = document.getElementById('live-status');
  const player = document.getElementById('live-player');
  const title = document.getElementById('live-stream-title');
  if (!panel || !status || !player || !title) return;
  let currentId = null;
  let running = false;

  function clearPlayer() {
    currentId = null;
    player.removeAttribute('src');
    player.hidden = true;
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
        clearPlayer();
        status.textContent = data.status === 'unavailable'
          ? 'Live status cannot be confirmed right now. Select WATCH LIVE to view the channel on YouTube.'
          : 'No live broadcast was detected. Select WATCH LIVE to check YouTube for current broadcasts.';
      }
    } catch {
      clearPlayer();
      status.textContent = 'Live status cannot be confirmed right now. Select WATCH LIVE to open YouTube.';
    } finally {
      running = false;
    }
  }

  clearPlayer();
  refreshLive();
  setInterval(refreshLive, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
})();