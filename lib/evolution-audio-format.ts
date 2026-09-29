import { spawn } from "node:child_process";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function convertToMp3(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "pipe:1"], { stdio:["pipe", "pipe", "ignore"] });
    } catch { resolve(null); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(null); }, 20_000);
    child.stdout!.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) { child.kill(); finish(null); }
      else chunks.push(chunk);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 && size > 0 && size <= MAX_AUDIO_BYTES ? Buffer.concat(chunks) : null));
    child.stdin!.on("error", () => {});
    child.stdin!.end(input);
  });
}

export async function prepareEvolutionAudio(base64: string, mimeType: string) {
  // Check the encoded length before allocating a large Buffer from provider data.
  if (!base64 || base64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 16 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) return null;
  const raw = Buffer.from(base64, "base64");
  if (!raw.length || raw.length > MAX_AUDIO_BYTES) return null;
  const type = mimeType.toLowerCase().split(";")[0]?.trim() || "";
  const ogg = raw.subarray(0,4).toString("ascii") === "OggS";
  if (ogg || ["audio/ogg", "audio/opus", "audio/oga", "audio/aac", "audio/x-aac"].includes(type)) {
    const converted = await convertToMp3(raw);
    return converted ? { bytes:converted, mimeType:"audio/mpeg", extension:"mp3" } : null;
  }
  const supported: Record<string, string> = {
    "audio/mp4":"m4a", "audio/m4a":"m4a", "audio/x-m4a":"m4a",
    "audio/mpeg":"mp3", "audio/mp3":"mp3", "audio/mpga":"mp3",
    "audio/wav":"wav", "audio/x-wav":"wav", "audio/webm":"webm",
  };
  const extension = supported[type];
  return extension ? { bytes:raw, mimeType:type, extension } : null;
}
