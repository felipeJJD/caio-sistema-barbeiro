import 'server-only';
import { getStorage } from './storage.mjs';

// Keep server bindings lazy: builds must never open or create the live database.
export const env = {
  ...process.env,
  get DB() { return getStorage().DB; },
  get BUCKET() { return getStorage().BUCKET; },
};
