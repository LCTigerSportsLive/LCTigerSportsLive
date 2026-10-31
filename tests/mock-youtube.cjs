'use strict';
// Mock YouTube HTTP responses for deterministic server integration tests.
const channel = 'UCHteYhHnv-6VrSc9ImSs62g';
const knownId = 'f1uagBxRzAc';
const uploadsId = 'ABcde12345_';
const scenario = process.env.TEST_SCENARIO || 'ended';
function response(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}
global.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname === 'gridiron.pressrowapps.com') {
    return response({
      title: 'Liberty Center Football',
      snapshot: {
        homeTeam: { name: 'Liberty Center Tigers' },
        awayTeam: { name: 'Visitors' },
        homeScore: 21, awayScore: 14,
        quarter: 3, gameTime: '05:42',
        downDistanceText: '2nd & 7', yardLineDisplay: 'LC 43'
      },
      revision: 4, updatedAt: 1793450000
    });
  }
  if (url.hostname === 'www.googleapis.com') {
    if (url.pathname.endsWith('/videos')) {
      const ids = (url.searchParams.get('id') || '').split(',');
      return response({ items: ids.filter(id => id === knownId || id === uploadsId).map(id => {
        const live = id === knownId ? scenario === 'live' : scenario === 'uploads';
        return {
          id,
          snippet: { channelId: channel, title: 'Test Tigers Game', liveBroadcastContent: live ? 'live' : 'none' },
          liveStreamingDetails: live ? { actualStartTime: '2026-10-30T17:00:00Z' } : { actualEndTime: '2026-10-30T18:00:00Z' }
        };
      }) });
    }
    if (url.pathname.endsWith('/search')) return response({ items: [] });
    if (url.pathname.endsWith('/channels')) return response({
      items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUHteYhHnv-6VrSc9ImSs62g' } } }]
    });
    if (url.pathname.endsWith('/playlistItems')) return response({
      items: scenario === 'uploads' ? [{ contentDetails: { videoId: uploadsId } }] : []
    });
    return response({ items: [] });
  }
  if (url.hostname === 'www.youtube.com') return new Response('', { status: 200 });
  throw new Error('Unexpected HTTP request in test: ' + url.hostname);
};
