// Keep one capture session for consecutive voice notes. An idle track stays
// disabled for a short time, then is stopped to avoid leaving the mic open.
export function createHelpMicrophone(
  request: () => Promise<MediaStream>,
  onReadyChange: (ready: boolean) => void,
  idleMilliseconds = 60_000,
) {
  let stream: MediaStream | null = null;
  let pending: Promise<MediaStream> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function release() {
    generation++;
    clearIdleTimer();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    pending = null;
    onReadyChange(false);
  }

  async function acquire() {
    clearIdleTimer();
    if (stream && stream.getAudioTracks().some((track) => track.readyState === "live")) {
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      onReadyChange(false);
      return stream;
    }
    if (stream) release();
    if (pending) return pending;
    const currentGeneration = generation;
    const requestPromise = request().then((captured) => {
      if (generation !== currentGeneration) {
        captured.getTracks().forEach((track) => track.stop());
        throw new DOMException("Microphone request cancelled", "AbortError");
      }
      stream = captured;
      return captured;
    });
    pending = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (pending === requestPromise) pending = null;
    }
  }

  function idle() {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    onReadyChange(true);
    clearIdleTimer();
    idleTimer = setTimeout(release, idleMilliseconds);
  }

  return { acquire, idle, release };
}
