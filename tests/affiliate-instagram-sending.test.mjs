import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}),{module,exports:module.exports,require:name=>name in mocks?mocks[name]:require(name),Request,Response,URL,URLSearchParams,AbortSignal,AbortController,setTimeout,clearTimeout,console,...globals},{filename:file});return module.exports;}
test('Instagram sender API usa sessão e link do afiliado e rejeita origem externa',async()=>{
 const calls=[],prefix='../'.repeat(6);let active=true;
 const api=load('app/api/affiliate/prospecting/instagram/sending/route.ts',{
  [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active,affiliateId:42,name:'Teste'})},
  [prefix+'db/affiliate-portal']:{getAffiliateDashboard:async()=>({links:[{id:1,active:true,isMain:true,url:'https://cortouanotou.com.br/comece?ref=owner42'},{id:2,active:false,url:'https://cortouanotou.com.br/comece?ref=disabled'}]})},
  [prefix+'lib/request-origin']:{validAppOrigin:request=>request.headers.get('origin')==='https://cortouanotou.com.br'},
  [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:access=>({prospectorKey:`affiliate:${access.affiliateId}`}),affiliateProspectingFetch:async(path,options)=>{calls.push({path,options});return {response:{status:200},payload:{ok:true}};}}
 });
 const post=(body,origin='https://cortouanotou.com.br')=>api.POST(new Request('https://cortouanotou.com.br/api/affiliate/prospecting/instagram/sending',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 assert.equal((await post({action:'start',usernames:['barber'],template:'Oi {link}',prospectorKey:'affiliate:99',link:'https://evil.invalid',campaignId:null})).status,200);
 assert.equal(calls[0].options.prospectorKey,'affiliate:42');assert.equal(calls[0].options.body.link,'https://cortouanotou.com.br/comece?ref=owner42');assert.ok(!('prospectorKey' in calls[0].options.body));
 assert.equal((await post({action:'start',usernames:['barber'],template:'Oi',campaignId:2})).status,400);
 assert.equal((await post({action:'connect',username:'@me',password:'fixture'},'https://evil.invalid')).status,403);
 assert.equal((await post({action:'connect',username:'@me',password:''})).status,400);
 assert.equal((await post({action:'start',usernames:Array(41).fill('barber'),template:'Oi'})).status,400);
 assert.equal((await post({action:'start',usernames:[{}],template:'Oi'})).status,400);
 assert.equal(calls.length,1);active=false;assert.equal((await api.GET()).status,401);assert.equal((await post({action:'pause',batchId:'fixture'})).status,401);assert.equal(calls.length,1);
});
test('Instagram sender UI exige conexão, selecionados e confirmação, protege senha e pausa a fila',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'}),{window}=dom;
 globalThis.window=window;globalThis.document=window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let confirmed=false,changes=0,refused=true;const posts=[];
 window.confirm=()=>confirmed;
 let state={enabled:true,connection:{username:'',status:'disconnected',error:''},batch:null};
 const fetch=async(url,options={})=>{
  if(options.method!=='POST')return Response.json(state);
  const body=JSON.parse(options.body);posts.push(body);
  if(body.action==='connect'&&refused)return Response.json({error:'O Instagram recusou esta tentativa de conexão.',code:'access_denied',reference:'IG-FIXTURE'},{status:422});
  if(body.action==='connect')state={...state,connection:{username:'fixture.sender',status:'connected',error:''}};
  if(body.action==='start')state={...state,batch:{id:'fixture-id',status:'running',reason:'',sender:'fixture.sender',items:[{username:'barber',name:'Barber',status:'pending',error:'',confirmed:false}]}};
  if(body.action==='pause')state={...state,batch:{...state.batch,status:'paused'}};
  return Response.json(state);
 };
 const api=load('app/ui/affiliate-instagram-sender.tsx',{'./affiliate-instagram-manual.module.css':{default:new Proxy({},{get:(_,key)=>key}),__esModule:true}},{window,document:window.document,fetch});
 const root=createRoot(window.document.getElementById('root'));
 const props={name:'Kaio',signupUrl:'https://cortouanotou.com.br/comece?ref=fixture',links:[],campaignId:null,onChooseCampaign(){},selectedUsernames:[],showQueue:true,onChanged(){changes++;}};
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 const button=text=>[...window.document.querySelectorAll('button')].find(node=>node.textContent===text);
 const click=async node=>{assert.ok(node);assert.equal(node.disabled,false);await act(async()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));await settle();};
 const change=async(node,value)=>{const key=Object.keys(node).find(value=>value.startsWith('__reactProps$'));await act(async()=>node[key].onChange({target:{value}}));};
 try{
  await act(async()=>root.render(React.createElement(api.AffiliateInstagramSender,props)));await settle();
  assert.equal(button('Enviar para 0 barbearia(s)').disabled,true);
  await click(button('Conectar meu Instagram'));
  const fields=window.document.querySelectorAll('form input');assert.equal(fields[1].type,'password');
  await change(fields[0],'https://www.instagram.com/fixture.sender/');await change(fields[1],'fixture-password');
  await act(async()=>window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.equal(posts[0].action,'connect');assert.match(window.document.querySelector('[role=alert]').textContent,/IG-FIXTURE/);assert.ok(!window.document.querySelector('[role=alert]').textContent.includes('pausados'));
  assert.equal(posts.length,1,'refusal does not trigger an automatic retry');assert.equal(window.document.querySelector('input[type=password]').value,'fixture-password');
  const verify=window.document.querySelector('form a');assert.equal(verify.href,'https://www.instagram.com/');assert.match(verify.rel,/noopener/);
  refused=false;await act(async()=>window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.equal(window.document.querySelector('input[type=password]'),null);
  await act(async()=>root.render(React.createElement(api.AffiliateInstagramSender,{...props,selectedUsernames:['barber']})));await settle();
  await click(button('Enviar para 1 barbearia(s)'));assert.equal(posts.length,2,'cancelled send does not enqueue');
  confirmed=true;await click(button('Enviar para 1 barbearia(s)'));assert.equal(posts[2].action,'start');assert.deepEqual(posts[2].usernames,['barber']);assert.equal(posts[2].campaignId,null);assert.ok(!('password' in posts[2]));assert.match(posts[2].template,/\{link\}/);
  assert.match(window.document.body.textContent,/Aguardando envio/);assert.ok(!window.document.body.textContent.includes('fixture-password'));
  await click(button('Pausar envios'));assert.equal(posts[3].action,'pause');assert.equal(posts[3].batchId,'fixture-id');assert.ok(button('Continuar envios'));assert.ok(changes>=3);
 }finally{await act(async()=>root.unmount());window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
