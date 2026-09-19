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
