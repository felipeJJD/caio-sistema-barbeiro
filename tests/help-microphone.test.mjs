import assert from "node:assert/strict";
import test from "node:test";
import { createHelpMicrophone } from "../lib/help-microphone.ts";

function fakeStream() {
  const track = { enabled: true, readyState: "live", stop() { this.readyState = "ended"; } };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

test("duas mensagens seguidas reutilizam a captura sem novo pedido de permissão", async () => {
  let requests = 0;
  const stream = fakeStream();
  const ready = [];
  const mic = createHelpMicrophone(async () => { requests++; return stream; }, (value) => ready.push(value));
  assert.equal(await mic.acquire(), stream);
  mic.idle();
  assert.equal(stream.track.enabled, false);
  assert.equal(await mic.acquire(), stream);
  assert.equal(stream.track.enabled, true);
  assert.equal(requests, 1);
  assert.deepEqual(ready, [true, false]);
  mic.release();
  assert.equal(stream.track.readyState, "ended");
});

test("fechar durante a permissão pendente interrompe captura concedida depois", async () => {
  let resolvePermission;
  const stream = fakeStream();
  const mic = createHelpMicrophone(() => new Promise((resolve) => { resolvePermission = resolve; }), () => {});
  const request = mic.acquire();
  mic.release();
  resolvePermission(stream);
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(stream.track.readyState, "ended");
});

test("microfone parado é liberado após o curto período de reutilização", async () => {
  let requests = 0;
  const streams = [];
  const mic = createHelpMicrophone(async () => {
    requests++;
    const stream = fakeStream();
    streams.push(stream);
    return stream;
  }, () => {}, 15);
  await mic.acquire();
  mic.idle();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(streams[0].track.readyState, "ended");
  await mic.acquire();
  assert.equal(requests, 2);
  mic.release();
});
