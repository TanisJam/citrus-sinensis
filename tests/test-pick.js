const {loadEngine}=require('./engine-under-test');
/* ============ elegir la fruta y la etiqueta del proyecto ============
   `pick(i)` es la unica eleccion que la pieza acepta desde afuera: cambia el
   proyecto de ESTA vuelta y salta antes de la ventana de seleccion. La etiqueta
   del proyecto se enciende recien con la fruta abierta y se apaga antes de la
   suelta. Se afirma lo que el motor REPORTA por `onHud` y por `state()`. */
const noop=()=>{};
const ctx=new Proxy({},{get(t,k){
  if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:noop});
  if(k==='measureText') return ()=>({width:50});
  return typeof k==='string'&&k in t?t[k]:noop;},set(t,k,v){t[k]=v;return true;}});
const mk=()=>({style:{setProperty:noop},dataset:{},classList:{toggle:noop},getContext:()=>ctx,setAttribute:noop,addEventListener:noop});
global.document={getElementById:()=>mk(),querySelectorAll:()=>[],documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:mk};
global.window=global;global.innerWidth=1440;global.innerHeight=900;global.devicePixelRatio=1;global.scrollY=0;
global.matchMedia=()=>({matches:true});const L={};global.addEventListener=(e,f)=>{L[e]=f;};
global.scrollTo=(x,y)=>{global.scrollY=y;};
global.performance={now:()=>1000};let pending=null;global.requestAnimationFrame=f=>{pending=f;};
const hud={};const eng=loadEngine()({canvas:mk(),bands:[],onHud:d=>Object.assign(hud,d)});
const run=n=>{for(let i=0;i<n;i++){const f=pending;pending=null;f(1000);}};
const go=u=>{global.scrollY=u*(16000-900);L.scroll();run(4);};
const check=(got,want,why)=>{if(got!==want){console.error('FALLA: '+why+' — esperaba '+want+', dio '+got);process.exit(1);}console.log('ok  '+why+' → '+got);};
run(1);
check(hud.project,0,'la vuelta arranca en el primer proyecto');
check(hud.tag,false,'sin etiqueta en la semilla');
eng.pick(4);run(4);
check(eng.state().fruit,4,'pick(4) elige la quinta fruta');
check(hud.project,4,'y el HUD lo reporta');
check(hud.tag,false,'pick deja la etiqueta apagada: cae antes de la ventana de seleccion');
// La ventana de la etiqueta se busca por ETAPA: el mapa scroll→p no es lineal
// y no se exporta, pero Endosperm (0.916) cae adentro de [0.884, 0.940).
let u=0.80;while(u<0.99&&hud.stage!=='Endosperm'){u+=0.004;go(u);}
check(hud.stage,'Endosperm','se llego a la fruta abierta');
check(hud.tag,true,'con la fruta abierta la etiqueta esta encendida');
check(hud.project,4,'y sigue siendo la elegida');
go(0.5);check(hud.tag,false,'lejos del climax se apaga');
eng.pick(-1);run(1);check(eng.state().fruit,5,'pick envuelve: -1 es la ultima');
console.log('La etiqueta acompaña a la fruta elegida, y a ninguna otra.');
