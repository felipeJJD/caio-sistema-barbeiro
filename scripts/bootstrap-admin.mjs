import { pbkdf2Sync, randomBytes } from 'node:crypto';

// Startup-only provisioning; never resets an existing account.
export async function bootstrapAdmin(db, { email, password, name = 'Administrador', organization = 'Caio Barbearia' }) {
  if ((await db.prepare('SELECT COUNT(*) AS count FROM auth_accounts').first()).count > 0) return false;
  if (!email || !password) return false;
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) throw new Error('Invalid initial administrator configuration');
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
  await db.batch([
    db.prepare("UPDATE organizations SET name = ?, status = 'active', trial_ends_at = NULL WHERE id = 1").bind(organization),
    db.prepare("INSERT INTO team (organization_id, name, role, login_email, access_role, platform_admin, commission_cents, commission_rate_bps, active) VALUES (1, ?, 'Administrador', ?, 'owner', 1, 0, 0, 1)").bind(name, email),
    db.prepare('INSERT INTO auth_accounts (organization_id, team_member_id, email, password_hash, password_salt, password_iterations, email_verified_at) SELECT 1, id, ?, ?, ?, 100000, CURRENT_TIMESTAMP FROM team WHERE login_email = ?').bind(email, hash, salt, email),
    db.prepare("INSERT INTO services (organization_id, name, price_cents) VALUES (1, 'Corte', 3000), (1, 'Barba', 3000), (1, 'Corte + barba', 5500)"),
    db.prepare("INSERT INTO payment_methods (organization_id, name, fee_bps) VALUES (1, 'Dinheiro', 0), (1, 'Pix', 0), (1, 'Débito', 0), (1, 'Crédito', 0)"),
  ]);
  return true;
}
