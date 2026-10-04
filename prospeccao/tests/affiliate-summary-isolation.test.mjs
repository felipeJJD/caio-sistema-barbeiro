import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../lib/affiliate-claims.js", import.meta.url);

test("resumo da prospecção filtra contagens e nomes pelo prospector atual", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("export async function getClaimSummary");
  assert.ok(start >= 0, "getClaimSummary precisa existir");
  const summarySource = source.slice(start);

  assert.match(summarySource, /normalizeProspectorKey\(owner\)/);
  assert.equal((summarySource.match(/prospector_key = \$1/g) || []).length, 2);
  assert.match(summarySource, /COALESCE\(SUM\(reply_count\), 0\) AS received/);
  assert.match(summarySource, /LIMIT 5/);
  assert.match(summarySource, /received: Number/);
});
