(() => {
  const upcoming = document.getElementById('upcoming-game');
  const title = document.getElementById('upcoming-game-title');
  const time = document.getElementById('upcoming-game-time');
  const link = document.getElementById('upcoming-game-link');
  const live = document.getElementById('game-day-live');
  const status = document.getElementById('live-status');
  const scoreboard = document.getElementById('pressrow-panel');
  if (!upcoming || !live || !status) return;
  let next = null;
  let fetching = false;
  function update() {
    const broadcasting = live.classList.contains('is-live');
    const gameActive = scoreboard && !scoreboard.hidden;
    const show = Boolean(next && !broadcasting && !gameActive);
    upcoming.hidden = !show;
    status.hidden = show;
  }
  async function refresh() {
    if (fetching || document.hidden) return;
    fetching = true;
    try {
      const response = await fetch('/api/next-game', {cache:'no-store'});
      if (!response.ok) throw new Error('Schedule unavailable');
      const data = await response.json();
      next = data.available && data.event ? data.event : null;
      if (next) {
        title.textContent = next.title;
        time.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone:'America/New_York', weekday:'long', month:'long', day:'numeric',
          hour:'numeric', minute:'2-digit', timeZoneName:'short'
        }).format(new Date(next.start));
        if (link && /^[A-Za-z0-9_-]{11}$/.test(next.videoId || '')) link.href = 'https://www.youtube.com/watch?v=' + next.videoId;
      }
    } catch { next = null; }
    finally { fetching = false; update(); }
  }
  new MutationObserver(update).observe(live, {attributes:true,attributeFilter:['class']});
  if (scoreboard) new MutationObserver(update).observe(scoreboard, {attributes:true,attributeFilter:['hidden']});
  refresh();
  setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
