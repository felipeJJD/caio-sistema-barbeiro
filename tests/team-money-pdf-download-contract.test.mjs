import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync(new URL("../app/ui/team-money-section.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/team-money/closures/[id]/pdf/route.ts", import.meta.url), "utf8");

test("fechamento oferece download sem navegar a tela atual para o PDF", () => {
  assert.match(ui, /document\.createElement\("a"\)/);
  assert.match(ui, /link\.download = ""/);
  assert.match(ui, /link\.href = `\/api\/team-money\/closures\/\$\{id\}\/pdf`/);
  assert.match(ui, />Baixar PDF<\/button>/);
  assert.doesNotMatch(ui, /window\.location\.assign\(`\/api\/team-money\/closures\/\$\{id\}\/pdf`\)/);
});

test("rota do PDF continua forçando arquivo para download com nome próprio", () => {
  assert.match(route, /"content-type": "application\/pdf"/);
  assert.match(route, /"content-disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(route, /fechamento-\$\{filePart\(snapshot\.teamMember\.name\)\}-\$\{snapshot\.periodEndDate\}\.pdf/);
});
