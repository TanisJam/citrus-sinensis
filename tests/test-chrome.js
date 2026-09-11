const {loadEngine}=require('./engine-under-test');
/* ============ el viraje de la marca y la navegación ============
   `sampleChrome` lee una fila del lienzo ya pintado y decide, por lado, si la
   marca y la navegación van en tinta o en hueso. Acá el lienzo es una fila
   sintética —un gris a la izquierda, otro a la derecha— y se afirma lo que el
   motor REPORTA por `onHud`: el umbral, la histéresis alrededor de 0.42, y que
   los dos lados deciden por su cuenta. */
const noop=()=>{};let L=0,R=0;                 // L, R: luma 0..1 de cada mitad de la fila
const ctx=new Proxy({},{get(t,k){
  if(k==='getImageData') return (x,y,w)=>{const d=new Uint8ClampedArray(w*4);
    for(let i=0;i<w;i++) d[i*4]=d[i*4+1]=d[i*4+2]=Math.round(255*(i<w/2?L:R));return {data:d};};
  if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:noop});
  if(k==='measureText') return ()=>({width:50});
  return typeof k==='string'&&k in t?t[k]:noop;},set(t,k,v){t[k]=v;return true;}});
const mk=()=>({style:{setProperty:noop},dataset:{},classList:{toggle:noop},getContext:()=>ctx,setAttribute:noop,addEventListener:noop});
global.document={getElementById:()=>mk(),querySelectorAll:()=>[],documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:mk};
global.window=global;global.innerWidth=1440;global.innerHeight=900;global.devicePixelRatio=1;global.scrollY=0;
global.matchMedia=()=>({matches:true});global.scrollTo=noop;global.addEventListener=noop;
global.performance={now:()=>1000};let pending=null;global.requestAnimationFrame=f=>{pending=f;};
const hud={};loadEngine()({canvas:mk(),bands:[],onHud:d=>Object.assign(hud,d)});
// Nueve cuadros: el muestreo corre uno de cada ocho, así que al menos uno lee la fila nueva.
const at=(l,r)=>{L=l;R=r;for(let i=0;i<9;i++){const f=pending;pending=null;f(1000);}return hud.brandDark+'/'+hud.navDark;};
const check=(got,want,why)=>{if(got!==want){console.error('FALLA: '+why+' — esperaba '+want+', dio '+got);process.exit(1);}console.log('ok  '+why+' → '+got);};
check(at(0.80,0.80),'false/false','cielo claro: tinta a los dos lados');
check(at(0.41,0.41),'false/false','0.41 no cruza: sigue en tinta (histéresis)');
check(at(0.30,0.30),'true/true','tierra en sombra: hueso a los dos lados');
check(at(0.44,0.44),'true/true','0.44 no vuelve: sigue en hueso (histéresis)');
check(at(0.50,0.50),'false/false','0.50 vuelve a tinta');
check(at(0.20,0.80),'true/false','sol a la derecha: cada lado decide solo');
console.log('La marca y la navegación viran con lo que tienen debajo, y no antes.');
