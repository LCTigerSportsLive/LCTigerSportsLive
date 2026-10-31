(() => {
  const byId = id => document.getElementById(id);
  const status = byId('pressrow-status');
  const board = byId('pressrow-scoreboard');
  const panel = byId('pressrow-panel');
  if (!status || !board || !panel) return;
  panel.hidden = true;
  const update = byId('pressrow-update');
  const key = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  function field(object, names) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
    for (const name of names) {
      const found = Object.keys(object).find(k => key(k) === key(name));
      if (found !== undefined && object[found] !== undefined && object[found] !== null && object[found] !== '') return object[found];
    }
    return undefined;
  }
  function text(value) {
    if (value === null || value === undefined || typeof value === 'object') return null;
    return String(value);
  }
  function score(value) {
    if (value && typeof value === 'object') value = field(value, ['total', 'points', 'value', 'score']);
    return text(value);
  }
  function roots(feed) {
    const items = [feed];
    for (const item of items) {
      if (items.length >= 20) break;
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      for (const k of ['snapshot', 'game', 'scoreboard', 'data', 'payload', 'broadcast', 'state', 'gameState', 'gameData', 'live']) {
        const child = field(item, [k]);
        if (child && typeof child === 'object' && !items.includes(child)) items.push(child);
      }
    }
    return items;
  }
  function fromAny(items, names) {
    for (const item of items) {
      const value = field(item, names);
      if (value !== undefined) return value;
    }
    return undefined;
  }
  function teamFromObject(item, side) {
    const names = side === 'home'
      ? ['home', 'homeTeam', 'teamHome', 'homeSide', 'home_team', 'team1']
      : ['away', 'awayTeam', 'visitor', 'visitors', 'visitingTeam', 'guest', 'teamAway', 'away_team', 'team2'];
    return field(item, names);
  }
  function findTeams(items) {
    let home, away;
    for (const item of items) {
      if (!home) home = teamFromObject(item, 'home');
      if (!away) away = teamFromObject(item, 'away');
      const list = field(item, ['teams', 'participants', 'competitors', 'opponents']);
      if (Array.isArray(list)) {
        for (const team of list) {
          const side = key(text(field(team, ['side', 'homeAway', 'designation', 'location', 'type'])) || '');
          if (side === 'home' && !home) home = team;
          if (['away', 'visitor', 'visiting', 'guest'].includes(side) && !away) away = team;
        }
        if (!away) away = list[0];
        if (!home) home = list[1];
      }
    }
    return { home, away };
  }
  function teamName(team, items, side) {
    if (typeof team === 'string') return team;
    const name = text(field(team, ['displayName', 'fullName', 'name', 'teamName', 'schoolName', 'school', 'abbreviation', 'shortName', 'nickname', 'team']));
    return name || text(fromAny(items, side === 'home'
      ? ['homeTeamName', 'homeName', 'homeSchool', 'home_team_name']
      : ['awayTeamName', 'visitorName', 'awayName', 'awaySchool', 'away_team_name']));
  }
  function teamScore(team, items, side) {
    const own = score(field(team, ['score', 'points', 'totalScore', 'total', 'currentScore']));
    if (own !== null) return own;
    return score(fromAny(items, side === 'home'
      ? ['homeScore', 'scoreHome', 'homePoints', 'home_team_score', 'score1']
      : ['awayScore', 'visitorScore', 'scoreAway', 'awayPoints', 'away_team_score', 'score2']));
  }
  function put(id, value, fallback = '') {
    byId(id).textContent = value ?? fallback;
  }
  function detail(id, value) {
    const node = byId(id);
    node.hidden = value === null || value === undefined || value === '';
    node.textContent = node.hidden ? '' : value;
  }
  function render(feed, fetchedAt) {
    const items = roots(feed);
    const teams = findTeams(items);
    const awayName = teamName(teams.away, items, 'away');
    const homeName = teamName(teams.home, items, 'home');
    const awayScore = teamScore(teams.away, items, 'away');
    const homeScore = teamScore(teams.home, items, 'home');
    const hasScore = homeScore !== null || awayScore !== null;
    const hasTeam = Boolean(homeName || awayName);
    if (!hasScore && !hasTeam) {
      board.hidden = true;
      status.textContent = 'Connected to Press Row. Waiting for game scoreboard information.';
      return;
    }
    put('pressrow-away-name', awayName, 'Away');
    put('pressrow-home-name', homeName, 'Home');
    put('pressrow-away-score', awayScore, '—');
    put('pressrow-home-score', homeScore, '—');
    const periodRaw = text(fromAny(items, ['quarter', 'currentQuarter', 'period', 'currentPeriod', 'gamePeriod']));
    const clockRaw = text(fromAny(items, ['clock', 'gameClock', 'timeRemaining', 'periodClock', 'clockDisplay', 'timeLeft', 'gameTime']));
    const state = text(fromAny(items, ['gameStatus', 'status', 'gamePhase', 'phase', 'gameState']));
    const down = text(fromAny(items, ['down', 'currentDown']));
    const distance = text(fromAny(items, ['distance', 'yardsToGo', 'toGo']));
    const ballOn = text(fromAny(items, ['ballOn', 'yardLineDisplay', 'yardLine', 'lineOfScrimmage']));
    const downDistance = text(fromAny(items, ['downDistanceText']));
    const period = periodRaw && /^\\d+$/.test(periodRaw) ? 'Q' + periodRaw : periodRaw;
    detail('pressrow-period', period || state);
    detail('pressrow-clock', clockRaw);
    detail('pressrow-situation', [
      downDistance || (down && distance ? down + ' & ' + distance : null),
      ballOn ? (ballOn.toLowerCase().startsWith('ball') ? ballOn : 'Ball on ' + ballOn) : null
    ].filter(Boolean).join(' · '));
    const more = byId('pressrow-more');
    more.hidden = true;
    more.textContent = '';
    board.hidden = false;
    const final = state && /final|complete|finished|ended/i.test(state);
    status.textContent = final ? 'Final score · Press Row Gridiron' : 'Scores connected · Press Row Gridiron';
    update.hidden = false;
    const at = new Date(fetchedAt);
    update.textContent = Number.isNaN(at.getTime()) ? 'Updated from Press Row' : 'Last checked ' + at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }
  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/v1/pressrow/gridiron', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.connected || !payload.feed) throw new Error('Feed unavailable');
      if (payload.activeGame !== true) {
        panel.hidden = true;
        board.hidden = true;
        update.hidden = true;
        return;
      }
      render(payload.feed, payload.fetchedAt);
      panel.hidden = false;
    } catch {
      panel.hidden = true;
      board.hidden = true;
      update.hidden = true;
      status.textContent = 'Live scores are temporarily unavailable. Trying again automatically.';
    } finally { busy = false; }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
