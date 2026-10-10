import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { superviseWorker } from '../scripts/worker-supervisor.mjs';
test('worker restart backs off and shutdown cancels retry without touching web', () => {
  const children=[]; const retries=[];const cancelled=[];
  const worker=superviseWorker({name:'fixture',launch:()=>{const c=new EventEmitter();c.kill=signal=>c.signal=signal;children.push(c);return c;},schedule:(fn,ms)=>{retries.push({fn,ms});return retries.length;},cancel:id=>cancelled.push(id),log:()=>{}});
  children[0].emit('exit',1);assert.equal(retries[0].ms,1000);
  retries[0].fn();children[1].emit('exit',0);assert.equal(retries[1].ms,2000);
  worker.stop();assert.deepEqual(cancelled,[2]);assert.equal(children[1].signal,'SIGTERM');
  retries[1].fn();assert.equal(children.length,2);
});
test('spawn error and subsequent exit schedule exactly one restart',()=>{
 const c=new EventEmitter();c.kill=()=>{};let attempts=0;
 const worker=superviseWorker({name:'fixture',launch:()=>c,schedule:()=>++attempts,log:()=>{},cancel:()=>{}});
 c.emit('error',Error('fixture'));c.emit('exit',1);assert.equal(attempts,1);worker.stop();
});
