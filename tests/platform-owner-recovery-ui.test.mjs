import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints:['app/ui/platform-owner-password.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'] });
async function setup({ verified=false, blocked=false, hasPassword=true }={}) {
  const dom = new JSDOM('<div id="root"></div>',{url:'https://example.invalid',pretendToBeVisual:true});
  const { window }=dom;
  const names=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];
  const previous=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  for(const [name,value] of Object.entries({window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  const module={exports:{}};
  vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require,console});
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(window.document.getElementById('root'));
  const saves=[];let sends=0;
  await act(async()=>root.render(React.createElement(module.exports.PlatformOwnerPassword,{shop:{name:'Fixture',ownerEmail:'owner@example.invalid',ownerEmailVerified:verified,ownerHasPassword:hasPassword,isBlocked:blocked},pending:false,onSave:async password=>{saves.push(password);return true;},onSendEmail:async()=>{sends++;return true;}})));
  return {window,document:window.document,saves,get sends(){return sends;},click:async node=>act(async()=>node.click()),fill:async(node,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));}),submit:async()=>act(async()=>window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))),cleanup:async()=>{await act(async()=>root.unmount());dom.window.close();for(const name of names){if(previous[name]) Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name];}}};
}
test('pending owner has clickable reset and confirmation controls and saving keeps confirmation guidance',async()=>{
  const ui=await setup();
  try{
    const buttons=[...ui.document.querySelectorAll('section>div>button')];
    assert.equal(buttons[0].disabled,false);
    assert.equal(buttons[1].textContent,'Reenviar confirmação');
    await ui.click(buttons[0]);
    const inputs=ui.document.querySelectorAll('form input');
    assert.equal(inputs.length,2);
    await ui.fill(inputs[0],'fixture-password');
    await ui.fill(inputs[1],'different-password');
    await ui.submit();
    assert.equal(ui.saves.length,0);
    assert.match(ui.document.querySelector('[role="status"]').textContent,/precisam ser iguais/);
    await ui.fill(inputs[1],'fixture-password');
    await ui.submit();
    assert.deepEqual(ui.saves,['fixture-password']);
    assert.equal(ui.document.querySelector('form'),null);
    assert.match(ui.document.querySelector('[role="status"]').textContent,/ainda precisa confirmar/);
    await ui.click(buttons[1]);
    assert.equal(ui.sends,1);
    assert.match(ui.document.querySelector('[role="status"]').textContent,/owner@example.invalid/);
  }finally{await ui.cleanup();}
});
test('blocked and missing-login owners remain unavailable; confirmed owners get recovery link control',async()=>{
  for(const options of [{blocked:true},{hasPassword:false},{verified:true}]){
    const ui=await setup(options);
    try{
      const buttons=[...ui.document.querySelectorAll('section>div>button')];
      assert.equal(buttons[0].disabled,!options.verified);
      assert.equal(buttons[1].disabled,!options.verified);
      if(options.verified) assert.equal(buttons[1].textContent,'Enviar link de recuperação');
    }finally{await ui.cleanup();}
  }
});
