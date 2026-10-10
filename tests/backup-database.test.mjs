import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotDatabase } from '../scripts/backup-database.mjs';
test('consistent snapshot restores committed WAL rows and refuses overwrite',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ca-snapshot-fixture-'));const source=join(dir,'source.sqlite');const target=join(dir,'restore.sqlite');const db=new DatabaseSync(source);
 try {db.exec("PRAGMA journal_mode=WAL; CREATE TABLE fixture(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO fixture VALUES(1,'fixture');");
 assert.deepEqual(snapshotDatabase(source,target),{verified:true});
 const restored=new DatabaseSync(target,{readOnly:true});try{assert.equal(restored.prepare('SELECT name FROM fixture').get().name,'fixture');}finally{restored.close();}
 assert.equal(statSync(target).mode & 0o777,0o600);assert.throws(()=>snapshotDatabase(source,target),/new file/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
