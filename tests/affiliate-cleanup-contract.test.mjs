import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("afiliado só exclui link sem histórico e nunca exclui o link principal", async () => {
  const database = await read("db/affiliate-portal.ts");
  const route = await read("app/api/affiliate/dashboard/route.ts");
  const ui = await read("app/ui/affiliate-portal.tsx");

  assert.match(database, /deleteOwnUnusedAffiliateLink/);
  assert.match(database, /O link principal não pode ser excluído/);
  assert.match(database, /notExists\(referralExists\)/);
  assert.match(database, /notExists\(commissionExists\)/);
  assert.match(database, /já possui indicação ou comissão/);
  assert.match(route, /body\.action === "delete-link"/);
  assert.match(ui, /!link\.isMain && link\.referrals === 0 && link\.earnedCents === 0/);
  assert.match(ui, /Excluir “\$\{link\.label\}”/);
});

test("arquivar indicação só muda a visualização e preserva histórico e comissão", async () => {
  const database = await read("db/affiliate-portal.ts");
  const route = await read("app/api/affiliate/dashboard/route.ts");
  const ui = await read("app/ui/affiliate-portal.tsx");
  const migration = await read("drizzle/0049_affiliate_cleanup.sql");

  assert.match(database, /affiliate_referral_archives/);
  assert.match(database, /setOwnReferralArchived/);
  assert.match(database, /innerJoin\(affiliateLinks/);
  assert.match(route, /body\.action === "set-referral-archived"/);
  assert.match(ui, /Arquivadas \(\{archivedShops\.length\}\)/);
  assert.match(ui, /Indicação restaurada/);
  assert.match(ui, /Indicação arquivada/);
  assert.match(migration, /CREATE TABLE `affiliate_referral_archives`/);
});
