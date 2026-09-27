"use client";

import { useCallback, useEffect, useRef } from "react";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

async function playSplashSignature(interactive: boolean) {
  if (typeof window === "undefined") return false;
  if (!interactive && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return false;

  const context = new AudioContextConstructor();
  try {
    let resumeResult: Promise<boolean> | null = null;
    if (context.state !== "running") {
      if (!interactive) {
        void context.close().catch(() => undefined);
        return false;
      }
      resumeResult = Promise.race([
        context.resume().then(() => true).catch(() => false),
        new Promise<false>((resolve) => window.setTimeout(() => resolve(false), 900)),
      ]);
    }

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.062, now + 0.075);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);
    master.connect(context.destination);

    const sweep = context.createOscillator();
    const sweepGain = context.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(170, now);
    sweep.frequency.exponentialRampToValueAtTime(510, now + 0.48);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.42, now + 0.07);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);
    sweep.connect(sweepGain).connect(master);
    sweep.start(now);
    sweep.stop(now + 0.56);

    const notes = [
      { frequency: 1046.5, start: 0.27, level: 0.62 },
      { frequency: 1318.5, start: 0.39, level: 0.52 },
      { frequency: 1568, start: 0.52, level: 0.46 },
    ];
    notes.forEach(({ frequency, start, level }, index) => {
      const tone = context.createOscillator();
      const toneGain = context.createGain();
      tone.type = index === 0 ? "triangle" : "sine";
      tone.frequency.setValueAtTime(frequency, now + start);
      toneGain.gain.setValueAtTime(0.0001, now + start);
      toneGain.gain.exponentialRampToValueAtTime(level, now + start + 0.025);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.43);
      tone.connect(toneGain).connect(master);
      tone.start(now + start);
      tone.stop(now + start + 0.46);
    });

    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(2350, now + 0.58);
    shimmer.frequency.exponentialRampToValueAtTime(2900, now + 0.88);
    shimmerGain.gain.setValueAtTime(0.0001, now + 0.58);
    shimmerGain.gain.exponentialRampToValueAtTime(0.18, now + 0.64);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.98);
    shimmer.connect(shimmerGain).connect(master);
    shimmer.start(now + 0.58);
    shimmer.stop(now + 1.0);

    if (resumeResult && !(await resumeResult)) {
      void context.close().catch(() => undefined);
      return false;
    }
    window.setTimeout(() => void context.close().catch(() => undefined), 1250);
    return true;
  } catch {
    await context.close().catch(() => undefined);
    return false;
  }
}

export function AppLoadingScreen({ intro = false, onComplete }: { intro?: boolean; onComplete?: () => void }) {
  const completionTimer = useRef<number | null>(null);

  const finishAfterOpening = useCallback(() => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    completionTimer.current = window.setTimeout(() => onComplete?.(), 2100);
  }, [onComplete]);

  useEffect(() => {
    if (!intro) return;

    let active = true;
    let gestureArmed = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const trySoundOnGesture = () => {
      if (!active) return;
      gestureArmed = false;
      void playSplashSignature(true);
    };

    finishAfterOpening();

    if (!reducedMotion) {
      void playSplashSignature(false).then((played) => {
        if (!active || played) return;
        gestureArmed = true;
        window.addEventListener("pointerdown", trySoundOnGesture, { once: true, capture: true });
      });
    }

    return () => {
      active = false;
      if (gestureArmed) window.removeEventListener("pointerdown", trySoundOnGesture, { capture: true });
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    };
  }, [intro, finishAfterOpening]);

  return (
    <div
      className={"app-loading-screen" + (intro ? " app-loading-intro" : "")}
      role="status"
      aria-live="polite"
      aria-label="Carregando o Cortou Anotou"
    >
      <div className="app-loading-tech" aria-hidden="true">
        <i className="app-loading-tech-ring app-loading-tech-ring-one" />
        <i className="app-loading-tech-ring app-loading-tech-ring-two" />
        <i className="app-loading-tech-scan" />
      </div>

      <div className="app-loading-content">
        <div className="app-loading-ca" aria-hidden="true">
          <b className="app-loading-letter-c">C</b>
          <i />
          <b className="app-loading-letter-a">A</b>
        </div>
        <p className="app-loading-name">CORTOU <strong>ANOTOU</strong></p>
        <small>AGENDA E GESTÃO PARA BARBEARIAS</small>
        <div className="app-loading-track" aria-hidden="true"><i /></div>
        <p className="app-loading-copy">Carregando<span aria-hidden="true">...</span></p>
      </div>

      <div className="app-loading-signature">
        <span>CORTOU ANOTOU · VERSÃO 1.0</span>
        <strong>BY KAIO</strong>
      </div>
    </div>
  );
}
