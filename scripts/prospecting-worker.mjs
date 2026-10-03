const secret=String(process.env.WHATSAPP_JOB_SECRET||'').trim();
const port=String(process.env.PORT||'3000');
let stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(secret.length>=24 && process.env.AFFILIATE_PROSPECTING_URL) {
  await wait(15000);
  while(!stopping) {
    try {const response=await fetch(`http://127.0.0.1:${port}/api/affiliate/prospecting/jobs`,{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)});
      if(!response.ok)console.error('[prospecting-worker]',{event:'poll_failed',status:response.status});
    }catch(error){console.error('[prospecting-worker]',{event:'poll_failed',type:error.name});}
    await wait(3000);
  }
}
