// Restarts an unexpected worker exit without restarting the web server.
export function superviseWorker({ name, launch, schedule = setTimeout, cancel = clearTimeout, log = console.error, maxDelayMs = 60_000 }) {
  let child;
  let timer;
  let stopped = false;
  let failures = 0;
  let startedAt = 0;
  function retry(code) {
    if (stopped) return;
    if (Date.now() - startedAt >= 300_000) failures = 0;
    const delayMs = Math.min(maxDelayMs, 1_000 * 2 ** Math.min(failures++, 6));
    log('[worker-supervisor]', { worker: name, event: 'restart-scheduled', code, delayMs });
    timer = schedule(start, delayMs);
  }
  function start() {
    if (stopped) return;
    startedAt = Date.now();
    let handled = false;
    const exited = code => { if (!handled) { handled = true; retry(code); } };
    try {
      child = launch();
      child.once('error', () => exited('spawn-error'));
      child.once('exit', code => exited(code ?? 'signal'));
    } catch { exited('spawn-error'); }
  }
  start();
  return { stop(signal = 'SIGTERM') { stopped = true; if (timer) cancel(timer); child?.kill(signal); } };
}
