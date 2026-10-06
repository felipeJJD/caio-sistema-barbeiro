import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';

export function instagramKey(){
 const value=process.env.PROSPECCAO_INSTAGRAM_SESSION_KEY||'';
 if(!/^[a-f0-9]{64}$/i.test(value))throw Object.assign(Error('A conexão do Instagram ainda não foi configurada.'),{status:503});
 return Buffer.from(value,'hex');
}
export function sealSession(owner,session){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',instagramKey(),iv);
 cipher.setAAD(Buffer.from(owner));
 const body=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
export function openSession(owner,value){
 const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',instagramKey(),bytes.subarray(0,12));
 decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(bytes.subarray(12,28));
 return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
}
// Credentials are sent only through stdin, never command arguments, files or logs.
export function instagramOperation(input){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.PROSPECCAO_INSTAGRAM_PYTHON||'python3',[path.join(process.cwd(),'scripts/instagram-account.py')],{stdio:['pipe','pipe','ignore']});
  let output='',done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,code:'timeout',uncertain:input.action==='send',error:'O Instagram não confirmou a operação. Confira a conversa antes de tentar novamente.'});},65000);
  child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>512000){child.kill('SIGKILL');finish({ok:false,code:'invalid',uncertain:input.action==='send',error:'Não foi possível confirmar a resposta do Instagram.'});}});
  child.on('error',()=>{clearTimeout(timer);if(!done){done=true;reject(Object.assign(Error('A conexão do Instagram está indisponível.'),{status:503}));}});
  child.on('close',()=>{if(done)return;try{finish(JSON.parse(output));}catch{finish({ok:false,code:'invalid',uncertain:input.action==='send',error:'Não foi possível confirmar a resposta do Instagram.'});}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
 });
}
