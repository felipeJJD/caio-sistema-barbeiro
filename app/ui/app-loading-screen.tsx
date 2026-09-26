"use client";

import { useEffect } from "react";

const SPLASH_SOUND_KEY = "cortou-anotou:splash-sound-played";

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

async function playSplashSignature() {
  if (typeof window === "undefined") return false;
  if (window.sessionStorage.getItem(SPLASH_SOUND_KEY) === "1") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return false;

  const context = new AudioContextConstructor();
  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      await context.close().catch(() => undefined);
      return false;
    }

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.032, now + 0.07);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
    master.connect(context.destination);

    const sweep = context.createOscillator();
    const sweepGain = context.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(210, now);
    sweep.frequency.exponentialRampToValueAtTime(560, now + 0.46);
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.7, now + 0.08);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    sweep.connect(sweepGain).connect(master);
    sweep.start(now);
    sweep.stop(now + 0.52);

    const chime = context.createOscillator();
    const chimeGain = context.createGain();
    chime.type = "triangle";
    chime.frequency.setValueAtTime(920, now + 0.34);
    chime.frequency.exponentialRampToValueAtTime(1380, now + 0.64);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.33);
    chimeGain.gain.exponentialRampToValueAtTime(0.82, now + 0.39);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
    chime.connect(chimeGain).connect(master);
    chime.start(now + 0.33);
    chime.stop(now + 0.8);

    window.sessionStorage.setItem(SPLASH_SOUND_KEY, "1");
    window.setTimeout(() => void context.close().catch(() => undefined), 1000);
    return true;
  } catch {
    await context.close().catch(() => undefined);
    return false;
  }
}

export function AppLoadingScreen({ intro = false }: { intro?: boolean }) {
  useEffect(() => {
    let active = true;
    let listeningForGesture = false;

    const onFirstGesture = () => {
      listeningForGesture = false;
      void playSplashSignature();
    };

    void playSplashSignature().then((played) => {
      if (!played && active) {
        listeningForGesture = true;
        window.addEventListener("pointerdown", onFirstGesture, { once: true, capture: true });
      }
    });

    return () => {
      active = false;
      if (listeningForGesture) window.removeEventListener("pointerdown", onFirstGesture, true);
    };
  }, []);

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
