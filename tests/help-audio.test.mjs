import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [assistantUi, voiceUi, transcribeRoute] = await Promise.all([
  readFile(new URL("../app/ui/help-assistant.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/help-voice.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/help/transcribe/route.ts", import.meta.url), "utf8"),
]);

test("assistente usa áudio real em vez de SpeechRecognition", () => {
  assert.doesNotMatch(assistantUi, /createHelpDictation|SpeechRecognition|webkitSpeechRecognition/);
  assert.match(voiceUi, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(voiceUi, /new MediaRecorder/);
  assert.match(assistantUi, /HelpVoiceBubble/);
});

test("áudio enviado fica oculto como texto até pedir transcrição", () => {
  assert.match(assistantUi, /showTranscript: false/);
  assert.match(voiceUi, /Ver transcrição/);
  assert.match(voiceUi, /Ocultar transcrição/);
});

test("gravação tem apagar, pausar e enviar", () => {
  assert.match(assistantUi, /Apagar gravação/);
  assert.match(assistantUi, /Pausar gravação/);
  assert.match(assistantUi, /Enviar áudio/);
});

test("transcrição passa por rota autenticada e limita tamanho", () => {
  assert.match(transcribeRoute, /getSessionAccess/);
  assert.match(transcribeRoute, /MAX_AUDIO_BYTES/);
  assert.match(transcribeRoute, /help-audio/);
  assert.match(transcribeRoute, /audio\/transcriptions/);
  assert.match(transcribeRoute, /gpt-4o-mini-transcribe/);
});


test("rota aceita MIME do Safari com codec e variantes m4a/aac", () => {
  assert.match(transcribeRoute, /split\(";"\)\[0\]/);
  assert.match(transcribeRoute, /audio\/x-m4a/);
  assert.match(transcribeRoute, /audio\/aac/);
  assert.match(transcribeRoute, /help_audio_unsupported_type/);
});
