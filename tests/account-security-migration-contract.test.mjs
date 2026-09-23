import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("0048 é aditiva e está registrada no journal", async () => {
  const migration = await read("drizzle/0048_verified_account_creation.sql");
  const journal = await read("drizzle/meta/_journal.json");
  assert.match(migration, /CREATE TABLE `pending_registrations`/);
  assert.match(migration, /CREATE TABLE `deleted_team_members`/);
  assert.doesNotMatch(migration, /DROP TABLE/);
  assert.match(journal, /0048_verified_account_creation/);
});
