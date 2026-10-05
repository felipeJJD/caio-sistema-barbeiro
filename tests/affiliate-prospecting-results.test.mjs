import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import ts from 'typescript';

test('lista prioriza celulares, guarda indisponíveis e preserva paginação da busca', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://fixture.test/afiliado/prospeccao'});
  const {window} = dom;
  const document = window.document;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const mobile = id => ({id: `mobile-${id}`, name: `Celular ${id}`, phone: `4199999${String(id).padStart(4, '0')}`, phoneE164: `554199999${String(id).padStart(4, '0')}`, phoneKind: 'mobile', whatsappCandidate: true, address: 'Colombo'});
  const fixed = id => ({id: `fixed-${id}`, name: `Fixo ${id}`, phone: `413333${String(id).padStart(4, '0')}`, phoneE164: `55413333${String(id).padStart(4, '0')}`, phoneKind: 'landline', whatsappCandidate: false, address: 'Colombo'});
  const mixed = Array.from({length: 14}, (_, i) => fixed(i + 1));
  for (let i = 1; i <= 12; i++) mixed.splice(i * 2, 0, mobile(i));
  mixed.push({...mobile(99), phoneE164: ''});
  let round = 0;
  const searchRequests = [];
  const fetch = async url => {
    const request = new URL(url, window.location.origin);
    let payload = {};
    if (request.pathname.endsWith('/cities')) payload = {cities: [{id: 1, name: 'Colombo'}]};
    else if (request.pathname.endsWith('/whatsapp')) payload = {state: 'close', connected: false};
    else if (request.pathname.endsWith('/queue')) payload = {jobs: []};
    else if (request.pathname.endsWith('/search')) {
      searchRequests.push(Object.fromEntries(request.searchParams));
      const offset = Number(request.searchParams.get('offset'));
      if (offset === 0) round++;
      if (round === 1) {
        if (offset === 0) payload = {leads: mixed, nextOffset: 40, hasMore: true};
        else if (offset === 40) payload = {leads: [fixed(15), fixed(16)], nextOffset: 80, hasMore: true};
        else if (offset === 80) payload = {leads: [mobile(13), mobile(14)], nextOffset: 120, hasMore: false};
        else assert.fail(`Unexpected offset ${offset}`);
      } else {
        payload = offset === 0
          ? {leads: [fixed(20)], nextOffset: 40, hasMore: true}
          : {leads: [mobile(20)], nextOffset: 80, hasMore: false};
      }
    }
    return Response.json(payload);
  };
  const require = createRequire(import.meta.url);
  const file = path.resolve(new URL('../app/ui/affiliate-prospecting.tsx', import.meta.url).pathname);
  const module = {exports: {}};
  const source = ts.transpile(fs.readFileSync(file, 'utf8'), {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true});
  const localRequire = name => {
    if (name === 'next/link') return {default: ({children}) => React.createElement('a', null, children), __esModule: true};
    if (name.endsWith('.css')) return {default: new Proxy({}, {get: (_, key) => String(key)}), __esModule: true};
    if (name === './brand-logo') return {BrandLogo: () => null};
    if (name === './affiliate-prospecting-audio') return {AffiliateProspectingAudio: () => null, DEFAULT_VOICE_INTRO: ''};
    return require(name);
  };
  vm.runInNewContext(source, {module, exports: module.exports, require: localRequire, window, document, fetch, console, URL, URLSearchParams}, {filename: file});
  const root = createRoot(document.getElementById('root'));
  const settle = () => act(async () => {await new Promise(resolve => setTimeout(resolve, 10));});
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => {
    assert.ok(node, 'control exists');
    await act(async () => node.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true})));
    await settle();
  };
  const search = async () => {
    await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true})));
    await settle();
  };
  const results = () => document.querySelector('[aria-label="Resultados da busca"]');
  const rows = () => [...results().querySelectorAll('button.lead')];
  try {
    await act(async () => root.render(React.createElement(module.exports.AffiliateProspecting, {name: 'Teste', initialWhatsapp: '', signupUrl: 'https://example.test', isAdmin: false})));
    await settle();
    await search();
    assert.equal(rows().length, 10, 'invalid results do not consume the ten visible slots');
    assert.ok(rows().every(row => !row.disabled && row.textContent.includes('Celular')));
    assert.match(results().querySelector('.cardTitle').textContent, /12 disponíveis/);
    assert.equal(results().querySelector('.unavailableLead'), null, 'invalid results start hidden');
    assert.equal(searchRequests.length, 1, 'filtering does not trigger extra searches');
    await click(button('Selecionar celulares visíveis'));
    assert.ok(button('Preparar 10 contatos'), 'only the ten visible mobiles are selected');
    await click(button('Ver indisponíveis (15)'));
    assert.equal(results().querySelectorAll('.unavailableLead').length, 10);
    assert.equal(rows().length, 10, 'opening invalid results does not change the main list');
    await click(button('Ver mais indisponíveis'));
    assert.equal(results().querySelectorAll('.unavailableLead').length, 15);
    assert.equal(searchRequests.length, 1, 'invalid disclosure only reads loaded results');
    await click(button('Ver mais barbearias'));
    assert.equal(rows().length, 12);
    assert.equal(searchRequests.length, 1, 'the remaining valid loaded results appear before requesting another batch');
    await click(button('Ver mais barbearias'));
    assert.equal(rows().length, 12);
    assert.match(results().querySelector('.cardTitle').textContent, /12 disponíveis/);
    assert.ok(button('Ver mais barbearias'), 'an invalid-only batch does not prevent continuation');
    await click(button('Ver mais barbearias'));
    assert.equal(rows().length, 14);
    assert.match(results().querySelector('.cardTitle').textContent, /14 disponíveis/);
    assert.equal(button('Ver mais barbearias'), undefined);
    assert.deepEqual(searchRequests, [0, 40, 80].map(offset => ({city: 'Colombo, PR', offset: String(offset)})), 'original backend offsets and query are preserved');
    await search();
    assert.equal(rows().length, 0);
    assert.match(results().querySelector('.cardTitle').textContent, /0 disponíveis/);
    assert.equal(results().querySelector('.unavailableLead'), null, 'a new search collapses invalid results');
    assert.equal(button('Selecionar celulares visíveis'), undefined);
    assert.match(results().textContent, /Toque em Ver mais barbearias para continuar/);
    await click(button('Ver mais barbearias'));
    assert.equal(rows().length, 1);
    assert.match(results().querySelector('.cardTitle').textContent, /1 disponíveis/);
    assert.equal(searchRequests.at(-1).offset, '40');
  } finally {
    await act(async () => root.unmount());
    window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
