import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const scratch = await mkdtemp(join(tmpdir(), "ca-evolution-audio-"));
const source = await readFile(new URL("../lib/evolution-audio-format.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022 } }).outputText;
const modulePath = join(scratch, "format.mjs");
await writeFile(modulePath, output);
const { prepareEvolutionAudio } = await import(pathToFileURL(modulePath).href);
test.after(async () => rm(scratch, { recursive:true, force:true }));

test("rejeita mídia inválida ou acima do limite antes de decodificar", async () => {
  assert.equal(await prepareEvolutionAudio("***", "audio/ogg"), null);
  assert.equal(await prepareEvolutionAudio("a".repeat(12_000_000), "audio/ogg"), null);
  assert.equal(await prepareEvolutionAudio("YWJj", "application/octet-stream"), null);
});

test("preserva formato aceito com extensão correta", async () => {
  const result = await prepareEvolutionAudio(Buffer.from("RIFFtest").toString("base64"), "audio/wav");
  assert.equal(result?.extension, "wav");
  assert.equal(result?.bytes.toString(), "RIFFtest");
});

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio:"ignore" }).status === 0;
test("converte voz OGG/Opus da Evolution para MP3 aceito pela transcrição", { skip:!ffmpegAvailable }, async () => {
  const sample = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-c:a", "libopus", "-f", "ogg", "pipe:1"], { maxBuffer:1024 * 1024 });
  assert.equal(sample.status, 0);
  assert.equal(sample.stdout.subarray(0,4).toString(), "OggS");
  const result = await prepareEvolutionAudio(sample.stdout.toString("base64"), "audio/ogg; codecs=opus");
  assert.equal(result?.extension, "mp3");
  assert.equal(result?.mimeType, "audio/mpeg");
  assert.equal(result?.bytes.subarray(0,3).toString(), "ID3");
});
