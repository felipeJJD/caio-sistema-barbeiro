import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import ts from 'typescript';
test('Instagram busca por cidade, pagina, enfileira, copia com fallback e só registra envio confirmado',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'});const {window}=dom;
 globalThis.window=window;globalThis.document=window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const contact={username:'barbearia.teste',name:'Barbearia Teste',city:'São Paulo, SP',status:'ready',queued:false,contactedAt:null};
 const calls=[],copies=[],searches=[];let confirmed=false,clipboardFails=false,fallbackCalls=0,fallbackWorks=true;
 window.confirm=()=>confirmed;window.document.execCommand=()=>{fallbackCalls++;return fallbackWorks;};
 const fetch=async(url,init={})=>{
  if(init.method==='POST'){
   const body=JSON.parse(init.body);calls.push(body);
   if(body.action==='instagram_enqueue'){contact.queued=true;return Response.json({items:[{...contact}],queued:1});}
   if(body.action==='instagram_contacted'){contact.status='contacted';contact.queued=false;}
   if(body.action==='instagram_block'){contact.status='blocked';contact.queued=false;}
   return Response.json({item:{...contact}});
  }
  const path=new URL(url,'https://fixture.test');const params=path.searchParams;
  if(path.pathname.endsWith('/cities'))return Response.json({cities:params.get('uf')==='SP'?[{id:3550308,name:'São Paulo'},{id:3509502,name:'Campinas'}]:[{id:4105805,name:'Colombo'},{id:4106902,name:'Curitiba'}]});
  if(params.get('discover')==='1'){
   searches.push(Object.fromEntries(params));
   return Response.json({items:params.get('offset')==='0'?[{...contact}]:[],displayName:'São Paulo, SP',nextOffset:params.get('offset')==='0'?40:80,hasMore:params.get('offset')==='0',scanned:40,withoutProfile:39,tip:'Fonte pública'});
  }
  const view=params.get('view');const visible=view==='queue'?contact.queued:view==='history'?contact.status!=='ready':true;
  return Response.json({items:visible?[{...contact}]:[],hasMore:false});
 };
 const require=createRequire(import.meta.url),module={exports:{}};
 const file='app/ui/affiliate-instagram-manual.tsx';
 vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}),{module,exports:module.exports,require:name=>name.endsWith('.css')?{default:new Proxy({},{get:(_,key)=>key}),__esModule:true}:name.endsWith('/affiliate-scroll-lock')?{lockAffiliateScroll:()=>{window.document.body.style.position='fixed';return()=>window.document.body.style.removeProperty('position');}}:require(name),window,document:window.document,navigator:{clipboard:{writeText:async text=>{if(clipboardFails)throw Error('denied');copies.push(text);}}},fetch,console,Event:window.Event,Response,URL,URLSearchParams},{filename:file});
 const root=createRoot(window.document.getElementById('root'));const settle=async()=>act(async()=>{await new Promise(r=>setTimeout(r,20));});
 const button=text=>[...window.document.querySelectorAll('button')].find(b=>b.textContent===text);
 const click=async node=>{assert.ok(node);assert.equal(node.disabled,false);await act(async()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));await settle();};
 try{
  await act(async()=>root.render(React.createElement(module.exports.AffiliateInstagramManual,{name:'Kaio',signupUrl:'https://fixture.test/comece?ref=kaio',links:[],campaignId:null,onChooseCampaign(){}})));await settle();
  assert.equal(button('Salvar perfil'),undefined,'manual registration is not the primary flow');
  const selectors=[...window.document.querySelectorAll('form select')];
  const choose=async(node,value)=>{const props=Object.keys(node).find(key=>key.startsWith('__reactProps$'));await act(async()=>node[props].onChange({target:{value}}));await settle();};
  assert.equal(selectors[0].querySelectorAll('option').length,27);assert.equal(selectors[1].value,'Colombo');
  await choose(selectors[0],'SP');assert.equal(selectors[1].value,'','changing state clears the old city');assert.equal(window.document.querySelector('form button').disabled,true);
  assert.deepEqual([...selectors[1].options].map(x=>x.value),['','São Paulo','Campinas']);
  await choose(selectors[1],'São Paulo');assert.equal(window.document.querySelector('form button').disabled,false);
  await act(async()=>window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();
  assert.equal(searches[0].city,'São Paulo');assert.equal(searches[0].uf,'SP');assert.equal(searches[0].offset,'0');assert.equal(calls.length,0,'search does not enqueue/send');
  await click(button('Buscar mais barbearias'));assert.equal(searches[1].offset,'40');assert.equal(searches[1].city,'São Paulo');assert.equal(searches[1].uf,'SP');assert.equal(window.document.querySelectorAll('input[type=checkbox]').length,1);
  await click(window.document.querySelector('input[type=checkbox]'));await click(button('Colocar 1 na fila'));
  assert.equal(calls[0].action,'instagram_enqueue');assert.equal(calls[0].items[0].username,'barbearia.teste');
  await click(button('Fila de abordagens'));await click(window.document.querySelector('button.row'));
  assert.equal(window.document.querySelector('dialog').open,true);assert.equal(window.document.body.style.position,'fixed');
  assert.equal(window.document.querySelectorAll('textarea').length,1,'one editable ready message');
  await click(button('Copiar mensagem com meu link'));assert.match(copies[0],/Barbearia Teste/);assert.match(copies[0],/ref=kaio/);assert.equal(calls.length,1,'copy does not send');
  clipboardFails=true;await click(button('Copiar mensagem com meu link'));assert.equal(fallbackCalls,1,'clipboard rejection retries legacy copy');
  fallbackWorks=false;await click(button('Copiar mensagem com meu link'));assert.match(window.document.querySelector('[role=alert]').textContent,/selecionada/);assert.equal(window.document.querySelector('textarea').selectionEnd,window.document.querySelector('textarea').value.length);
  const link=window.document.querySelector('.actions a');assert.equal(link.href,'https://www.instagram.com/barbearia.teste/');assert.match(link.rel,/noopener/);
  await click(button('Já enviei o direct'));assert.equal(calls.length,1,'cancelled confirmation cannot register delivery');
  confirmed=true;await click(button('Já enviei o direct'));assert.equal(calls[1].action,'instagram_contacted');assert.ok(!button('Já enviei o direct'));assert.equal(window.document.querySelectorAll('button.row').length,0);
  await click(button('Não contatar mais'));assert.equal(calls[2].action,'instagram_block');assert.equal(button('Copiar mensagem com meu link').disabled,true);
  await click(button('Fechar ficha'));assert.equal(window.document.body.style.position,'');
 }finally{await act(async()=>root.unmount());window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
