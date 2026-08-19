const {loadEngine}=require('./engine-under-test');
// Captura la secuencia de llamadas de dibujo en una posición dada de scroll.
function capture(pTarget){
  const log=[];
  const grad={addColorStop:(o,c)=>log.push('gs|'+o.toFixed(3)+'|'+c)};
  const ctx=new Proxy({},{
    get(t,k){
      if(k==='createLinearGradient'||k==='createRadialGradient')
        return (...a)=>{log.push(k+'|'+a.map(v=>v.toFixed(1)).join(','));return grad;};
      if(k==='measureText') return ()=>({width:50});
      if(typeof k!=='string') return undefined;
      if(k in t) return t[k];
      return (...a)=>log.push(k+'|'+a.map(v=>typeof v==='number'?v.toFixed(2):String(v)).join(','));
    },
    set(t,k,v){log.push('SET '+k+'='+v);t[k]=v;return true;}
  });
  const noop=()=>{};
  const mk=ds=>({style:{setProperty:noop},dataset:ds||{},
    classList:{toggle:noop},getContext:()=>ctx,setAttribute:noop,
    addEventListener:noop,textContent:'',innerHTML:''});
  const bd=[[0,0.048],[0.085,0.165],[0.195,0.262],[0.315,0.400],[0.440,0.510],[0.560,0.622]];
  global.document={getElementById:()=>mk(),
    querySelectorAll:s=>s==='.band'?bd.map(b=>mk({from:String(b[0]),to:String(b[1])})):[],
    documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:()=>mk()};
  global.window=global;global.innerWidth=1440;global.innerHeight=900;
  global.devicePixelRatio=2;
  const MAX=16000-900;
  global.scrollY=pTarget*MAX;
  global.matchMedia=()=>({matches:true});   // REDUCED: p salta directo a target, sin viento
  global.scrollTo=noop;
  const L={};global.addEventListener=(e,f)=>{L[e]=f;};
  let n=0,pending=null;
  global.performance={now:()=>1000};        // tiempo congelado → sin animación ambiente
  global.requestAnimationFrame=f=>{pending=f;};
  loadEngine()({canvas:mk(),bands:bd.map(b=>({from:b[0],to:b[1],el:mk()}))});
  L.scroll();
  for(let i=0;i<4;i++){const f=pending;pending=null;log.length=0;f(1000);}
  return log;
}
let bad=0;
for(const off of [0.002,0.010,0.020,0.030,0.040,0.048]){
  const a=capture(off), b=capture(0.95+off);
  const same = a.length===b.length && a.every((v,i)=>v===b[i]);
  console.log('p='+off.toFixed(3)+' vs p='+(0.95+off).toFixed(3)+
    '  →  '+(same?'IDÉNTICO':'DISTINTO')+'  ('+a.length+' vs '+b.length+' llamadas)');
  if(!same){
    bad++;
    for(let i=0;i<Math.max(a.length,b.length);i++)
      if(a[i]!==b[i]){console.log('   primera diferencia @'+i+':\n     A: '+a[i]+'\n     B: '+b[i]);break;}
  }
}
console.log(bad? '\n'+bad+' posiciones divergen' : '\nEl bucle es invisible: el final renderiza exactamente el inicio.');
