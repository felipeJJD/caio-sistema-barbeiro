import { spawn } from 'node:child_process';
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
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
