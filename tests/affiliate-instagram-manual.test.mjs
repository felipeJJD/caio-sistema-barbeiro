import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import ts from 'typescript';
test('Instagram manual copia e abre perfil sem fingir envio; registro exige confirmação',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'});const {window}=dom;globalThis.window=window;globalThis.document=window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const contact={username:'barbearia.teste',name:'Barbearia Teste',city:'Colombo',status:'ready',contactedAt:null};const calls=[],copies=[];let confirmed=false;
 window.confirm=()=>confirmed;
 const fetch=async(url,init={})=>{if(init.method==='POST'){const body=JSON.parse(init.body);calls.push(body);if(body.action==='instagram_contacted')contact.status='contacted';if(body.action==='instagram_block')contact.status='blocked';return Response.json({item:{...contact}});}return Response.json({items:[{...contact}],hasMore:false});};
 const require=createRequire(import.meta.url),module={exports:{}};
 const path='app/ui/affiliate-instagram-manual.tsx';
 vm.runInNewContext(ts.transpile(fs.readFileSync(path,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}),{module,exports:module.exports,require:name=>name.endsWith('.css')?{default:new Proxy({},{get:(_,key)=>key}),__esModule:true}:require(name),window,document:window.document,navigator:{clipboard:{writeText:async text=>copies.push(text)}},fetch,console,Event:window.Event,Response},{filename:path});
 const root=createRoot(window.document.getElementById('root'));const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,20));});const button=text=>[...window.document.querySelectorAll('button')].find(b=>b.textContent===text);
 const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));await settle();};
 try{
  await act(async()=>root.render(React.createElement(module.exports.AffiliateInstagramManual,{name:'Kaio',signupUrl:'https://fixture.test/comece?ref=kaio',links:[],campaignId:null,onChooseCampaign(){}})));await settle();
  await click(window.document.querySelector('button.row'));await click(button('Copiar mensagem com meu link'));
  assert.match(copies[0],/Barbearia Teste/);assert.match(copies[0],/ref=kaio/);assert.equal(calls.length,0);
  const link=window.document.querySelector('.actions a');assert.equal(link.href,'https://www.instagram.com/barbearia.teste/');assert.match(link.rel,/noopener/);
  await click(button('Já enviei o direct'));assert.equal(calls.length,0,'cancelled confirmation cannot register delivery');
  confirmed=true;await click(button('Já enviei o direct'));assert.equal(calls[0].action,'instagram_contacted');assert.ok(!button('Já enviei o direct'));
  await click(button('Não contatar mais'));assert.equal(calls[1].action,'instagram_block');assert.equal(button('Copiar mensagem com meu link').disabled,true);
 }finally{await act(async()=>root.unmount());window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
