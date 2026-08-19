const {loadEngine}=require('./engine-under-test');
/* ============ arrastre de estado entre vueltas ============
   La pieza se sostiene sobre un invariante: un frame es función de pe y de
   nada más. Ni de por dónde venías, ni de cuántas vueltas llevabas.

   `test-loop-identity` no puede verificar eso: evalúa cada p desde una
   instancia limpia, así que jamás ve estado arrastrado. Y hay estado que
   sobrevive de una vuelta a la otra — los anchos del modelo de tubería, las
   posiciones de los nodos, la elección de fruta — porque son buffers que se
   reescriben en vez de reconstruirse.

   Este test hace lo que el otro no puede: renderiza la MISMA posición dos
   veces, una desde limpio y otra después de haber jugado una vuelta entera, y
   exige que las dos secuencias de dibujo sean idénticas.

   Lo que lo motivó: `drawContact` se llamaba desde `frame()`, pero leía
   `g.wb`, que escribe `pipeWidths` — y `pipeWidths` no corre cuando `drawTree`
   sale por su return temprano (SHOOT vale 0 por debajo de pe=0.22). Después
   del salto del bucle aparecía el pie de un tronco adulto encima de la semilla
   germinando, con los anchos de la vuelta anterior. */

// Una instancia viva de la pieza, que se puede llevar por donde uno quiera.
function instance(){
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
  const els={};
  const bd=[[0,0.048],[0.085,0.165],[0.195,0.262],[0.315,0.400],[0.440,0.510],[0.560,0.622]];
  global.document={getElementById:id=>(els[id]||(els[id]=mk())),
    querySelectorAll:s=>s==='.band'?bd.map(b=>mk({from:String(b[0]),to:String(b[1])})):[],
    documentElement:{scrollHeight:16000,style:{setProperty:noop}},createElement:()=>mk()};
  global.window=global;global.innerWidth=1440;global.innerHeight=900;
  global.devicePixelRatio=2;
  const MAX=16000-900;
  global.scrollY=0;
  global.matchMedia=()=>({matches:true});   // REDUCED: p salta directo a target, sin viento
  global.scrollTo=noop;
  const L={};global.addEventListener=(e,f)=>{L[e]=f;};
  let pending=null;
  global.performance={now:()=>1000};        // tiempo congelado → sin animación ambiente
  global.requestAnimationFrame=f=>{pending=f;};
  /* `where()` describia la posicion leyendo el textContent de dos nodos del
     HUD. Ahora el HUD es de React y el motor lo REPORTA, asi que el test se
     suscribe al mismo aviso que recibe la pagina — que ademas es mas honesto:
     verifica lo que el motor dice, no lo que quedo escrito en un div. */
  const hud={};
  const eng=loadEngine()({
    canvas:mk(),
    bands:bd.map(b=>({from:b[0],to:b[1],el:mk()})),
    onHud:d=>Object.assign(hud,d),
  });
  const step=()=>{const f=pending;pending=null;log.length=0;f(1000);};
  return {
    // Llevar el scroll a una fracción u y dejar asentar.
    go(u,frames=4){
      global.scrollY=u*MAX; L.scroll();
      for(let i=0;i<frames;i++) step();
      return this;
    },
    // Dejar correr sin tocar el scroll: es lo que hace falta después del salto
    // del bucle, que reposiciona p por su cuenta.
    settle(frames=4){for(let i=0;i<frames;i++) step();return this;},
    log:()=>log.slice(),
    state:()=>eng.state(),
    where:()=>(hud.age||'?')+' · '+(hud.stage||'?')
  };
}

// Una vuelta entera hacia adelante, pasando por la fase interior — que es donde
// el árbol queda adulto y donde deja de dibujarse la escena.
const LAP=Array.from({length:60},(_,i)=>i/59);

/* Lo ÚNICO que la pieza arrastra a propósito de una vuelta a la siguiente es la
   idea elegida. `carried` tiñe la semilla que cae —un solo fillStyle, en
   `drawFallingSeed`— y escribe "grown from —" en la etiqueta. Eso es el
   argumento de la pieza, no un defecto.
   Se declara acá, entrada por entrada, en vez de tolerar diferencias en
   general: así el arrastre deliberado pasa y cualquier otro sigue fallando. */
const TINTE_DE_LA_SEMILLA=/^SET fillStyle=/;

