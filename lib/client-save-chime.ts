// Prepare audio during the Save gesture so Safari/iOS can unlock it; play only
// after the client save succeeds. Audio failure must never affect the save.
export function prepareClientSaveChime(): { play: () => void; cancel: () => void } | null {
  if (typeof window === "undefined") return null;
  const AudioConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioConstructor) return null;

  try {
    const context = new AudioConstructor();
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      void context.close().catch(() => undefined);
    };

    // iOS only allows audio after a direct user gesture. Unlock the context while
    // the Save tap is still active, using an inaudible one-sample buffer.
    const unlock = () => {
      try {
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, context.sampleRate);
        const gain = context.createGain();
        gain.gain.value = 0.00001;
        source.connect(gain).connect(context.destination);
        source.start(0);
      } catch {
        // The save must continue even if audio is unavailable.
      }
    };

    void context.resume().then(unlock).catch(() => undefined);

    const ring = () => {
      if (closed || context.state !== "running") {
        close();
        return;
      }
      try {
        const now = context.currentTime;
        const master = context.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.085, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
        master.connect(context.destination);

        // Two very short harmonics create the light "plim" confirmation sound.
        const first = context.createOscillator();
        first.type = "sine";
        first.frequency.setValueAtTime(1046.5, now);
        first.connect(master);
        first.start(now);
        first.stop(now + 0.22);

        const second = context.createOscillator();
        const secondGain = context.createGain();
        second.type = "sine";
        second.frequency.setValueAtTime(1568, now);
        secondGain.gain.setValueAtTime(0.42, now);
        secondGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        second.connect(secondGain).connect(master);
        second.start(now + 0.018);
        second.stop(now + 0.25);

        window.setTimeout(close, 420);
      } catch {
        close();
      }
    };

    return {
      cancel: close,
      play: () => {
        if (closed) return;
        if (context.state === "running") {
          ring();
          return;
        }
        void context.resume().then(ring).catch(close);
      },
    };
  } catch {
    return null;
  }
}
