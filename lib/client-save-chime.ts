// Prepare audio during the Save gesture so Safari can unlock it; play only
// after the client save succeeds. Audio failure must never affect the save.
export function prepareClientSaveChime(): { play: () => void; cancel: () => void } | null {
  if (typeof window === "undefined") return null;
  const AudioConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioConstructor) return null;

  try {
    const context = new AudioConstructor();
    void context.resume().catch(() => undefined);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void context.close().catch(() => undefined);
    };
    return {
      cancel: close,
      play: () => {
        if (closed || context.state !== "running") { close(); return; }
        try {
          const now = context.currentTime;
          const tone = context.createOscillator();
          const volume = context.createGain();
          tone.type = "sine";
          tone.frequency.setValueAtTime(880, now);
          tone.frequency.exponentialRampToValueAtTime(1320, now + 0.11);
          volume.gain.setValueAtTime(0.0001, now);
          volume.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
          volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
          tone.connect(volume).connect(context.destination);
          tone.start(now);
          tone.stop(now + 0.29);
          window.setTimeout(close, 400);
        } catch { close(); }
      },
    };
  } catch { return null; }
}
