import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync(new URL("../app/ui/team-money-section.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/team-money/closures/[id]/pdf/route.ts", import.meta.url), "utf8");

test("fechamento baixa o arquivo antes de entregar ao navegador", () => {
  assert.match(ui, /fetch\(`\/api\/team-money\/closures\/\$\{id\}\/pdf`/);
  assert.match(ui, /await response\.blob\(\)/);
  assert.match(ui, /new File\(\[blob\], filename, \{ type: "application\/pdf" \}\)/);
  assert.match(ui, /navigator\.share\(shareData\)/);
  assert.match(ui, /new Blob\(\[blob\], \{ type: "application\/octet-stream" \}\)/);
  assert.match(ui, /URL\.createObjectURL\(downloadBlob\)/);
  assert.match(ui, /link\.download = filename/);
  assert.match(ui, />Baixar PDF<\/button>/);
  assert.doesNotMatch(ui, /link\.href = `\/api\/team-money\/closures\/\$\{id\}\/pdf`/);
  assert.doesNotMatch(ui, /window\.location\.assign\(`\/api\/team-money\/closures\/\$\{id\}\/pdf`\)/);
});

test("iPhone recebe opção nativa de salvar ou compartilhar quando suporta arquivos", () => {
  assert.match(ui, /iPad\|iPhone\|iPod/);
  assert.match(ui, /navigator\.canShare\(shareData\)/);
  assert.match(ui, /Salvar em Arquivos/);
});

test("rota do PDF continua protegida e entregando arquivo com nome próprio", () => {
  assert.match(route, /getSessionAccess\(\)/);
  assert.match(route, /getTeamPaymentClosureForAccess\(access, closureId\)/);
  assert.match(route, /"content-type": "application\/pdf"/);
  assert.match(route, /"content-disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(route, /fechamento-\$\{filePart\(snapshot\.teamMember\.name\)\}-\$\{snapshot\.periodEndDate\}\.pdf/);
});
