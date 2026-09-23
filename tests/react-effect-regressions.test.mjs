import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicBooking = await readFile(new URL("../app/ui/public-booking-app.tsx", import.meta.url), "utf8");
const teamMoney = await readFile(new URL("../app/ui/team-money-section.tsx", import.meta.url), "utf8");

test("busca de mensalista limpa resultados curtos no evento de digitação, não no effect", () => {
  assert.match(publicBooking, /function updateMembershipLookupName\(value: string\)/);
  assert.match(publicBooking, /if \(value\.trim\(\)\.length < 3\) \{\s*setMembershipCandidates\(\[\]\);\s*setMembershipSearchPending\(false\);\s*\}/s);
  assert.match(publicBooking, /if \(query\.length < 3\) return;/);
  assert.doesNotMatch(publicBooking, /if \(query\.length < 3\) \{\s*setMembershipCandidates/s);
});

test("Minha Grana carrega de forma assíncrona no effect e mantém recarga após alterações", () => {
  assert.match(teamMoney, /async function fetchTeamMoneyData\(\)/);
  assert.match(teamMoney, /useEffect\(\(\) => \{[\s\S]*?void fetchTeamMoneyData\(\)\s*\.then/s);
  assert.doesNotMatch(teamMoney, /useEffect\(\(\) => \{\s*void load\(\);\s*\}/);
  assert.match(teamMoney, /if \(ok\) \{\s*setEditing\(null\);\s*await load\(\);/s);
  assert.match(teamMoney, /if \(ok\) \{\s*if \(editing\?\.id === entry\.id\) setEditing\(null\);\s*await load\(\);/s);
});
