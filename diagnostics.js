(function(){
  'use strict';
  const KEY='app-diagnostics-queue-v1', MAX=40;
  let client=null, appCode='unknown', version='1', currentUserId=null, flushing=false;
  const originalFetch=window.fetch.bind(window);
  function clean(value){
    return String(value||'Falha sem mensagem').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[documento]')
      .replace(/\b\+?\d[\d\s().-]{8,}\d\b/g,'[telefone]')
      .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token]')
      .slice(0,500);
  }
  function readQueue(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return[]}}
  function writeQueue(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)))}catch(_){}}
  function pathOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href)}catch(_){return null}}
  function queue(entry){
    const rows=readQueue(), now=Date.now(), signature=[entry.source,entry.code,entry.path,entry.message].join('|');
    if(rows.some(x=>x.signature===signature&&now-x.at<60000))return;
    rows.push({...entry,at:now,signature});writeQueue(rows);
    if(client&&currentUserId)flush();
  }
  async function flush(){
    if(flushing||!client||!currentUserId||!navigator.onLine)return;
    flushing=true;
    try{
      const rows=readQueue();if(!rows.length)return;
      const batch=rows.slice(0,20).map(x=>({
        user_id:currentUserId,app_code:appCode,severity:x.severity||'error',
        source:x.source||'javascript',message:clean(x.message),error_code:x.code||null,
        http_status:x.status||null,request_path:x.path||null,app_version:version,
        user_agent:navigator.userAgent.slice(0,300)
      }));
      const {error}=await client.from('app_error_logs').insert(batch);
      if(!error)writeQueue(rows.slice(batch.length));
    }catch(_){/* O diagnóstico nunca pode interromper o aplicativo. */}
    finally{flushing=false}
  }
  window.__appDiagnostics={
    attach(sb,code,ver){client=sb;appCode=code;version=ver||'1';sb.auth.onAuthStateChange((_event,session)=>{currentUserId=session?.user?.id||null;if(currentUserId)setTimeout(flush,0)});sb.auth.getSession().then(({data})=>{currentUserId=data?.session?.user?.id||null;if(currentUserId)flush()}).catch(()=>{});},
    report(error,source='manual',severity='error'){
      queue({source,severity,message:clean(error?.message||error),code:error?.code||error?.name||null});
    },
    flush
  };
  window.fetch=async function(input,init){
    const url=pathOf(input), started=Date.now();
    try{
      const response=await originalFetch(input,init), elapsed=Date.now()-started;
      if(url&&/\.supabase\.co$/i.test(url.hostname)&&!url.pathname.includes('/app_error_logs')){
        if(!response.ok)queue({source:'supabase_http',message:'Falha em requisição ao Supabase',code:'HTTP_'+response.status,status:response.status,path:url.pathname,severity:response.status>=500?'critical':'error'});
        else if(elapsed>=8000)queue({source:'performance',message:'Requisição ao Supabase demorou '+elapsed+' ms',code:'SLOW_REQUEST',status:response.status,path:url.pathname,severity:'warning'});
      }
      return response;
    }catch(error){
      if(url&&/\.supabase\.co$/i.test(url.hostname)&&!url.pathname.includes('/app_error_logs'))queue({source:'network',message:'Falha de rede ao acessar o Supabase',code:error?.name||'NETWORK_ERROR',path:url.pathname,severity:'critical'});
      throw error;
    }
  };
  window.addEventListener('error',event=>{
    if(event?.message)queue({source:'javascript',message:clean(event.message),code:'UNCAUGHT_ERROR',severity:'critical'});
    else if(event?.target?.src)queue({source:'asset',message:'Falha ao carregar recurso do aplicativo',code:'RESOURCE_LOAD_ERROR',path:pathOf(event.target.src)?.pathname||null});
  },true);
  window.addEventListener('unhandledrejection',event=>{
    queue({source:'promise',message:clean(event?.reason?.message||event?.reason),code:event?.reason?.code||'UNHANDLED_REJECTION',severity:'critical'});
  });
  window.addEventListener('online',()=>setTimeout(flush,1000));
})();