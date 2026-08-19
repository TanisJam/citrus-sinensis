/* Viento (W5). El sistema de resortes es lo único con estado de la pieza, y
   el test de identidad del bucle corre con prefers-reduced-motion, así que no
   lo cubre. Acá se verifica lo que sí puede romperse:
     1. Que en pe < 0.05 el árbol esté en reposo TOTAL con el viento activo.
        Si no, el bucle deja de ser invisible (§3.1).
     2. Que nada diverja: la amplitud tiene que quedar acotada y no crecer.
   Corre sobre el motor de la app React:  node test-wind.js                   */
const {loadEngine}=require('./engine-under-test');

function run(pTarget,frames,windOn){
  const moves=[];                       // una entrada por translate(), por frame
  let cur=null;
  const grad={addColorStop:()=>{}};
  const ctx=new Proxy({},{
    get(t,k){
      if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>grad;
      if(k==='measureText') return ()=>({width:50});
      if(typeof k!=='string') return undefined;
      if(k in t) return t[k];
      if(k==='translate') return (x,y)=>{cur.push(x,y);};
      return ()=>{};
    },
    set(t,k,v){t[k]=v;return true;}
  });
  const noop=()=>{};
  const mk=ds=>({style:{setProperty:noop},dataset:ds||{},
    classList:{toggle:noop,add:noop,remove:noop},getContext:()=>ctx,
    setAttribute:noop,addEventListener:noop,textContent:'',innerHTML:''});
  const bd=[[0,0.048],[0.085,0.165],[0.195,0.262],[0.315,0.400],[0.440,0.510],[0.560,0.622]];
  global.document={getElementById:()=>mk(),
    querySelectorAll:s=>s==='.band'?bd.map(b=>mk({from:String(b[0]),to:String(b[1])})):[],
    documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:()=>mk()};
  global.window=global;global.innerWidth=1440;global.innerHeight=900;
  global.devicePixelRatio=2;
  /* OJO: `pTarget` es una fracción de SCROLL, no de `pe`. El motor la pasa por
     `sToP`, que reparte de forma no lineal, así que scroll 0.50 no cae en
     pe 0.50. Si se cambian los pesos del reparto, los conteos que imprime este
     test se mueven — y eso es correcto, no una regresión: lo que el test afirma
     es que el viento queda ACOTADO y que el bucle sigue en reposo. */
  global.scrollY=pTarget*(16000-900);
  global.matchMedia=()=>({matches:!windOn});   // windOn=false ⇒ REDUCED
  global.scrollTo=noop;
  const L={};global.addEventListener=(e,f)=>{L[e]=f;};
  let n=0,pending=null;
  global.performance={now:()=>1000+n*16};      // 62.5 fps, dt estable
  global.requestAnimationFrame=f=>{pending=f;};
  loadEngine()({canvas:mk(),bands:bd.map(b=>({from:b[0],to:b[1],el:mk()}))});
  L.scroll();
  for(let i=0;i<frames;i++){
    n++;cur=[];
    const f=pending;pending=null;f(performance.now());
    moves.push(cur);
  }
  return moves;
}

let bad=0;

/* ---- 1. reposo en la zona espejo del bucle, con viento activo ---- */
for(const p of [0.010,0.030,0.048]){
  const m=run(p,40,true);
  const a=m[25],b=m[39];
  const same=a.length===b.length&&a.every((v,i)=>v===b[i]);
  console.log('pe='+p.toFixed(3)+' con viento  →  '+(same?'EN REPOSO':'SE MUEVE')+
    '  ('+(a.length>>1)+' elementos)');
  if(!same) bad++;
}

/* ---- 2. la amplitud queda acotada y no crece ----
   La ráfaga tiene período 2π/0.42 ≈ 15 s = 935 frames a 62.5 fps. Hay que
   comparar períodos COMPLETOS: dos ventanas cortas caen en fases distintas de
   la misma ráfaga y parecen divergencia sin serlo. */
const PER=935, WARM=400;
console.log('');
for(const p of [0.50,0.62,0.78]){
  const m=run(p,WARM+PER*2,true);
  const slots=m[0].length;
  const span=(s,f0,f1)=>{let lo=1e9,hi=-1e9;
    for(let f=f0;f<f1;f++){const v=m[f][s];if(v<lo)lo=v;if(v>hi)hi=v;}return hi-lo;};
  let amp=0,ampA=0,ampB=0;
  for(let s=0;s<slots;s++){
    const a=span(s,WARM,WARM+PER), b=span(s,WARM+PER,WARM+PER*2);
    if(a>ampA)ampA=a; if(b>ampB)ampB=b; if(a>amp)amp=a;
  }
  const grow=ampB/Math.max(1e-6,ampA);
  const ok=slots>0&&amp<60&&grow<1.15&&isFinite(amp);
  console.log('pe='+p.toFixed(2)+'  '+(slots>>1)+' elementos · amplitud máx '+amp.toFixed(2)+
    ' px · ráfaga 2 / ráfaga 1 = '+grow.toFixed(3)+'  →  '+(ok?'ACOTADO':'DIVERGE'));
  if(!ok) bad++;
}

console.log(bad? '\n'+bad+' comprobaciones fallan'
               : '\nEl viento sopla y se asienta: nada diverge y el bucle sigue en reposo.');
