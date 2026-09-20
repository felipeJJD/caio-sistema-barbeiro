"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type HelpVoicePayload = {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
};

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function microphonePermissionState() {
  try {
    if (!navigator.permissions?.query) return "prompt" as PermissionState;
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "prompt" as PermissionState;
  }
}

export function useHelpVoiceRecorder({
  onSend,
  onError,
}: {
  onSend: (payload: HelpVoicePayload) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const finishModeRef = useRef<"send" | "discard">("discard");
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    secondsRef.current = 0;
    if (mountedRef.current) {
      setRecording(false);
      setPaused(false);
      setSeconds(0);
    }
  }, [clearTimer, releaseStream]);

  const finish = useCallback((mode: "send" | "discard") => {
    finishModeRef.current = mode;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      reset();
      return;
    }
    try {
      recorder.stop();
    } catch {
      reset();
    }
  }, [reset]);

  const start = useCallback(async () => {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Este navegador não oferece gravação de áudio aqui. Atualize o navegador ou use o campo de texto.");
      return;
    }
    const permission = await microphonePermissionState();
    if (permission === "denied") {
      onError("O microfone está bloqueado para este site. Libere o microfone nos ajustes do navegador e tente novamente.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      try { localStorage.setItem("ca-help-microphone-granted", "1"); } catch {}
      const mimeType = chooseMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      secondsRef.current = 0;
      finishModeRef.current = "discard";
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onError("A gravação foi interrompida. Tente novamente.");
        reset();
      };
      recorder.onstop = () => {
        const shouldSend = finishModeRef.current === "send";
        const type = recorder.mimeType || mimeType || chunksRef.current[0]?.type || "audio/webm";
        const durationSeconds = Math.max(1, secondsRef.current);
        const blob = new Blob(chunksRef.current, { type });
        reset();
        if (shouldSend && blob.size > 0) void onSend({ blob, durationSeconds, mimeType: type });
      };
      recorder.start(250);
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      clearTimer();
      timerRef.current = setInterval(() => {
        if (recorder.state !== "recording") return;
        secondsRef.current += 1;
        if (mountedRef.current) setSeconds(secondsRef.current);
        if (secondsRef.current >= 120) finish("send");
      }, 1000);
    } catch (error) {
      releaseStream();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError("O microfone não foi liberado. Toque em Permitir uma vez; depois o navegador deve lembrar dessa escolha.");
      } else {
        onError("Não consegui abrir o microfone. Tente novamente.");
      }
    }
  }, [clearTimer, finish, onError, onSend, recording, releaseStream, reset]);

  const togglePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      if (recorder.state === "recording") {
        recorder.pause();
        setPaused(true);
      } else if (recorder.state === "paused") {
        recorder.resume();
        setPaused(false);
      }
    } catch {
      onError("Não consegui pausar a gravação.");
    }
  }, [onError]);

  const send = useCallback(() => finish("send"), [finish]);
  const discard = useCallback(() => finish("discard"), [finish]);

  useEffect(() => () => {
    mountedRef.current = false;
    finishModeRef.current = "discard";
    try { recorderRef.current?.stop(); } catch {}
    clearTimer();
    releaseStream();
  }, [clearTimer, releaseStream]);

  return { recording, paused, seconds, start, togglePause, send, discard };
}

export function HelpVoiceWave({ active = false, progress = 0 }: { active?: boolean; progress?: number }) {
  return <span className={"help-voice-wave" + (active ? " active" : "")} style={{ "--voice-progress": `${Math.max(0, Math.min(100, progress))}%` } as React.CSSProperties}>
    {Array.from({ length: 23 }, (_, index) => <i key={index} />)}
  </span>;
}

export function HelpVoiceBubble({
  url,
  durationSeconds,
  transcript,
  showTranscript,
  status,
  onToggleTranscript,
}: {
  url: string;
  durationSeconds: number;
  transcript: string;
  showTranscript: boolean;
  status: "processing" | "ready" | "error";
  onToggleTranscript: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {}
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const formatted = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`;

  return <div className="help-voice-message">
    <audio
      ref={audioRef}
      src={url}
      preload="metadata"
      onTimeUpdate={(event) => {
        const audio = event.currentTarget;
        setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      }}
      onEnded={() => { setPlaying(false); setProgress(0); }}
    />
    <div className="help-voice-player">
      <button type="button" className="help-voice-play" aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"} onClick={togglePlay}>
        {playing
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg>}
      </button>
      <div className="help-voice-track">
        <HelpVoiceWave progress={progress} />
        <small>{formatted}</small>
      </div>
    </div>
    <div className="help-voice-meta">
      {status === "processing" && <span>Entendendo o áudio…</span>}
      {status === "error" && <span>Não consegui transcrever este áudio.</span>}
      {status === "ready" && transcript && <button type="button" onClick={onToggleTranscript}>{showTranscript ? "Ocultar transcrição" : "Ver transcrição"}</button>}
    </div>
    {showTranscript && transcript && <p className="help-voice-transcript">{transcript}</p>}
  </div>;
}

export function formatHelpVoiceTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
