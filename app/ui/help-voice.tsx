"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createHelpMicrophone } from "../../lib/help-microphone";

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
  const [requesting, setRequesting] = useState(false);
  const [ready, setReady] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const microphoneRef = useRef<ReturnType<typeof createHelpMicrophone> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const finishModeRef = useRef<"send" | "discard">("discard");
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const startIdRef = useRef(0);
  const callbacksRef = useRef({ onSend, onError });

  useEffect(() => { callbacksRef.current = { onSend, onError }; }, [onSend, onError]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    recorderRef.current = null;
    chunksRef.current = [];
    secondsRef.current = 0;
    if (mountedRef.current) {
      setRecording(false);
      setPaused(false);
      setSeconds(0);
    }
  }, [clearTimer]);

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
      microphoneRef.current?.idle();
    }
  }, [reset]);

  const start = useCallback(async () => {
    if (startingRef.current || recorderRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      callbacksRef.current.onError("Este navegador não oferece gravação de áudio aqui. Atualize o navegador ou use o campo de texto.");
      return;
    }
    startingRef.current = true;
    const startId = ++startIdRef.current;
    setRequesting(true);
    try {
      // Request capture directly from the tap. Querying Permissions first can
      // consume user activation on Safari and cannot grant access itself.
      microphoneRef.current ??= createHelpMicrophone(
        () => navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        (value) => { if (mountedRef.current) setReady(value); },
      );
      const stream = await microphoneRef.current!.acquire();
      if (startId !== startIdRef.current || !mountedRef.current) return;
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
        callbacksRef.current.onError("A gravação foi interrompida. Tente novamente.");
        reset();
        microphoneRef.current?.release();
      };
      recorder.onstop = () => {
        const shouldSend = finishModeRef.current === "send";
        const type = recorder.mimeType || mimeType || chunksRef.current[0]?.type || "audio/webm";
        const durationSeconds = Math.max(1, secondsRef.current);
        const blob = new Blob(chunksRef.current, { type });
        reset();
        microphoneRef.current?.idle();
        if (shouldSend && blob.size > 0) void callbacksRef.current.onSend({ blob, durationSeconds, mimeType: type });
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
      if (startId !== startIdRef.current || !mountedRef.current) return;
      recorderRef.current = null;
      clearTimer();
      microphoneRef.current?.release();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        callbacksRef.current.onError("Microfone bloqueado. Libere nas permissões deste site no Safari ou nos Ajustes do iPhone e tente novamente.");
      } else if (name === "NotFoundError") {
        callbacksRef.current.onError("Não encontrei um microfone neste aparelho.");
      } else if (name !== "AbortError") {
        callbacksRef.current.onError("Não consegui abrir o microfone. Verifique se outro app está usando o áudio e tente novamente.");
      }
    } finally {
      if (startId === startIdRef.current) {
        startingRef.current = false;
        if (mountedRef.current) setRequesting(false);
      }
    }
  }, [clearTimer, finish, reset]);

  const close = useCallback(() => {
    ++startIdRef.current;
    startingRef.current = false;
    finishModeRef.current = "discard";
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.onerror = null;
      try { if (recorder.state !== "inactive") recorder.stop(); } catch {}
    }
    reset();
    microphoneRef.current?.release();
    if (mountedRef.current) setRequesting(false);
  }, [reset]);

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
      } else {
        return;
      }
    } catch {
      callbacksRef.current.onError("Não consegui pausar a gravação.");
    }
  }, []);

  const send = useCallback(() => finish("send"), [finish]);
  const discard = useCallback(() => finish("discard"), [finish]);

  useEffect(() => {
    mountedRef.current = true;
    const releaseWhenHidden = () => {
      if (document.visibilityState === "hidden") close();
    };
    document.addEventListener("visibilitychange", releaseWhenHidden);
    window.addEventListener("pagehide", close);
    return () => {
      mountedRef.current = false;
      close();
      document.removeEventListener("visibilitychange", releaseWhenHidden);
      window.removeEventListener("pagehide", close);
    };
  }, [close]);

  return { recording, paused, seconds, requesting, ready, start, togglePause, send, discard, close };
}

export function HelpVoiceWave({ active = false, progress = 0 }: { active?: boolean; progress?: number }) {
  return <span className={"help-voice-wave" + (active ? " active" : "")} style={{ "--voice-progress": `${Math.max(0, Math.min(100, progress))}%` } as CSSProperties}>
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
  const [elapsed, setElapsed] = useState(0);

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
        setElapsed(Math.floor(audio.currentTime));
        setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
      }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); setProgress(0); setElapsed(0); }}
    />
    <div className="help-voice-player">
      <button type="button" className="help-voice-play" aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"} onClick={togglePlay}>
        {playing
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg>}
      </button>
      <div className="help-voice-track">
        <div role="progressbar" aria-label="Progresso do áudio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><HelpVoiceWave progress={progress} /></div>
        <small>{formatHelpVoiceTime(elapsed)} / {formatted}</small>
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
