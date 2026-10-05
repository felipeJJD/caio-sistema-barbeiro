import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';
import {lockAffiliateScroll} from '../lib/affiliate-scroll-lock.ts';

// Component integration in a simulated DOM. No browser session or live API is used.
test('menu fecha no item atual, URLs selecionam a tela certa e progresso abre os detalhes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test/afiliado/prospeccao?tab=progress'});
 const {window}=dom;const document=window.document;
 globalThis.window=window;globalThis.document=document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let restoredPosition;
 Object.defineProperty(window,'scrollY',{configurable:true,value:460});
 window.scrollTo=(x,y)=>{restoredPosition={x,y};};window.confirm=()=>true;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const subscribe=cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb);};
 const push=href=>{window.history.pushState({},'',href);window.dispatchEvent(new window.PopStateEvent('popstate'));};
 const router={push,refresh(){}};
 const navigation={useSearchParams(){React.useSyncExternalStore(subscribe,()=>window.location.href);return new URLSearchParams(window.location.search);},useRouter:()=>router};
 function Link({href,onClick,children,...props}){return React.createElement('a',{...props,href,onClick:event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();push(href);}}},children);}
 let unavailable=false,connected=true;const mutations=[];
 const contact={key:'phone:5541999990001',name:'Barbearia Teste',phoneE164:'5541999990001',city:'Colombo, PR',status:'contacted',contactedAt:'2026-10-05T20:00:00Z',respondedAt:'2026-10-05T20:01:00Z',lastInboundMessage:'Pode mandar sim',lastOutboundMessage:'Posso apresentar o sistema?',replyCount:1};
 const jobs=[{id:'00000000-0000-0000-0000-000000000001',key:contact.key,name:contact.name,phoneE164:contact.phoneE164,status:'sent',delivery:'delivered'}, {id:'00000000-0000-0000-0000-000000000002',key:'phone:5541999990002',name:'Barbearia Na Fila',phoneE164:'5541999990002',status:'pending',approachMode:'audio_only'}];
 const fetch=async(url,init={})=>{let payload={};let status=200;
  if(url.includes('/whatsapp')){payload={state:connected?'open':'close',connected,connectionMessage:connected?'Seu WhatsApp está conectado.':'O WhatsApp removeu o aparelho vinculado.',phone:'5541999990099'};if(unavailable){status=503;payload={error:'Consulta indisponível'};}}
  else if(url.includes('/queue'))payload={jobs};
  else if(url.includes('/summary'))payload={contacted:1,received:1};
  else if(url.includes('/cities'))payload={cities:[{id:1,name:'Colombo'}]};
  else if(url.includes('/claims')){if(init.method==='POST'){const body=JSON.parse(init.body);mutations.push(body);if(body.action==='interested')contact.qualification='interested';payload={item:contact};}else payload={items:[contact],hasMore:false,nextOffset:50};}
  return Response.json(payload,{status});
 };
 const require=createRequire(import.meta.url);const cache=new Map();
 function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const source=ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true});
  const localRequire=name=>{if(name==='next/link')return {default:Link,__esModule:true};if(name==='next/navigation')return navigation;if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)}),__esModule:true};if(name.startsWith('.')){const base=path.resolve(path.dirname(file),name);const target=['','.tsx','.ts'].map(ext=>base+ext).find(candidate=>fs.existsSync(candidate));if(!target)throw Error('Missing '+name);return load(target);}return require(name);};
  vm.runInNewContext(source,{module,exports:module.exports,require:localRequire,window,document,fetch,console,process,setTimeout,clearTimeout,Event:window.Event,FormData:window.FormData,URL,URLSearchParams,AbortController,TextEncoder,Intl,Response,navigator:window.navigator},{filename:file});return module.exports;
 }
 const repo=path.resolve(new URL('..',import.meta.url).pathname);
 const {AffiliateAppShell}=load(path.join(repo,'app/ui/affiliate-app-shell.tsx'));
 const {AffiliateProspectingWorkspace}=load(path.join(repo,'app/ui/affiliate-prospecting-workspace.tsx'));
 const {AffiliatePortal}=load(path.join(repo,'app/ui/affiliate-portal.tsx'));
 const dashboard={month:'2026-10',profile:{name:'Teste Afiliado',whatsapp:'41999990099'},summary:{},links:[],shops:[],payouts:[]};
 function App(){const params=navigation.useSearchParams();const workspace=window.location.pathname.includes('prospeccao');const section=workspace?params.get('tab')==='progress'?'progress':params.get('tab')==='settings'?'settings':'prospecting':params.get('view')==='links'?'links':'home';return React.createElement(AffiliateAppShell,{name:'Teste Afiliado',section,workspace},workspace?React.createElement(AffiliateProspectingWorkspace,{name:'Teste Afiliado',initialWhatsapp:'41999990099',signupUrl:'https://example.test',isAdmin:false}):React.createElement(AffiliatePortal,{initialData:dashboard}));}
 const root=createRoot(document.getElementById('root'));
 const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
 const click=async node=>{assert.ok(node,'control exists');await act(async()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));await settle();};
 const menu=async label=>{
  await click(document.querySelector('[aria-label="Abrir menu do afiliado"]'));
  const originalUrl=window.location.href;
  await click([...document.querySelectorAll('aside a')].find(node=>node.textContent.includes(label)));
  assert.ok(document.querySelector('aside.drawerClosing'),'drawer stays mounted for the exit');
  assert.equal(window.location.href,originalUrl,'navigation waits for the exit');
  assert.equal(document.body.style.position,'fixed','background stays fixed during the exit');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,450));});
  assert.equal(document.querySelector('aside'),null,'drawer closes after the exit');
  assert.equal(document.body.style.position,'','page unlocks after closing');
 };
 try {
  await act(async()=>root.render(React.createElement(App)));await settle();
  assert.equal(document.querySelector('div.panel:not([hidden])').querySelector('h2').textContent,'Contatos e mensagens');
  await click([...document.querySelectorAll('button.contactRow')].find(node=>node.textContent.includes(contact.name)));
  assert.equal(document.querySelector('dialog').open,true);assert.match(document.querySelector('dialog').textContent,/Pode mandar sim/);
  assert.equal(document.body.style.position,'fixed');assert.equal(document.body.style.top,'-460px');assert.equal(document.documentElement.style.overflow,'hidden');
  assert.equal(document.querySelector('dialog a').href,'https://wa.me/5541999990001');
  await click(button('Sim, tem interesse'));assert.equal(mutations[0].action,'interested');assert.match(document.querySelector('dialog').textContent,/Tem interesse/);
  await click(document.querySelector('[aria-label="Fechar detalhes"]'));
  assert.equal(document.body.style.position,'');assert.deepEqual(restoredPosition,{x:0,y:460});
  await click([...document.querySelectorAll('.metrics button')].find(node=>node.textContent.includes('Na fila')));
  await click([...document.querySelectorAll('button.contactRow')].find(node=>node.textContent.includes('Barbearia Na Fila')));
  assert.match(document.querySelector('dialog').textContent,/Na fila/);assert.match(document.querySelector('dialog').textContent,/Somente áudio/);
  await click(document.querySelector('[aria-label="Fechar detalhes"]'));
  await menu('Progresso');assert.equal(window.location.search,'?tab=progress');
  await menu('WhatsApp e abordagem');assert.equal(window.location.search,'?tab=settings');assert.match(document.querySelector('div.panel:not([hidden])').textContent,/Meu WhatsApp/);
  unavailable=true;await act(async()=>window.dispatchEvent(new window.Event('focus')));await settle();
  assert.match(document.querySelector('div.panel:not([hidden])').textContent,/SEM CONSULTA/);assert.doesNotMatch(document.querySelector('div.panel:not([hidden])').textContent,/DESCONECTADO/);
  unavailable=false;connected=false;await act(async()=>window.dispatchEvent(new window.Event('focus')));await settle();
  assert.match(document.querySelector('div.panel:not([hidden])').textContent,/removeu o aparelho/);assert.ok(button('Conectar meu WhatsApp'));
  await menu('Gerar links');assert.equal(window.location.pathname,'/afiliado');assert.equal(window.location.search,'?view=links');assert.ok(document.querySelector('.affiliate-create-link-card'));
  await menu('Resumo');assert.ok(document.querySelector('.affiliate-stat-grid'));await menu('Resumo');assert.ok(document.querySelector('.affiliate-stat-grid'));
  window.matchMedia=()=>({matches:true});
  await click(document.querySelector('[aria-label="Abrir menu do afiliado"]'));
  await click(document.querySelector('aside [aria-label="Fechar menu"]'));
  assert.equal(document.querySelector('aside'),null,'reduced motion closes without waiting');
 } finally {await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

test('bloqueios sobrepostos preservam posição e estilos até a última janela fechar',()=>{
 const dom=new JSDOM('<main>Página de teste</main>');
 const {window}=dom;const document=window.document;
 globalThis.window=window;globalThis.document=document;
 Object.defineProperty(window,'scrollY',{value:320});
 document.body.style.position='relative';document.body.style.width='85%';
 document.body.style.setProperty('overflow','auto','important');
 document.documentElement.style.overflow='scroll';document.documentElement.style.scrollBehavior='smooth';
 let restores=0;
 window.scrollTo=(x,y)=>{assert.equal(x,0);assert.equal(y,320);assert.equal(document.documentElement.style.scrollBehavior,'auto');restores++;};
 try {
  const releaseFirst=lockAffiliateScroll();const releaseSecond=lockAffiliateScroll();
  releaseFirst();releaseFirst();
  assert.equal(document.body.style.position,'fixed');assert.equal(document.body.style.top,'-320px');assert.equal(restores,0);
  releaseSecond();releaseSecond();
  assert.equal(restores,1);assert.equal(document.body.style.position,'relative');assert.equal(document.body.style.width,'85%');
  assert.equal(document.body.style.getPropertyPriority('overflow'),'important');assert.equal(document.body.style.overflow,'auto');
  assert.equal(document.documentElement.style.overflow,'scroll');assert.equal(document.documentElement.style.scrollBehavior,'smooth');
 } finally {dom.window.close();delete globalThis.window;delete globalThis.document;}
});
