import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("lixeira compacta dos convites é montada somente para proprietário autenticado", async () => {
  const page = await read("app/page.tsx");
  const trash = await read("app/ui/invite-history-trash.tsx");
  assert.match(page, /sessionAccess\.isOwner && <InviteHistoryTrash/);
  assert.match(trash, /\.invite-history \.invite-list > \.invite-row/);
  assert.match(trash, /Excluir convite/);
  assert.match(trash, /O funcionário continuará cadastrado e o histórico dele será preservado/);
});
