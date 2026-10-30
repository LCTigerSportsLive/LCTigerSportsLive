(() => {
  const status = document.getElementById('pressrow-status');
  const open = document.getElementById('pressrow-open');
  const toggle = document.getElementById('pressrow-toggle');
  const frame = document.getElementById('pressrow-frame');
  const note = document.getElementById('pressrow-embed-note');
  if (!status || !open || !toggle || !frame || !note) return;

  let currentUrl = null;
  async function refreshLink() {
    try {
      const response = await fetch('/api/v1/pressrow', { cache: 'no-store' });
      if (!response.ok) throw new Error('Press Row link unavailable');
      const data = await response.json();
      const url = data.configured ? new URL(data.url) : null;
      if (!url || url.protocol !== 'https:' || url.hostname !== 'hoops.pressrowapps.com' || !url.pathname.startsWith('/live/')) {
        currentUrl = null;
        open.hidden = true;
        toggle.hidden = true;
        frame.hidden = true;
        frame.removeAttribute('src');
        note.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        status.textContent = 'Live basketball scoring will appear here when a game link is configured.';
        return;
      }
      if (currentUrl !== url.href) {
        currentUrl = url.href;
        open.href = url.href;
        frame.hidden = true;
        frame.removeAttribute('src');
        note.hidden = true;
        toggle.textContent = 'SHOW SCORES HERE';
        toggle.setAttribute('aria-expanded', 'false');
      }
      open.hidden = false;
      toggle.hidden = false;
      status.textContent = 'Press Row game page connected. Select OPEN LIVE SCORES or SHOW SCORES HERE.';
    } catch {
      status.textContent = 'Unable to check the Press Row game link right now. Try again shortly.';
    }
  }
  toggle.addEventListener('click', () => {
    if (!currentUrl) return;
    if (frame.hidden) {
      frame.src = currentUrl;
      frame.hidden = false;
      note.hidden = false;
      toggle.textContent = 'HIDE SCORES';
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      frame.hidden = true;
      frame.removeAttribute('src');
      note.hidden = true;
      toggle.textContent = 'SHOW SCORES HERE';
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  refreshLink();
  setInterval(() => { if (!document.hidden) refreshLink(); }, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLink(); });
})();
