import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedBridge } from '../lib/bridge-auth.js';
import { hashAccessCode } from '../lib/access.js';
process.env.PROSPECCAO_ACCESS_CODE='unit-test-access-code-not-real';
async function signed({owner='affiliate:42',path='/api/queue',body='{"action":"enqueue"}',timestamp=String(Date.now())}={}){
 const canonical=[timestamp,'POST',path,owner,'Luiz',await hashAccessCode(body)].join('\n');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.PROSPECCAO_ACCESS_CODE),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonical))).toString('hex');
 return new Request('https://example.test'+path,{method:'POST',body,headers:{'x-ca-bridge-time':timestamp,'x-ca-bridge-signature':signature,'x-ca-prospector-key':owner,'x-ca-prospector-name':'Luiz'}});
}
test('requisição do servidor é aceita; cookie de prévia sozinho não autoriza',async()=>{
 assert.equal(await authorizedBridge(await signed()),true);
 assert.equal(await authorizedBridge(new Request('https://example.test/api/queue',{method:'POST',body:'{}',headers:{cookie:'ca_prospeccao_access=any'}})),false);
});
test('alterar afiliado, corpo ou URL invalida a assinatura',async()=>{
 const original=await signed();const headers=new Headers(original.headers);headers.set('x-ca-prospector-key','affiliate:43');
 assert.equal(await authorizedBridge(new Request(original.url,{method:'POST',body:await original.clone().text(),headers})),false);
 assert.equal(await authorizedBridge(new Request(original.url,{method:'POST',body:'{"action":"lease"}',headers:original.headers})),false);
 assert.equal(await authorizedBridge(new Request('https://example.test/api/claims',{method:'POST',body:await original.clone().text(),headers:original.headers})),false);
});
test('assinatura expirada é rejeitada',async()=>assert.equal(await authorizedBridge(await signed({timestamp:String(Date.now()-360000)})),false));
