import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../lib/affiliate-summary.js", import.meta.url);

test("resumo da prospecção filtra contagens e nomes pelo prospector atual", async () => {
  const summarySource = await readFile(sourceUrl, "utf8");

  assert.match(summarySource, /normalizeProspectorKey\(owner\)/);
  assert.equal((summarySource.match(/prospector_key = \$1/g) || []).length, 2);
  assert.match(summarySource, /COALESCE\(SUM\(reply_count\), 0\) AS received/);
  assert.match(summarySource, /LIMIT 5/);
  assert.match(summarySource, /received: Number/);
});
