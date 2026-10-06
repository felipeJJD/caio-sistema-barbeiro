import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','0.0.0.0','-p',process.env.PORT||'3000'],{stdio:'inherit'});
let worker,stopping=false,restart;
function runWorker(){if(stopping)return;worker=spawn(process.execPath,['scripts/instagram-worker.mjs'],{stdio:'inherit'});worker.on('exit',()=>{if(!stopping)restart=setTimeout(runWorker,10000);});}
if(process.env.PROSPECCAO_INSTAGRAM_SESSION_KEY)runWorker();
function stop(signal='SIGTERM'){if(stopping)return;stopping=true;clearTimeout(restart);server.kill(signal);worker?.kill(signal);const timer=setTimeout(()=>{server.kill('SIGKILL');worker?.kill('SIGKILL');},75000);timer.unref();}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop('SIGINT'));server.on('exit',code=>{stop();process.exitCode=code||0;});
