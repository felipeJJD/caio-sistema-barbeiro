import test from 'node:test';
import assert from 'node:assert/strict';
import { isClearOptOut } from '../lib/opt-out.js';
import { normalizePhoneE164 } from '../lib/funnel-records.js';
test('só bloqueia frases claras de recusa, não dúvidas nem pedidos normais',()=>{
 for(const text of ['não quero','não tenho interesse obrigado','retire meu número','remova o meu contato','pare de me mandar mensagens'])assert.equal(isClearOptOut(text),true,text);
 for(const text of ['não quero perder os horários','não quero cancelar','não tenho interesse em outra agenda mas quero conhecer','como funciona?'])assert.equal(isClearOptOut(text),false,text);
});
test('telefone de lead exige DDD válido e celular com nono dígito',()=>{
 assert.equal(normalizePhoneE164('5541999999999'),'5541999999999');
 assert.equal(normalizePhoneE164('5500999999999'),'');
 assert.equal(normalizePhoneE164('5541322222222'),'');
});
