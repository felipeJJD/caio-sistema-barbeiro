import test from 'node:test';
import assert from 'node:assert/strict';
import {profilesFromPlaces} from '../lib/instagram-discovery.js';
test('Instagram discovery uses every explicit social URL, ignores publications, other cities and fake domains, and does not require a phone',()=>{
 const places=[
  {name:'Sem telefone',socials:['https://facebook.com/123','https://www.instagram.com/Shop.ONE/?igsh=abc'],websites:[],addresses:[{locality:'Colombo',country:'BR'}]},
  {name:'Duplicada',websites:['http://instagram.com/shop.one/']},
  {name:'Site como Instagram',websites:['https://www.instagram.com/shop.two/']},
  {name:'Link do fornecedor',websites:['https://instagram.com/titular.consultoria/']},
  {name:'Outra cidade',socials:['https://www.instagram.com/other/'],addresses:[{locality:'Curitiba',country:'BR'}]},
  {name:'Ruim',socials:['https://instagram.com/p/abc','https://instagram.com.evil.test/user','https://facebook.com/123','@guess','https://instagram.com/direct/']}
 ];
 const results=profilesFromPlaces(places,'Colombo, PR');
 assert.deepEqual(results.map(x=>x.username),['shop.one','shop.two']);
 assert.equal(results[0].name,'Sem telefone');assert.equal(results[0].city,'Colombo, PR');assert.equal(results[0].sourceUrl,'https://www.instagram.com/shop.one/');
});