let bad=0;
function check(name,limpio,conVuelta,donde,permitido=[]){
  const fila=name.padEnd(30)+' ';
  const cuenta='('+limpio.length+' vs '+conVuelta.length+' llamadas)';
  if(limpio.length!==conVuelta.length){
    bad++;
    console.log(fila+'ARRASTRA  '+cuenta+'   '+donde);
    console.log('   la vuelta previa cambia CUÁNTO se dibuja, no sólo con qué');
    return;
  }
  const d=[];
  for(let i=0;i<limpio.length;i++)
    if(limpio[i]!==conVuelta[i]) d.push({i,a:limpio[i],b:conVuelta[i]});
  const esperado = d.length===permitido.length &&
    d.every((x,k)=>permitido[k].test(x.a)&&permitido[k].test(x.b));
  const nota = permitido.length ? '   (+ tinte de la semilla, deliberado)' : '';
  console.log(fila+(esperado?'LIMPIO  ':'ARRASTRA')+'  '+cuenta+'   '+donde+
    (esperado?nota:''));
  if(!esperado){
    bad++;
    for(const x of d.slice(0,3))
      console.log('   difiere @'+x.i+':\n     sin vuelta previa: '+x.a+
                  '\n     con vuelta previa: '+x.b);
    if(d.length>3) console.log('   ... y '+(d.length-3)+' diferencias más');
  }
}

/* 1. El aterrizaje del bucle. `wrap()` reposiciona p por su cuenta al llegar al
      final, así que a los dos lados se llega igual: yendo al fondo del scroll.
      La única diferencia entre A y B es haber jugado la vuelta o no. */
{
  const A=instance().go(1).settle();
  const a=A.log(), donde=A.where();
  const B=instance();
  for(const u of LAP) B.go(u,1);
  B.go(1).settle();
  check('aterrizaje del bucle',a,B.log(),donde);
}

/* 2. Arrastre general: la misma posición, con y sin una vuelta encima. Cubre
      cualquier buffer que se reescriba en vez de reconstruirse, no sólo el que
      rompió esta vez.
      Hasta 0.52 alcanza con comparar contra una instancia limpia: ahí no hay
      fruta elegida todavía y la pieza sigue siendo función de pe. */
for(const u of [0.02,0.12,0.30,0.52]){
  const A=instance().go(u);
  const a=A.log(), donde=A.where();
  const B=instance();
  for(const v of LAP) B.go(v,1);
  B.go(u);
  // Scroll y p coinciden en 0–0.05: ahí abajo cae la semilla, y es la única
  // que tiene permitido cambiar de color por haber jugado una vuelta.
  check('scroll '+u.toFixed(2),a,B.log(),donde,
    u<0.05?[TINTE_DE_LA_SEMILLA]:[]);
}

/* 3. De 0.745 en adelante la pieza YA NO es función de pe, y no por un
      descuido: cuál de los tres proyectos se abre depende de cuántas vueltas
      llevás. Eso reemplazó a elegir la fruta moviendo el mouse — una
      interacción que no se anunciaba, no se podía deshacer y no llevaba a
      ninguna parte.
      Comparar contra una instancia limpia acá sólo mediría el cambio de
      proyecto, que es justamente lo que se quiere. Lo que hay que seguir
      exigiendo es que no haya NINGÚN OTRO arrastre, así que se comparan dos
      instancias con la misma cantidad de vueltas que llegaron por caminos
      distintos: si algún buffer se reescribe en vez de reconstruirse, los dos
      caminos difieren. */
const LAP_CORTO=Array.from({length:23},(_,i)=>i/22);
for(const u of [0.74,0.88]){
  const A=instance(); for(const v of LAP) A.go(v,1); A.go(u);
  const a=A.log(), donde=A.where();
  const B=instance(); for(const v of LAP_CORTO) B.go(v,1); B.go(u);
  check('scroll '+u.toFixed(2)+' (1 vuelta)',a,B.log(),donde);
}

/* 4. Y la rotación en sí: que cada vuelta muestre OTRO proyecto, y que el par
      (proyecto, gajo) no se repita antes de tiempo. Es el reemplazo de la
      elección, así que si no rota, la pieza muestra siempre lo mismo. */
{
  const E=instance();
  const vistos=[];
  for(let v=0;v<6;v++){
    for(const q of LAP) E.go(q,1);
    const st=E.state();
    vistos.push(st.fruit+':'+st.gajo);
  }
  const distintos=new Set(vistos);
  const ok=vistos.length===distintos.size;
  console.log('\nrotación por vuelta          '+(ok?'ROTA    ':'REPITE  ')+
    '  '+vistos.join(' → '));
  if(!ok) bad++;
}

console.log(bad
  ? '\n'+bad+' comprobaciones dependen de la vuelta anterior sin motivo'
  : '\nNingún arrastre accidental: lo único que cambia entre vueltas es el proyecto.');
process.exit(bad?1:0);
