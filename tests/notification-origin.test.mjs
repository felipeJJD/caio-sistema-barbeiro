import assert from 'node:assert/strict';
import test from 'node:test';
import { validNotificationOrigin } from '../lib/request-origin.ts';

const publicUrl = 'https://cortouanotou.com.br/';
const request = (origin, extra = {}) => new Request('http://0.0.0.0:3000/api/notifications', {
  headers: { ...(origin === undefined ? {} : { origin }), ...extra },
});

test('public HTTPS origin works behind an internal HTTP reverse proxy', () => {
  assert.equal(validNotificationOrigin(request('https://cortouanotou.com.br'), publicUrl), true);
});

test('old PUBLIC_APP_URL does not block the canonical notification controls', () => {
  const previous = process.env.PUBLIC_APP_URL;
  try {
    process.env.PUBLIC_APP_URL = 'https://clube-fiel-v11.kaylon-estefani2016.chatgpt.site';
    assert.equal(validNotificationOrigin(request('https://cortouanotou.com.br')), true);
    assert.equal(validNotificationOrigin(request('https://clube-fiel-v11.kaylon-estefani2016.chatgpt.site')), false);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

test('foreign, null, downgraded and lookalike origins remain blocked', () => {
  for (const origin of ['https://evil.invalid', 'null', 'http://cortouanotou.com.br', 'https://cortouanotou.com.br.evil.invalid']) {
    assert.equal(validNotificationOrigin(request(origin, { 'x-forwarded-host': 'evil.invalid', 'x-forwarded-proto': 'https' }), publicUrl), false);
  }
});

test('configuration is explicit and malformed configuration fails closed', () => {
  assert.equal(validNotificationOrigin(request('https://custom.example'), 'https://custom.example/path'), true);
  assert.equal(validNotificationOrigin(request('https://cortouanotou.com.br'), 'bad-url'), false);
  assert.equal(validNotificationOrigin(request(undefined), publicUrl), true);
});
