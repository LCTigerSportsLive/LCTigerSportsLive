'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function startServer(t, scenario) {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(port), TEST_SCENARIO: scenario,
      NODE_OPTIONS: '--require=' + path.join(__dirname, 'mock-youtube.cjs'),
      YOUTUBE_API_KEY: 'test-only',
      YOUTUBE_CHANNEL_ID: 'UCHteYhHnv-6VrSc9ImSs62g',
      LIVE_VIDEO_ID: 'f1uagBxRzAc'
    },
    stdio: 'ignore'
  });
  t.after(() => child.kill());
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited before readiness');
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/api/live');
      if (response.ok) {
        result = await response.json();
        if (result.status !== 'checking') break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(result, 'live endpoint should become available');
  return result;
}

test('known video is shown only while verified live', async t => {
  const result = await startServer(t, 'live');
  assert.equal(result.live, true);
  assert.equal(result.videoId, 'f1uagBxRzAc');
  assert.equal(result.source, 'known-video-verified');
});

test('ended manual video is not falsely labeled live', async t => {
  const result = await startServer(t, 'ended');
  assert.equal(result.live, false);
  assert.notEqual(result.source, 'manual');
});

test('new public live video is found through uploads playlist', async t => {
  const result = await startServer(t, 'uploads');
  assert.equal(result.live, true);
  assert.equal(result.videoId, 'ABcde12345_');
  assert.equal(result.source, 'channel-uploads');
});


async function getPressrowResponse(t, scenario) {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(port), TEST_SCENARIO: scenario,
      NODE_OPTIONS: '--require=' + path.join(__dirname, 'mock-youtube.cjs'),
      YOUTUBE_API_KEY: 'test-only',
      YOUTUBE_CHANNEL_ID: 'UCHteYhHnv-6VrSc9ImSs62g',
      PRESSROW_GRIDIRON_FEED_URL: scenario.startsWith('hoops-') ? '' : 'https://pressrowgridiron.com/api/broadcast/feed/test-token/data.json',
      PRESSROW_HOOPS_FEED_URL: 'https://pressrowhoops.com/api/broadcast/live/test-token.json'
    },
    stdio: 'ignore'
  });
  t.after(() => child.kill());
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited unexpectedly');
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/api/v1/pressrow/gridiron');
      if (res.ok) return await res.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Press Row endpoint never became ready');
}

test('Press Row active football game is shown and feed token stays private', async t => {
  const result = await getPressrowResponse(t, 'pressrow-active');
  assert.equal(result.connected, true);
  assert.equal(result.activeGame, true);
  assert.equal(result.feed.snapshot.homeScore, 21);
  assert.equal(result.provider, 'pressrow-gridiron');
  assert.equal(JSON.stringify(result).includes('test-token'), false);
});

for (const scenario of ['pressrow-stale', 'pressrow-pregame', 'pressrow-final']) {
  test('Press Row panel hides for ' + scenario, async t => {
    const result = await getPressrowResponse(t, scenario);
    assert.equal(result.connected, true);
    assert.equal(result.activeGame, false);
  });
}

for (const [scenario, active] of [['hoops-live', true], ['hoops-final', false], ['hoops-scheduled', false]]) {
  test('Press Row Hoops visibility follows provider live status: ' + scenario, async t => {
    const result = await getPressrowResponse(t, scenario);
    assert.equal(result.connected, true);
    assert.equal(result.provider, 'pressrow-hoops');
    assert.equal(result.sport, 'basketball');
    assert.equal(result.activeGame, active);
    assert.equal(result.feed.homescore, 41);
    assert.equal(result.feed.awayscore, 36);
    assert.equal(JSON.stringify(result).includes('test-token'), false);
  });
}
