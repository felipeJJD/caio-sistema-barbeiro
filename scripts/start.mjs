import { spawn } from 'node:child_process';
import { superviseWorker } from './worker-supervisor.mjs';
import { getStorage } from '../runtime/storage.mjs';
import { bootstrapAdmin } from './bootstrap-admin.mjs';

await bootstrapAdmin(getStorage().DB, {
  email: process.env.INITIAL_ADMIN_EMAIL,
  password: process.env.INITIAL_ADMIN_PASSWORD,
  name: process.env.INITIAL_ADMIN_NAME,
  organization: process.env.INITIAL_ORGANIZATION_NAME,
});
delete process.env.INITIAL_ADMIN_PASSWORD;

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000'], { stdio: 'inherit' });
const workers = [];
// Operations may pause workers through configuration while the site stays online.
if (process.env.PROSPECTING_WORKER_PAUSED !== 'true') {
  workers.push(superviseWorker({ name: 'prospecting', launch: () => spawn(process.execPath, ['scripts/prospecting-worker.mjs'], { stdio: 'inherit' }) }));
}
if (process.env.WHATSAPP_WORKER_PAUSED !== 'true' && String(process.env.WHATSAPP_JOB_SECRET || '').trim().length >= 24) {
  workers.push(superviseWorker({ name: 'whatsapp', launch: () => spawn(process.execPath, ['scripts/whatsapp-worker.mjs'], { stdio: 'inherit' }) }));
}
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const worker of workers) worker.stop(signal);
    child.kill(signal);
  });
}
child.on('exit', code => {
  for (const worker of workers) worker.stop();
  process.exit(code ?? 1);
});
