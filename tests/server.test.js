'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

test('health, teams, homepage and icon are served', async (t) => {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), PRESSROW_LIVE_URL: 'https://hoops.pressrowapps.com/live/test-public-game' },
    stdio: 'ignore'
  });
  t.after(() => child.kill());

  let health;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming ready');
    try {
      health = await fetch('http://127.0.0.1:' + port + '/api/health');
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(health, 'health endpoint should become reachable');
  assert.equal(health.status, 200);
  const status = await health.json();
  assert.equal(status.status, 'ok');
  assert.equal(status.service, 'tiger-sports-live');

  const teamsResponse = await fetch('http://127.0.0.1:' + port + '/api/v1/teams');
  assert.equal(teamsResponse.status, 200);
  const directory = await teamsResponse.json();
  assert.equal(directory.schemaVersion, 1);
  assert.ok(directory.teams.some((team) => team.id === 'football' && team.rosterStatus === 'available'));

  const pressrow = await fetch('http://127.0.0.1:' + port + '/api/v1/pressrow');
  assert.equal(pressrow.status, 200);
  const scoreLink = await pressrow.json();
  assert.equal(scoreLink.provider, 'pressrow-hoops');
  assert.equal(scoreLink.configured, true);
  assert.equal(scoreLink.url, 'https://hoops.pressrowapps.com/live/test-public-game');

  const homepage = await fetch('http://127.0.0.1:' + port + '/');
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /Tiger Sports Live/);

  const icon = await fetch('http://127.0.0.1:' + port + '/tiger-sports-live-logo.svg');
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /image\/svg\+xml/);

  const missing = await fetch('http://127.0.0.1:' + port + '/missing-page.html');
  assert.equal(missing.status, 404);
});
