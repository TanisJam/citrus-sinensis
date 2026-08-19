const {loadEngine,meta,BAND_RANGES}=require('./engine-under-test');
/* ============ el final ramifica ============
   Este test verificaba que la elección con el MOUSE ramificara el final: se
   movía el puntero a la izquierda, al centro y a la derecha durante las dos
   ventanas de selección, y se exigía que las tres corridas terminaran en
   proyectos, gajos e ideas distintas.

   Esa interacción ya no existe. Se sacó porque estaba a medio definir: no había
   forma de saber que había una elección para hacer, no había estado, no había
   vuelta atrás, y el resultado no llevaba a ninguna parte. Un control que no se
   anuncia y no se puede deshacer no es interacción.

   Lo que la reemplazó tiene que cumplir la misma promesa —que el final no sea
   siempre el mismo— por otro camino: cada VUELTA muestra otro proyecto y otro
   gajo. Así que el test no se borra, se reapunta.

   Y verifica algo que el test viejo no podía: que la idea que se lleva una
   vuelta es EXACTAMENTE la primera semilla del gajo que esa vuelta abrió. Con
   el mouse eso dependía de dónde estuviera el puntero en un frame concreto;
   ahora es una cadena cerrada y se puede comprobar entera. Si se desalinea, la
   etiqueta "grown from —" empieza a mentir y nadie se entera, porque sigue
   mostrando una idea que existe. */
const {IDEAS,PROJECTS}=meta();

function makeEngine(){
  const noop=()=>{};const grad={addColorStop:noop};
  const ctx=new Proxy({},{get(t,k){
    if(k==='createLinearGradient'||k==='createRadialGradient')return()=>grad;
    if(k==='measureText')return()=>({width:50});
    if(k==='getTransform')return()=>({a:1,b:0,c:0,d:1,e:0,f:0});
    if(typeof k!=='string')return undefined;
    if(k in t)return t[k];
    return()=>{};},set(t,k,v){t[k]=v;return true;}});
  const mk=()=>({style:{setProperty:noop},dataset:{},
    classList:{toggle:noop},getContext:()=>ctx,setAttribute:noop,
    addEventListener:noop,textContent:'',innerHTML:''});
  const bd=BAND_RANGES;
  global.document={getElementById:()=>mk(),querySelectorAll:()=>[],
    documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:()=>mk()};
  global.window=global;global.innerWidth=1440;global.innerHeight=900;
  global.devicePixelRatio=2;global.matchMedia=()=>({matches:true});
  global.scrollTo=noop;
  const MAX=16000-900;
  const L={};global.addEventListener=(e,f)=>{L[e]=f;};
  let pending=null,tick=1000;
  global.performance={now:()=>tick};
  global.requestAnimationFrame=f=>{pending=f;};
  global.scrollY=0;
  const hud={};
  const eng=loadEngine()({
    canvas:mk(),
    bands:bd.map(b=>({from:b[0],to:b[1],el:mk()})),
    onHud:d=>Object.assign(hud,d),
  });
  return {
    state:()=>eng.state(),
    hud,
    // Una vuelta entera de scroll, de arriba abajo. `wrap()` cierra el bucle
    // al llegar al fondo y ahí es donde rota la elección.
    lap(){
      for(let i=0;i<=180;i++){
        global.scrollY=(i/180)*MAX; L.scroll();
        tick+=16;const f=pending;pending=null;f(tick);
      }
    },
  };
}

let bad=0;
const E=makeEngine();
const vistos=[];
/* Una vuelta POR PROYECTO, y el número sale del catálogo — estaba clavado en
   cuatro, que era una vuelta más que los tres proyectos de entonces. Clavado no
   sirve: con seis proyectos, cuatro vueltas dejan dos sin visitar, y un proyecto
   que nunca sale elegido es un proyecto que el clímax no puede abrir. Recorrer
   PROJECTS.length vueltas y exigirlas todas distintas prueba las dos cosas a la
   vez: que la rotación cubre el catálogo entero y que no repite antes de
   terminarlo. */
const VUELTAS=PROJECTS.length;
for(let v=1;v<=VUELTAS;v++){
  // El par que ESTA vuelta va a mostrar se lee antes de recorrerla: `loopTurn`
  // calcula la idea con el par que termina y recién después rota.
  const antes=E.state();
  const proj=PROJECTS[antes.fruit], gajo=proj.gajos[antes.gajo];
  E.lap();
  const despues=E.state();

  vistos.push(proj.name+' · '+gajo.name);
  console.log('vuelta '+v);
  console.log('  proyecto         : '+proj.name);
  console.log('  gajo abierto     : '+gajo.name);
  console.log('  idea que se lleva: '+despues.carried);

  const esperada=IDEAS[gajo.seeds[0]];
  if(despues.carried!==esperada){
    bad++;
    console.log('  !! la cadena está rota: esperaba "'+esperada+'"');
  }
}

const distintos=new Set(vistos);
if(distintos.size!==vistos.length){
  bad++;
  console.log('\n!! el final NO ramifica: '+vistos.join(' / '));
}else{
  console.log('\nEl final ramifica: '+VUELTAS+' vueltas, '+VUELTAS+' (proyecto, gajo) distintos,');
  console.log('y cada vuelta se lleva exactamente la primera semilla del gajo que abrió.');
}
/* Y que las vueltas hayan recorrido el catálogo ENTERO, no un subconjunto que
   dé la casualidad de ser distinto entre sí. */
const proyectosVistos=new Set(vistos.map(v=>v.split(' · ')[0]));
if(proyectosVistos.size!==PROJECTS.length){
  bad++;
  console.log('\n!! la rotación no cubre el catálogo: '+proyectosVistos.size+
              ' de '+PROJECTS.length+' proyectos en '+VUELTAS+' vueltas');
}else{
  console.log('Y cubren los '+PROJECTS.length+' proyectos del catálogo, sin repetir.');
}
process.exit(bad?1:0);
