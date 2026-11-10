(() => {
  const upcoming = document.getElementById('upcoming-game');
  const title = document.getElementById('upcoming-game-title');
  const time = document.getElementById('upcoming-game-time');
  const location = document.getElementById('upcoming-game-location');
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
      next = data.available && data.game ? data.game : null;
      if (next) {
        title.textContent = next.title;
        time.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone:'America/New_York', weekday:'long', month:'long', day:'numeric',
          hour:'numeric', minute:'2-digit', timeZoneName:'short'
        }).format(new Date(next.start));
        location.textContent = next.location ? 'Location: ' + next.location : '';
        location.hidden = !next.location;
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
