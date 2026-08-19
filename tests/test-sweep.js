const {loadEngine}=require('./engine-under-test');
/* La lista era a mano y estaba incompleta: le faltaba `bezierCurveTo`, que usa
   `ribbon` para las ramas, y el barrido moria en el primer frame con arbol —o
   sea que hacia anios que no barria nada. Un doble de prueba que no implementa
   lo que el codigo llama no prueba: rompe.
   Sigue siendo una lista explicita y no un Proxy que devuelva cualquier cosa,
   porque la gracia de este test es justamente reventar cuando el motor empieza
   a usar una primitiva nueva — pero ahora reventar es la excepcion y no el
   comportamiento normal. */
const M=['fillRect','beginPath','moveTo','lineTo','closePath','fill','stroke','arc','ellipse',
'save','restore','clip','translate','rotate','setTransform','quadraticCurveTo','scale',
'clearRect','fillText','measureText','setLineDash','rect','bezierCurveTo','arcTo',
'drawImage','transform','resetTransform','getTransform','strokeRect','roundRect'];
const noop=()=>{}; const grad={addColorStop:noop}; let calls=0;
const ctx={createLinearGradient:()=>grad,createRadialGradient:()=>grad,
  measureText:()=>({width:50}),
  // La matriz identidad alcanza: lo que el motor lee de aca es una POSICION, y
  // este test mide que el barrido no explote, no donde cae cada cosa.
  getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0})};
for(const m of M) if(!ctx[m]) ctx[m]=(...a)=>{calls++;};
const mk=ds=>({style:{setProperty:noop},dataset:ds||{},
  classList:{toggle:noop,add:noop,remove:noop},getContext:()=>ctx,
  setAttribute:noop,addEventListener:noop,textContent:'',innerHTML:''});
const bandDefs=[[0,0.048],[0.085,0.165],[0.195,0.262],[0.315,0.400],[0.440,0.510],[0.560,0.622]];
global.document={getElementById:()=>mk(),
  querySelectorAll:s=>s==='.band'?bandDefs.map(b=>mk({from:String(b[0]),to:String(b[1])})):[],
  documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:()=>mk()};
global.window=global; global.innerWidth=1440; global.innerHeight=900;
global.devicePixelRatio=2; global.scrollY=0;
global.matchMedia=()=>({matches:false});
let wraps=[];
global.scrollTo=(x,y)=>{wraps.push(y/(16000-900));global.scrollY=y;};
const L={};
global.addEventListener=(ev,fn)=>{L[ev]=fn;};
let n=0,pending=null,ms=[],peak=0;
global.performance={now:()=>1000+n*16};
global.requestAnimationFrame=fn=>{pending=fn;};
loadEngine()({canvas:mk(),bands:bandDefs.map(b=>({from:b[0],to:b[1],el:mk()}))});

const MAX=16000-900;
let err=null,frames=0;
try{
  for(let i=0;i<2400;i++){
    global.scrollY=Math.min(MAX,global.scrollY+MAX/2000);
    // mover el mouse durante el barrido para ejercitar la selección
    if(L.pointermove) L.pointermove({clientX:(0.2+0.6*Math.abs(Math.sin(i/180)))*1440});
    L.scroll();
    n++;const fn=pending;pending=null;
    const s=calls,a=process.hrtime.bigint();
    fn(performance.now());
    ms.push(Number(process.hrtime.bigint()-a)/1e6);
    peak=Math.max(peak,calls-s);frames++;
  }
}catch(e){err=e;}
if(err){console.log('ERROR:',err.message);console.log(err.stack.split('\n').slice(1,3).join('\n'));}
else{
  const sorted=[...ms].sort((a,b)=>a-b);
  console.log('barrido OK ·',frames,'frames');
  console.log('js-ms mediana',sorted[frames>>1].toFixed(2),'| p95',sorted[Math.floor(frames*0.95)].toFixed(2),'| max',sorted[frames-1].toFixed(2));
  console.log('pico ctx-calls/frame',peak);
  console.log('wraps:',wraps.length,'→ aterriza en p =',wraps.map(v=>v.toFixed(4)).join(','));
}
