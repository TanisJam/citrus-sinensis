/* ============================================================
   MOTOR DEL CICLO — todo el dibujo 2D de la pieza.

   Es el mismo codigo imperativo que corria dentro de ciclo.html, movido a un
   modulo y envuelto en una fabrica. No se convirtio a React a proposito: un
   frame de canvas es una escritura opaca sobre un contexto, no un arbol de
   elementos, asi que declararlo en JSX solo agregaria una capa que no describe
   nada. React se queda con la pagina; el motor se queda con el pixel.

   El motor NO toca el DOM por su cuenta. Todo lo que necesita del exterior
   llega por `host`, y todo lo que produce sale por callbacks:

     host.canvas      el <canvas> ya montado
     host.bands       [{ from, to, el }] — las secciones de texto
     host.refs        { flash, cycleDot } — nodos que cambian todos los frames
     host.onHud       (snapshot) => void — solo cuando un campo CAMBIA
     host.onAccent    (hex) => void

   La division no es estetica: los campos del HUD cambian unas pocas veces por
   scroll, asi que pueden ser estado de React; la opacidad de las bandas y la
   posicion del punto cambian a 60 fps y se escriben por referencia, igual que
   antes. Meter eso en el ciclo de render de React seria pagar una reconciliacion
   por frame para mover un div dos pixeles.
   ============================================================ */
/* ============ contenido ============
   Las ideas son un pool compartido: el mismo principio reaparece en proyectos
   distintos. Ese es el argumento — todo está hecho de las mismas piezas simples.

   Vive a nivel de módulo, no dentro del motor, por dos razones: no es estado de
   una instancia, y la lista accesible de proyectos —la que leen los lectores de
   pantalla, fuera del canvas— tiene que salir de ACÁ y no de una copia escrita
   a mano en el JSX. Antes eran dos listas separadas que podían divergir en
   silencio; ahora hay una sola y la otra no existe. */
export const IDEAS=[
  'One source of truth','Make the default correct','Name things once',
  'Fail loudly, early','Write it down','Small reversible steps',
  'Boring is a feature','Delete more than you add'
];
export const PROJECTS=[
  {name:'Endeavor Platform', meta:'Aerolab · 2025', hue:'#F08C1C',
   gajos:[
     {name:'Global directory', seeds:[0,2]},
     {name:'Permissions',      seeds:[1,3]},
     {name:'Search',           seeds:[2,6]},
     {name:'Reporting',        seeds:[0,4]},
     {name:'Audit trail',      seeds:[4,3]}
   ]},
  {name:'Frontend Standards', meta:'Systems · 2025', hue:'#EFA23B',
   gajos:[
     {name:'Component library',seeds:[2,7]},
     {name:'Review checklist', seeds:[4,3]},
     {name:'Estimation ritual',seeds:[5,4]},
     {name:'Onboarding path',  seeds:[1,6]},
     {name:'Design tokens',    seeds:[0,1]}
   ]},
  {name:'Salesforce Integrations', meta:'Backend · 2024', hue:'#E8791B',
   gajos:[
     {name:'Sync layer',    seeds:[0,5]},
     {name:'Field mapping', seeds:[2,1]},
     {name:'Error recovery',seeds:[3,5]},
     {name:'Retry policy',  seeds:[6,5]},
     {name:'Audit trail',   seeds:[4,7]}
   ]}
];

/* ============ etapas + notas de campo ============
   El HUD arranca en STAGES[0] antes de que el motor emita nada: si no, el
   primer pintado sale con la etiqueta vacía y se ve el salto. */
export const STAGES=[
  {p:0.000,name:'Dispersal',    dark:false, note:'Citrus seeds are recalcitrant. They cannot dry out and wait for a better year.'},
  {p:0.062,name:'Imbibition',   dark:true,  note:'A Valencia seed carries 2.9 to 4.6 embryos. Most are clones of the mother; usually one is new.'},
  {p:0.135,name:'Hydrotropism', dark:true,  note:'The root cap reads water-potential gradients of 0.5 MPa and overrides gravity to follow them.'},
  {p:0.250,name:'Emergence',    dark:false, note:'Cotyledons feed the seedling until the first true leaves can pay their own way.'},
  {p:0.300,name:'Flush cycles', dark:false, note:'Root growth stops while shoots grow. Citrus builds itself in alternating pulses, never both at once.'},
  {p:0.400,name:'Juvenility',   dark:false, note:'A juvenile tree is thorny and cannot flower. Three to seven years from seed — sometimes fifteen.'},
  {p:0.520,name:'Induction',    dark:false, note:'Flowering is triggered by cold or drought. The tree commits months before any bud moves.'},
  {p:0.560,name:'Anthesis',     dark:false, note:'Each flower opens once. The scent is the tree paying insects in advance.'},
  {p:0.632,name:'June drop',    dark:false, note:'Under 2% of flowers become fruit. The fruitlet falls at zone C — the calyx stays on the branch.'},
  {p:0.700,name:'Colour break', dark:true,  note:'The orange was always orange. Cool nights break down the chlorophyll and let the carotenoids show.'},
  {p:0.786,name:'Selection',    dark:false, note:'Non-climacteric: it will not ripen further once it leaves. Whatever takes it, takes it finished.'},
  {p:0.840,name:'Anatomy',      dark:false, note:'The rind is one organ; the segments are separate carpels. A project is the same shape.'},
  {p:0.916,name:'Endosperm',    dark:false, note:'Every segment carries seeds. Every feature is a handful of simple ideas, assembled.'}
];

export function createEngine(host){

'use strict';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = host.canvas;
const ctx = cv.getContext('2d', { alpha:false });
let W=0,H=0,DPR=1;

/* Todo lo que el motor devuelve al exterior. Los defaults dejan que el motor
   corra sin host completo — que es exactamente lo que hacen los tests. */
const noop=()=>{};
const onHud    = host.onHud    || noop;
const onAccent = host.onAccent || noop;
const refs     = host.refs     || {};

/* ============ ciclo de vida ============
   Suelto en una pagina, el motor no necesitaba saber morirse: vivia lo mismo
   que el documento. Dentro de un efecto de React si, y no por prolijidad: en
   desarrollo React monta, desmonta y vuelve a montar cada componente a
   proposito, asi que sin esto quedarian DOS bucles de animacion peleandose por
   el mismo canvas desde el primer arranque — y cada oyente de scroll duplicado.

   Se resuelve sombreando las dos globales que el cuerpo ya usaba. El cuerpo no
   cambia una linea: sigue escribiendo `addEventListener(...)` como siempre, y
   lo que cambia es a donde va a parar. Delegan en `globalThis` a proposito,
   para que los tests —que reemplazan las globales por espias— sigan viendo lo
   mismo que veian cuando esto era un IIFE en la pagina. */
const listeners=[];
const addEventListener=(type,fn,opts)=>{
  listeners.push([type,fn,opts]);
  globalThis.addEventListener(type,fn,opts);
};
let rafId=0, alive=true;
const requestAnimationFrame=fn=>{
  if(!alive) return 0;
  return (rafId=globalThis.requestAnimationFrame(fn));
};

/* ============ utilidades ============ */
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const ease=t=>1-Math.pow(1-t,3);
function mul(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/* El color se mezcla miles de veces por rebuild de paleta, así que parsear y
   serializar hex es el costo dominante. Se cachea el parseo (con tope, porque
   entran colores generados al vuelo) y las cadenas de mezcla se resuelven en
   números, serializando una sola vez al final. */
let HXC=Object.create(null), hxN=0;
function hx(h){
  const c=HXC[h]; if(c) return c;
  if(++hxN>600){HXC=Object.create(null);hxN=1;}
  return HXC[h]=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
}
const o2=n=>{n=n<0?0:n>255?255:Math.round(n);return (n<16?'0':'')+n.toString(16);};
const rgbH=(r,g,b)=>'#'+o2(r)+o2(g)+o2(b);
function mixH(a,b,t){const A=hx(a),B=hx(b);
  return rgbH(lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t));}

/* ============ mezcla que no ensucia ============
   `mixH` interpola en sRGB, en línea recta. Entre dos colores de matiz opuesto
   esa recta PASA POR EL EJE NEUTRO: mezclando el tostado del atardecer con el
   azul del día, a mitad de camino queda 156,159,158 — gris. El croma cae de 79
   a 3. Es el mismo error que ensuciar el cuadro mezclando complementarios en la
   paleta en vez de girar el matiz.
   La mezcla de abajo trabaja en OKLCh: interpola claridad y croma por separado,
   y el matiz POR EL ARCO, de modo que el camino rodea el eje neutro en vez de
   atravesarlo. El croma de llegada es el que uno pidió, no el que sobrevive. */
const srgbToLin=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
const linToSrgb=v=>255*(v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055);
function toLab(h){
  const c=hx(h),r=srgbToLin(c[0]),g=srgbToLin(c[1]),b=srgbToLin(c[2]);
  const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
          1.9779984951*l-2.4285922050*m+0.4505937099*s,
          0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
function labToHex(L,A,B){
  const l=Math.pow(L+0.3963377774*A+0.2158037573*B,3);
  const m=Math.pow(L-0.1055613458*A-0.0638541728*B,3);
  const s=Math.pow(L-0.0894841775*A-1.2914855480*B,3);
  return rgbH(linToSrgb( 4.0767416621*l-3.3077115913*m+0.2309699292*s),
              linToSrgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
              linToSrgb(-0.0041960863*l-0.7034186147*m+1.7076147010*s));
}
/* `dir` fuerza el sentido del giro cuando el arco corto va por donde no
   corresponde: del atardecer al día, el cielo real gira por el magenta y el
   violeta, no por el verde. */
function mixL(a,b,t,dir){
  if(t<=0) return a; if(t>=1) return b;
  const A=toLab(a),B=toLab(b);
  const ca=Math.hypot(A[1],A[2]), cb=Math.hypot(B[1],B[2]);
  let ha=Math.atan2(A[2],A[1]), hb=Math.atan2(B[2],B[1]);
  let d=hb-ha;
  const TAU=6.283185307179586;
  while(d> Math.PI) d-=TAU;
  while(d<-Math.PI) d+=TAU;
  if(dir&&Math.sign(d)!==Math.sign(dir)&&d!==0) d-=Math.sign(d)*TAU;
  /* Un color casi neutro no tiene matiz propio: si se lo interpola igual, el
     ruido de su ángulo tiñe toda la transición. Toma prestado el del otro. */
  if(ca<0.004) ha=hb-d;
  const L=lerp(A[0],B[0],t), C=lerp(ca,cb,t), H=ha+d*t;
  return labToHex(L,C*Math.cos(H),C*Math.sin(H));
}
/* ============ vocabulario de easing ============
   Dos curvas para todo es la razón de que el crecimiento se sienta mecánico:
   nada anticipa, nada sobrepasa, nada asienta. */
const backOut=(t,c)=>1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);
const petalOut=t=>backOut(t,1.4);         // apertura de pétalos y de gajos
const growOut=t=>backOut(t,0.26);         // crecimiento: 1.5% de sobrepaso
const peelOut=t=>t<=0?0:t>=1?1:            // el pelado es lo más físico
  Math.pow(2,-9*t)*Math.sin((t*10-0.75)*2.0944)+1;

/* Catmull-Rom para la cámara. Con smoothstep la velocidad se anula en CADA
   keyframe: por eso la cámara llega y frena, diecinueve veces. Con tangentes
   continuas atraviesa las paradas en lugar de detenerse en ellas. El limitador
   de Fritsch–Carlson evita que sobrepase el encuadre entre keyframes. */
function keyC(stops,p){
  const n=stops.length;
  if(p<=stops[0][0]) return stops[0][1];
  if(p>=stops[n-1][0]) return stops[n-1][1];
  let i=0; while(i<n-2&&p>stops[i+1][0]) i++;
  const x0=stops[i][0],x1=stops[i+1][0],y0=stops[i][1],y1=stops[i+1][1];
  const h=x1-x0,t=(p-x0)/h,d=(y1-y0)/h;
  let m0,m1;
  if(i===0) m0=d; else {const q=stops[i-1];m0=(y1-q[1])/(x1-q[0]);}
  if(i+2>=n) m1=d; else {const q=stops[i+2];m1=(q[1]-y0)/(q[0]-x0);}
  if(d===0){m0=0;m1=0;}
  else{
    const a=m0/d,b=m1/d,s=a*a+b*b;
    if(s>9){const k=3/Math.sqrt(s);m0=k*a*d;m1=k*b*d;}
  }
  const t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*y0+(t3-2*t2+t)*h*m0+(-2*t3+3*t2)*y1+(t3-t2)*h*m1;
}

function key(stops,p,f){
  if(p<=stops[0][0]) return stops[0][1];
  const n=stops.length;
  if(p>=stops[n-1][0]) return stops[n-1][1];
  let i=0; while(i<n-2 && p>stops[i+1][0]) i++;
  const t=(p-stops[i][0])/(stops[i+1][0]-stops[i][0]);
  return lerp(stops[i][1],stops[i+1][1],(f||smooth)(t));
}

/* ============ luz ============
   Un solo vector, derivado de la hora del día. Todo lo que tiene volumen lo
   consulta: el sol dibujado, las ramas, las hojas, los pétalos, el fruto.
   Es función pura de pe y de la noche, así que no compromete el bucle. */
const rgba=(h,a)=>{const c=hx(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';};
const LIGHT={x:0.93,y:-0.36,z:0.54,sun:'#FFF6DC',sky:'#C9DDE9',amb:0.42,exp:1,low:1,k:-1};
function updateLight(pe,sky,night){
  const ang=Math.PI*(0.12+clamp(pe/0.9)*0.78);
  // Clave de la luz, cuantizada: nada de lo que se derive de ella depende de t,
  // así que las paletas se recalculan sólo cuando el sol se movió de verdad.
  LIGHT.k=Math.round(ang*512)*64+Math.round(night*63);
  LIGHT.x=Math.cos(ang); LIGHT.y=-Math.sin(ang);
  LIGHT.low=1-Math.abs(Math.sin(ang));        // 1 con el sol en el horizonte, 0 en el cenit
  // Sol bajo = luz más cálida y más rasante. De noche, azul y casi toda ambiente.
  LIGHT.sun=mixH(mixH('#FFF6DC','#F4A855',LIGHT.low*0.92),'#35507C',night);
  LIGHT.sky=mixH(sky.b,'#22304A',night*0.65);
  /* De noche hay mucha menos luz, y eso lo baja la exposición. Lo que NO
     corresponde es subir tanto la ambiente: con `amb` en 0.60 y `exp` en 0.42 el
     rango de iluminación queda entre 0.25 y 0.42 —el 29% del rango de día— y por
     eso la noche medía 40 niveles de 255. Un frame entero dentro del 16% de la
     escala tonal no es una noche, es una mancha.
     El error de fondo era tratar la noche como si fuera toda ambiente. La luna
     es direccional: una luna llena proyecta sombras nítidas. Baja el nivel, no
     el modelado. La ambiente de día también baja, porque un relleno del 42% no
     deja que nada llegue a oscuro de verdad. */
  LIGHT.amb=0.30+0.12*(1-LIGHT.low)+0.30*night;
  /* Se probó subir la exposición por encima de 1 para devolver por arriba lo que
     la sombra se llevaba por abajo. Medido, no movió el histograma ni un nivel:
     `amb` y `exp` sólo tocan lo que pasa por `shadeL` —árbol, hojas, fruto— y
     eso es una fracción chica del frame. El cielo y la tierra son gradientes
     directos, y son ELLOS los que fijan el rango tonal de la imagen. Queda
     anotado para no volver a intentarlo por acá. */
  LIGHT.exp=1-0.58*night;
  LIGHT.sunA=hx(LIGHT.sun); LIGHT.skyA=hx(LIGHT.sky);
}
/* Lambert barato a partir de la incidencia ya calculada. Lo que queda en
   sombra se tiñe del cielo (rebote), nunca de gris.
   `layer` aplica el tratamiento de profundidad de W4 sin una segunda pasada de
   color: la copa trasera se va hacia el cielo (bruma) y la delantera gana
   contraste. Por eso la bruma sigue al cielo sola, a cualquier hora. */
const HAZE=0.30;
function shadeL(base,d,layer){
  if(d<0)d=0; else if(d>1)d=1;
  const lum=(LIGHT.amb+(1-LIGHT.amb)*d)*LIGHT.exp;
  const B=hx(base),S=LIGHT.sunA,K=LIGHT.skyA;
  const t1=0.26*d*d, t2=0.18*(1-d);
  let r=lerp(14,B[0],lum), g=lerp(26,B[1],lum), b=lerp(34,B[2],lum);
  r=lerp(r,S[0],t1); g=lerp(g,S[1],t1); b=lerp(b,S[2],t1);
  r=lerp(r,K[0],t2); g=lerp(g,K[1],t2); b=lerp(b,K[2],t2);
  if(layer===0){                       // copa trasera: bruma del color del cielo
    r=lerp(r,K[0],HAZE); g=lerp(g,K[1],HAZE); b=lerp(b,K[2],HAZE);
    const m=(r+g+b)/3; r=lerp(m,r,0.75); g=lerp(m,g,0.75); b=lerp(m,b,0.75);
  } else if(layer===2){                // copa delantera: +8% de contraste
    r=(r-128)*1.08+128; g=(g-128)*1.08+128; b=(b-128)*1.08+128;
  }
  return rgbH(r,g,b);
}
const shadeD=(base,d)=>shadeL(base,d,1);
// Superficie plana: pd es la incidencia sobre su normal. Nunca llega a negro
// del todo porque una lámina delgada translúcida siempre pasa algo de luz.
const shadeFlat=(base,pd,l)=>shadeL(base,0.54+0.62*pd,l);
// Cilindro de eje conocido: u es la posición a lo ancho (−1..1), pd la
// incidencia sobre su perpendicular. El término en z es lo que le da el lomo.
const shadeCyl=(base,pd,u,l)=>shadeL(base,0.84*u*pd+LIGHT.z*Math.sqrt(1-u*u),l);

/* ============ el bucle ============
   0.95–1.00 renderiza exactamente lo mismo que 0.00–0.05. */
const LOOP_AT=0.95, LOOP_LEN=0.05;
/* `p − 0.95` no da bit-idéntico a su espejo: la resta deja un epsilon de ~1e-16.
   Invisible en pantalla, pero suficiente para que dos posiciones espejadas
   dejen de ser demostrablemente iguales en cuanto un valor lo amplifica. Se
   cuantiza a 1e-9 — que sobre un scroll de 15000 px son 1.5e-5 px, o sea nada—
   y el invariante vuelve a ser exacto para todo lo que se derive de pe. */
const fold=p=> Math.round((p>=LOOP_AT ? p-LOOP_AT : p)*1e9)/1e9;

/* IDEAS, PROJECTS y STAGES viven arriba, a nivel de módulo: son el catálogo, no
   estado de una instancia, y la lista accesible de proyectos los necesita
   fuera del canvas. */

/* ============ cámara ============ */
const CAM_Y=[[0,-1180],[0.048,-90],[0.085,30],[0.125,90],[0.165,170],
  [0.205,270],[0.245,140],[0.275,-10],[0.335,-70],[0.395,-120],[0.465,-170],
  [0.545,-210],[0.615,-230],[0.690,-240],[0.750,-250],[0.790,-262],
  [0.812,-300],[0.856,-360],[0.95,-1180]];
/* Los dos extremos tienen que ser el MISMO valor: 0.95 renderiza lo mismo que
   0, y ahí es donde cierra el bucle. Subieron los dos juntos de 1.9 a 2.6 para
   que la semilla abra la pieza con tamaño de sujeto y no de detalle. */
const CAM_S=[[0,2.6],[0.048,2.6],[0.085,3.0],[0.125,2.6],[0.165,2.1],[0.205,1.7],
  [0.245,1.5],[0.275,1.35],[0.335,1.05],[0.395,0.85],[0.465,0.68],[0.545,0.58],
  [0.615,0.55],[0.690,0.54],[0.750,0.56],[0.790,0.64],[0.812,0.92],
  [0.856,1.6],[0.95,2.6]];

/* ============ etapas + notas de campo ============ */
const stageAt=p=>{let s=STAGES[0];for(const q of STAGES) if(p>=q.p) s=q; return s;};

const AGE=[[0,0],[0.062,1],[0.11,14],[0.165,26],[0.25,40],[0.29,90],[0.335,300],
  [0.395,700],[0.465,1500],[0.52,2300],[0.545,2555],[0.56,2570],[0.615,2600],
  [0.66,2660],[0.72,2790],[0.78,2830],[0.95,2840]];
function ageLabel(d){
  if(d<1) return 'day 0';
  if(d<75) return 'day '+Math.round(d);
  if(d<730) return 'month '+Math.round(d/30.4);
  const y=d/365.25;
  return 'year '+(y<10?y.toFixed(1):Math.round(y));
}

/* ============ flujos alternados (raíz y brote se turnan) ============ */
const SHOOT=[[0.22,0],[0.25,0.05],[0.27,0.10],[0.29,0.10],
  [0.32,0.22],[0.335,0.22],[0.36,0.34],[0.375,0.34],
  [0.40,0.47],[0.42,0.47],[0.45,0.60],[0.465,0.60],
  [0.49,0.72],[0.505,0.72],[0.53,0.84],[0.555,0.90],[0.62,0.97],[0.70,1]];
const ROOT=[[0.11,0],[0.16,0.16],[0.205,0.30],[0.25,0.33],[0.27,0.33],
  [0.30,0.45],[0.32,0.45],[0.35,0.56],[0.37,0.56],
  [0.40,0.66],[0.42,0.66],[0.45,0.76],[0.47,0.76],
  [0.50,0.85],[0.52,0.85],[0.56,0.93],[0.63,0.98],[0.70,1]];

/* ============ mundo ============ */
const SOIL=[
  {y:0,c:'#6B5236'},{y:60,c:'#5B462F'},{y:150,c:'#4A3A28'},
  {y:300,c:'#3E3122'},{y:470,c:'#33291D'},{y:700,c:'#28211A'}
];
const POCKETS=[{x:-55,y:185,r:78},{x:125,y:255,r:95},{x:-80,y:390,r:105},{x:150,y:515,r:88}];
let speck=[],stones=[],litter=[];

/* ============ árbol y raíces ============ */
const TREE_D=7;
let tree=null, roots=null, sites=[], keepSites=[];

function buildTree(seed){
  const r=mul(seed);
  const par=[],rel=[],len=[],dep=[],ph=[],leaf=[],thorn=[];
  /* El tronco no nace en la vertical exacta. Un eje a −π/2 clavado es la marca
     de que esto lo dibujó una máquina: ningún árbol crece a plomo, y menos uno
     que pasó siete años buscando luz para un lado. */
  let q=[{p:-1,a:-Math.PI/2+0.052,l:170,d:0}];
  while(q.length){
    const nx=[];
    for(const b of q){
      const i=par.length;
      par.push(b.p); rel.push(b.a); len.push(b.l); dep.push(b.d);
      ph.push(r()*6.283); leaf.push(1); thorn.push(b.d>=1&&b.d<=4&&r()<0.55?1:0);
      if(b.p>=0) leaf[b.p]=0;
      if(b.d>=TREE_D-1||b.l<4) continue;
      const n=2+(r()<0.32?1:0);
      for(let j=0;j<n;j++){
        const t=n===1?0:(j/(n-1))*2-1;
        nx.push({p:i,
          a:t*(0.30+r()*0.42)*(b.d===0?1.5:1)+(r()-0.5)*0.22-0.03,
          l:b.l*(b.d===0?0.72:0.78)*(0.84+r()*0.32), d:b.d+1});
      }
    }
    q=nx;
  }
  const n=par.length;

  // Curvatura: ningún árbol tiene segmentos rectos. Derivada de ph para no
  // tocar la secuencia aleatoria y dejar la topología donde estaba.
  const bend=new Float32Array(n);
  for(let i=0;i<n;i++){
    /* Dos correcciones sobre el 0.052 plano que había:

       - La amplitud sube donde la curva SE VE. El tronco y las madres son los
         tramos largos y gruesos del centro del cuadro; una ramilla de ocho
         píxeles puede ser recta sin que nadie lo note, el tronco no.
       - Un piso del 45%. Con `sin(ph)` pelado, cualquier rama cuyo ph cayera
         cerca de un cero quedaba PERFECTAMENTE recta — y por mala suerte el
         tronco era una de ésas. Se conserva el signo, que es de dónde sale que
         unas curven a un lado y otras al otro, y se acota el módulo por abajo. */
    const s=Math.sin(ph[i]*3.7);
    const amp=dep[i]===0?0.088:dep[i]<=2?0.105:0.070;
    bend[i]=(s<0?-1:1)*(0.45+0.55*Math.abs(s))*amp;
  }

  /* Profundidad: cada terminal recibe un z de su hash y cada rama hereda el
     mínimo de sus descendientes, así ninguna rama se dibuja delante de sus
     propias hojas. Tronco y ramas madres se dibujan aparte, antes de todo. */
  const z=new Float32Array(n).fill(2);
  for(let i=0;i<n;i++) if(leaf[i]){
    const s=Math.sin(ph[i]*127.1+i*311.7)*43758.5453; z[i]=s-Math.floor(s);
  }
  for(let i=n-1;i>=1;i--) if(z[i]<z[par[i]]) z[par[i]]=z[i];
  const lay=new Uint8Array(n);
  for(let i=0;i<n;i++) lay[i]=z[i]<0.35?0:z[i]<0.70?1:2;

  // posiciones finales, para poder elegir los frutos por dónde quedan de verdad
  const fx=new Float32Array(n), fy=new Float32Array(n), fa=new Float32Array(n);
  for(let i=0;i<n;i++){
    const pa=par[i];
    const px=pa<0?0:fx[pa], py=pa<0?-4:fy[pa];
    const a=(pa<0?rel[i]:fa[pa]+rel[i]); fa[i]=a;
    fx[i]=px+Math.cos(a)*len[i]; fy[i]=py+Math.sin(a)*len[i];
  }
  sites=[]; keepSites=[];
  const term=[];
  for(let i=0;i<n;i++) if(leaf[i]) term.push(i);
  const want=Math.min(46,term.length);
  const stepI=Math.max(1,Math.floor(term.length/want));
  const picked=[];
  for(let k=0;k<term.length&&picked.length<want;k+=stepI) picked.push(term[k]);

  // Las tres que llevan proyecto se eligen por su x, bien separadas y en lo alto
  // de la copa: son las que el clímax puede abrir, así que tienen que leerse
  // como tres cosas distintas y no como tres frutos apilados.
  let hi=[...picked];
  let minY=0; for(const i of hi) if(fy[i]<minY) minY=fy[i];
  const canopy=hi.filter(i=>fy[i]<minY*0.30);
  const pool=(canopy.length>=8?canopy:hi).slice().sort((a,b)=>fx[a]-fx[b]);
  const keepNodes=[pool[0], pool[pool.length>>1], pool[pool.length-1]];

  /* Y los que no cuentan nada.
     El árbol daba TRES naranjas en toda la copa, y la nota de campo lo defendía
     con el dato correcto —menos del 2% de las flores cuaja—. Pero el 2% es
     sobre las flores del árbol REAL, que son miles: acá hay 46 flores dibujadas
     representando esos miles, así que aplicarle el 2% a la muestra en vez de a
     la población es contar dos veces la misma poda. Un naranjo adulto lleva
     cientos de frutos; el dato honesto de la nota no obliga a dibujar tres.
     Éstos no tienen proyecto ni nombre ni se pueden abrir. Están para que el
     árbol sea un naranjo cargado y no un árbol con tres adornos. */
  const EXTRA_FRUIT=6;
  const extra=new Set();
  for(let k=0;k<EXTRA_FRUIT;k++){
    // Repartidos sobre el mismo pool ordenado por x, corridos medio paso para
    // no caer sobre los tres con nombre.
    const idx=Math.round((k+0.5)/EXTRA_FRUIT*(pool.length-1));
    const node=pool[idx];
    if(node!==undefined&&keepNodes.indexOf(node)<0) extra.add(node);
  }

  for(const node of picked){
    const rr=r();
    const ki=keepNodes.indexOf(node);
    const keep = ki>=0 || extra.has(node);
    const fate = keep ? 'keep' : (rr<0.82?'post':'june');
    const ph0=r()*6.283;
    const s={node,fate,ph:ph0,jit:(r()-0.5)*10,
      // Desfase de apertura y de viraje, derivados de ph para no tocar la
      // secuencia aleatoria ni mover la topología ya validada.
      stag:(Math.sin(ph0*11.3)*0.5+0.5)*0.018-0.009,
      /* Los sin nombre viran repartidos por todo el rango en vez de en tres
         escalones: si viran juntos, seis naranjas cambiando de color en el
         mismo cuadro delatan que es una animación. */
      turn:(ki>=0?ki*0.09:(Math.sin(ph0*3.1)*0.5+0.5)*0.26)
           +(Math.sin(ph0*5.7)*0.5+0.5)*0.03,
      // Tamaño: en un árbol cargado no hay dos frutos del mismo calibre.
      cal:ki>=0?1:0.74+0.30*(Math.sin(ph0*7.7)*0.5+0.5),
      dropAt: fate==='post' ? 0.626+r()*0.024 : 0.650+r()*0.030, proj:ki};
    sites.push(s);
    if(ki>=0) keepSites[ki]=s;
  }
  /* ---- brotes interiores ----
     El centro de la copa seguía vacío después de sembrar hojas hacia adentro, y
     no era un problema de cuántas hojas: era de dónde colgarlas. Este árbol se
     abre en abanico, así que tiene TRECE ramas de nivel 3 y treinta y tres de
     nivel 4 ocupando todo el centro del cuadro, contra ciento sesenta y una
     ramitas apretadas en el borde. Repartir follaje sobre esa estructura da
     exactamente lo que se veía: una corona densa y un hueco.
     Lo que falta ahí no son hojas, es MADERA. Un naranjo llena su interior con
     brotes cortos que salen de la madera vieja hacia adentro de la copa —el
     tipo que la poda de cítricos llama chupón cuando se va de largo— y son
     ellos los que sostienen el follaje interior. Así que se agregan.

     Con su PROPIO generador. Si estos brotes salieran del `r()` del árbol,
     cada llamada correría la secuencia y saldría otro árbol entero: otra
     topología, otras ramas madres, otros nodos elegidos para los frutos. El
     árbol de arriba no se entera de que esto existe. */
  const spur=[];
  {
    const rs=mul(seed^0x5BD1E995);
    for(let i=0;i<n;i++){
      const d=dep[i];
      if(d<2||d>4||leaf[i]) continue;
      const k=rs()<0.55?2:1;
      for(let j=0;j<k;j++){
        spur.push({
          p:i,
          u:0.30+rs()*0.58,               // dónde nace sobre la rama madre
          /* Hacia ADENTRO. Un brote que sale siguiendo la dirección de su rama
             va al mismo borde que ya está lleno; el que sirve es el que se
             cruza hacia el interior, casi perpendicular y tirando hacia abajo,
             que es además el que de verdad brota de la madera vieja. */
          rel:(rs()<0.5?-1:1)*(1.05+rs()*0.75)+0.18,
          len:len[i]*(0.30+rs()*0.26),
        });
      }
    }
  }
  return {par,rel,len,dep,ph,leaf,thorn,n,bend,z,lay,spur,
    A:new Float32Array(n),X:new Float32Array(n),Y:new Float32Array(n),G:new Float32Array(n),
    wb:new Float32Array(n),wt:new Float32Array(n),
    th:new Float32Array(n),om:new Float32Array(n)};   // resorte del viento
}

function buildRoots(seed){
  const r=mul(seed);
  const par=[],rel=[],len=[],dep=[],ph=[],abs=[];
  const X=[],Y=[];
  // Misma razón que el tronco, y hacia el otro lado: la pivotante contrapesa.
  let q=[{p:-1,a:Math.PI/2-0.060,l:105,d:0,x:0,y:6}];
  while(q.length){
    const nx=[];
    for(const b of q){
      const i=par.length;
      let ax=Math.cos(b.a),ay=Math.sin(b.a);
      let best=null,bd=1e9;
      for(const w of POCKETS){
        const dx=w.x-b.x,dy=w.y-b.y,d=Math.hypot(dx,dy);
        if(d<bd&&dy>-30){bd=d;best={dx:dx/d,dy:dy/d,d};}
      }
      if(best){
        const pull=clamp(1-best.d/420)*0.55*Math.min(1,b.d/2);
        ax=lerp(ax,best.dx,pull); ay=lerp(ay,best.dy,pull);
      }
      ax+=(r()-0.5)*0.35; ay+=Math.abs((r()-0.5)*0.2)+0.05;
      const a=Math.atan2(ay,ax);
      par.push(b.p); rel.push(i===0?a:a-abs[b.p]); abs.push(a);
      len.push(b.l); dep.push(b.d); ph.push(r()*6.283);
      const ex=b.x+Math.cos(a)*b.l, ey=b.y+Math.sin(a)*b.l;
      X.push(ex); Y.push(ey);
      if(b.d>=7||b.l<5) continue;
      const n=2+(r()<0.5?1:0);
      for(let j=0;j<n;j++){
        nx.push({p:i,a:a+(j-(n-1)/2)*(0.42+r()*0.4)+(r()-0.5)*0.2,
          l:b.l*0.80*(0.8+r()*0.4), d:b.d+1, x:ex, y:ey});
      }
    }
    q=nx;
  }
  const n=par.length;
  // Terminales: son las que llevan cofia y de las que salen las micorrizas.
  const kid=new Uint8Array(n);
  for(let i=1;i<n;i++) kid[par[i]]=1;
  const term=new Uint8Array(n);
  for(let i=0;i<n;i++) term[i]=kid[i]?0:1;
  return {par,rel,len,dep,ph,n,term,
    A:new Float32Array(n),X:new Float32Array(n),Y:new Float32Array(n)};
}

/* La tierra no es ruido uniforme: tiene grumos. Un agregado es un centro con
   cinco a nueve partículas alrededor, con radio decreciente. */
/* Paso de 25 px y no de 50: la frontera se dibuja como polilínea, así que el
   paso ES la longitud del tramo recto más corto que puede tener. Con 50 px la
   ondulación de período corto se comía sus propias crestas y el borde volvía a
   leerse tirado a regla. */
const AGG_X0=-1000, AGG_STEP=25, AGG_N=81;
let soilEdge=null;
/* La frontera muestreada cada 50 px, leída en cualquier x. Fuera del rango
   muestreado se sostiene el valor del extremo, que es lo que ya hacía el
   relleno de estratos al cerrar contra los bordes de la vista. */
function edgeAt(i,x){
  const u=(x-AGG_X0)/AGG_STEP;
  if(u<=0) return soilEdge[i][0];
  if(u>=AGG_N-1) return soilEdge[i][AGG_N-1];
  const k=u|0;
  return lerp(soilEdge[i][k],soilEdge[i][k+1],u-k);
}
function buildWorld(){
  tree=buildTree(20260807);
  roots=buildRoots(4242);
  const r=mul(77);
  speck=[];
  for(let k=0;k<118;k++){
    const cx=(r()-0.5)*1900, cy=r()*900, m=5+((r()*5)|0), sp=3+r()*10;
    for(let j=0;j<m;j++){
      const a=r()*6.283, rr=sp*Math.sqrt(r());
      const o=0.05+r()*0.15*(1-rr/sp*0.5);
      /* `bin` agrupa por opacidad para poder dibujar las ~700 partículas en
         cuatro trazadas en vez de setear alpha setecientas veces. Lo que se
         pierde entre bin y bin son tres centésimas de alpha; lo que se gana es
         poder dibujarlas redondas. */
      speck.push({x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr,
        s:0.8+r()*2.4,o,bin:Math.min(3,((o-0.05)/0.0375)|0)});
    }
  }
  /* Agregados: no todos son del mismo mineral. Tres matices y un rango de
     tamaño más ancho — un suelo real tiene un canto grande cada varios chicos. */
  const STONE_C=['#6A5A44','#7A6446','#584C3A'];
  /* Eran 64 repartidas parejo sobre 1700×860, o sea una piedra cada 22.000 px²:
     la tierra quedaba como un campo liso con algún canto suelto, y un campo
     liso no es tierra, es un relleno. Ahora son 150, y —esto es lo que importa—
     ya no se reparten al azar uniforme.
     Un perfil de suelo real se ordena por profundidad: arriba, donde la raíz
     trabaja y la lluvia lava los finos, quedan muchos cantos chicos; abajo, la
     carga compacta y aparecen los bloques grandes y espaciados. `Math.pow` del
     azar sesga la profundidad, y el tamaño sigue a la profundidad en vez de ser
     independiente de ella. Densidad Y orden: repartir más piedras al azar sólo
     hubiera dado más ruido parejo. */
  stones=Array.from({length:150},()=>{
    const dep=Math.pow(r(),0.72);            // sesgo hacia la parte de arriba
    const big=r()<(0.08+0.22*dep)?2.1:1;     // los bloques viven abajo
    const sc=big*(0.62+0.55*dep);            // y arriba todo es más chico
    const a=r()*3.14;
    return {x:(r()-0.5)*1900,y:20+dep*880,w:(5+r()*17)*sc,h:(3.5+r()*9)*sc,
            a,ca:Math.cos(a),sa:Math.sin(a),c:STONE_C[(r()*3)|0]};
  });
  /* Hojarasca: lo que quedó del ciclo anterior, tumbado sobre la superficie.
     Es la franja donde la tierra deja de ser tierra y empieza a ser aire. */
  litter=Array.from({length:96},()=>({x:(r()-0.5)*2100,l:3+r()*11,a:(r()-0.5)*0.9,
    o:0.12+r()*0.26,dy:r()*3.5}));
  /* Fronteras de estrato onduladas: fbm barato muestreado cada 50 px de mundo.
     Una frontera recta entre capas de tierra no existe en ninguna parte. */
  soilEdge=SOIL.map((s,i)=>{
    /* La superficie llevaba la MENOR amplitud de las cuatro fronteras, y es la
       única que se ve contra el cielo: siete píxeles repartidos en dos mil se
       leen como una recta. Ahora es la de más relieve, que además es lo cierto
       —debajo la carga la compacta y la aplana. */
    const amp=i===0?17:11+i*3.5, e=new Float32Array(AGG_N);
    for(let k=0;k<AGG_N;k++){
      const x=AGG_X0+k*AGG_STEP;
      e[k]=(Math.sin(x*0.0042+i*2.1)*0.46+Math.sin(x*0.0111+i*5.3)*0.26
           +Math.sin(x*0.0270+i*1.7)*0.17+Math.sin(x*0.0630+i*3.9)*0.11)*amp;
    }
    return e;
  });
}

/* ============ resize / scroll / puntero ============ */
function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  W=innerWidth;H=innerHeight;
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  cv.style.width=W+'px';cv.style.height=H+'px';
}
/* ============ reparto del scroll ============
   El clímax necesita más recorrido que el resto: es donde hay más para ver y
   donde el detalle es más chico. En vez de mover las constantes de cada fase
   —que están acopladas a cámara, etapas, ciclo día/noche y viraje— se reparte
   el scroll de forma no lineal sobre el mismo p.
   Los dos tramos del bucle llevan peso 1 y el resto compensa EXACTAMENTE, de
   modo que scroll y p coinciden en 0–0.05 y en 0.95–1. Por eso el corte sigue
   siendo demostrablemente invisible y los tests no necesitan cambiar. */
/* Cuánto del scroll se lleva cada tramo. Suman 1 y los dos extremos del bucle
   valen exactamente lo que miden en p, que es la condición de que el corte sea
   invisible: en 0–0.05 y en 0.95–1, scroll y p son el mismo número.
   El clímax subió de 0.2717 a 0.32 y el crecimiento bajó a 0.58. La fase
   interior pasó a tener un movimiento más —el giro que lleva la fruta de perfil
   a sección— y ese movimiento no se puede meter a presión entre los que ya
   estaban: una transición sin recorrido es un corte. */
const S_LOOP=0.05, S_GROW=0.58, S_END=0.32;
const P_LOOP=0.05, P_END=0.79, P_TAIL=0.95;

/* El tramo de crecimiento llevaba UN peso parejo de punta a punta, y eso repartía
   el scroll por duración biológica en vez de por densidad de acontecimiento. Las
   ventanas medidas lo muestran: `Juvenility` se llevaba 0.120 de p —la más larga
   de las trece— para mostrar un árbol que solamente engorda, mientras que
   `Emergence`, que es el brote rompiendo la tierra, se llevaba 0.050.
   Acá van pesos RELATIVOS: cuánto scroll se lleva cada fase por unidad de p.
   Mayor que uno se demora, menor pasa de largo. Se normalizan abajo, así que lo
   único que importa es la proporción entre ellos — y como la normalización
   fuerza que el tramo entregue exactamente el mismo scroll que antes, los dos
   extremos del bucle no se enteran y el corte sigue siendo invisible. */
const GROW_REL=[
  [0.050,0.135,0.85],   // imbibición
  [0.135,0.250,0.70],   // hidrotropismo: la raíz es larga y no cambia mucho
  [0.250,0.300,1.55],   // emergencia: el brote rompe la tierra. Se mira.
  [0.300,0.400,0.62],   // ciclos de brote
  [0.400,0.520,0.55],   // juvenilidad: el árbol engorda y nada más
  [0.520,0.560,0.85],   // inducción
  [0.560,0.632,1.50],   // antesis: la flor abre una sola vez en todo el ciclo
  [0.632,0.700,0.95],   // caída de junio
  [0.700,0.790,0.90],   // viraje de color
];
/* Las bandas de texto piden su propio tiempo, y no coincide con el de la
   biología. `Juvenility` no tiene nada que mostrar y encima lleva la banda más
   larga de la pieza; `Hydrotropism` es una raíz que baja despacio y abajo hay
   tres párrafos. Con el scroll eso lo resolvía el lector: frenaba. Sin scroll
   no lo resuelve nadie, así que lo resuelve el reparto.
   Cada rango es [desde, hasta, factor] y multiplica el peso ya calculado. */
const READ_REL=[
  [0.085,0.165,1.55],   // "Four embryos, one tree"
  [0.195,0.262,1.45],   // "Currently"
  [0.315,0.400,1.60],   // "How I work" — tres párrafos
  [0.440,0.510,1.50],   // "Writing"
  [0.560,0.622,1.15],   // "Say hi" — cae sobre la antesis, que ya iba lenta
];
/* La normalización es lo que sostiene el invariante: el tramo tiene que
   ENTREGAR el mismo scroll total que cuando era un peso solo. Repartir distinto
   adentro es gratis; cambiar el total no lo es. */
/* Se parte el tramo de crecimiento por TODOS los bordes —los de la biología y
   los de la lectura— y cada trozo se lleva el producto de los dos pesos. Así
   los dos repartos conviven sin que ninguno tenga que conocer al otro, y la
   normalización de abajo sigue forzando que el tramo entregue exactamente el
   mismo tiempo que entregaba con un peso plano: los dos extremos del bucle no
   se enteran y el corte sigue siendo invisible. */
const GROW_SEG=(()=>{
  const cuts=new Set();
  for(const g of GROW_REL){cuts.add(g[0]);cuts.add(g[1]);}
  for(const g of READ_REL){cuts.add(g[0]);cuts.add(g[1]);}
  const xs=[...cuts].filter(x=>x>=P_LOOP&&x<=P_END).sort((a,b)=>a-b);
  const out=[];
  for(let i=0;i<xs.length-1;i++){
    const a=xs[i],b=xs[i+1],m=(a+b)/2;
    let w=1;
    for(const g of GROW_REL) if(m>=g[0]&&m<g[1]) w=g[2];
    for(const g of READ_REL) if(m>=g[0]&&m<g[1]) w*=g[2];
    out.push([a,b,w]);
  }
  return out;
})();
const GROW_K=S_GROW/GROW_SEG.reduce((a,g)=>a+(g[1]-g[0])*g[2],0);
const WSEG=[[0,P_LOOP,1],
            ...GROW_SEG.map(g=>[g[0],g[1],g[2]*GROW_K]),
            [P_END,P_TAIL,S_END/(P_TAIL-P_END)],[P_TAIL,1,1]];
function sToP(u){
  let s=u;
  for(const g of WSEG){
    const w=(g[1]-g[0])*g[2];
    if(s<=w) return g[0]+s/g[2];
    s-=w;
  }
  return 1;
}

function pToS(p){
  let s=0;
  for(const g of WSEG){
    if(p<=g[0]) break;
    s+=(Math.min(p,g[1])-g[0])*g[2];
  }
  return s;
}

let target=0,p=0;
let pPrev=0,scrollV=0,skipV=false;   // velocidad de scroll, para calmar la noche
/* Ciclo completo en ~11 s a fondo, que son unas tres veces y media la
   velocidad de lectura cómoda: no molesta scrolleando normal y sólo actúa en
   los tirones. */
const PMAX=0.09;
function maxScroll(){return document.documentElement.scrollHeight-innerHeight;}
function readScroll(){const m=maxScroll();target=m>0?clamp(sToP(clamp(scrollY/m))):0;}
addEventListener('scroll',readScroll,{passive:true});

/* ============ la elección ============
   Esto lo decidía la posición del puntero: en la ventana de selección, el
   tercio de pantalla donde estuviera el mouse elegía la fruta, y más adelante
   el gajo. Se fue, y no por costo — por honestidad. Era una interacción a medio
   pulir sobre la que la pieza igual no tenía nada definido: no había forma de
   saber que había una elección, no había estado, no había vuelta atrás, y el
   resultado no llevaba a ninguna parte. Un control que no se anuncia y no se
   puede deshacer no es interacción, es una trampa.
   Lo que queda es determinista y sí tiene una lectura: cada VUELTA muestra otro
   proyecto. Quedándose, la pieza recorre el catálogo entero en vez de repetir
   siempre el mismo — y como el gajo avanza con un paso que no divide a cinco,
   tampoco se repite el par (proyecto, gajo) hasta la vuelta larga.
   El scroll sigue siendo el que maneja el tiempo. Eso nunca estuvo en duda. */
let chosenFruit=0, chosenGajo=2, carried=null, fruitScreen=[];
function loopTurn(){
  carried=IDEAS[PROJECTS[chosenFruit].gajos[chosenGajo].seeds[0]];
  chosenFruit=(chosenFruit+1)%PROJECTS.length;
  chosenGajo=(chosenGajo+2)%PROJECTS[chosenFruit].gajos.length;
}
function wrap(){
  /* Sólo cuando la REPRODUCCIÓN llegó al final, no cuando llegó el scroll: con
     el tope de velocidad p puede ir muy por detrás de target, y saltar acá se
     comería el clímax entero. */
  if(target<=0.9992||p<0.9985) return;
  const np=target-LOOP_AT;
  target=np;p=np;pPrev=np;skipV=true;   // el salto del bucle no es velocidad
  loopTurn();
  window.scrollTo(0,pToS(np)*maxScroll());
}

/* ============ bloom ============
   Sólo donde hay una fuente que lo justifique: las anteras al sol durante la
   floración y el fruto maduro a contraluz. Nunca global. Se acumulan las
   fuentes en coordenadas de pantalla, se pintan en un buffer a 1/4, se
   desenfoca una sola vez y se devuelve en `screen` — que es mucho más barato
   que un blur a resolución completa. */
const BLOOM_Q=4;
let bloomCv=null,bloomCtx=null,bloomOK=false;
const glowBuf=[];
function buildBloom(){
  try{
    bloomCv=document.createElement('canvas');
    bloomCtx=bloomCv.getContext('2d');
    bloomOK=!!(bloomCtx&&bloomCtx.drawImage&&ctx.drawImage&&'filter' in bloomCtx);
  }catch(e){ bloomOK=false; }
}
function drawBloom(){
  if(!bloomOK||!glowBuf.length){glowBuf.length=0;return;}
  const bw=Math.max(1,Math.round(W/BLOOM_Q)), bh=Math.max(1,Math.round(H/BLOOM_Q));
  if(bloomCv.width!==bw||bloomCv.height!==bh){bloomCv.width=bw;bloomCv.height=bh;}
  const g=bloomCtx;
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,bw,bh);
  g.filter='none';
  for(let i=0;i<glowBuf.length;i+=4){
    const r=Math.max(0.8,glowBuf[i+2]/BLOOM_Q);
    const rg=g.createRadialGradient(glowBuf[i]/BLOOM_Q,glowBuf[i+1]/BLOOM_Q,0,
      glowBuf[i]/BLOOM_Q,glowBuf[i+1]/BLOOM_Q,r);
    rg.addColorStop(0,rgba(LIGHT.sun,glowBuf[i+3].toFixed(3)));
    rg.addColorStop(1,rgba(LIGHT.sun,0));
    g.fillStyle=rg;
    g.fillRect(glowBuf[i]/BLOOM_Q-r,glowBuf[i+1]/BLOOM_Q-r,r*2,r*2);
  }
  glowBuf.length=0;
  ctx.save();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.globalCompositeOperation='screen';
  ctx.filter='blur(3px)';
  ctx.drawImage(bloomCv,0,0,W,H);
  ctx.filter='none';
  ctx.restore();
}

/* ============ dither ordenado ============
   Un gradiente grande en 8 bits deja bandas planas. La matriz de Bayer 8×8
   perturba ±1–2 niveles con media cero —la mitad de las celdas aclara y la
   otra mitad oscurece— y la banda se disuelve. Se construye una vez y se
   aplica en espacio de pantalla: en coordenadas de mundo la celda cambiaría
   de tamaño con el zoom y el patrón nadaría con la cámara. */
/* ============ granulación de la tierra ============
   El dither de acá abajo resuelve el BANDEO de un gradiente, que es un problema
   de 8 bits, y por eso va en espacio de pantalla. Esto es otra cosa: es la
   materia. Un estrato de tierra pintado con un gradiente lineal limpio se lee
   como plástico por más correcto que esté el color, y lo que lo vuelve tierra
   es que el pigmento esté asentado de forma despareja.
   La receta es la misma que la del papel —alta frecuencia modulada por baja—,
   pero acá el tile va en coordenadas de MUNDO: es la textura del suelo, no la
   de la hoja, así que tiene que crecer con el zoom y viajar con la cámara. Si
   se pintara en pantalla, la tierra "hierve" cuando la cámara baja. */
let grit=null, haze=null;
/* `soft` deja sólo la octava gruesa. Es lo que quiere el cielo: ahí el problema
   no es falta de grano —el papel ya lo pone, y encima el cielo es lo más lejos
   que hay— sino que un degradado de dos paradas no tiene NADA. Un cielo pintado
   tiene nubes de valor: variación grande y suavísima. Grano fino ahí se leería
   como suciedad de sensor. */
function buildGrit(soft){
  const N=256;
  try{
    const c=document.createElement('canvas');
    c.width=N;c.height=N;
    const g=c.getContext('2d');
    if(!g||!g.createImageData||!ctx.createPattern) return null;
    const im=g.createImageData(N,N);
    const h=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);};
    /* Las dos octavas son INTERPOLADAS, ninguna es ruido por píxel — y eso no
       es una preferencia estética. Un texel de este tile mide un píxel de
       MUNDO, así que con la cámara a 3× cada texel se ve como un cuadradito
       de tres píxeles: ruido por píxel acá abajo se convierte en mosaico en
       cuanto la pieza se acerca a mirar la raíz.
       El reparto correcto es ése: el grano fino lo pone el papel, que vive en
       espacio de pantalla y por eso es nítido a cualquier zoom; este tile pone
       el CÚMULO, que es lo que hace que el pigmento se lea asentado. Cada uno
       en el espacio al que de verdad pertenece. */
    const octave=C=>{
      const m=new Float32Array((C+1)*(C+1));
      // El módulo es lo que hace que el tile cierre consigo mismo al repetir.
      for(let j=0;j<=C;j++) for(let i=0;i<=C;i++) m[j*(C+1)+i]=h(i%C,j%C);
      return (x,y)=>{
        const u=x/N*C, v=y/N*C, i=u|0, j=v|0;
        const fu=smooth(u-i), fv=smooth(v-j);
        const a=lerp(m[j*(C+1)+i],m[j*(C+1)+i+1],fu);
        const b=lerp(m[(j+1)*(C+1)+i],m[(j+1)*(C+1)+i+1],fu);
        return lerp(a,b,fv);
      };
    };
    const fine=octave(16), coarse=octave(soft?2:4), mid=octave(6);
    for(let y=0;y<N;y++) for(let x=0;x<N;x++){
      // El producto de las dos: la textura fina sólo carga donde la mancha
      // grande la deja. Eso es un cúmulo, y es lo que no da una octava sola.
      const v=soft ? coarse(x,y)*(0.45+0.55*mid(x,y))
                   : fine(x,y)*(0.28+0.72*coarse(x,y));
      const i=(y*N+x)*4;
      im.data[i]=im.data[i+1]=im.data[i+2]=0;
      im.data[i+3]=Math.round(Math.pow(v,soft?1.1:1.5)*255);
    }
    g.putImageData(im,0,0);
    return ctx.createPattern(c,'repeat');
  }catch(e){ return null; }
}

let dither=null;
function buildDither(){
  const B=[0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
           12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
           3,35,11,43,1,33,9,41,  51,19,59,27,49,17,57,25,
           15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21];
  try{
    const c=document.createElement('canvas');
    c.width=8;c.height=8;
    const g=c.getContext('2d');
    if(!g||!g.createImageData||!ctx.createPattern) return null;
    const im=g.createImageData(8,8);
    for(let i=0;i<64;i++){
      const up=B[i]>=32, v=up?(B[i]-32)/31:(31-B[i])/31;
      im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=up?255:0;
      im.data[i*4+3]=Math.round(v*255);
    }
    g.putImageData(im,0,0);
    return ctx.createPattern(c,'repeat');
  }catch(e){ return null; }
}

/* ============ cielo y suelo ============ */
/* El tramo largo era el de vuelta: del tostado del atardecer al azul del día no
   se llega sin pasar por algún lado, y en línea recta ese lado es el gris. Se
   parte en dos con una parada de madrugada — el cielo de verdad vuelve por el
   violeta y el salmón, nunca por el neutro— y cada salto queda entre matices
   vecinos. La mezcla va por OKLCh, así que el croma es el que se pidió. */
function skyColors(pe,night){
  const A=key([[0,0],[0.25,1],[0.52,2],[0.70,3],[0.82,4],[0.95,5]],pe,t=>t);
  /* La última parada es la primera, byte por byte. Es un CICLO: el cielo con el
     que cierra la vuelta tiene que ser el cielo con el que abre la siguiente.
     Estaba en '#7EB2D2','#D6E4E9' contra '#6FA6CF','#C9DDE9', y esa diferencia
     —quince niveles de luma sobre la superficie más grande del cuadro— era el
     salto que el destello blanco del final estaba tapando. Con el destello
     afuera, tapar dejó de ser una opción y hubo que arreglarlo. */
  const P=[['#6FA6CF','#C9DDE9'],['#7FB3D4','#DCE7E4'],['#8DBBD6','#E8E2CE'],
           ['#B98C6A','#EBCB96'],['#7E6796','#E5A48F'],['#6FA6CF','#C9DDE9']];
  const i=Math.min(4,Math.floor(A)),f=A-i;
  let a=mixL(P[i][0],P[i+1]?P[i+1][0]:P[i][0],f);
  let b=mixL(P[i][1],P[i+1]?P[i+1][1]:P[i][1],f);
  /* La noche también es una mezcla larga: apagar un cielo cálido contra un
     navy por el camino recto lo pasa por el mismo gris de antes.
     Y los dos destinos estaban demasiado juntos: 27 y 47 de luma, o sea que la
     noche entera cabía en veinte niveles. Medido sobre el frame, el cielo iba de
     54 en el cenit a 77 en el horizonte — veintitrés niveles para toda la
     imagen. Eso no es una noche, es un tono.
     Un cielo nocturno de verdad tiene un gradiente vertical fuerte: negro
     arriba, y la luz que queda apoyada en el horizonte. Separando los dos
     destinos aparece el oscuro que el cuadro no tenía, y el horizonte se queda
     como la nota clara. */
  if(night>0.01){a=mixL(a,'#070C1A',night);b=mixL(b,'#2E3E64',night);}
  return {a,b};
}
function drawSky(view,sky,night){
  if(view.y0>=0) return;
  const g=ctx.createLinearGradient(0,view.y0,0,Math.min(view.y1,0));
  g.addColorStop(0,sky.a);g.addColorStop(1,sky.b);
  ctx.fillStyle=g;
  ctx.fillRect(view.x0-10,view.y0-10,view.w+20,Math.min(view.y1,0)-view.y0+20);
  /* Antes esto se apagaba con `night<0.7`, y ahí la noche se quedaba sin UNA
     sola nota clara: un cuadro cuyo punto más luminoso es el fondo no tiene
     dónde apoyar el ojo. Cualquiera que haya pintado una nocturna sabe que lo
     primero que se pone es la luna.
     Es el mismo halo, no uno nuevo: la fuente sigue estando donde dice LIGHT,
     así que lo que ilumina y lo que se ve siguen coincidiendo. Lo que cambia con
     la noche es el color —de sol cálido a luna fría— y el tamaño: el halo lunar
     es mucho más ceñido que el resplandor del sol. */
  {
    const yb=Math.min(view.y1,0), hgt=yb-view.y0;
    const sx=view.x0+view.w*(0.5+LIGHT.x*0.42), sy=yb+LIGHT.y*hgt*0.78;
    const moon=night>0.01?mixH(LIGHT.sun,'#DCE6F5',night):LIGHT.sun;
    const R=(420*(1+LIGHT.low*0.55))*(1-0.55*night);
    const rg=ctx.createRadialGradient(sx,sy,0,sx,sy,R);
    rg.addColorStop(0,rgba(moon,0.62));
    rg.addColorStop(0.34,rgba(moon,0.20));
    rg.addColorStop(1,rgba(moon,0));
    /* De día el halo sigue la exposición como siempre; de noche no se apaga del
       todo, se queda en una nota chica y clara. */
    ctx.globalAlpha=lerp((1-night)*0.9,0.34,night);ctx.fillStyle=rg;
    ctx.beginPath();ctx.arc(sx,sy,R,0,6.283);ctx.fill();
    ctx.globalAlpha=1;
  }
}
function drawSoil(view,camS){
  if(view.y1<0) return;
  const bot=view.y1+400;
  /* Se pinta de arriba hacia abajo: cada estrato tapa todo lo que queda por
     debajo de su propia frontera, así que las fronteras onduladas se ven sin
     necesidad de recortar nada. */
  for(let i=0;i<SOIL.length;i++){
    const y0=SOIL[i].y, y1=i<SOIL.length-1?SOIL[i+1].y:bot;
    if(y0>view.y1) break;
    const g=ctx.createLinearGradient(0,y0,0,y1);
    g.addColorStop(0,SOIL[i].c);
    g.addColorStop(1,i<SOIL.length-1?SOIL[i+1].c:SOIL[i].c);
    ctx.fillStyle=g;
    ctx.beginPath();
    const e=soilEdge[i];
    ctx.moveTo(view.x0-10,y0+e[0]);
    for(let k=0;k<AGG_N;k++){
      const x=AGG_X0+k*AGG_STEP;
      if(x<view.x0-60||x>view.x1+60) continue;
      ctx.lineTo(x,y0+e[k]);
    }
    ctx.lineTo(view.x1+10,y0+e[AGG_N-1]);
    ctx.lineTo(view.x1+10,bot);ctx.lineTo(view.x0-10,bot);
    ctx.closePath();ctx.fill();
  }
  /* Granulación sobre los estratos ya pintados y por debajo de todo lo demás:
     es el pigmento de la tierra, no un velo sobre la escena. */
  if(grit){
    /* Recortada contra la MISMA frontera que dibujó el primer estrato, no
       contra una caja: con un rectángulo, la franja que sobra por encima de la
       loma cae sobre el cielo y aparece una banda de arena flotando en el aire
       —y el borde ondula ±17 px, así que no hay margen fijo que la tape. */
    ctx.save();
    /* La carga sigue a la cámara. El tile mide 256 px de MUNDO: de lejos entra
       seis veces en el ancho de la pantalla y el cúmulo se vuelve un tramado
       parejo —justo lo que la granulación venía a evitar—; de cerca entra una
       vez y media y se lee como materia.
       Además es lo que hace cualquier medio real: el grano aparece cuando te
       acercás al papel, no cuando te alejás. */
    ctx.globalAlpha=0.22*clamp((camS-0.7)/1.5,0.34,1);
    ctx.fillStyle=grit;
    ctx.beginPath();
    ctx.moveTo(view.x0-10,edgeAt(0,view.x0-10));
    for(let k=0;k<AGG_N;k++){
      const x=AGG_X0+k*AGG_STEP;
      if(x<view.x0-60||x>view.x1+60) continue;
      ctx.lineTo(x,soilEdge[0][k]);
    }
    ctx.lineTo(view.x1+10,edgeAt(0,view.x1+10));
    ctx.lineTo(view.x1+10,bot);ctx.lineTo(view.x0-10,bot);
    ctx.closePath();ctx.fill();
    ctx.restore();
  }
  /* Bolsas de humedad.
     Eran un `arc` perfecto con un gradiente radial encima, y eso no se lee como
     agua en la tierra: se lee como un disco azul con blur pegado sobre el
     dibujo, exactamente el mismo defecto que tenía la masa de copa. El agua en
     un suelo no ocupa un círculo — ocupa los poros, así que su contorno lo
     dicta la textura de la tierra, no la geometría.
     Dos correcciones. La forma pasa a ser un contorno irregular cerrado con
     bezier, del que el gradiente no puede salirse; y la intensidad baja a la
     mitad, porque una bolsa de humedad es tierra MÁS OSCURA Y MÁS FRÍA, no una
     luz encendida abajo. */
  for(const w of POCKETS){
    if(w.y+w.r<view.y0||w.y-w.r>view.y1) continue;
    ctx.save();
    ctx.beginPath();
    const N=11;
    for(let k=0;k<=N;k++){
      const a=k*6.283/N;
      // El radio ondula con dos armónicos que no son múltiplo uno del otro:
      // la forma nunca se cierra sobre sí misma en un patrón reconocible.
      const rr=w.r*(0.80+0.16*Math.sin(a*3+w.x*0.03)+0.10*Math.sin(a*5-w.y*0.02));
      const x=w.x+Math.cos(a)*rr, y=w.y+Math.sin(a)*rr*0.86;
      if(k===0) ctx.moveTo(x,y);
      else{
        const pa=(k-1)*6.283/N, ma=(pa+a)*0.5;
        const mr=w.r*(0.80+0.16*Math.sin(ma*3+w.x*0.03)+0.10*Math.sin(ma*5-w.y*0.02))*1.06;
        ctx.quadraticCurveTo(w.x+Math.cos(ma)*mr,w.y+Math.sin(ma)*mr*0.86,x,y);
      }
    }
    ctx.closePath();
    ctx.clip();
    const rg=ctx.createRadialGradient(w.x,w.y,0,w.x,w.y,w.r);
    /* Oscurecimiento de borde. Una mancha de agua no se desvanece parejo desde
       el centro: al secarse, la tensión superficial arrastra el pigmento HACIA
       AFUERA y el aro del borde queda más denso que el medio. Es el efecto que
       delata a una acuarela de verdad. */
    rg.addColorStop(0,'rgba(58,84,96,.16)');
    rg.addColorStop(0.58,'rgba(52,78,90,.07)');
    rg.addColorStop(0.88,'rgba(38,62,72,.15)');
    rg.addColorStop(1,'rgba(38,62,72,.02)');
    ctx.fillStyle=rg;ctx.fillRect(w.x-w.r,w.y-w.r,w.r*2,w.r*2);
    // Grano húmedo: la tierra empapada tiene los agregados más marcados, no
    // burbujas de luz. Va recortado por la misma forma, así que no se escapa.
    ctx.fillStyle='rgba(30,50,58,.13)';
    ctx.beginPath();
    for(let k=0;k<88;k++){
      const a=k*2.39996+w.x*0.01;
      const rr=w.r*(0.30+0.62*((Math.sin(k*12.9898+w.y)*0.5+0.5)));
      const bx=w.x+Math.cos(a)*rr, by=w.y+Math.sin(a)*rr*0.86;
      const bs=w.r*(0.010+0.020*(Math.sin(k*4.7)*0.5+0.5));
      ctx.moveTo(bx+bs,by);ctx.arc(bx,by,bs,0,6.283);
    }
    ctx.fill();
    ctx.restore();
  }
  /* Partículas. Eran `fillRect`: cuadraditos perfectos alineados al eje, que a
     cámara cerca se leen como polvo de monitor y no como grano de tierra. Nada
     en un suelo tiene los lados paralelos al borde de la hoja. */
  ctx.fillStyle='#000';
  for(let bin=0;bin<4;bin++){
    ctx.globalAlpha=0.069+bin*0.0375;
    ctx.beginPath();
    let any=0;
    for(const s of speck){
      if(s.bin!==bin) continue;
      if(s.y<view.y0-20||s.y>view.y1+20||s.x<view.x0-20||s.x>view.x1+20) continue;
      const rr=s.s*0.5;
      // `arc` continúa el subpath abierto: sin el `moveTo` cada partícula queda
      // cosida a la anterior por una recta, igual que pasaba con las piedras.
      ctx.moveTo(s.x+rr,s.y);ctx.arc(s.x,s.y,rr,0,6.283);
      any=1;
    }
    if(any) ctx.fill();
  }
  /* Agregados con volumen. Un canto en corte no es una mancha plana: deja un
     hueco oscuro por debajo y su cara de arriba recibe lo que se filtra. Tres
     pasadas sobre la lista entera —hueco, cuerpo, cara— y no tres rellenos por
     piedra: el coste es el mismo que tenía la mancha. */
  const vis=[];
  for(const s of stones) if(s.y>=view.y0-24&&s.y<=view.y1+24) vis.push(s);
  if(vis.length){
    /* `ellipse` continúa el subpath abierto: sin un `moveTo` al punto de
       arranque, cada piedra queda cosida a la anterior por una recta. */
    const arc=(s,dy,fw,fh)=>{
      const w=s.w*fw,h=s.h*fh;
      ctx.moveTo(s.x+w*s.ca,s.y+dy+w*s.sa);
      ctx.ellipse(s.x,s.y+dy,w,h,s.a,0,6.283);
    };
    /* El detalle estaba repartido parejo, y eso es lo contrario de lo que hace
       un dibujante. Con alpha 0.30 en todas partes las piedras no leían como
       piedras: leían como manchas, porque una forma sin contraste suficiente no
       es una forma. Y subirle el contraste a TODAS tampoco sirve — un cuadro
       con detalle uniforme no tiene dónde mirar.
       La jerarquía va por distancia al sujeto, que en este corte vive en x≈0:
       cerca, la piedra tiene hueco, cuerpo, cara y contorno; lejos se deshace
       en la masa de tierra. Es el mismo criterio con el que un ojo enfoca. */
    const halfW=Math.max(1,view.w*0.5);
    const near=[],far=[];
    for(const s of vis) (Math.abs(s.x)/halfW<0.42?near:far).push(s);
    /* Un lote por nivel de jerarquía: dos rellenos en lugar de uno, no uno por
       piedra. Se mantiene el orden de coste que ya tenía. */
    /* `dyf` es un FACTOR sobre la altura de cada piedra, no un desplazamiento
       fijo: el hueco de un canto grande cae más abajo que el de uno chico, y
       pasarlo como constante aplasta esa diferencia. */
    const batch=(list,dyf,fw,fh,col,al)=>{
      if(!list.length) return;
      ctx.globalAlpha=al;ctx.fillStyle=col;
      ctx.beginPath();
      for(const s of list) arc(s,s.h*dyf,fw,fh);
      ctx.fill();
    };
    batch(far ,0.32,1,1,'#140F09',0.22);   // el hueco que deja el canto por debajo
    batch(near,0.32,1,1,'#140F09',0.46);
    // El cuerpo ya llevaba alpha por piedra, así que acá la caída es continua.
    for(const s of vis){
      const d=clamp(Math.abs(s.x)/halfW);
      ctx.globalAlpha=0.24+0.30*(1-d)*(1-d);
      ctx.fillStyle=s.c;
      ctx.beginPath();arc(s,0,1,1);ctx.fill();
    }
    // La cara de arriba es una lente fina pegada al borde, no una tapa: una
    // elipse ancha y centrada deja su propio contorno cruzando la piedra.
    batch(far ,-0.44,0.70,0.34,'#CBB78E',0.09);
    batch(near,-0.44,0.70,0.34,'#CBB78E',0.20);
    /* El contorno es lo que termina de convertir la mancha en forma, y va SÓLO
       en las de cerca: dibujarlo en todas devuelve el detalle uniforme que
       estábamos sacando. */
    if(near.length){
      ctx.globalAlpha=0.16;ctx.strokeStyle='#0F0B06';ctx.lineWidth=1.1;
      ctx.beginPath();
      for(const s of near) arc(s,0,1,1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha=1;

  /* ---------- la superficie ----------
     Es la única franja de tierra que ve el sol, y hasta acá no se enteraba: a
     medianoche estaba pintada igual que a mediodía. Se la trata como una lámina
     horizontal, con la normal hacia arriba — su incidencia es −LIGHT.y. */
  const pdUp=clamp(-LIGHT.y);
  const ex0=edgeAt(0,view.x0-10), ex1=edgeAt(0,view.x1+10);
  /* `wob` modula el desplazamiento con la ondulación del estrato de abajo: sin
     eso la costra tiene grosor constante y a cámara cerca se lee como una
     franja dibujada encima, no como una capa de tierra. */
  const edgeRun=(off,fwd,wob)=>{
    const w0=wob?edgeAt(1,view.x0-10)*wob:0, w1=wob?edgeAt(1,view.x1+10)*wob:0;
    if(fwd){
      ctx.lineTo(view.x0-10,ex0+off+w0);
      for(let k=0;k<AGG_N;k++){
        const x=AGG_X0+k*AGG_STEP;
        if(x<view.x0-60||x>view.x1+60) continue;
        ctx.lineTo(x,soilEdge[0][k]+off+(wob?soilEdge[1][k]*wob:0));
      }
      ctx.lineTo(view.x1+10,ex1+off+w1);
    }else{
      ctx.lineTo(view.x1+10,ex1+off+w1);
      for(let k=AGG_N-1;k>=0;k--){
        const x=AGG_X0+k*AGG_STEP;
        if(x<view.x0-60||x>view.x1+60) continue;
        ctx.lineTo(x,soilEdge[0][k]+off+(wob?soilEdge[1][k]*wob:0));
      }
      ctx.lineTo(view.x0-10,ex0+off+w0);
    }
  };
  // Costra seca: los primeros milímetros pierden el agua y se aclaran.
  ctx.beginPath();ctx.moveTo(view.x0-10,ex0);edgeRun(0,true);edgeRun(9,false,0.42);ctx.closePath();
  ctx.fillStyle=shadeFlat(mixH(SOIL[0].c,'#AC8D60',0.60),pdUp,1);
  ctx.fill();
  // Y por debajo, la luz se apaga en el grano: unos diez centímetros y ya no hay.
  const gy=ctx.createLinearGradient(0,0,0,120);
  gy.addColorStop(0,rgba(LIGHT.sun,0.05+0.20*pdUp));
  gy.addColorStop(1,rgba(LIGHT.sun,0));
  ctx.fillStyle=gy;
  ctx.beginPath();ctx.moveTo(view.x0-10,ex0);edgeRun(0,true);edgeRun(120,false);ctx.closePath();ctx.fill();

  // Hojarasca del ciclo anterior, tumbada sobre el borde.
  ctx.strokeStyle=shadeFlat('#4A3A22',pdUp,1);ctx.lineWidth=1.4;ctx.lineCap='round';
  for(const s of litter){
    if(s.x<view.x0-20||s.x>view.x1+20) continue;
    const y=edgeAt(0,s.x)+s.dy;
    ctx.globalAlpha=s.o;
    ctx.beginPath();ctx.moveTo(s.x,y);
    ctx.lineTo(s.x+Math.cos(s.a)*s.l,y+Math.sin(s.a)*s.l*0.5);ctx.stroke();
  }
  ctx.globalAlpha=1;

  /* El borde sigue la ondulación. Recto era la marca de que esto es un relleno.
     Y el filo se reparte: pleno en el centro —donde está el árbol, que es el
     foco de todos los frames— y aflojando hacia los costados. Con alpha
     constante ésta era la línea más dura del cuadro, cruzándolo entero de lado
     a lado, compitiendo con lo único que hay que mirar.
     No es bruma de distancia: la pieza es una vista EN CORTE y el borde está
     todo a la misma distancia. Es jerarquía de bordes, que es otra cosa. */
  const eg=ctx.createLinearGradient(view.x0,0,view.x1,0);
  eg.addColorStop(0,'rgba(40,30,18,.13)');
  eg.addColorStop(0.5,'rgba(40,30,18,.52)');
  eg.addColorStop(1,'rgba(40,30,18,.13)');
  ctx.strokeStyle=eg;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(view.x0-10,ex0);edgeRun(0,true);ctx.stroke();
}

/* ============ contacto con la tierra ============
   Un tronco que cruza la línea del suelo y sigue de largo es lo que hace que el
   árbol se vea apoyado encima en vez de plantado. Lo que lo asienta son dos
   cosas, y ninguna es una sombra: el ensanche de la base —el pie, que en un
   cítrico adulto es bien visible— y la oclusión de la juntura, donde la tierra
   se oscurece contra la madera porque ahí no le llega nada.
   Se dibuja después del árbol: así el ancho del tronco es el de este frame y no
   el del anterior, y la pieza sigue siendo función de pe. */
function drawContact(g){
  const w=g.wb[0]*0.5;
  if(w<1.6) return;
  const e=edgeAt(0,0);

  /* Ni el tronco ni la pivotante pasan ya por x=0: el tronco nace inclinado y
     arqueado, y la raíz sale curva. Las tres piezas del contacto se apoyan
     sobre esos dos ejes REALES en vez de sobre la vertical que se suponía.
     Clavadas en cero, el pie quedaba como un bloque escalonado al costado del
     tronco y el cuello como una venda pálida al lado de la raíz. */
  const a0=g.A[0], nx=Math.sin(a0), ny=-Math.cos(a0);
  const bm0=g.bend[0]*g.len[0]*g.G[0], ty0=g.Y[0]+4;
  // Misma curvatura que dibuja `rings`: interpolación de RB sobre los 4 anillos.
  const rbAt=u=>{
    for(let k=1;k<4;k++) if(u<=RU[k]) return lerp(RB[k-1],RB[k],(u-RU[k-1])/(RU[k]-RU[k-1]));
    return 0;
  };
  const woodAxis=y=>{
    if(!(ty0<0)) return 0;                      // sin tronco crecido, la vertical
    const u=clamp((y+4)/ty0);
    return g.X[0]*u+nx*rbAt(u)*bm0;
  };
  const rootAxis=y=>{
    if(!crown) return 0;
    const u=clamp((y-6)/((crown.y-6)||1)), v=1-u;
    return 2*v*u*crown.cx+u*u*crown.x;
  };
  const xB=rootAxis(e);                          // el eje justo en la juntura

  /* 1. Oclusión en la juntura. Va recortada por debajo del borde: la tierra se
     oscurece contra la madera, pero el aire de al lado no tiene por qué. Sin el
     recorte queda un halo gris flotando sobre la línea del suelo. */
  const R=w*5.2;
  ctx.save();
  ctx.beginPath();ctx.rect(xB-R,e,R*2,w*4);ctx.clip();
  const rg=ctx.createRadialGradient(xB,e,w*0.5,xB,e,R);
  rg.addColorStop(0,'rgba(22,15,8,.42)');
  rg.addColorStop(0.30,'rgba(22,15,8,.14)');
  rg.addColorStop(1,'rgba(22,15,8,0)');
  ctx.fillStyle=rg;
  ctx.beginPath();ctx.ellipse(0,e,R,w*2.6,0,0,6.283);ctx.fill();
  ctx.restore();

  /* 2. El cuello. La raíz principal no cambia de material al cruzar el suelo:
     lo hace de a poco, a lo largo de los primeros centímetros. Dibujado acá
     —después de las raíces— es lo que cose el tronco oscuro con la raíz pálida
     en vez de dejar el empalme a la vista. */
  /* El color no se inventa: sale de la misma paleta que el tronco, indexada por
     su propia incidencia. Cualquier otra cosa produce un pie más claro que la
     madera que sostiene, que es peor que no tener pie. */
  const pd0=nx*LIGHT.x+ny*LIGHT.y;
  let bin=Math.round((pd0+1)*0.5*(PD_BINS-1));
  if(bin<0)bin=0; else if(bin>PD_BINS-1)bin=PD_BINS-1;

  const CH=w*5.5, rw=w*0.46;
  // El cuello sigue a la raíz: arriba nace en el eje de la juntura y abajo
  // termina montado sobre la pivotante, esté donde esté.
  const xM=rootAxis(e+CH*0.42), xE=rootAxis(e+CH);
  const cg=ctx.createLinearGradient(0,e-2,0,e+CH);
  cg.addColorStop(0,woodPal[bin*3+1]);
  cg.addColorStop(1,'#B9A47A');
  ctx.fillStyle=cg;
  ctx.beginPath();
  ctx.moveTo(xB-w*0.86,e-4);
  ctx.quadraticCurveTo(xM-w*0.60,e+CH*0.42,xE-rw,e+CH);
  ctx.lineTo(xE+rw,e+CH);
  ctx.quadraticCurveTo(xM+w*0.60,e+CH*0.42,xB+w*0.86,e-4);
  ctx.closePath();ctx.fill();

  /* 3. El pie. La base de un cítrico adulto no es un cilindro cortado: se abre
     con una curva cóncava —un filete— hacia las raíces de anclaje. El control
     de la cuadrática va justo debajo del borde del tronco; si va hacia afuera
     la curva se vuelve convexa y sale un cono, que es peor que no ponerlo. */
  const H=w*3.0, S=w*2.30;
  // Arriba, el eje de la MADERA —que es contra lo que el pie tiene que cerrar—;
  // abajo, el de la juntura. Entre los dos hay hoy varios píxeles de diferencia.
  const xT=woodAxis(e-H);
  for(let i=0;i<2;i++){
    const sg=i?1:-1;
    // La banda del tronco que le toca a este lado: u = sg·nx, igual que ribbon.
    const bandC=woodPal[bin*3+(sg*nx>0?2:0)];
    /* Borde perdido arriba. El pie cerraba con un corte horizontal a la altura
       e−H: como su tinte es el de una banda y el tronco ahí ya lleva las tres,
       ese corte se leía como el escalón de una pieza pegada encima. Un pie no
       empieza en ninguna altura — se va engrosando. El degradado a
       transparente hace que la unión no exista en vez de disimularla. */
    const fg=ctx.createLinearGradient(0,e-H,0,e-H*0.12);
    fg.addColorStop(0,rgba(bandC,0));
    fg.addColorStop(1,rgba(bandC,1));
    ctx.fillStyle=fg;
    ctx.beginPath();
    ctx.moveTo(xT+sg*w*0.98,e-H);
    ctx.quadraticCurveTo(xT+sg*w*0.98,e-H*0.04,xB+sg*S,e+3);
    ctx.lineTo(xB,e+3);
    ctx.lineTo(xT,e-H);
    ctx.closePath();ctx.fill();
  }
}

/* ============ atmósfera ============
   Rayos rasantes al amanecer y al atardecer, y polvo en suspensión durante la
   floración. Los dos son función pura de (pe, t): no guardan estado, así que
   no comprometen el bucle. */
const DUST_N=88, DUST=new Float32Array(DUST_N*4);
for(let i=0;i<DUST_N;i++){
  const f=n=>{const h=Math.sin(n)*43758.5453;return h-Math.floor(h);};
  DUST[i*4]=f(i*1.7)*900-450; DUST[i*4+1]=f(i*3.1)*520-470;
  DUST[i*4+2]=f(i*5.3);       DUST[i*4+3]=f(i*7.9)*6.283;
}
function drawAir(view,pe,t,night){
  const yb=Math.min(view.y1,0), hgt=yb-view.y0;
  const sx=view.x0+view.w*(0.5+LIGHT.x*0.42), sy=yb+LIGHT.y*hgt*0.78;
  // Volumétricos: sólo con el sol bajo, y nunca de noche.
  const ray=clamp((LIGHT.low-0.40)/0.32)*(1-clamp((night-0.28)/0.34));
  if(ray>0.012){
    const R=view.w*1.5;
    const rg=ctx.createRadialGradient(sx,sy,0,sx,sy,R);
    rg.addColorStop(0,rgba(LIGHT.sun,0.5));
    rg.addColorStop(0.45,rgba(LIGHT.sun,0.16));
    rg.addColorStop(1,rgba(LIGHT.sun,0));
    ctx.fillStyle=rg;ctx.globalAlpha=ray*0.30;
    const base=Math.atan2(-LIGHT.y,-LIGHT.x);
    for(let k=0;k<7;k++){
      const a=base+(k-3)*0.088+Math.sin(t*0.07+k*1.7)*0.014;
      const w=0.016+0.014*(Math.sin(k*2.3)*0.5+0.5);
      ctx.beginPath();ctx.moveTo(sx,sy);
      ctx.lineTo(sx+Math.cos(a-w)*R,sy+Math.sin(a-w)*R);
      ctx.lineTo(sx+Math.cos(a+w)*R,sy+Math.sin(a+w)*R);
      ctx.closePath();ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // Polvo: es primavera y el aire tiene polen.
  const dus=clamp((pe-0.525)/0.030)*(1-clamp((pe-0.638)/0.040));
  if(dus>0.01&&!REDUCED){
    ctx.fillStyle=rgba(LIGHT.sun,0.9);
    for(let i=0;i<DUST_N;i++){
      const ph=DUST[i*4+3];
      let x=DUST[i*4]+t*(6+DUST[i*4+2]*16);
      x=((x+450)%900+900)%900-450;
      const y=DUST[i*4+1]+Math.sin(t*0.5+ph)*15;
      const tw=Math.pow(Math.sin(t*1.6+ph)*0.5+0.5,3);
      ctx.globalAlpha=dus*(0.14+0.5*tw);
      ctx.fillRect(x,y,1.3,1.3);
    }
    ctx.globalAlpha=1;
  }
}

/* ============ la semilla ============
   Es LA MISMA semilla en los tres lugares donde aparece: dentro del gajo,
   cayendo por el cielo y germinando bajo tierra. Estaba dibujada de tres
   maneras distintas —dos elipses de proporciones diferentes y una lágrima— y
   por eso el ciclo no se leía como el mismo objeto volviendo, que es
   literalmente el argumento de la pieza.
   Marco canónico: eje largo sobre y, micrópilo (la punta, por donde sale la
   radícula) abajo, calaza redondeada arriba. `s` es la semilongitud. */
const SEED_BASE='#EFE3C2';
function seedPath(g,s){
  const w=s*0.66;
  g.beginPath();
  g.moveTo(0,-s);
  g.quadraticCurveTo(w*1.08,-s*0.70,w*0.93,-s*0.02);
  g.quadraticCurveTo(w*0.82,s*0.64,0,s);
  g.quadraticCurveTo(-w*0.82,s*0.64,-w*0.93,-s*0.02);
  g.quadraticCurveTo(-w*1.08,-s*0.70,0,-s);
  g.closePath();
}
/* `draw` de 0 a 1 traza la semilla en vez de encenderla.
   Las semillas dentro del gajo aparecían subiendo el alpha, que es la forma de
   hacer aparecer algo cuando no querés que se note que apareció — y acá es
   exactamente al revés: la semilla es lo que la pieza quiere que mires, porque
   es lo que se va a llevar al ciclo siguiente.
   Así que se DIBUJA: primero el contorno, trazándose desde la calaza hacia la
   punta con `setLineDash` sobre un dash único del largo del propio contorno, y
   detrás va entrando el relleno. Es literalmente la animación de un path de
   SVG, hecha en canvas — el mismo recurso y la misma lectura. El rafe sale al
   final, cuando ya hay semilla donde ponerlo. */
function seedDraw(s,fill,line,draw){
  const d=draw===undefined?1:clamp(draw);
  if(d<=0) return;
  seedPath(ctx,s);
  if(d>=1){
    ctx.fillStyle=fill;ctx.fill();
  }else{
    // El relleno persigue al trazo, un cuarto de vuelta atrás.
    const a=ctx.globalAlpha;
    ctx.globalAlpha=a*clamp((d-0.25)/0.55);
    ctx.fillStyle=fill;ctx.fill();
    ctx.globalAlpha=a;
  }
  ctx.strokeStyle=line;ctx.lineWidth=Math.max(0.5,s*0.070);
  if(d<1){
    /* El perímetro de la silueta, con holgura: `setLineDash` necesita un largo
       y medirlo de verdad exigiría integrar cuatro cuadráticas por frame. El
       contorno de la semilla es una lágrima de semieje `s`, así que su
       perímetro anda por 5·s; con un dash más largo que el real el trazo llega
       antes de tiempo, y con uno más corto no cierra nunca. 5.4 cierra. */
    const per=s*5.4;
    ctx.setLineDash([per,per]);
    ctx.lineDashOffset=per*(1-d);
    ctx.stroke();
    ctx.setLineDash([]);ctx.lineDashOffset=0;
  }else ctx.stroke();
  if(s>6&&d>0.62){              // el rafe: la costura que recorre la semilla
    const r=clamp((d-0.62)/0.38), per=s*1.5;
    ctx.beginPath();
    ctx.moveTo(-s*0.26,-s*0.56);
    ctx.quadraticCurveTo(-s*0.44,0,-s*0.14,s*0.68);
    if(r<1){ ctx.setLineDash([per,per]); ctx.lineDashOffset=per*(1-r); }
    ctx.stroke();
    if(r<1){ ctx.setLineDash([]); ctx.lineDashOffset=0; }
  }
}

function drawSeed(pe){
  const swell=key([[0.05,1],[0.10,1.22],[0.17,1.3]],pe);
  const open=clamp((pe-0.095)/0.045);
  ctx.save();ctx.translate(0,4);ctx.rotate(-0.2+open*0.1);
  seedDraw(13*swell,
    shadeD(mixH(SEED_BASE,'#C9B689',clamp((pe-0.075)/0.09)),0.80),
    'rgba(90,70,40,.5)');
  if(open>0){                   // la testa se abre por la sutura
    ctx.strokeStyle='rgba(90,70,40,.55)';ctx.lineWidth=0.9;
    ctx.beginPath();ctx.moveTo(0,-13*swell);ctx.lineTo(0,13*swell);ctx.stroke();
  }
  ctx.restore();
  const emb=clamp((pe-0.105)/0.045);
  if(emb>0){
    ctx.strokeStyle='#C6D9A8';ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const a=Math.PI/2+(i-1)*0.62+0.12;
      const l=10+emb*(16-i*4)*(1-clamp((pe-0.17)/0.09)*0.35);
      ctx.globalAlpha=0.85*(1-clamp((pe-0.19)/0.10)*0.75);
      ctx.lineWidth=1.9;
      ctx.beginPath();ctx.moveTo(0,10);
      ctx.quadraticCurveTo(Math.cos(a)*l*0.6,10+Math.sin(a)*l*0.6,Math.cos(a)*l,10+Math.sin(a)*l);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
}

const rb=[[],[],[],[],[],[],[],[],[]], rbw=[[],[],[],[],[],[],[],[],[]];
const hairBuf=[],capBuf=[],mycBuf=[];
// Una raíz que llegó a la bolsa está tomando agua, y se oscurece.
function inPocket(x,y){
  for(const w of POCKETS){const dx=x-w.x,dy=y-w.y;if(dx*dx+dy*dy<w.r*w.r) return 1;}
  return 0;
}
/* El arranque de la pivotante de ESTE frame. Lo publica `drawRoots` y lo lee
   `drawContact`, que es lo único que necesita saber por dónde sale la raíz de
   verdad: el cuello se dibuja encima de ella y, si se lo deja clavado en x=0
   mientras la raíz se arquea, queda un parche pálido flotando al costado. */
let crown=null;
function drawRoots(g,pe,t,scale){
  const G=key(ROOT,pe);
  if(G<=0.001){crown=null;return;}
  crown=null;
  for(let i=0;i<g.n;i++){
    const pa=g.par[i],d=g.dep[i];
    const px=pa<0?0:g.X[pa],py=pa<0?6:g.Y[pa];
    const st=(d/8)*0.72;
    let gg=(G-st)/0.30;
    if(gg<=0){g.X[i]=px;g.Y[i]=py;g.A[i]=pa<0?g.rel[i]:g.A[pa];continue;}
    if(gg>1)gg=1;gg=ease(gg);
    const a=(pa<0?g.rel[i]:g.A[pa]+g.rel[i])
      +(REDUCED?0:0.012*Math.pow(d/7,1.4)*Math.sin(t*0.5+g.ph[i]));
    g.A[i]=a;
    const L=g.len[i]*gg;
    const x=px+Math.cos(a)*L,y=py+Math.sin(a)*L;
    g.X[i]=x;g.Y[i]=y;
    /* Cada tramo es una cuadrática, no una recta. Una raíz recta no existe: va
       esquivando piedras y siguiendo agua, y ése es justamente el gesto que la
       pieza narra dos fases antes con el hidrotropismo. Dibujada con `lineTo`
       lo decía el texto y lo desmentía el trazo.
       El control va en el medio, desplazado el DOBLE de la flecha que se
       quiere: una cuadrática pasa por la mitad de camino hacia su control. */
    const dx=x-px, dy=y-py, sl=Math.hypot(dx,dy)||1;
    const bow=sl*0.12*Math.sin(g.ph[i]*2.9);
    const cx=(px+x)*0.5-dy/sl*bow*2, cy=(py+y)*0.5+dx/sl*bow*2;
    (inPocket(x,y)?rbw:rb)[d].push(px,py,cx,cy,x,y);
    if(pa<0) crown={cx,cy,x,y};
    // La tangente de SALIDA de la cuadrática, que ya no es la de la cuerda.
    // La cofia se orienta con ésta; con la vieja quedaba torcida contra su raíz.
    const aOut=Math.atan2(y-cy,x-cx);
    // El ancho de este nivel, que necesitan cofia y pelos.
    const w=Math.max(0.5,8.5*Math.pow(0.70,d)*(0.34+0.66*G));
    /* Los pelos salen en la zona de maduración de las laterales finas. Atado a
       profundidad ≥3, que es la que existe justo cuando la cámara está abajo
       mirando el hidrotropismo — con ≥5 no habría raíz que mostrarlos. */
    if(d>=3&&gg>0.9&&scale>0.7&&L>4) hairBuf.push(px,py,cx,cy,x,y,w);
    if(g.term[i]&&gg>0.55) capBuf.push(x,y,aOut,w);
    if(g.term[i]&&scale>0.6) mycBuf.push(x,y,aOut,g.ph[i]);
  }
  /* Micorrizas: hilos finísimos irradiando de las raíces más finas. Van
     primero, por detrás de todo. */
  if(mycBuf.length){
    ctx.strokeStyle='rgba(226,214,182,.13)';ctx.lineWidth=0.4;ctx.lineCap='butt';
    ctx.beginPath();
    for(let i=0;i<mycBuf.length;i+=4){
      const x=mycBuf[i],y=mycBuf[i+1],a=mycBuf[i+2],ph=mycBuf[i+3];
      for(let k=0;k<3;k++){
        const aa=a+(k-1)*0.9+Math.sin(ph+k)*0.35, ln=8+6*Math.sin(ph*3+k);
        ctx.moveTo(x,y);
        ctx.quadraticCurveTo(x+Math.cos(aa)*ln*0.5,y+Math.sin(aa)*ln*0.5,
          x+Math.cos(aa+0.45)*ln,y+Math.sin(aa+0.45)*ln);
      }
    }
    ctx.stroke();mycBuf.length=0;
  }
  ctx.lineCap='round';
  for(let pass=0;pass<2;pass++){
    const B=pass?rbw:rb;
    for(let d=0;d<B.length;d++){
      const b=B[d];if(!b.length)continue;
      ctx.strokeStyle=pass?(d<2?'#9A8459':'#AC9B71'):(d<2?'#B9A47A':'#CDBE97');
      ctx.globalAlpha=0.92-d*0.06;
      // La raíz engrosa con lo que ya creció, igual que el tallo. Sin esto el
      // plantín del mes 1 tiene una raíz pivotante más gruesa que su tallo.
      const lw=Math.max(0.5,8.5*Math.pow(0.70,d)*(0.34+0.66*G));
      ctx.lineWidth=lw;
      const path=()=>{
        ctx.beginPath();
        for(let i=0;i<b.length;i+=6){
          ctx.moveTo(b[i],b[i+1]);ctx.quadraticCurveTo(b[i+2],b[i+3],b[i+4],b[i+5]);
        }
      };
      path();ctx.stroke();
      /* Peso de línea. La raíz se dibujaba con un trazo de ancho constante y
         color plano: eso no es un tubo, es un alambre. La regla de taller es
         cargar la línea del lado en sombra y aflojarla del lado de la luz —una
         sola pasada más fina, corrida hacia donde el sol NO da, y el mismo
         trazo pasa a tener un lado y otro.
         Sólo donde hay ancho que repartir: por debajo de un par de píxeles el
         corrimiento no separa nada y sólo emborrona. */
      if(lw>1.7){
        ctx.save();
        ctx.translate(-LIGHT.x*lw*0.26,-LIGHT.y*lw*0.26);
        ctx.globalAlpha*=0.42;
        ctx.strokeStyle=pass?'#6E5A38':'#8A754C';
        ctx.lineWidth=lw*0.52;
        path();ctx.stroke();
        ctx.restore();
      }
      b.length=0;
    }
  }
  /* Pelos radiculares: es el órgano que absorbe. Sin ellos la raíz es un palo. */
  if(hairBuf.length){
    ctx.strokeStyle='rgba(216,203,170,.46)';ctx.lineWidth=0.45;ctx.lineCap='butt';
    ctx.beginPath();
    for(let i=0;i<hairBuf.length;i+=7){
      /* Los pelos se plantan sobre la CURVA, no sobre su cuerda: ahora que el
         tramo se arquea, repartirlos por interpolación lineal los dejaba
         flotando al costado de la raíz que se supone que llevan. */
      const x0=hairBuf[i],y0=hairBuf[i+1],cx=hairBuf[i+2],cy=hairBuf[i+3];
      const x1=hairBuf[i+4],y1=hairBuf[i+5],w=hairBuf[i+6];
      if(Math.hypot(x1-x0,y1-y0)<3) continue;
      for(let k=1;k<=7;k++){
        const u=k/8, v=1-u;
        const bx=v*v*x0+2*v*u*cx+u*u*x1, by=v*v*y0+2*v*u*cy+u*u*y1;
        // Normal de la tangente en u, que es la derivada de la cuadrática.
        const tx=2*(v*(cx-x0)+u*(x1-cx)), ty=2*(v*(cy-y0)+u*(y1-cy));
        const tl=Math.hypot(tx,ty)||1;
        const nx=-ty/tl,ny=tx/tl, sg=k&1?1:-1;
        // Proporcionales al grosor de la raíz que los lleva.
        const hl=w*(1.4+0.9*Math.sin(k*3.1+x0*0.11));
        ctx.moveTo(bx+nx*sg*w*0.5,by+ny*sg*w*0.5);
        ctx.lineTo(bx+nx*sg*hl,by+ny*sg*hl);
      }
    }
    ctx.stroke();hairBuf.length=0;
  }
  /* Cofia: el órgano que lee el gradiente de humedad y manda sobre la
     gravedad. Merece verse: más clara, más gruesa, redondeada. */
  if(capBuf.length){
    ctx.fillStyle='#E9DEC0';ctx.globalAlpha=0.92;
    ctx.beginPath();
    for(let i=0;i<capBuf.length;i+=4){
      const x=capBuf[i],y=capBuf[i+1],a=capBuf[i+2],w=capBuf[i+3];
      const r=Math.max(0.7,w*0.92),rx=r*1.45;
      const cxp=x+Math.cos(a)*r*0.45,cyp=y+Math.sin(a)*r*0.45;
      ctx.moveTo(cxp+Math.cos(a)*rx,cyp+Math.sin(a)*rx);
      ctx.ellipse(cxp,cyp,rx,r,a,0,6.283);
    }
    ctx.fill();capBuf.length=0;
  }
  ctx.globalAlpha=1;

  /* Perspectiva aérea, hacia abajo.
     Todo el sistema radicular se dibujaba con el mismo contraste de arriba a
     abajo, y por eso a mes 10 las raíces del fondo se leían como una jaula de
     alambre: nada decía cuáles están cerca. En un dibujo eso se resuelve con
     bordes perdidos —la forma se disuelve en su fondo a medida que se aleja— y
     acá el "lejos" es la profundidad. Un velo del color del estrato más hondo,
     creciendo con la hondura, hace que las puntas se pierdan en la tierra y
     deja el nudo de anclaje como lo único de contraste pleno.
     Va DESPUÉS de las raíces y antes que nada más: es lo único que hay abajo. */
  const veil=ctx.createLinearGradient(0,300,0,940);
  veil.addColorStop(0,rgba(SOIL[SOIL.length-1].c,0));
  veil.addColorStop(1,rgba(SOIL[SOIL.length-1].c,0.62));
  ctx.fillStyle=veil;
  ctx.fillRect(-1400,300,2800,640);
}

/* La hoja del cítrico es unifoliolada: una compuesta reducida a un solo
   folíolo, con pecíolo alado, articulación y glándulas de aceite. No es una
   hoja simple y no es una elipse.
   C = [mitad +, mitad −, pecíolo, ala, nervadura, especular, glándulas].
   lod: 0 silueta, 1 lámina plegada, 2 completa. */
function leafShape(x,y,a,s,C,lod,roll){
  const B=s*0.42, T=s*1.95;              // base de la lámina y punta
  ctx.save();ctx.translate(x,y);ctx.rotate(a);
  /* Escorzo. La hoja está en el espacio, no pegada al plano de la pantalla:
     girada sobre su propio nervio, lo que se ve es la lámina comprimida a lo
     ancho. Es una escala en y después de rotar — cuesta nada y es lo que
     rompe la lectura de calcomanía, porque deja de haber dos hojas iguales. */
  if(roll<0.995) ctx.scale(1,roll);
  if(lod===0){
    ctx.fillStyle=C[0];
    ctx.beginPath();ctx.moveTo(B,0);
    ctx.quadraticCurveTo(s*0.95,-s*0.44,T,0);
    ctx.quadraticCurveTo(s*0.95,s*0.40,B,0);
    ctx.fill();ctx.restore();return;
  }
  // pecíolo alado + articulación
  ctx.strokeStyle=C[2];ctx.lineWidth=Math.max(0.5,s*0.10);
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(B,0);ctx.stroke();
  ctx.fillStyle=C[3];
  ctx.beginPath();ctx.ellipse(s*0.22,0,s*0.19,s*0.12,0,0,6.283);ctx.fill();
  // La articulación: el ala del pecíolo se corta acá. Es el rasgo que delata
  // que la hoja es unifoliolada y no simple, así que se dibuja ya en nivel 1.
  ctx.strokeStyle=C[4];ctx.lineWidth=Math.max(0.4,s*0.06);
  ctx.beginPath();ctx.moveTo(B,-s*0.08);ctx.lineTo(B,s*0.08);ctx.stroke();
  // Lámina en dos mitades asimétricas: una un poco más llena que la otra.
  ctx.fillStyle=C[0];
  ctx.beginPath();ctx.moveTo(B,0);
  ctx.quadraticCurveTo(s*0.92,-s*0.46,T,0);ctx.lineTo(B,0);ctx.fill();
  ctx.fillStyle=C[1];
  ctx.beginPath();ctx.moveTo(B,0);
  ctx.quadraticCurveTo(s*0.98,s*0.38,T,0);ctx.lineTo(B,0);ctx.fill();
  /* Peso de línea en el margen, y de un solo lado.
     La hoja del cítrico tiene el borde engrosado y más oscuro, y la regla de
     taller es cargar la línea del lado en sombra y aflojarla del lado de la
     luz. `C[1]` es siempre la mitad menos iluminada de las dos —sale de
     `pd − FOLD` contra `pd + FOLD`—, así que el margen cargado va ahí y el otro
     lado se queda sin trazo. Con contorno parejo la hoja es una calcomanía. */
  ctx.strokeStyle=C[1];ctx.lineWidth=Math.max(0.35,s*0.055);
  ctx.beginPath();ctx.moveTo(B,0);
  ctx.quadraticCurveTo(s*0.98,s*0.38,T,0);ctx.stroke();
  if(lod<2){ctx.restore();return;}
  // nervio central y laterales a ~45°
  ctx.strokeStyle=C[4];ctx.lineWidth=Math.max(0.4,s*0.045);
  ctx.beginPath();ctx.moveTo(B,0);ctx.lineTo(T*0.97,0);
  for(let i=0;i<5;i++){
    const u=0.20+i*0.16, vx=lerp(B,T,u), sg=i&1?1:-1;
    ctx.moveTo(vx,0);
    ctx.lineTo(vx+(T-B)*0.17,sg*s*(0.30-u*0.20));
  }
  ctx.stroke();
  ctx.fillStyle=C[5];                     // especular chico y desplazado
  ctx.beginPath();ctx.ellipse(s*1.02,-s*0.12,s*0.30,s*0.09,-0.2,0,6.283);ctx.fill();
  if(s>18){
    ctx.fillStyle=C[6];
    for(let i=0;i<5;i++){
      ctx.beginPath();
      ctx.arc(s*(0.7+i*0.22),Math.sin(i*2.1)*s*0.13,s*0.042,0,6.283);ctx.fill();
    }
  }
  ctx.restore();
}

/* ============ ramas como tubos ============
   Cada segmento es un polígono de cuatro anillos a lo largo del eje —unión,
   cuarto, medio, punta— con el ancho que dicta el modelo de tubería, y se
   pinta en tres bandas a lo ancho: sombra, lomo, luz. Esas tres bandas son
   todo el volumen. Nada de stroke, así que no hay bolitas en las uniones ni
   saltos de ancho entre niveles.
   Los segmentos se agrupan por (clase de profundidad × incidencia) para que
   el árbol entero sean unas decenas de fill(), no un stroke por rama. */
/* Modelo de tubería de da Vinci: la sección del padre es la suma de las de sus
   hijos. Con exp 2.3 (Leonardo dijo 2; la medición moderna en árboles da
   2.0–2.5) el tronco es *resultado* de la topología — con la copa completa da
   16.3 px, así que el 17 que estaba hardcodeado era correcto pero nadie lo
   eligió. Se resuelve por frame y no al construir, porque el engrosamiento
   secundario sigue a la copa que el segmento ya sostiene: en el mes 1 el
   plantín tiene que ser un tallo fino, no un tronco en miniatura. */
const TIP_W=1.75, PIPE=2.3, TIP_END=0.20;
function pipeWidths(g){
  const wb=g.wb,wt=g.wt;
  for(let i=0;i<g.n;i++){wb[i]=TIP_W*g.G[i];wt[i]=TIP_END*g.G[i];}
  for(let i=g.n-1;i>=1;i--){
    const pa=g.par[i];
    wb[pa]=Math.pow(Math.pow(wb[pa],PIPE)+Math.pow(wb[i],PIPE),1/PIPE);
    // La punta del padre es su hijo más grueso: por eso la unión no tiene
    // escalón. Sin hijos, se afina casi a cero en vez de topar en un mínimo.
    if(wb[i]>wt[pa]) wt[pa]=wb[i];
  }
}

/* Grupos de dibujo: 0 tronco, 1 ramas madres, 2–4 ramillas por plano de copa.
   El tronco y las madres se dibujan una sola vez, entre la copa trasera y la
   media: así hay hojas por delante y por detrás sin que la estructura central
   se lleve la bruma ni el reescalado de las capas. */
const PD_BINS=9, WOOD=['#6E5C3F','#5B4B34','#463A28'], GROUPS=5;
const SEG=10;                                  // floats por segmento
const segBk=[]; for(let i=0;i<GROUPS*PD_BINS;i++) segBk.push([]);
const barkBuf=[];
const RU=[0,0.24,0.62,1], RB=[0,0.685,0.930,0];        // u del anillo y su curvatura
// Bandas ligeramente superpuestas: si comparten borde exacto, el antialias
// deja una costura visible entre ellas.
const BAND=[[-1,-0.38,-0.72],[-0.42,0.42,0],[0.38,1,0.72]];
const rx=[0,0,0,0], ry=[0,0,0,0], rw=[0,0,0,0];
let gnx=0,gny=0;
/* `kb` escala la flecha del arqueo. Vale 1 para la polilínea; el trazado suave
   la necesita mayor porque una cúbica NO pasa por sus controles: con los
   anillos 1 y 2 de control, el punto medio queda a 3·(RB₁+RB₂)/8 = 0.61·bm en
   vez de a 0.93·bm, y el tronco se enderezaría un tercio al suavizarlo. */
const SM_K=0.930/(3*(0.685+0.930)/8);
function rings(S,o,kb){
  const px=S[o],py=S[o+1],ex=S[o+2],ey=S[o+3],bm=S[o+9]*(kb||1);
  gnx=S[o+4];gny=S[o+5];
  rw[0]=S[o+6];rw[1]=S[o+7];rw[2]=(S[o+7]+S[o+8])*0.5;rw[3]=S[o+8];
  for(let k=0;k<4;k++){
    const u=RU[k],ob=bm*RB[k];
    rx[k]=px+(ex-px)*u+gnx*ob; ry[k]=py+(ey-py)*u+gny*ob;
  }
}
/* `sm` traza los costados como cúbica en vez de polilínea de cuatro puntos.
   No es gratis, así que lo usan sólo el tronco y las ramas madres: son quince
   segmentos, son los gruesos, son los que más se arquean y son a los que la
   cámara se acerca. En una ramilla de ocho píxeles el quiebre no existe; en la
   silueta del tronco es un vértice, y un tronco no tiene vértices. */
function ribbon(S,o,a,b,sm){
  rings(S,o,sm?SM_K:1);
  if(!sm){
    ctx.moveTo(rx[0]+gnx*rw[0]*b,ry[0]+gny*rw[0]*b);
    for(let k=1;k<4;k++) ctx.lineTo(rx[k]+gnx*rw[k]*b,ry[k]+gny*rw[k]*b);
    for(let k=3;k>=0;k--) ctx.lineTo(rx[k]+gnx*rw[k]*a,ry[k]+gny*rw[k]*a);
    ctx.closePath();
    return;
  }
  ctx.moveTo(rx[0]+gnx*rw[0]*b,ry[0]+gny*rw[0]*b);
  ctx.bezierCurveTo(rx[1]+gnx*rw[1]*b,ry[1]+gny*rw[1]*b,
                    rx[2]+gnx*rw[2]*b,ry[2]+gny*rw[2]*b,
                    rx[3]+gnx*rw[3]*b,ry[3]+gny*rw[3]*b);
  ctx.lineTo(rx[3]+gnx*rw[3]*a,ry[3]+gny*rw[3]*a);
  ctx.bezierCurveTo(rx[2]+gnx*rw[2]*a,ry[2]+gny*rw[2]*a,
                    rx[1]+gnx*rw[1]*a,ry[1]+gny*rw[1]*a,
                    rx[0]+gnx*rw[0]*a,ry[0]+gny*rw[0]*a);
  ctx.closePath();
}

const leafBk=[[],[],[]], thornBuf=[];   // hojas por plano de copa
const LEAF=6;                           // floats por hoja
const LEAF_BINS=6, LEAF_AGE=3;
/* Un nudo cada tantas unidades de brote. Es lo que hace que la cuenta de hojas
   siga a la LONGITUD de la rama y no a su nivel: las de adentro son las largas,
   así que se llevan más hojas, que es exactamente donde faltaban.
   Un número fijo por rama repartía al revés — 161 ramitas del borde con tres
   hojas cada una contra 13 ramas del centro con dos. */
const NODE_SP=14;
/* Tramo del brote donde se siembran. La punta las carga hacia el extremo —el
   cítrico amontona el flush ahí— y el brote interior las reparte parejo. */
const LEAF_U_TIP=[0.45,1.00];
const LEAF_U_MID=[0.22,0.92];
// El pliegue conduplicado: las dos mitades de la lámina se inclinan en sentidos
// opuestos alrededor del nervio central, así que reciben incidencias distintas.
const FOLD=0.30;

/* ============ paletas ============
   Todo el color sombreado sale de (posición del sol × madurez). Ninguna de las
   dos depende del tiempo ambiente, así que se cachean y el frame típico no
   mezcla ni un color. */
let palK=-1, leafK=-1, woodPal=null, leafPal=null, flowPal=null;
/* Los tres tramos de la mancha de masa. Se arman con el resto de la paleta,
   así que siguen al sol y a la madurez sin costar nada por frame. */
let massC0='#2F5F2C', massC1='#2F5F2C', massC2='rgba(0,0,0,0)';
function palettes(mat,lign){
  // Lignificación: el tallo de un cítrico joven es verde y fotosintético, y se
  // vuelve leñoso después. Marrón desde el día uno es un error botánico.
  const lk0=Math.round(lign*24);
  const k0=LIGHT.k*32+lk0;
  if(palK!==k0){
    palK=k0; leafK=-1;
    if(!woodPal) woodPal=new Array(GROUPS*PD_BINS*3);
    for(let gr=0;gr<GROUPS;gr++){
      const lay=gr<2?1:gr-2;
      // Las ramillas lignifican más tarde que el tronco.
      const wood=mixH('#86A857',WOOD[gr<2?gr:2],clamp(lk0/24*(gr<2?1:0.78)));
      for(let b=0;b<PD_BINS;b++){
        const pd=b/(PD_BINS-1)*2-1;
        for(let k=0;k<3;k++) woodPal[(gr*PD_BINS+b)*3+k]=shadeCyl(wood,pd,BAND[k][2],lay);
      }
    }
    flowPal=[rgba(shadeD('#FFFCF6',0.88),0.96), shadeD('#E8C65A',0.92),
             shadeD('#3F6B33',0.68), shadeD('#7FA648',0.74), shadeD('#8E7B52',0.72),
             rgba(shadeD('#F0E6D8',0.44),0.95),   // envés del pétalo recurvado
             shadeD('#F7EFD9',0.80),              // filamento
             shadeD('#5E8A3A',0.72)];             // ovario = la naranja futura
  }
  const lk=Math.round(clamp(mat)*96);
  if(leafK===lk) return;
  leafK=lk;
  /* Una hoja de flush nuevo es más chica, más clara y más amarillenta, y se
     va oscureciendo. Se cachea el producto (plano × edad × incidencia) porque
     ninguno de los tres depende del tiempo. */
  const old=mixH('#4E7A34','#2F5F2C',lk/96);
  leafPal=new Array(3*LEAF_AGE*LEAF_BINS);
  for(let l=0;l<3;l++) for(let ag=0;ag<LEAF_AGE;ag++){
    const col=mixH('#9CBF63',old,ag/(LEAF_AGE-1));
    for(let b=0;b<LEAF_BINS;b++){
      const pd=b/(LEAF_BINS-1)*2-1, d=clamp(0.54+0.62*pd);
      leafPal[(l*LEAF_AGE+ag)*LEAF_BINS+b]=[
        shadeFlat(col,pd+FOLD,l),          // mitad +perpendicular
        shadeFlat(col,pd-FOLD,l),          // mitad −perpendicular
        shadeFlat('#5C7A3C',pd,l),         // pecíolo
        shadeFlat('#6E8F4A',pd,l),         // pecíolo alado
        rgba(shadeFlat(col,pd-0.85,l),0.18),          // nervadura
        rgba(LIGHT.sun,(0.06+0.26*d*d).toFixed(2)),   // especular: cítrico glossy
        rgba(LIGHT.sun,(0.10+0.16*d).toFixed(2))];    // glándulas de aceite
    }
  }
  /* El interior de una copa no es una hoja oscura: es el hueco entre miles de
     hojas, donde la luz llega después de rebotar varias veces. Va más oscuro y
     más frío que la hoja más vieja, y como todo lo que está en sombra se tiñe
     del cielo — por eso pasa por `shadeFlat` con incidencia negativa y en el
     plano trasero, que es el que lleva la bruma. */
  /* No tiene que ser una sombra: si va más oscuro que las hojas, lee como un
     manchón detrás del árbol en vez de como el fondo de la copa. Es hoja vieja
     en penumbra, apenas por debajo del tono más oscuro del follaje. */
  /* Va por el plano 1, NO por el 0. El plano trasero aplica bruma del color del
     cielo, que es lo correcto para follaje lejano — pero esto no es follaje
     lejano, es el interior de la copa, lo más oscuro y lo más cerrado que hay.
     Con la bruma puesta, la masa se iba hacia el cielo y la separación
     figura/fondo medida se caía de 30 a 13: la copa dejaba de recortarse. */
  const core=shadeFlat(mixH(old,'#26492A',0.42),-0.30,1);
  const K=hx(core);
  massC0=rgba(core,0.92);
  massC1=rgba(core,0.78);
  massC2=`rgba(${K[0]},${K[1]},${K[2]},0)`;
}
/* ============ viento ============
   La ráfaga no es global: es una onda que cruza el árbol en x. Cada nodo la
   consulta con la x de su padre, así se la ve entrar por un lado y salir por
   el otro. */
function gustAt(x,t){
  const u=x*0.0016-t*0.42;
  return 0.55+0.45*Math.sin(u)+0.22*Math.sin(u*2.7+1.1)+0.12*Math.sin(u*6.3+2.4);
}
/* Ganancia: la desviación se acumula por la cadena, así que el efecto en la
   punta es la suma de los siete niveles. Con 0.030 daban ~12° acumulados —
   tormenta. 0.015 deja ~6°, que es brisa. */
const WGAIN=0.015;

let scaleNow=1;      // escala de cámara del frame, para el LOD de las hojas
let interiorNow=0;   // cuánto avanzó la fase interior, para no pagar de más
/* Pose en pantalla de la semilla que se va a soltar, publicada por el carpelo
   que la contiene y leída por el viaje del final. Vive fuera porque la escribe
   un punto del código que está dentro de seis transformaciones anidadas y la
   lee otro que está fuera de todas. */
let seedOut=null;
function drawTree(g,t,pe,mat,scale,dt){
  const G=key(SHOOT,pe);
  if(G<=0.001) return;
  scaleNow=scale;
  for(let i=0;i<g.n;i++){
    const pa=g.par[i],d=g.dep[i];
    const px=pa<0?0:g.X[pa],py=pa<0?-4:g.Y[pa];
    const st=(d/TREE_D)*0.66;
    let gg=(G-st)/0.34;
    if(gg<=0){
      g.X[i]=px;g.Y[i]=py;g.A[i]=pa<0?g.rel[i]:g.A[pa];g.G[i]=0;
      g.th[i]=0;g.om[i]=0;      // el resorte queda en reposo: §3.1
      continue;
    }
    // Sobrepaso del 1.5%: el brote se pasa un pelo y asienta. Es lo que le da peso.
    if(gg>1)gg=1;gg=growOut(gg);g.G[i]=gg;
    /* Resorte amortiguado por rama: las largas oscilan lento y las ramitas
       rápido, y al aflojar la ráfaga rebotan en vez de frenar de golpe. Eso
       es el movimiento secundario, y es lo que separa animado de vivo. */
    if(REDUCED){g.th[i]=0;}
    else{
      const k=26/Math.max(6,g.len[i]);
      const c=2*Math.sqrt(k)*0.14;
      const f=gustAt(px,t)*WGAIN*Math.pow((d+1)/TREE_D,1.7);
      g.om[i]+=(f-k*g.th[i]-c*g.om[i])*dt;
      g.th[i]+=g.om[i]*dt;
    }
    const a=(pa<0?g.rel[i]:g.A[pa]+g.rel[i])+g.th[i];
    g.A[i]=a;
    const L=g.len[i]*gg;
    const x=px+Math.cos(a)*L,y=py+Math.sin(a)*L;
    g.X[i]=x;g.Y[i]=y;

    if(g.thorn[i]&&mat<1&&gg>0.6) thornBuf.push(x,y,a,4.5*Math.pow(0.8,d));
    /* ---- dónde nacen las hojas ----
       Acá había UNA hoja por nodo terminal, y eso es lo que dejaba la copa
       hueca: en un árbol binario de siete niveles, TODOS los terminales están
       sobre el perímetro. Salía una corona de follaje con el esqueleto pelado
       adentro — que no es cómo se ve un naranjo, es cómo se ve un árbol
       dibujado por su propia estructura de datos.
       Un cítrico lleva las hojas A LO LARGO del brote, en filotaxis alterna, y
       los brotes de los últimos niveles viven ADENTRO de la copa, no en el
       borde. Así que las hojas se siembran sobre el segmento y no en su punta,
       y no sólo sobre los terminales: los dos niveles anteriores también
       brotan, y son ellos los que llenan el interior.
       El costo se paga donde se ve: `LEAF_U` da tres hojas en el terminal —que
       es donde el cítrico las amontona— y dos en los internos. */
    if(gg>0.5){
      const term=g.leaf[i];
      /* Hasta dónde hacia adentro llega el follaje. Con dos niveles el hueco
         del medio seguía ahí, y no por poca cantidad: la copa se abre en
         abanico, así que los niveles 5 y 6 TAMBIÉN viven sobre el perímetro.
         Lo que ocupa el centro del cuadro son las ramas de nivel 3 y 4, y
         mientras esas estén peladas el árbol lee como alambre por adentro.
         Un naranjo real sí tiene follaje interior —hojas viejas, en penumbra,
         sobre madera ya lignificada— y es justamente lo que faltaba. */
      if(term||d>=TREE_D-4){
        const lay=g.lay[i];
        const U=term?LEAF_U_TIP:LEAF_U_MID;
        const ca=Math.cos(a),sa=Math.sin(a);
        const nk=Math.min(6,Math.max(term?2:1,Math.round(g.len[i]/NODE_SP)));
        /* Cuánto de esta hoja es hoja de SOMBRA. No es un tinte: una hoja de
           interior de copa es más grande, más plana y más oscura que una de
           sol, y las tres cosas salen de acá. La lámina crece porque tiene que
           interceptar luz de rebote; se pone de cara porque no hay un sol al
           que esquivar; y es la más vieja del árbol. */
        const shade=term?0:clamp((TREE_D-2-d)/2.5);
        for(let k=0;k<nk;k++){
          const uu=U[0]+(U[1]-U[0])*(nk===1?1:k/(nk-1));
          /* Filotaxis: cada hoja sale a ~137.5° de la anterior alrededor del
             eje, que proyectado sobre el plano es un lado y el otro alternados
             con una inclinación distinta cada vez. `ph` desfasa la serie por
             rama para que dos ramas vecinas no salgan calcadas. */
          const ang=a+(k&1?1:-1)*(0.62+0.34*Math.sin(g.ph[i]+k*2.399));
          leafBk[lay].push(px+ca*L*uu, py+sa*L*uu, ang, gg,
            g.ph[i]+k*2.399, shade);
        }
      }
    }
  }

  // Los anchos necesitan el árbol entero ya crecido: segundo pase, hacia la raíz.
  pipeWidths(g);

  for(let i=0;i<g.n;i++){
    if(g.G[i]<=0) continue;
    const pa=g.par[i],d=g.dep[i],a=g.A[i];
    const px=pa<0?0:g.X[pa],py=pa<0?-4:g.Y[pa];
    // Perpendicular al segmento: es la normal del tubo a lo ancho.
    const nx=Math.sin(a),ny=-Math.cos(a);
    const pd=nx*LIGHT.x+ny*LIGHT.y;
    let bin=Math.round((pd+1)*0.5*(PD_BINS-1));
    if(bin<0)bin=0; else if(bin>PD_BINS-1)bin=PD_BINS-1;
    // Estructura (tronco y madres) en su propio grupo; las ramillas van al
    // plano de copa que heredaron de sus hojas.
    const gr=d<=1?0:(d<=3?1:2+g.lay[i]);
    // El ancho de la unión lo pone el padre: por eso no hay escalón, y de paso
    // aparece el ensanchamiento de la axila.
    const wj=(pa<0?g.wb[i]:lerp(g.wb[i],g.wt[pa],0.5))*0.5;
    const bm=g.bend[i]*g.len[i]*g.G[i];
    segBk[gr*PD_BINS+bin].push(px,py,g.X[i],g.Y[i],nx,ny,wj,g.wb[i]*0.5,g.wt[i]*0.5,bm);
    // Corteza sólo donde hay madera que agrietar: en un tallo tierno no existe.
    if(d<=2&&g.wb[i]>4) barkBuf.push(px,py,g.X[i],g.Y[i],nx,ny,wj,g.wb[i]*0.5,g.wt[i]*0.5,bm);
  }

  /* Los brotes interiores. Van DESPUÉS de `pipeWidths` porque su ancho sale del
     de la rama madre, y antes de eso `g.wb` todavía tiene los valores de la
     vuelta anterior. No participan del modelo de tubería —son ramitas de un
     solo segmento, sin hijos que alimentar— así que su ancho es proporcional y
     nada más. Tampoco llevan resorte propio: cuelgan del ángulo de su rama, que
     ya trae el viento acumulado de toda la cadena. */
  for(const sp of g.spur){
    const i=sp.p, gg=g.G[i];
    if(gg<=0.5) continue;
    const pa=g.par[i];
    const px=pa<0?0:g.X[pa], py=pa<0?-4:g.Y[pa];
    const a=g.A[i], L=g.len[i]*gg;
    const bx=px+Math.cos(a)*L*sp.u, by=py+Math.sin(a)*L*sp.u;
    // Salen con el último tercio del crecimiento de su madre: la madera vieja
    // no rebrota mientras la rama todavía se está haciendo.
    const sg=clamp((gg-0.62)/0.38);
    if(sg<=0.02) continue;
    const sa=a+sp.rel, sl=sp.len*sg;
    const ex=bx+Math.cos(sa)*sl, ey=by+Math.sin(sa)*sl;
    const lay=g.lay[i];
    const nx=Math.sin(sa), ny=-Math.cos(sa);
    const pd=nx*LIGHT.x+ny*LIGHT.y;
    let bin=Math.round((pd+1)*0.5*(PD_BINS-1));
    if(bin<0)bin=0; else if(bin>PD_BINS-1)bin=PD_BINS-1;
    const w=Math.max(0.6,g.wb[i]*0.22);
    segBk[(2+lay)*PD_BINS+bin].push(bx,by,ex,ey,nx,ny,w*0.5,w*0.5,w*0.28,0);
    // Y su follaje, que es para lo que están: hoja de sombra, la más grande y
    // la más plana, porque viven en el centro de la copa.
    const nk=Math.max(2,Math.min(5,Math.round(sp.len/NODE_SP)));
    const ca=Math.cos(sa), sy2=Math.sin(sa);
    for(let k=0;k<nk;k++){
      const uu=0.24+0.72*(nk===1?1:k/(nk-1));
      const ang=sa+(k&1?1:-1)*(0.58+0.30*Math.sin(g.ph[i]+k*2.399));
      leafBk[lay].push(bx+ca*sl*uu, by+sy2*sl*uu, ang, gg,
        g.ph[i]+k*2.399+1.7, 1);
    }
  }


  /* Orden: masa → copa trasera → estructura → copa media → copa delantera.
     Así hay hojas que pasan claramente por detrás del tronco y otras por
     delante, que es lo que le da espesor a la copa.
     La masa va PRIMERA, y tiene que leer los tres planos antes de que nadie
     dibuje: `drawLayer` vacía su bucket al terminar. */
  drawCanopyMass();
  drawLayer(g,0);
  drawWood(0);drawWood(1);
  drawBark();drawThorns(mat);
  drawLayer(g,1);
  drawLayer(g,2);
  /* El contacto con la tierra va acá adentro, no en el llamador: depende de
     `g.wb`, que lo escribe `pipeWidths` — y `pipeWidths` no corre cuando esta
     función sale por el return de arriba. Llamándolo desde afuera, en la
     segunda vuelta el brote todavía no existe (SHOOT vale 0 bajo pe=0.22) pero
     `wb` sigue teniendo los anchos del árbol adulto de la vuelta anterior, y
     aparecía el pie de un tronco maduro encima de la semilla germinando. */
  drawContact(g);
}

function drawWood(gr){
  for(let b=0;b<PD_BINS;b++){
    const S=segBk[gr*PD_BINS+b];
    if(!S.length) continue;
    for(let k=0;k<3;k++){
      ctx.fillStyle=woodPal[(gr*PD_BINS+b)*3+k];
      ctx.beginPath();
      for(let o=0;o<S.length;o+=SEG) ribbon(S,o,BAND[k][0],BAND[k][1],gr<2);
      ctx.fill();
    }
    S.length=0;
  }
}
// Corteza: unas pocas fisuras longitudinales donde el zoom las hace legibles.
function drawBark(){
  if(!barkBuf.length) return;
  ctx.lineCap='butt';ctx.lineWidth=0.7;ctx.strokeStyle='rgba(34,26,16,.26)';
  ctx.beginPath();
  for(let o=0;o<barkBuf.length;o+=SEG){
    // La corteza sólo existe sobre tronco y madres, que ahora se trazan
    // suaves: con los anillos sin escalar las fisuras se salían de la madera.
    rings(barkBuf,o,SM_K);
    for(let j=0;j<3;j++){
      const u=-0.55+j*0.5;
      ctx.moveTo(rx[1]+gnx*rw[1]*u,ry[1]+gny*rw[1]*u);
      ctx.quadraticCurveTo(rx[2]+gnx*rw[2]*u,ry[2]+gny*rw[2]*u,
                           rx[3]+gnx*rw[3]*u,ry[3]+gny*rw[3]*u);
    }
  }
  ctx.stroke();barkBuf.length=0;
}
function drawThorns(mat){
  if(!thornBuf.length) return;
  ctx.strokeStyle=flowPal[4];ctx.globalAlpha=(1-mat)*0.9;ctx.lineWidth=1.2;
  ctx.beginPath();
  for(let i=0;i<thornBuf.length;i+=4){
    const x=thornBuf[i],y=thornBuf[i+1],a=thornBuf[i+2]-1.15,s=thornBuf[i+3];
    ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s);
  }
  ctx.stroke();ctx.globalAlpha=1;thornBuf.length=0;
}

/* ============ masa de copa ============
   Acá vivía un bloqueo de masa: las hojas se agrupaban por celda y donde había
   varias se pintaba un gradiente radial del tono profundo de la copa, para que
   los huecos entre hoja y hoja dejaran de ser cielo.
   El diagnóstico era correcto y la solución era el atajo. Un gradiente radial
   no es masa de follaje: es una bola verde con blur, y a la escala de cámara de
   esta pieza se lee exactamente así — manchones flotando sobre las ramas. Lo
   que resuelve el hueco no es taparlo con niebla, es que haya hojas ahí, y ésa
   es la corrección que se hizo arriba: las hojas ahora nacen a lo largo del
   brote y sobre los dos niveles interiores, no sólo en las puntas.
   Con follaje de verdad adentro, la masa no tiene nada que bloquear.
   Queda el color `massC*` porque lo sigue usando la paleta como referencia del
   fondo de copa. */
function drawCanopyMass(){}

// Escala de cada plano: la trasera se aleja, la delantera se acerca.
const LAY_S=[0.88,1,1.08];
function drawLayer(g,l){
  drawWood(2+l);
  const B=leafBk[l];
  if(!B.length) return;
  const ls=LAY_S[l];
  for(let i=0;i<B.length;i+=LEAF){
    const ph=B[i+4], sh=B[i+5];
    // Variación por hoja: ±12% de tamaño, ±14° de inserción y un escalón de
    // incidencia. Una hoja no sale exactamente en el eje de su ramita.
    const v=ph*0.1591; const vr=v-Math.floor(v);
    const a=B[i+2]+(vr-0.5)*0.5;
    // Hoja de sombra: hasta un tercio más grande. No es licencia, es como
    // funciona una copa — la lámina crece donde hay menos luz que interceptar.
    const s=15*ls*(0.88+0.24*vr)*(1+0.34*sh)*ease(clamp((B[i+3]-0.5)/0.5));
    const sp=s*scaleNow;
    if(sp<1.2) continue;
    /* Giro sobre el nervio. Iba de 0.28 a 1, o sea que la hoja más de canto se
       aplastaba al 28% de su ancho: a esa compresión una hoja de cítrico deja
       de leerse como hoja y pasa a ser una astilla, y la copa se llenaba de
       formas que no son la misma forma.
       El piso sube a 0.58. Sigue habiendo escorzo —que es lo que evita la
       calcomanía repetida— pero ahora todas las hojas de la copa se leen como
       LA MISMA hoja vista desde ángulos distintos, que es lo que son.
       Y la de sombra se pone casi de cara: sin un sol al que esquivar, la hoja
       se acuesta para recibir todo lo que le llega de rebote. */
    const v2=ph*0.4771; const vr2=v2-Math.floor(v2);
    const roll=lerp(0.58+0.42*vr2*(0.40+0.60*vr2), 0.88+0.12*vr2, sh);
    const pd=-Math.sin(a)*LIGHT.x+Math.cos(a)*LIGHT.y;
    // La hoja de canto entrega menos cara al sol: baja de escalón. Y la de
    // sombra baja dos más: está dentro de la copa, le llega luz rebotada.
    let bi=Math.round((pd+1)*0.5*(LEAF_BINS-1)+(vr-0.5)*0.9+(roll-1)*1.1-sh*2.1);
    if(bi<0)bi=0; else if(bi>LEAF_BINS-1)bi=LEAF_BINS-1;
    // Edad del brote: recién salida es clara y amarillenta, y se oscurece.
    // La de sombra es siempre la más vieja: nadie renueva el interior.
    let ag=Math.round(Math.max(sh,clamp((B[i+3]-0.5)/0.2))*(LEAF_AGE-1));
    const C=leafPal[(l*LEAF_AGE+ag)*LEAF_BINS+bi];
    // LOD por tamaño en pantalla: nada de bezier bajo 5 px, nada de nervadura
    // bajo 12 px. Con esta cámara casi toda la copa vive en el nivel medio.
    const lod=sp<5?0:sp<12?1:2;
    leafShape(B[i],B[i+1],a,s,C,lod,roll);
    /* Acá salía una segunda hoja más chica pegada a la primera, que era el
       parche para darle masa a una copa que sólo tenía hojas en las puntas.
       Ahora las hojas se siembran a lo largo del brote y sobre los niveles
       interiores, así que la masa la da el follaje real: duplicar cada hoja
       encima de sí misma sólo agregaría trabajo y una segunda silueta corrida
       que se lee como error de registro. */
  }
  B.length=0;
}

/* ============ flores, cuaje, caída, fruto ============ */

/* Un pétalo de azahar: céreo, grueso, elíptico y ancho en la punta. Cinco de
   estos, no cinco elipses rotadas. */
function petalPath(r0,L,wd){
  const r1=r0+L;
  ctx.moveTo(r0,0);
  ctx.quadraticCurveTo(r0+L*0.26,-wd,r0+L*0.70,-wd*0.90);
  ctx.quadraticCurveTo(r1,-wd*0.46,r1,0);
  ctx.quadraticCurveTo(r1,wd*0.46,r0+L*0.70,wd*0.90);
  ctx.quadraticCurveTo(r0+L*0.26,wd,r0,0);
}

/* Retícula de Fibonacci sobre la esfera. Proyectada, la densidad crece sola
   hacia el borde — y eso es exactamente lo que hace que el granulado lea como
   esfera y no como círculo. Se calcula una sola vez. */
const RIND_N=118, RIND=new Float32Array(RIND_N*3);
for(let i=0;i<RIND_N;i++){
  // Un jitter chico rompe los brazos de la espiral, que si no se ven como
  // rayas diagonales sobre la cáscara.
  const j=Math.sin(i*12.9898)*0.5;
  const y=1-((i+j)/(RIND_N-1))*2, r=Math.sqrt(Math.max(0,1-y*y));
  const th=2.39996323*i+Math.sin(i*78.233)*0.22;
  RIND[i*3]=Math.cos(th)*r; RIND[i*3+1]=y; RIND[i*3+2]=Math.sin(th)*r;
}

// Esfera con normal real: el terminador cae donde lo pone el sol, no donde
// quedó bien un gradiente.
/* Un cítrico es OBLATO: más ancho que alto, siempre. El fruto se dibujaba con
   `arc` —círculo perfecto— y ésa es de las siluetas que el ojo reconoce como
   dibujada aunque no sepa por qué. No hace falta deformarlo al azar; alcanza
   con que tenga la proporción que tiene.
   El camino sale de acá y no de cada llamador: los recortes del viraje usan la
   misma silueta, y si se escriben dos veces, un día divergen y el recorte le
   come el borde al fruto. */
const FR_X=1.048, FR_Y=0.958;
function fruitPath(x,y,R){
  ctx.beginPath();ctx.ellipse(x,y,R*FR_X,R*FR_Y,0,0,6.283);
}
function sphere(x,y,R,base){
  const rg=ctx.createRadialGradient(x+LIGHT.x*R*0.45,y+LIGHT.y*R*0.45,R*0.05,x,y,R*1.18);
  rg.addColorStop(0,shadeD(base,0.99));
  rg.addColorStop(0.5,shadeD(base,0.64));
  rg.addColorStop(1,shadeD(base,0.06));
  ctx.fillStyle=rg;
  fruitPath(x,y,R);ctx.fill();
}
// Granulado: cada punto de la retícula es un hoyuelo, con su lucecita y su
// sombrita. Los que caen del lado de atrás de la esfera no se dibujan.
function rindTexture(x,y,R,base,al){
  const d=Math.max(0.6,R*0.062), off=d*0.55;
  for(let pass=0;pass<2;pass++){
    const sg=pass?-1:1;
    // Los hoyuelos marcan, no manchan: a 11 px en pantalla el par sombra/luz
    // al 26% se leía como moho en vez de como cáscara.
    ctx.globalAlpha=al*(pass?0.17:0.20);
    ctx.fillStyle=pass?shadeD(base,0.06):rgba(LIGHT.sun,0.9);
    /* Redondos y en una sola trazada. Eran `fillRect`: cuadraditos alineados al
       borde de la pantalla, el mismo defecto que tenían las partículas del
       suelo. Un poro no tiene lados rectos y menos paralelos a la hoja. */
    ctx.beginPath();
    for(let i=0;i<RIND_N;i++){
      const z=RIND[i*3+2]; if(z<=0.05) continue;
      const r=d*(0.42+0.58*z)*0.5;
      const cx=x+RIND[i*3]*R*FR_X*0.94+LIGHT.x*off*sg;
      const cy=y+RIND[i*3+1]*R*FR_Y*0.94+LIGHT.y*off*sg;
      ctx.moveTo(cx+r,cy);ctx.arc(cx,cy,r,0,6.283);
    }
    ctx.fill();
  }
  ctx.globalAlpha=al;
}
/* El acabado de una naranja: el halo de subsuperficie en el borde iluminado, la
   sombra propia bajo el pedúnculo y el especular chico.
   Vive acá, suelto, porque lo usan LOS DOS lugares donde aparece una naranja —
   la de la rama y la que viaja al centro en el clímax— y son la misma fruta.
   Cuando estaba escrito una sola vez dentro de `drawFlowers`, la del clímax se
   dibujaba con otro material y en el cuadro del traspaso se veía el cambio de
   superficie aunque la posición fuera continua. */
function orangeSheen(x,y,R,body,al){
  const la=Math.atan2(LIGHT.y,LIGHT.x);
  // Subsurface: el borde iluminado de una naranja tiene halo cálido porque la
  // luz atraviesa la cáscara.
  ctx.globalAlpha=al*0.30;
  ctx.strokeStyle=shadeD(mixH(body,'#FF9A2E',0.55),0.95);
  ctx.lineWidth=R*0.16;
  ctx.beginPath();ctx.arc(x,y,R*0.90,la-1.15,la+1.15);ctx.stroke();
  // Sombra propia bajo el cáliz, que está arriba, del lado del pedúnculo.
  ctx.globalAlpha=al*0.34;
  ctx.fillStyle=shadeD(body,0.04);
  ctx.beginPath();ctx.ellipse(x,y-R*0.66,R*0.46,R*0.22,0,0,6.283);ctx.fill();
  // Especular chico y nítido, no un gradiente difuso.
  ctx.globalAlpha=al*0.55;
  ctx.fillStyle=rgba(LIGHT.sun,0.9);
  ctx.beginPath();
  ctx.ellipse(x+LIGHT.x*R*0.52,y+LIGHT.y*R*0.52,R*0.16,R*0.10,la,0,6.283);
  ctx.fill();
  ctx.globalAlpha=al;
}

function drawFlowers(g,pe,orange,camS,camY,pick){
  const setP=clamp((pe-0.618)/0.020);
  const cPetal=flowPal[0], cStamen=flowPal[1], cCalyx=flowPal[2], cSet=flowPal[3];
  const cPetalIn=flowPal[5], cFil=flowPal[6], cOvary=flowPal[7];
  fruitScreen=[];
  for(const s of sites){
    const i=s.node;
    if(g.G[i]<=0.5) continue;
    const x=g.X[i],y=g.Y[i];
    /* Apertura escalonada: cada flor abre en su momento. Una floración en la
       que abren todas juntas es la que delata que esto es una animación. */
    const off=s.stag;
    const op=clamp((pe-0.550-off)/0.030)*(1-clamp((pe-0.605-off)/0.028));
    if(op>0.01){
      const e=petalOut(op);            // la corola abre con un sobrepaso corto
      const sc=6.4*(0.85+0.3*Math.sin(s.ph));
      const sp=sc*camS;
      ctx.save();ctx.translate(x,y);ctx.rotate(s.ph);
      // Los pétalos se reflejan hacia atrás al abrirse: la corola se separa
      // del centro y la punta se recurva.
      const rf=e*e;
      const r0=sc*(0.10+0.20*rf), L=sc*(0.55+0.62*e), wd=sc*(0.24+0.26*e);
      ctx.fillStyle=cPetal;
      ctx.beginPath();
      for(let k=0;k<5;k++){
        const a=k*1.2566;
        ctx.save();ctx.rotate(a);petalPath(r0,L,wd);ctx.restore();
      }
      ctx.fill();
      if(rf>0.25&&sp>5.5){               // el envés que asoma al recurvarse
        ctx.fillStyle=cPetalIn;
        ctx.beginPath();
        for(let k=0;k<5;k++){
          const a=k*1.2566;
          ctx.save();ctx.rotate(a);
          petalPath(r0+L*(1-0.26*rf),L*0.26*rf,wd*0.80);
          ctx.restore();
        }
        ctx.fill();
      }
      /* Penacho de estambres: ~22 filamentos con antera amarilla. Es lo que
         hace que se lea azahar y no margarita. La cuenta baja con el tamaño en
         pantalla: 22 hilos en 4 px son una mancha, no un penacho. */
      const NF=sp>13?22:sp>6?12:6;
      if(sp>2.2){
        const fl=sc*(0.30+0.52*e);
        ctx.strokeStyle=cFil;ctx.lineWidth=Math.max(0.25,sc*0.045);
        ctx.beginPath();
        for(let k=0;k<NF;k++){
          const a=k*6.283/NF+s.ph*0.7, ln=fl*(0.72+0.28*Math.sin(k*2.7+s.ph));
          ctx.moveTo(0,0);
          ctx.quadraticCurveTo(Math.cos(a)*ln*0.5,Math.sin(a)*ln*0.5,
            Math.cos(a+0.22*rf)*ln,Math.sin(a+0.22*rf)*ln);
        }
        ctx.stroke();
        ctx.fillStyle=cStamen;ctx.beginPath();
        for(let k=0;k<NF;k++){
          const a=k*6.283/NF+s.ph*0.7, ln=fl*(0.72+0.28*Math.sin(k*2.7+s.ph));
          const ax=Math.cos(a+0.22*rf)*ln, ay=Math.sin(a+0.22*rf)*ln;
          ctx.moveTo(ax+sc*0.075,ay);
          ctx.arc(ax,ay,sc*0.075,0,6.283);
        }
        ctx.fill();
      }
      // Ovario: literalmente la naranja futura. Su radio empalma con el del
      // fruto para que no haya corte entre una cosa y la otra.
      ctx.fillStyle=cOvary;
      ctx.beginPath();ctx.arc(0,0,1.40,0,6.283);ctx.fill();
      ctx.restore();
      // El penacho al sol es una de las dos únicas fuentes de bloom.
      if(bloomOK&&e>0.4&&LIGHT.low<0.72)
        glowBuf.push(W/2+x*camS,H*0.52+(y-camY)*camS,sc*camS*2.4,0.30*e*(1-LIGHT.low));
    }
    /* Los pétalos no se desvanecen: se sueltan y caen. */
    const fa=(pe-(0.612+off))/0.058;
    if(fa>0&&fa<1&&camS>0.28){
      ctx.fillStyle=cPetal;ctx.globalAlpha=1-clamp((fa-0.82)/0.18);
      ctx.beginPath();
      const sc=6.4*(0.85+0.3*Math.sin(s.ph));
      for(let k=0;k<5;k++){
        const j=Math.sin(s.ph*7.1+k*2.3);
        const px=x+j*26*fa, py=y+6+330*fa*fa*(0.8+0.2*Math.abs(j));
        const rot=s.ph+k+fa*(4.2*j);
        ctx.save();ctx.translate(px,py);ctx.rotate(rot);
        petalPath(0,sc*1.05,sc*0.44);
        ctx.restore();
      }
      ctx.fill();ctx.globalAlpha=1;
    }
    if(setP<=0) continue;
    ctx.fillStyle=cCalyx;
    ctx.save();ctx.translate(x,y);ctx.rotate(s.ph);
    ctx.beginPath();
    for(let k=0;k<5;k++){
      const a=k*1.2566;
      ctx.ellipse(Math.cos(a)*1.7,Math.sin(a)*1.7,2.6,1.5,a,0,6.283);
    }
    ctx.fill();ctx.restore();

    if(s.fate==='keep'){
      const gr=key([[0.618,0.082],[0.650,0.11],[0.690,0.42],[0.735,0.78],[0.782,1]],pe);
      const R=17*gr*s.cal;
      const sel = pick>=0 && s.proj===pick;
      /* La posición en pantalla se publica ANTES de decidir si el fruto se
         dibuja: es de donde sale la fase interior, y si se publicara después
         del `continue` de abajo, el primer frame del viaje se quedaría sin
         origen y la naranja arrancaría desde el centro de la nada. */
      if(s.proj>=0) fruitScreen[s.proj]={
        x:W/2+x*camS, y:H*0.52+(y+R*0.85-camY)*camS, r:R*camS};
      /* El fruto elegido DESAPARECE de la copa apenas empieza a viajar. Antes
         seguía dibujándose acá mientras la fase interior pintaba otra naranja
         encima, así que durante toda la entrada había dos: la del árbol y la
         que crecía sobre ella. La que viaja es la misma que estaba en la rama,
         y la única forma de que se lea así es que haya UNA. */
      if(sel&&interiorNow>0.002) continue;
      /* Acá se atenuaban al 42% todas las frutas menos la elegida, y el elegido
         llevaba además un anillo blanco alrededor. Los dos eran señalización de
         la ELECCIÓN: con el puntero encima había que decir cuál estaba
         apuntada, y bajar las otras era la forma de decirlo.
         Sin elección, lo único que quedaba de eso era una naranja con un aro
         blanco y seis naranjas translúcidas — una fruta translúcida no es una
         fruta, y el aro se leía como un resto de interfaz olvidado sobre el
         dibujo. Lo que la fase que viene necesita es que se sepa cuál va a
         viajar, y eso ya lo dice ella sola: es la que crece y se acerca. */
      const dim=1;
      const pop = sel ? 1+0.13*clamp((pe-0.786)/0.02) : 1;
      // Los sin proyecto llevan un naranja de la casa, corrido por fruto: en un
      // árbol real tampoco hay dos exactamente del mismo tono.
      const green='#7BA544';
      const ripe = s.proj>=0 ? PROJECTS[s.proj].hue
                 : mixH('#E8791B','#F2A03C',(Math.sin(s.ph*9.1)*0.5+0.5));
      ctx.globalAlpha=dim;
      const cy=y+R*0.85, RR=R*pop, sp=RR*camS;
      sphere(x,cy,RR,green);
      /* El viraje no cambia el fruto entero de golpe: barre desde el extremo
         estilar hacia el pedúnculo, que es el que retiene clorofila más
         tiempo. Y los tres frutos no viran a la vez. */
      const ob=clamp((orange-s.turn)/(1-s.turn));
      if(ob>0.002){
        ctx.save();
        fruitPath(x,cy,RR);ctx.clip();
        const front=RR*(0.10+2.35*ob);
        ctx.globalAlpha=dim*0.55;                 // zona de transición amarillenta
        ctx.beginPath();ctx.arc(x,cy+RR*0.92,front*1.22,0,6.283);ctx.clip();
        sphere(x,cy,RR,ripe);
        ctx.globalAlpha=dim;
        ctx.beginPath();ctx.arc(x,cy+RR*0.92,front*0.82,0,6.283);ctx.clip();
        sphere(x,cy,RR,ripe);
        ctx.restore();
      }
      const body=mixH(green,ripe,ob);
      if(sp>7) rindTexture(x,cy,RR,body,dim);
      if(sp>4){
        // Subsurface: el borde iluminado de una naranja tiene halo cálido
        // porque la luz atraviesa la cáscara.
        ctx.globalAlpha=dim*0.30;
        ctx.strokeStyle=shadeD(mixH(body,'#FF9A2E',0.55),0.95);
        ctx.lineWidth=RR*0.16;
        ctx.beginPath();
        const la=Math.atan2(LIGHT.y,LIGHT.x);
        ctx.arc(x,cy,RR*0.90,la-1.15,la+1.15);ctx.stroke();
        // Sombra propia bajo el cáliz, que está arriba, del lado del pedúnculo.
        ctx.globalAlpha=dim*0.34;
        ctx.fillStyle=shadeD(body,0.04);
        ctx.beginPath();
        ctx.ellipse(x,cy-RR*0.66,RR*0.46,RR*0.22,0,0,6.283);ctx.fill();
        // Especular chico y nítido, no un gradiente difuso.
        ctx.globalAlpha=dim*0.55;
        ctx.fillStyle=rgba(LIGHT.sun,0.9);
        ctx.beginPath();
        ctx.ellipse(x+LIGHT.x*RR*0.52,cy+LIGHT.y*RR*0.52,RR*0.16,RR*0.10,la,0,6.283);
        ctx.fill();
        // El fruto maduro a contraluz: la otra fuente de bloom. No vale un
        // blur de pantalla completa por un fruto que ya se está yendo.
        if(bloomOK&&ob>0.55&&LIGHT.low>0.45&&interiorNow<0.3)
          glowBuf.push(W/2+x*camS,H*0.52+(cy-camY)*camS,RR*camS*2.6,
            0.34*ob*clamp((LIGHT.low-0.45)/0.35)*dim);
      }
      /* Cáliz y pedúnculo, a escala del fruto y encima de él. El cáliz genérico
         de más arriba mide 2.6 px fijos: contra una naranja de 17 desaparece, y
         lo que queda es una bolita apoyada al lado de la ramita sin nada que la
         sostenga. Va después de la cáscara porque se apoya sobre ella. */
      if(sp>3.5){
        const ty=cy-RR*0.82;
        ctx.globalAlpha=dim;
        ctx.strokeStyle=cCalyx;
        ctx.lineWidth=Math.max(0.7,RR*0.13);ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(x,ty);ctx.lineTo(x-RR*0.06,ty-RR*0.34);ctx.stroke();
        ctx.fillStyle=cCalyx;
        ctx.beginPath();
        for(let k=0;k<5;k++){
          const a=k*1.2566+s.ph;
          ctx.ellipse(x+Math.cos(a)*RR*0.17,ty+Math.sin(a)*RR*0.11,
            RR*0.27,RR*0.15,a,0,6.283);
        }
        ctx.fill();
      }
      ctx.globalAlpha=1;
    } else {
      const tf=(pe-s.dropAt)/0.062;
      if(tf<0){
        const R=4.2*clamp((pe-0.618)/0.04);
        ctx.fillStyle=cSet;
        ctx.beginPath();ctx.arc(x,y+R*0.9,R,0,6.283);ctx.fill();
      } else if(tf<1){
        const fy=y+9+520*tf*tf,fx=x+s.jit*tf;
        ctx.globalAlpha=1-clamp((tf-0.75)/0.25);
        ctx.fillStyle=cSet;
        ctx.beginPath();ctx.arc(fx,fy,4.2,0,6.283);ctx.fill();
        ctx.globalAlpha=1;
      }
    }
  }
}

/* La semilla aterriza EXACTAMENTE donde y como empieza la que germina: misma
   posición, misma orientación, mismo tamaño. Antes llegaba 4 px corrida y
   girada 540°, y al tocar tierra pegaba un salto — el mismo problema de
   continuidad que rompía la idea de que es la misma semilla volviendo.
   Una vuelta completa menos 0.2 rad es exactamente la pose de `drawSeed`.

   Y el OTRO extremo importa igual. La semilla entraba por el borde de arriba,
   chiquita, casi fuera de cuadro: la pieza abría con nada. Ahora arranca
   PLANTADA en el centro del encuadre y grande, que es donde el ojo ya está
   mirando, y desde ahí se aleja cayendo. Esa pose inicial no es libre — es la
   misma en la que la deja el gajo al soltarla al final de la vuelta anterior, y
   ése es todo el argumento de la pieza hecho geometría.

   Constantes de la pose de partida, exportadas por `SEED_IN`, porque el final
   del ciclo tiene que poder aterrizar EXACTAMENTE ahí. Si alguien toca una,
   toca las dos puntas del bucle a la vez, que es justamente lo que se quiere. */
const SEED_IN={s:13, rot:-0.2, hold:0.16};
function drawFallingSeed(u,camY,hh,tint){
  /* Un arranque quieto. `u²` sale disparada desde el primer frame; la semilla
     tiene que quedarse un momento donde la dejó la vuelta anterior —si no, el
     empalme se ve pero no se lee— y recién después caer. */
  const d=clamp((u-SEED_IN.hold)/(1-SEED_IN.hold));
  const e=d*d;
  const y=lerp(camY,4,e);
  const x=Math.sin(d*7)*46*e*(1-e)*2;
  const rot=SEED_IN.rot+d*6.2832+Math.sin(d*13)*(1-d)*d*0.9;
  ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  /* Y el tamaño también empalma por los dos lados: sale de 13 —la semilongitud
     con la que la suelta el gajo— y llega a 13, que es `drawSeed` en pe=0.05
     con su hinchazón todavía en 1. En el medio se aleja y se achica. */
  seedDraw(SEED_IN.s*(1-0.30*Math.sin(d*Math.PI)),
    shadeD(tint||SEED_BASE,0.82),'rgba(90,70,40,.45)');
  ctx.restore();
}

/* ============================================================
   FASE INTERIOR — se dibuja en coordenadas de pantalla.
   fruta → cáscara que se pela → gajos → semillas → una se suelta
   ============================================================ */
const GAJOS_TOTAL=10;   // una naranja real trae ~10 carpelos
/* Un carpelo no es un sector de anillo: es una gota. Arco exterior, dos lados
   con panza que convergen, y una punta redondeada sobre el eje. */
/* El radio se modula apenas — una naranja no es un círculo perfecto, y esa
   irregularidad mínima es la diferencia entre "esfera" y "fruta". */
const rMod=a=>1+0.014*Math.sin(a*3+1.1)+0.009*Math.sin(a*5-0.4)+0.005*Math.sin(a*8+2.2);
function wedgePath(g,r0,r1,a0,a1){
  const n=Math.max(3,Math.ceil((a1-a0)/0.10));
  g.beginPath();
  for(let k=0;k<=n;k++){
    const a=a0+(a1-a0)*k/n, r=r1*rMod(a);
    const x=Math.cos(a)*r, y=Math.sin(a)*r;
    if(k) g.lineTo(x,y); else g.moveTo(x,y);
  }
  if(r0>0){
    for(let k=n;k>=0;k--){
      const a=a0+(a1-a0)*k/n, r=r0*rMod(a);
      g.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    }
  } else g.lineTo(0,0);
  g.closePath();
}
/* ============ carpelo ============
   Un gajo tiene DOS formas de verdad y una sola primitiva no puede ser las
   dos: empaquetado dentro de la naranja es una cuña que tilea el disco, y
   suelto es un creciente gordo de punta roma. Dibujar el suelto como cuña es
   lo que lo hacía parecer un dardo de papel.
   Se dibuja en su propio marco: punta en el origen, eje sobre +x. */
/* El lado del sector hay que recorrerlo por RADIO, no por x: si no, la esquina
   exterior queda a L/cos(halfA) y el contorno del corte sale facetado en vez
   de circular. */
const CN=9;
function carpelW(u,L,halfA,detach){
  return lerp(u*L*Math.sin(halfA), L*0.34*(0.26+0.74*Math.pow(u,0.55)), detach);
}
function carpelX(u,L,halfA,detach){
  return lerp(u*L*Math.cos(halfA), u*L, detach);
}
/* Curvatura del eje: un gajo es una tajada de esfera, así que el lomo es
   convexo y la panza cóncava. Simétrico se lee como escudo, no como gajo.
   Sólo aparece cuando está suelto; empaquetado el eje es recto. */
function carpelC(u,L,detach){ return detach*L*0.115*Math.sin(Math.PI*u)*Math.pow(u,0.35); }
function carpelPath(g,L,halfA,detach){
  const wy=u=>carpelW(u,L,halfA,detach)+0, wx=u=>carpelX(u,L,halfA,detach);
  const cv=u=>carpelC(u,L,detach);
  const w1=wy(1), w0=wy(0.02), x1=wx(1), x0=wx(0.02);
  /* Lomo: cuadrática que aproxima el arco del círculo cuando está empaquetado
     (control en L/cos halfA, error < 0.2%) y panza cuando está suelto. */
  const cpx=lerp(L/Math.cos(halfA),L+w1*0.62,detach);
  g.beginPath();
  g.moveTo(x0,cv(0.02)-w0);
  for(let k=1;k<=CN;k++){const u=k/CN;g.lineTo(wx(u),cv(u)-wy(u));}
  g.quadraticCurveTo(cpx,cv(1),x1,cv(1)+w1);
  for(let k=CN-1;k>=1;k--){const u=k/CN;g.lineTo(wx(u),cv(u)+wy(u));}
  g.lineTo(x0,cv(0.02)+w0);
  g.quadraticCurveTo(x0-w0*1.5*detach,cv(0.02),x0,cv(0.02)-w0);
  g.closePath();
}

/* ============ puntilleo ============
   En una lámina botánica el volumen no se construye con gradientes: se
   construye con DENSIDAD de puntos. Más juntos, más oscuro; los brillos se
   dejan sin puntos. Es exactamente al revés de lo que hacía —densidad fija y
   color variable— y es la razón por la que se leía digital.
   Grilla jitereada sobre el disco unidad, calculada una vez. */
const STI_N=1600, STI=new Float32Array(STI_N*3);
(function(){
  const f=n=>{const h=Math.sin(n)*43758.5453;return h-Math.floor(h);};
  let m=0;
  for(let i=0;i<STI_N;i++){
    const a=i*2.39996323, r=Math.sqrt((i+0.5)/STI_N);
    STI[m++]=Math.cos(a)*r+(f(i*7.1)-0.5)*0.035;
    STI[m++]=Math.sin(a)*r+(f(i*3.7)-0.5)*0.035;
    STI[m++]=f(i*12.9);          // umbral propio de cada punto
  }
})();
/* tone(x,y) devuelve 0 (oscuro, muy punteado) a 1 (brillo, sin puntos). */
function stipple(cx,cy,R,col,tone,gain,dotR){
  ctx.fillStyle=col;
  const d=Math.max(0.55,dotR);
  for(let i=0;i<STI_N;i++){
    const ux=STI[i*3],uy=STI[i*3+1];
    if(ux*ux+uy*uy>1) continue;
    const dens=(1-tone(ux,uy))*gain;
    if(STI[i*3+2]>dens) continue;
    const s=d*(0.55+0.65*dens);
    ctx.fillRect(cx+ux*R-s*0.5,cy+uy*R-s*0.5,s,s);
  }
}
/* Vesículas de jugo: alargadas y radiales desde el eje, más densas hacia
   afuera. Es lo que separa pulpa de diana. Paramétricas, se calculan una vez. */
const VES_N=68, VES=new Float32Array(VES_N*4);
for(let i=0;i<VES_N;i++){
  const f=n=>{const h=Math.sin(n)*43758.5453;return h-Math.floor(h);};
  const u=f(i*12.9898), v=f(i*78.233), w=f(i*39.425);
  VES[i*4]=0.15+0.80*Math.sqrt(u);
  VES[i*4+1]=v*2-1;
  // Cortas y densas. Largas se leen como veta de madera, no como jugo.
  VES[i*4+2]=0.030+0.050*w;
  VES[i*4+3]=w;
}
/* ============ tipografía en canvas ============
   Las etiquetas del DOM están cuidadas; las del canvas tienen que estar al
   mismo nivel. Tracking real, halo para que se lean sobre la fruta, y nada de
   dibujar antes de que la fuente haya cargado: la primera pasada en fuente de
   sistema se ve como un salto. */
let LABEL_HALO='rgba(242,237,226,.85)';   // se ajusta al fondo cada frame
let fontsReady=!(document.fonts&&document.fonts.ready);
if(!fontsReady) document.fonts.ready.then(()=>{fontsReady=true;});
const HAS_LS=(function(){try{return 'letterSpacing' in ctx;}catch(e){return false;}})();
function label(text,x,y,align,size,col,alpha,weight,track){
  if(!fontsReady||alpha<=0.004) return;
  const tr=track===undefined?0.24:track;      // .24em, el mismo de las versalitas del DOM
  ctx.globalAlpha=alpha;
  ctx.fillStyle=col;
  ctx.font=(weight||500)+' '+size+'px "IBM Plex Mono",ui-monospace,Menlo,monospace';
  ctx.textBaseline='middle';
  // Halo del color del fondo: las etiquetas caen sobre la fruta.
  ctx.shadowColor=LABEL_HALO; ctx.shadowBlur=6;
  if(HAS_LS){
    ctx.letterSpacing=(size*tr).toFixed(2)+'px';
    ctx.textAlign=align;
    ctx.fillText(text,x,y);
    ctx.letterSpacing='0px';
  }else{
    // Sin letterSpacing, carácter por carácter con el avance a mano.
    const adv=size*tr;
    let w=-adv;
    for(let i=0;i<text.length;i++) w+=ctx.measureText(text[i]).width+adv;
    let cx0=align==='right'?x-w:align==='center'?x-w/2:x;
    ctx.textAlign='left';
    for(let i=0;i<text.length;i++){
      ctx.fillText(text[i],cx0,y);
      cx0+=ctx.measureText(text[i]).width+adv;
    }
  }
  ctx.shadowBlur=0;
  ctx.globalAlpha=1;
}

/* ============================================================
   EL PELADO
   ============================================================
   Lo que había acá antes eran ocho sectores de anillo que se corrían hacia
   afuera y se achataban. Funcionaba como reparto de una torta, no como una
   cáscara: la piel no se rompe, no se dobla, no muestra nunca su lado de
   adentro, y sobre todo no se DESPEGA — se aleja entera, rígida, como si la
   naranja se hubiera partido en gajos de corteza.

   Una cáscara real hace una sola cosa, y es la que hay que modelar: hay una
   LÍNEA DE PELADO que baja por la fruta, y por detrás de ella la piel ya
   soltada se enrosca. Debajo de la línea la piel sigue pegada y está
   exactamente sobre la esfera. Arriba está libre: sale de la esfera por la
   TANGENTE en la línea de pelado y sigue un arco de curvatura constante cuya
   longitud es exactamente la longitud de piel ya soltada. Esa última
   condición es la que importa: sin ella la tira se estira o se encoge mientras
   se pela, y el ojo lo lee como goma en vez de cáscara.

   La matemática es la de `orange-r3f/src/procedural.js` — `deformGore` — y se
   porta sin tocarla, pero NO por la razón que yo había anotado. La fase
   interior de esta pieza no es una vista en corte: es una sección
   TRANSVERSAL, un rosetón de carpelos visto desde el eje, así que una curva
   meridiana no proyecta ahí.
   Lo que sí es cierto es otra cosa, y alcanza: durante el pelado la fruta
   todavía se lee como esfera vista DE COSTADO. Y la proyección ortográfica de
   un gore 3D visto de costado es literalmente

       x = u·sen ψ        y = −v        z = u·cos ψ

   o sea que el par (u, v) que `deformGore` calcula en el plano meridiano ya es
   el dibujo, sin cámara ni proyección de por medio. Lo único que hay que
   agregar es el orden de pintado por z, que es painter's algorithm sobre diez
   tiras.
*/
const PEEL_N=10;                 // tiras: las mismas que carpelos tiene la fruta
const DPSI=6.283185307/PEEL_N;

/* Un pelado de verdad no arranca parejo. Cada tira se suelta un poco antes o
   un poco después, y esa diferencia es lo que hace que el borde se lea como
   roto en vez de recortado. Determinista: la pieza es función de pe. */
const PEEL_JAG=(()=>{
  const a=new Float32Array(PEEL_N);
  for(let i=0;i<PEEL_N;i++){const h=Math.sin((i+1)*78.233)*43758.5453;a[i]=0.80+0.34*(h-Math.floor(h));}
  return a;
})();

/* Orden de pintado: de atrás hacia adelante por el coseno del azimut. Estático,
   porque los azimuts de las tiras no cambian nunca. */
const PEEL_ORDER=(()=>{
  const o=[];
  for(let i=0;i<PEEL_N;i++) o.push(i);
  return o.sort((a,b)=>Math.cos((a+0.5)*DPSI-1.5708)-Math.cos((b+0.5)*DPSI-1.5708));
})();

/* La curva del meridiano NO depende del azimut: es la misma para las diez
   tiras. Se calcula una vez por frame en estos buffers en vez de diez veces.
   `sp` es cuánto se abre la tira a lo ancho, y es la segunda condición de
   longitud conservada: la piel tampoco se estira DE COSTADO. A radio u, el
   trozo que en la esfera medía R·sen θ de ancho tiene que seguir midiendo lo
   mismo, así que su medio ángulo se achica en R·sen θ / u. Sin eso la punta de
   la tira —que en la esfera es un punto sobre el polo— se abre en abanico
   mientras se aleja, y la cáscara parece un pétalo. */
const MER_K=34;
const MU=new Float32Array(MER_K+1), MV=new Float32Array(MER_K+1),
      MSP=new Float32Array(MER_K+1), MD=new Float32Array(MER_K+1);
let merRows=0;

/* Rehace la curva del meridiano para una línea de pelado en `thP`.
   `MD` guarda la incidencia de la luz sobre la superficie, con signo: positivo
   es la cara de afuera mirando al espectador, negativo es la de adentro. Ese
   signo es todo el truco de que la tira se lea como cáscara y no como recorte
   de papel — cuando se enrosca, lo que se ve es el albedo. */
function peelMeridian(thP,curv,R,psiC){
  const sinP=Math.sin(thP), cosP=Math.cos(thP);
  const pu=R*sinP, pv=R*cosP;
  const du=-cosP, dv=sinP;          // tangente cuesta abajo en la línea de pelado
  const nu=-dv,   nv=du;            // su normal izquierda
  const k=curv/R;
  const sc=Math.sin(psiC), cc=Math.cos(psiC);
  merRows=MER_K;
  for(let i=0;i<=MER_K;i++){
    const th=(i/MER_K)*Math.PI;
    let u,v,uT,vT;
    if(th>=thP){
      u=R*Math.sin(th);  v=R*Math.cos(th);
      uT=R*Math.cos(th); vT=-R*Math.sin(th);
    }else{
      const s=R*(thP-th);           // piel ya soltada
      const a=k*s, ca=Math.cos(a), sa=Math.sin(a);
      // sen(a)/k y (1−cos a)/k tienden a s y a 0 cuando k → 0.
      const f=Math.abs(k)<1e-6?s:sa/k;
      const g=Math.abs(k)<1e-6?0:(1-ca)/k;
      u=pu+f*du+g*nu;
      v=pv+f*dv+g*nv;
      uT=-R*(ca*du+sa*nu);
      vT=-R*(ca*dv+sa*nv);
    }
    MU[i]=u; MV[i]=v;
    /* En valor ABSOLUTO, y no es un detalle: una vez que la tira se enrosca
       bastante, `u` se vuelve NEGATIVA — la punta cruzó el eje y quedó del otro
       lado, que es exactamente lo que hace una cáscara al enrollarse sobre sí
       misma. Con la comparación contra cero, esas filas caían en el caso
       degenerado y la tira entera se cerraba en un hilo: la cáscara desaparecía
       justo cuando empezaba a enroscarse de verdad. */
    const w=R*Math.sin(th), au=u<0?-u:u;
    MSP[i]=au>1e-4 ? (w/au<1?w/au:1) : 1;
    /* Normal = dP/dθ × dP/dψ con el factor común u dividido, para que los polos
       —donde u = 0— sigan teniendo normal válida. Analítica y no promediada
       entre triángulos: en los bordes de la tira el promedio se cae y las diez
       tiras salen con costura. En pantalla, y es hacia abajo, así que la
       componente axial cambia de signo. */
    const nx=-sc*vT, ny=-uT, nz=-cc*vT;
    const len=Math.hypot(nx,ny,nz)||1;
    const d=(nx*LIGHT.x+ny*LIGHT.y+nz*LIGHT.z)/len;
    MD[i]=nz>=0 ? (d<0?0:d) : -((-d)<0?0:(-d));
  }
}

/* Dibuja las tiras de un lado. `side` −1 es el fondo y +1 el frente: el albedo
   va entre medio, así que la cáscara de atrás queda detrás de la fruta y la de
   adelante la tapa. */
const pore=[];
function drawPeelStrips(R,peel,side,ex,gradFill,albedoBase,rindBase){
  /* El llamador ya dejó puesto el alpha de salida de la cáscara. Los poros van
     por encima de las tiras, así que tienen que respetarlo: con alpha 1 propio,
     la cáscara se desvanece y los poros se quedan flotando. */
  const alphaNow=ctx.globalAlpha;
  /* Cuánto se enrosca la piel ya suelta. El arco gira `curv · (thP − θ)`
     radianes, o sea que con la curvatura FIJA la tira se enrosca más cuanto más
     larga, que es exactamente lo que hace una cáscara de verdad. Por eso el
     rango es corto: con curvatura 2 la tira da una vuelta y media antes de
     llegar a la mitad de la fruta, se enrolla sobre sí misma y en pantalla no
     se lee como cáscara enroscada sino como un bloque. En 0.5–0.9 la punta
     alcanza a girar unos 130° al final, que es una cáscara abriéndose.
     Acá SÍ entra `peelOut`, que es para lo que estaba escrita y hasta ahora no
     se usaba en ningún lado. La cáscara no se enrosca de a poco: está tensa
     contra la fruta, se suelta, se pasa de rosca y vuelve. Como la curvatura no
     tiene tope duro —a diferencia de la línea de pelado, que se recorta contra
     π— el sobrepaso se ve como lo que es, un rebote, en vez de reventar contra
     un clamp. */
  const curv=0.50+0.40*peelOut(peel);
  for(const s of PEEL_ORDER){
    const psi0=s*DPSI-1.5708, psi1=psi0+DPSI, psiC=psi0+DPSI*0.5;
    if((Math.cos(psiC)<0?-1:1)!==side) continue;
    /* `peelOut` NO sirve acá, y es el error que más costaba ver: es una curva
       elástica, pensada para el rebote de una cáscara que se dobla, y llega a 1
       cuando el pelado va por el 40%. Como línea de pelado eso significa que la
       piel entera se suelta de golpe al principio y después no pasa nada más
       durante el 60% restante. La línea de pelado tiene que ser MONÓTONA y
       recorrer la fruta de punta a punta. */
    const thP=Math.min(Math.PI,smooth(peel)*Math.PI*PEEL_JAG[s]);
    peelMeridian(thP,curv,R,psiC);
    const s0=Math.sin(psi0), s1=Math.sin(psi1);
    const m0=rMod(psi0), m1=rMod(psi1);
    /* La salida es una CAÍDA, no una escala. Agrandar la cáscara desde el
       centro la trae encima de la cámara: durante cinco o seis frames la
       pantalla entera es una pared naranja y no se ve la fruta que quedó, que
       es justo lo que había que mostrar. Cayendo —abajo y hacia su propio
       costado— se va de cuadro conservando su tamaño, y deja ver lo de atrás
       desde el primer frame. */
    const ox=Math.sin(psiC)*R*1.05*ex, oy=R*3.2*ex*ex;
    // fila donde termina lo pegado y empieza lo suelto
    const cut=Math.min(merRows,Math.ceil(thP/Math.PI*merRows));

    /* 1. lo que sigue pegado: está exactamente sobre la esfera, así que se
       pinta con el mismo degradado esférico que la fruta entera. Las diez
       tiras TILEAN el disco, y comparten el valor de `rMod` en cada borde, de
       modo que con el pelado en cero esto es —píxel por píxel— la naranja
       intacta. */
    if(cut<merRows){
      ctx.fillStyle=gradFill;
      ctx.beginPath();
      for(let i=cut;i<=merRows;i++){
        const hx0=MU[i]*(s0+(s1-s0)*(0.5-0.5*MSP[i]))*m0+ox;
        if(i===cut) ctx.moveTo(hx0,-MV[i]*m0+oy); else ctx.lineTo(hx0,-MV[i]*m0+oy);
      }
      for(let i=merRows;i>=cut;i--){
        const hx1=MU[i]*(s0+(s1-s0)*(0.5+0.5*MSP[i]))*m1+ox;
        ctx.lineTo(hx1,-MV[i]*m1+oy);
      }
      ctx.closePath();ctx.fill();
      /* Y sus poros. El puntilleo de la fruta entera se apaga en cuanto arranca
         el pelado —pintaría sobre el fondo—, así que a partir de ahí sólo tenían
         poros las filas SUELTAS: la cáscara quedaba granulada arriba de la línea
         de pelado y perfectamente lisa abajo, con el corte en la misma latitud
         donde estaba el escalón de tono. Dos defectos distintos dibujando la
         misma raya. Acá se acumulan los de la parte que sigue pegada, con el
         mismo criterio y el mismo tamaño: el granulado cruza la línea de pelado
         sin enterarse de que existe. */
      if(R>60) for(let i=cut;i<merRows;i++){
        if(MD[i]<=0.02) continue;
        const a0=MU[i]  *(s0+(s1-s0)*(0.5-0.5*MSP[i]))  *m0+ox, b0=-MV[i]*m0+oy;
        const a1=MU[i]  *(s0+(s1-s0)*(0.5+0.5*MSP[i]))  *m1+ox, b1=-MV[i]*m1+oy;
        const a2=MU[i+1]*(s0+(s1-s0)*(0.5+0.5*MSP[i+1]))*m1+ox, b2=-MV[i+1]*m1+oy;
        const a3=MU[i+1]*(s0+(s1-s0)*(0.5-0.5*MSP[i+1]))*m0+ox, b3=-MV[i+1]*m0+oy;
        const q=Math.hypot(a3-a0,b3-b0)*0.13;
        if(q<=0.45) continue;
        for(let k=0;k<3;k++){
          const h1=Math.sin(i*2.39+k*2.09+s*1.7), h2=Math.sin(i*4.11+k*1.31+s*0.7);
          const uu=0.5+0.30*h1, vv=0.5+0.34*h2;
          pore.push(lerp(a0+(a1-a0)*uu, a3+(a2-a3)*uu, vv),
                    lerp(b0+(b1-b0)*uu, b3+(b2-b3)*uu, vv),
                    q*(0.68+0.52*(h1*0.5+0.5)));
        }
      }
    }

    /* 2. lo suelto: fila por fila, con sombreado plano. Acá el degradado
       esférico ya no sirve —la tira dejó de estar sobre la esfera— y es
       justamente donde el volumen tiene que salir de la luz. Si la fila muestra
       su cara de adentro, se pinta el albedo.

       PERO no de golpe. Ése era el defecto más visible del clímax: la fruta
       pasaba de estar redonda a estar pelándose con un ESCALÓN DE TONO recto
       cruzándola, justo en la línea de pelado. La causa es que la misma
       superficie continua se estaba sombreando con dos modelos distintos — la
       parte pegada con el degradado esférico, la suelta con la incidencia — y
       en la frontera los dos no dan el mismo número. Y como la frontera es una
       latitud, el escalón sale horizontal y perfectamente recto: la línea más
       artificial que tenía la pieza, en su cuadro más importante.
       La fila recién soltada TODAVÍA está sobre la esfera, así que ahí el color
       correcto es el de la esfera. La transición entre los dos modelos se hace
       en el primer medio radián de piel soltada: se pinta el degradado esférico
       y encima el sombreado por incidencia con la opacidad que le corresponda a
       cuánto se despegó. En la línea de pelado eso es exactamente lo pegado; un
       poco más allá es exactamente la tira suelta; y en el medio no hay ningún
       borde porque no hay ningún salto. */
    /* Un radián entero de empalme: con MER_K = 34 son once filas, así que el
       escalón de opacidad entre dos filas contiguas queda en el 9% y deja de
       verse. Con medio radián eran seis filas y el bandeo horizontal seguía
       ahí, más suave pero ahí. */
    const BLEND=1.0;
    for(let i=0;i<cut;i++){
      const d0=MD[i], d1=MD[i+1];
      const a0=MU[i]  *(s0+(s1-s0)*(0.5-0.5*MSP[i]))  *m0+ox, b0=-MV[i]*m0+oy;
      const a1=MU[i]  *(s0+(s1-s0)*(0.5+0.5*MSP[i]))  *m1+ox, b1=-MV[i]*m1+oy;
      const a2=MU[i+1]*(s0+(s1-s0)*(0.5+0.5*MSP[i+1]))*m1+ox, b2=-MV[i+1]*m1+oy;
      const a3=MU[i+1]*(s0+(s1-s0)*(0.5-0.5*MSP[i+1]))*m0+ox, b3=-MV[i+1]*m0+oy;
      /* Sombreado a lo largo de la fila, no plano por fila.
         `peelMeridian` calcula la incidencia en CADA borde —`MD[i]` y
         `MD[i+1]`— y esto promediaba las dos y pintaba la fila de un color
         sólido. O sea: treinta y cuatro facetas con un escalón entre cada par,
         que es exactamente el bandeo horizontal que se ve cruzando la tira. El
         dato para no tenerlo ya estaba calculado; lo único que faltaba era no
         tirarlo.
         La excepción es el pliegue. Cuando `d0` y `d1` tienen SIGNOS distintos,
         esa fila es el canto por donde la tira se da vuelta y se deja de ver la
         cara de afuera para ver el albedo: ahí el borde duro es correcto, es
         una silueta. Degradar a través del pliegue lo emborronaría. */
      if((d0<0)===(d1<0)){
        const c0=d0<0?shadeD(albedoBase,0.30+0.70*-d0):shadeD(rindBase,d0);
        const c1=d1<0?shadeD(albedoBase,0.30+0.70*-d1):shadeD(rindBase,d1);
        if(c0===c1) ctx.fillStyle=c0;
        else{
          const lg=ctx.createLinearGradient((a0+a1)*0.5,(b0+b1)*0.5,(a3+a2)*0.5,(b3+b2)*0.5);
          lg.addColorStop(0,c0);lg.addColorStop(1,c1);
          ctx.fillStyle=lg;
        }
      }else{
        const dm=(d0+d1)*0.5, inside=dm<0, dd=inside?-dm:dm;
        ctx.fillStyle=inside?shadeD(albedoBase,0.30+0.70*dd):shadeD(rindBase,dd);
      }
      const shade=ctx.fillStyle;
      /* La hendija entre filas.
         Entre dos filas contiguas el antialias deja medio píxel de fondo, y
         diez tiras por treinta y cuatro filas son trescientas cuarenta
         hendijas: la cáscara sale rayada. Esto se resolvía trazando el contorno
         con el propio relleno, y funcionaba mientras el relleno fuera opaco.
         Con opacidad parcial deja de funcionar y pasa a ser el problema: el
         borde recibe el relleno Y el trazo, o sea 1−(1−α)² en vez de α, y esa
         doble carga sobre una línea de latitud es otra vez una raya horizontal.
         Sin trazo, entonces. La hendija la tapa el propio cuadrilátero,
         estirado siete décimas de píxel a lo largo de su eje: se pisa con el de
         abajo en vez de dejarle sitio al fondo, y como se pisan con el mismo
         color el solape no se ve. Un dibujo por fila en vez de dos. */
      const dx=a3-a0, dy=b3-b0, dl=Math.hypot(dx,dy)||1;
      const ex2=dx/dl*0.7, ey2=dy/dl*0.7;
      ctx.beginPath();
      ctx.moveTo(a0,b0);ctx.lineTo(a1,b1);
      ctx.lineTo(a2+ex2,b2+ey2);ctx.lineTo(a3+ex2,b3+ey2);
      ctx.closePath();
      // Cuánta piel soltó esta fila, en radianes de esfera y normalizada al
      // tramo de empalme. Cero en la línea de pelado, uno más allá.
      const rel=(thP-(i+0.5)/MER_K*Math.PI)/BLEND;
      if(rel<0.995){
        ctx.fillStyle=gradFill;
        ctx.fill();
        ctx.globalAlpha=alphaNow*smooth(rel<0?0:rel);
        ctx.fillStyle=shade;
        ctx.fill();
        ctx.globalAlpha=alphaNow;
      }else{
        ctx.fillStyle=shade;
        ctx.fill();
      }
      /* Un hoyuelo por fila sobre la cara de AFUERA, acumulado para dibujarlo
         después en dos trazadas. La cáscara suelta se quedaba sin poros: el
         puntilleo de la fruta entera se apaga en cuanto el pelado arranca
         —pintaría sobre el fondo— y a partir de ahí las tiras eran vectores
         planos. Los poros son lo único que distingue una cáscara de un papel
         naranja recortado. */
      if(d0>0.02&&R>60){
        const q=Math.hypot(a3-a0,b3-b0)*0.13;      // alto de la fila
        if(q>0.45) for(let k=0;k<3;k++){
          /* Tres por fila, y las tres coordenadas jitereadas.
             Uno solo por fila y centrado encadena los hoyuelos en una oruga que
             baja por el eje de la tira. Y aun repartiéndolos a lo ancho, si
             quedan todos a media altura de su fila aparecen TREINTA Y CUATRO
             renglones de puntos: la cáscara se lee como papel perforado. Los
             poros de un cítrico no forman renglones ni son del mismo tamaño. */
          const h1=Math.sin(i*2.39+k*2.09+s*1.7), h2=Math.sin(i*4.11+k*1.31+s*0.7);
          const u=0.5+0.30*h1, v=0.5+0.34*h2;
          pore.push(lerp(a0+(a1-a0)*u, a3+(a2-a3)*u, v),
                    lerp(b0+(b1-b0)*u, b3+(b2-b3)*u, v),
                    q*(0.68+0.52*(h1*0.5+0.5)));
        }
      }
    }

    /* Oscurecimiento de borde en los dos cantos de la tira suelta.
       Una cáscara cortada no termina en el mismo tono que su cara: el canto es
       flavedo visto de perfil, denso, y por eso una tira de naranja de verdad
       tiene el borde más cargado que el medio. Sin esto los cantos son filos de
       vector —la línea más limpia de toda la pieza, justo en el clímax. */
    if(cut>1&&R>60){
      ctx.beginPath();
      for(let i=0;i<=cut;i++){
        const x=MU[i]*(s0+(s1-s0)*(0.5-0.5*MSP[i]))*m0+ox, y=-MV[i]*m0+oy;
        if(i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
      }
      for(let i=cut;i>=0;i--){
        const x=MU[i]*(s0+(s1-s0)*(0.5+0.5*MSP[i]))*m1+ox, y=-MV[i]*m1+oy;
        if(i===cut) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle='rgba(126,58,10,.26)';
      ctx.lineWidth=Math.max(1,R*0.0075);
      ctx.stroke();
    }
  }
  if(pore.length){
    // Sombra abajo y luz arriba, como cualquier hoyuelo: dos trazadas para las
    // dos, no dos rellenos por poro.
    for(let pass=0;pass<2;pass++){
      ctx.globalAlpha=alphaNow*(pass?0.13:0.10);
      ctx.fillStyle=pass?rgba(LIGHT.sun,0.9):'rgba(74,36,6,.9)';
      const sg=pass?1:-1;
      ctx.beginPath();
      for(let i=0;i<pore.length;i+=3){
        /* El corrimiento es proporcional al RADIO del poro, no una constante
           del radio de la fruta: fijo, en los poros chicos las dos mitades se
           separan del todo y en vez de un hoyuelo se ve un par de puntitos. */
        const r=pore[i+2], o=r*0.42;
        const x=pore[i]+LIGHT.x*o*sg, y=pore[i+1]+LIGHT.y*o*sg;
        ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,6.283);
      }
      ctx.fill();
    }
    ctx.globalAlpha=alphaNow;
    pore.length=0;
  }
}

/* ============ compás del clímax ============
   Las seis rampas se solapaban o iban pegadas, una detrás de la otra sin un
   solo respiro: la fruta llegaba mientras todavía se estaba pelando, los gajos
   empezaban a abrirse en el mismo cuadro en que terminaban de separarse. Eso no
   es una secuencia, es un solo movimiento largo.
   El silencio entre dos notas es parte de la música. Cada evento ahora TERMINA,
   se queda un momento, y recién entonces empieza el siguiente. Los huecos son
   cortos —entre 0.004 y 0.008 de pe— pero son lo que convierte una rampa
   continua en cinco momentos que se pueden mirar de a uno.
   El presupuesto total no cambió: 0.812 a 0.950, con el corte del bucle en
   0.95. Lo que se les sacó a las rampas es exactamente lo que ocupan las
   pausas. */
const IN_ENTER=[0.812,0.018];   // la fruta llega y se planta   → pausa hasta 0.836
const IN_PEEL =[0.836,0.026];   // la cáscara se abre           → pausa hasta 0.867
const IN_EXIT =[0.862,0.012];   // y se va, mientras aparece el albedo
/* EL GIRO. Éste es el movimiento que faltaba, y su ausencia era el corte más
   feo de la pieza: de un cuadro al otro la fruta pasaba de ser una ESFERA VISTA
   DE COSTADO —con la cáscara meridiana y el albedo envolviéndola— a ser una
   SECCIÓN TRANSVERSAL, un rosetón de carpelos visto desde el eje. Dos
   proyecciones distintas empalmadas por opacidad no se leen como una cosa que
   se abre: se leen como dos dibujos superpuestos, y encima el segundo entraba
   más chico.
   No hace falta inventar nada para arreglarlo, porque la relación entre esas
   dos vistas es una rotación de 90° sobre el eje horizontal, y eso se puede
   dibujar. Un punto de la fruta a latitud θ y azimut ψ es
       (sen θ·sen ψ, cos θ, sen θ·cos ψ)
   y girándolo α sobre x y proyectando ortográficamente queda
       x = sen θ·sen ψ        y = cos θ·cos α − sen θ·cos ψ·sen α
   Con α = 0 eso es exactamente la elipse meridiana que ya se dibujaba de
   perfil; con α = π/2 es exactamente el radio del rosetón. La transición entre
   las dos vistas no es una mezcla: es el camino que hay entre ellas. */
const IN_TURN =[0.866,0.018];   // la fruta gira y muestra el corte → pausa 0.888
/* El albedo se abre. Duraba 0.012 —la mitad que cualquier otro movimiento de
   la fase— y encima era un agujero circular que crecía desde el centro, o sea
   que descubría los diez carpelos ENTEROS Y A LA VEZ. Eso no es abrirse: eso es
   un telón que sube, y por eso se leía como un corte de un cuadro al otro por
   más que técnicamente hubiera una rampa.
   Ahora dura el doble y se abre POR LOS TABIQUES, que es por donde la fruta ya
   venía dividida y por donde se abre una de verdad. */
const IN_BARE =[0.886,0.024];   // el albedo se rasga           → pausa hasta 0.916
const IN_FAN  =[0.916,0.020];   // los carpelos se separan      → pausa hasta 0.936
const IN_OPEN =[0.936,0.008];   // se abre el elegido
const IN_REL  =[0.942,0.008];   // y suelta la semilla, que abre la vuelta siguiente
const ramp=(pe,r)=>clamp((pe-r[0])/r[1]);

function drawInterior(pe,t){
  const enter  = ramp(pe,IN_ENTER);
  if(enter<=0) return 0;
  const peel   = ramp(pe,IN_PEEL);
  /* Entre que la cáscara terminó de salir y que los gajos se abren en hilera
     hay un momento que antes no existía: la fruta pelada, entera, envuelta en
     su albedo. Es el que hace legible la separación que viene después —sin él
     los carpelos aparecen de la nada— y es literalmente lo que se ve cuando
     uno termina de pelar una naranja y todavía no la abrió. */
  /* `turn` es el ángulo del giro, normalizado. Va con `smooth` porque una
     rotación que arranca y frena de golpe se lee mecánica, y con un pelín de
     inercia al final —el último 8% se hace con `smooth` de nuevo— para que la
     fruta llegue de frente y se quede, en vez de clavarse. */
  const turn   = smooth(ramp(pe,IN_TURN));
  const bare   = ramp(pe,IN_BARE);
  const fan    = ramp(pe,IN_FAN);
  const open   = ramp(pe,IN_OPEN);
  const release= ramp(pe,IN_REL);
  /* Cuánto se retiró la lámina. Es el complemento exacto del factor con el que
     `frame` apaga la fase interior, así que lo que se va de acá es lo que entra
     de cielo por detrás, sin que en ningún cuadro la suma dé otra cosa que uno.
     La semilla que viaja NO lleva este factor: es lo único que sobrevive al
     corte, y sobrevivir al corte es su trabajo. */
  const vis=1-clamp((pe-0.930)/0.020);

  const proj=PROJECTS[chosenFruit];
  const src=fruitScreen[chosenFruit]||{x:W/2,y:H*0.4,r:26};
  const R0=Math.min(W,H)*0.30;

  // la fruta viaja del árbol al centro y crece
  /* La fruta llega y FRENA. Con smoothstep se posa como una pluma, sin peso:
     algo que viaja y se detiene se pasa un poco y vuelve, y ese sobrepaso
     mínimo es todo lo que hace falta para que se sienta que pesa.
     Va sólo en posición y tamaño. `growOut` supera el 1 antes de asentar, y en
     un alpha eso es un valor inválido que el canvas descarta callado —el
     viñeteado se quedaría con la opacidad del frame anterior—, así que la
     opacidad sigue con la curva monótona. */
  const e=growOut(enter);
  const eA=smooth(enter);
  const cx=lerp(src.x,W/2,e), cy=lerp(src.y,H*0.47,e);
  const R=lerp(src.r,R0,e);

  ctx.setTransform(DPR,0,0,DPR,0,0);

  /* Fondo de lámina. El relleno plano de `sky.b` no es un fondo: es la ausencia
     de uno, y por eso el corte flota sobre un color en vez de apoyarse en algo.
     El degradado ya estaba, pero con radio `0.72·max(W,H)` la caída oscura
     recién empezaba a 475 px del centro: medido sobre el frame, el fondo daba
     218, 219 y 220 en el cenit, el horizonte y el pie — el mismo valor en todas
     partes. Un fondo que mide lo mismo en todos lados no es un fondo.
     Ciñendo el radio y separando los extremos, el frame recupera las dos puntas
     que le faltaban: una nota clara detrás del sujeto y un apoyo oscuro en los
     bordes, que además es lo que empuja el ojo hacia el centro. */
  if(e>0.01){
    const vg=ctx.createRadialGradient(W/2,H*0.45,0,W/2,H*0.45,Math.max(W,H)*0.58);
    vg.addColorStop(0,'rgba(255,246,226,.17)');
    vg.addColorStop(0.40,'rgba(255,246,226,0)');
    vg.addColorStop(1,'rgba(18,24,32,.44)');
    ctx.globalAlpha=eA*vis;ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
  }

  ctx.save();
  ctx.translate(cx,cy);
  /* El clímax se congelaba. Medido con el scroll quieto: a p=0.55 cambiaba el
     2.8–13.3% de las muestras cada 700 ms, y acá caía a 0.7–2.5% con un delta
     máximo de 15 sobre 255 — imperceptible. Y es justo donde el espectador se
     queda mirando.
     Una sola senoide no alcanza: lee como metrónomo. Dos frecuencias que no son
     múltiplo una de la otra no vuelven nunca a la misma fase, y eso es lo que
     hace que parezca que algo está vivo en vez de que algo oscila. La deriva
     vertical es más lenta todavía, para que el conjunto flote. */
  ctx.rotate((1-e)*0.9 + (Math.sin(t*0.35)*0.026+Math.sin(t*0.83+1.7)*0.011)*e);
  ctx.translate(0, (Math.sin(t*0.23)*3.4+Math.sin(t*0.61+0.9)*1.5)*e);

  /* A partir de acá la fruta ya no está en la escena: viaja hacia el
     espectador y se lee como lámina anatómica. Se conserva la DIRECCIÓN de la
     luz, para que no haya corte con lo que venía, pero no la hora: un corte de
     libro de texto está iluminado parejo, no de noche. La transición va
     montada sobre `e`, que es la misma con la que el árbol se desvanece. */
  const sceneAmb=LIGHT.amb, sceneExp=LIGHT.exp;
  const sceneSun=LIGHT.sunA, sceneSky=LIGHT.skyA;
  LIGHT.amb=lerp(sceneAmb,0.46,e); LIGHT.exp=lerp(sceneExp,1,e);
  // También el COLOR de la luz: de noche el sol es azul, y azul sobre naranja
  // da marrón. Una lámina de anatomía se ilumina con luz neutra.
  const SS=hx('#FFF4E2'), SK=hx('#C9C6BE');
  LIGHT.sunA=[lerp(sceneSun[0],SS[0],e),lerp(sceneSun[1],SS[1],e),lerp(sceneSun[2],SS[2],e)];
  LIGHT.skyA=[lerp(sceneSky[0],SK[0],e),lerp(sceneSky[1],SK[1],e),lerp(sceneSky[2],SK[2],e)];

  const rind=proj.hue;
  // La pulpa se sombrea con la misma luz que todo lo demás de la pieza.
  const cPulpHot =shadeD(mixH(rind,'#FFCE72',0.40),0.94);
  const cPulp    =shadeD(mixH(rind,'#FFAE4E',0.26),0.88);
  const cPulpEdge=shadeD(mixH(rind,'#D8770F',0.26),0.70);
  const cPulpSel =shadeD(mixH(rind,'#FFA53A',0.30),0.84);
  // Las vesículas son jugo, no leche: si se van al blanco lavan toda la pulpa.
  const cVes     =rgba(shadeD(mixH(rind,'#FFD98F',0.42),0.98),0.9);
  const cVesHi   =rgba(shadeD(mixH(rind,'#FFEBB4',0.62),1),0.9);
  const cMembrane=rgba(shadeD(mixH(rind,'#FFF2D6',0.72),0.92),0.85);
  const cMembFill=shadeD(mixH(rind,'#F7EBD2',0.80),0.80);
  const cAlbedo  =shadeD('#F4EDDD',0.84);
  // Sangrado de la luz que atraviesa el gajo y sale fuera de su silueta.
  const cBleed   =rgba(shadeD(mixH(rind,'#FFC978',0.5),1),0.55);
  const cStip    =rgba(shadeD(mixH(rind,'#B4560A',0.35),0.34),0.5);
  const cRindStip=rgba(shadeD(mixH(rind,'#8A3E06',0.42),0.26),0.6);
  const cCore    =shadeD('#EFE6D2',0.90);
  const cCoreLine=rgba(shadeD('#C6B48C',0.6),0.7);
  const cSeed    =shadeD('#F2E8CC',0.94);
  const cSeedLine=rgba(shadeD('#8A7440',0.5),0.6);
  const cSeedPit =rgba(shadeD(mixH(rind,'#8A4A08',0.4),0.30),0.75);
  const cScar    =shadeD('#CDBE9C',0.72);
  const cScarIn  =shadeD('#9C8A62',0.5);

  /* El rosetón tiene que llenar EXACTAMENTE el mismo disco que el albedo que se
     abre para mostrarlo. Con 0.78 contra 0.93 la fruta perdía un 16% de radio
     en el mismo cuadro en que se abría, y ese salto de tamaño es la mitad de lo
     que rompía la ilusión: la otra mitad era el cambio de proyección, que ahora
     lo resuelve el giro. `RA` se define más abajo con el mismo 0.93. */
  const RG=R*0.93*0.99;
  const shown=proj.gajos.length;
  /* La separación de los carpelos iba con `petalOut`, que es `backOut` con
     sobrepaso 1.4: un rebote elástico del 40%. Eso está bien para una corola que
     se abre de golpe, y mal para once piezas pesadas que se separan — el
     sobrepaso las hacía salir disparadas, pasarse y volver, todas juntas.
     Ahora es un `ease` cúbico —arranca rápido y frena— y cada gajo sale con su
     propio retardo, de afuera hacia adentro. */
  const f=ease(fan);
  const tSin=Math.sin(turn*1.5708);
  // Media apertura del sector, menos la membrana. Con esto los carpelos TILEAN
  // el disco: una naranja en corte no tiene huecos de fondo entre gajos.
  const HALF=Math.PI/GAJOS_TOTAL-0.006;

  /* ---------- 0. la cáscara de ATRÁS ----------
     Painter's algorithm. Las tiras cuyo azimut mira al fondo se pintan antes
     que la fruta, y las de adelante después: es lo único que hace falta para
     que una escena 3D salga bien sobre un contexto 2D, y con diez tiras que no
     se cruzan entre sí alcanza con ordenarlas por el coseno del azimut.

     El degradado esférico se construye una sola vez para las diez —era una
     llamada a createRadialGradient POR SECTOR, ocho por frame, con los mismos
     seis argumentos siempre. */
  /* Los MISMOS seis números que usa `sphere()` para el fruto en la rama. No es
     prolijidad: la naranja que viaja es la que estaba en el árbol, y con dos
     degradados distintos el material cambiaba en el cuadro exacto en que
     arranca el viaje. Se veía como un corte aunque la posición fuera continua,
     porque lo que el ojo sigue no es la posición, es la superficie. */
  const gRind=ctx.createRadialGradient(LIGHT.x*R*0.45,LIGHT.y*R*0.45,R*0.05,0,0,R*1.18);
  gRind.addColorStop(0,shadeD(rind,0.99));
  gRind.addColorStop(0.5,shadeD(rind,0.64));
  gRind.addColorStop(1,shadeD(rind,0.06));
  /* La cáscara se va SALIENDO DE CUADRO, no bajando el alpha, y esto no es una
     preferencia: una tira de cáscara se pisa a sí misma —cada fila comparte
     borde con la siguiente y las de adelante tapan a las de atrás— así que en
     cuanto deja de ser opaca, todas esas costuras internas se componen dos
     veces y la cáscara aparece rayada de líneas horizontales, justo en el
     momento en que uno la está mirando. Empujarla hacia afuera la saca del
     encuadre sin volverla nunca translúcida; el alpha sólo entra al final,
     cuando ya está fuera y no queda nada que rayar. */
  const peelEx=smooth(ramp(pe,IN_EXIT));
  const peelFade=1-clamp((peelEx-0.70)/0.30);
  if(peelFade>0.004){
    ctx.globalAlpha=peelFade;
    drawPeelStrips(R,peel,-1,peelEx,gRind,'#F4EDDD',rind);
    ctx.globalAlpha=1;
  }

  /* Disco de membrana por debajo de todo: el hueco entre dos carpelos es
     membrana, no fondo. Sin esto las separaciones se leen como agujeros al
     azul y el corte parece un gráfico de torta. */
  if(peel>0.01&&fan<0.34){
    ctx.globalAlpha=clamp(peel*2.6)*(1-clamp(fan*3));
    ctx.fillStyle=cMembFill;
    ctx.beginPath();ctx.arc(0,0,RG*1.012,0,6.283);ctx.fill();
    ctx.globalAlpha=1;
  }

  /* ---------- 1. la pulpa, siempre opaca ----------
     Antes se revelaba subiendo el alpha, y durante todo el pelado los carpelos
     quedaban al 42% sobre fondo oscuro: por eso se veían marrones y barrosos.
     Ahora se revelan por OCLUSIÓN — la cáscara los tapa hasta que se abre.

     Y el rosetón entero va dentro del giro. Un punto del plano ecuatorial a
     radio r y azimut ψ es (r·sen ψ, 0, r·cos ψ); girado α sobre el eje
     horizontal y proyectado queda (r·sen ψ, −r·cos ψ·sen α). O sea: el disco
     completo, escalado en y por sen α. Con α = 0 colapsa a una línea —la fruta
     está de perfil y la sección no se ve— y con α = π/2 es el rosetón de
     frente. Una sola línea de transformación hace todo el giro, porque la
     geometría ya lo tenía resuelto. */
  if(tSin>=0.004){
  ctx.save();
  ctx.scale(1,tSin);
  for(let i=0;i<GAJOS_TOTAL;i++){
    const named=i<shown;
    const aRose=(i/GAJOS_TOTAL)*6.283-1.5708+0.31;
    let px=0,py=0,ang=aRose,L=RG,det=0,alpha=vis,sc=1;
    if(named&&fan>0){
      /* Del rosetón a una hilera sobre la lámina. Antes el abanico apuntaba
         todo hacia arriba y dejaba media pantalla vacía. */
      const k=(i-(shown-1)/2)/Math.max(1,shown-1);
      /* Los once gajos salían del mismo molde: mismo largo, mismo ancho, misma
         inclinación, repartidos a paso constante. Once copias en fila es lo que
         hacía que la hilera se leyera como una plantilla y no como una fruta —
         en una naranja de verdad no hay dos carpelos iguales, y hay siempre uno
         gordo y uno enano.
         La variación entra CON `f`, nunca antes: empaquetados los gajos tienen
         que tilear el disco exacto, y ahí cualquier diferencia abre huecos. */
      const h=Math.sin((i+1)*78.233)*43758.5453, j=h-Math.floor(h);
      const h2=Math.sin((i+1)*12.9898+4.1)*43758.5453, j2=h2-Math.floor(h2);
      /* Cada gajo con su propio retardo, de afuera hacia adentro. Los once
         salían exactamente en el mismo cuadro y llegaban en el mismo cuadro, y
         eso —más que la curva— es lo que hacía que la separación se leyera
         mecánica: una fruta que se abre no libera todas sus piezas a la vez.
         Los de los extremos arrancan primero porque son los que más lejos
         tienen que ir, así que además llegan todos juntos. */
      const lead=(1-Math.abs(k))*0.20;
      const fi=ease(clamp((fan-lead*0.5)/(1-lead*0.5)));
      const rowX=k*W*0.345+(j-0.5)*W*0.012;
      const rowY=R0*0.26+Math.abs(k)*R0*0.09+(j2-0.5)*R0*0.075;
      px=lerp(0,rowX,fi); py=lerp(0,rowY,fi);
      ang=lerp(aRose,-1.5708+k*0.42+(j2-0.5)*0.22,fi);
      /* El gajo perdía un 30% de largo entre el rosetón y la hilera, y esa
         pérdida de masa en el mismo movimiento en que se separa es la que hacía
         que la hilera se viera chiquita y desangelada después de una fruta que
         llenaba la pantalla. Ahora conserva el 88%: lo justo para que cinco
         entren en el ancho sin pisarse. */
      L=lerp(RG,RG*0.88*(0.90+0.20*j),fi); det=fi;
    } else if(!named){
      // Los que no llevan nombre se van rápido: si tardan, el rosetón queda
      // pisándose con la hilera y todo se lee como un revoltijo.
      alpha=vis*(1-clamp(fan*2.4));
    }
    const sel=named&&i===chosenGajo;
    if(named&&open>0){
      if(sel){
        // El elegido vuelve al centro de la lámina y crece.
        const o=smooth(open);
        px=lerp(px,0,o); py=lerp(py,R0*0.06,o); sc=1+open*0.52;
      } else alpha*=1-open*0.82;
    }
    if(alpha<=0.004) continue;

    ctx.save();
    ctx.translate(px,py);ctx.rotate(ang);ctx.scale(sc,sc);
    ctx.globalAlpha=alpha;
    /* Traslucidez por transmisión: la luz atraviesa el gajo y sale por donde
       es más fino, o sea el borde. Por eso va un halo cálido afuera, un borde
       claro, y el centro más denso — al revés de una superficie opaca. */
    /* Ya separado del resto, el gajo proyecta. Es lo que lo despega de la
       lámina: sin esto son recortes planos sobre un fondo, con esto son piezas
       apoyadas. El desplazamiento de la sombra no lo toca la transformación
       —es espacio de canvas— así que los once caen para el mismo lado. */
    if(det>0.25){
      ctx.save();
      ctx.shadowColor='rgba(26,20,12,.36)';
      ctx.shadowBlur=RG*0.085*det;
      ctx.shadowOffsetX=RG*0.020*det; ctx.shadowOffsetY=RG*0.042*det;
      // Se rellena con el borde de la pulpa, no con negro: lo que asome por el
      // antialias del relleno de arriba es la propia orla del carpelo.
      ctx.fillStyle=cPulpEdge;
      carpelPath(ctx,L,HALF,det);ctx.fill();
      ctx.restore();
    }
    if(det>0.15){ctx.shadowColor=cBleed;ctx.shadowBlur=RG*0.075*det;}
    ctx.fillStyle=sel?cPulpSel:cPulpHot;
    carpelPath(ctx,L,HALF,det);ctx.fill();
    ctx.shadowBlur=0;
    ctx.save();
    ctx.translate(L*0.5,0);ctx.scale(0.87,0.68);ctx.translate(-L*0.5,0);
    ctx.fillStyle=cPulp;carpelPath(ctx,L,HALF,det);ctx.fill();
    ctx.restore();

    // Vesículas: paramétricas sobre el propio carpelo, así nunca se escapan.
    for(let grp=0;grp<3;grp++){
      ctx.globalAlpha=alpha*(0.13+grp*0.11);
      ctx.fillStyle=grp===2?cVesHi:cVes;
      ctx.beginPath();
      for(let k=0;k<VES_N;k++){
        if(((VES[k*4+3]*3)|0)!==grp) continue;
        const u=VES[k*4], rx=L*VES[k*4+2]*0.9, ry=L*0.020;
        const vx=carpelX(u,L,HALF,det);
        const vy=carpelC(u,L,det)+VES[k*4+1]*carpelW(u,L,HALF,det)*0.80;
        ctx.moveTo(vx+rx,vy);
        ctx.ellipse(vx,vy,rx,ry,0,0,6.283);
      }
      ctx.fill();
    }
    // Puntilleo: la densidad hace el volumen, no un gradiente.
    if(L*sc>70){
      ctx.globalAlpha=alpha*0.30;
      const w1=carpelW(1,L,HALF,det);
      stipple(L*0.52,0,L*0.52,cStip,
        (ux,uy)=>clamp(0.34+0.62*Math.abs(uy)+0.30*ux),0.55,Math.max(0.6,L*0.009));
    }
    /* Oscurecimiento de borde en la orla, con el filo REPARTIDO.
       Dos cosas de una. La primera: contra la membrana las vesículas se apilan
       y el borde del gajo queda más denso que el medio — el mismo efecto que en
       una acuarela deja el aro oscuro, y sin él el carpelo es un relleno plano
       con un contorno claro encima.
       La segunda: la carga NO es igual para todos. Un dibujo fuerte no tiene el
       mismo filo en todas partes; el borde duro va en el foco y los demás se
       ablandan. Esta fase es literalmente una elección, así que el gajo elegido
       es el único que lleva el borde a contraste pleno y los otros diez se
       quedan a un tercio. El dibujo dice cuál elegiste. */
    if(det>0.20){
      ctx.globalAlpha=alpha*(sel?0.34:0.12);
      ctx.strokeStyle=cPulpEdge;ctx.lineWidth=Math.max(0.8,L*0.030);
      carpelPath(ctx,L,HALF,det);ctx.stroke();
    }
    // Membrana propia del carpelo, más pálida y más opaca que el interior.
    ctx.globalAlpha=alpha*0.62;
    ctx.strokeStyle=cMembrane;ctx.lineWidth=Math.max(0.9,L*0.014);
    carpelPath(ctx,L,HALF,det);ctx.stroke();
    ctx.globalAlpha=1;

    // --- semillas dentro del gajo elegido
    if(sel&&open>0.15){
      const seeds=proj.gajos[i].seeds;
      for(let k=0;k<seeds.length;k++){
        const so=clamp((open-0.15-k*0.10)/0.4);
        if(so<=0) continue;
        const su=0.42+k*0.24;
        const sx=carpelX(su,L,HALF,det);
        const sy=carpelC(su,L,det)+(k?1:-1)*carpelW(su,L,HALF,det)*0.20;
        const ss=L*0.115;
        ctx.save();
        ctx.translate(sx,sy);
        /* La primera semilla es LA semilla: la que se suelta y abre la vuelta
           siguiente. Su pose se publica acá en coordenadas de pantalla —leída
           de la matriz del canvas, que ya trae encima el giro, la deriva, la
           rotación del carpelo y su escala— porque el viaje que viene después
           tiene que terminar en un punto exacto del ENCUADRE, no del carpelo.
           Componer a mano seis transformaciones para llegar al mismo número
           sería escribir dos veces lo que el contexto ya sabe. */
        if(k===0){
          const M=ctx.getTransform();
          seedOut={x:M.e/DPR, y:M.f/DPR,
                   s:ss*Math.hypot(M.a,M.b)/DPR,
                   rot:Math.atan2(M.b,M.a)+1.0708};
        }
        // Ya soltada, se dibuja afuera de todo esto y no acá.
        if(k===0&&release>0.001){ ctx.restore(); continue; }
        // El eje largo de la semilla acompaña al del carpelo.
        ctx.rotate(1.0708);
        ctx.globalAlpha=vis*so*(k===0?1:1-release);
        // Hueco donde está embebida, antes de la semilla. Se abre con ella.
        const pit=ctx.globalAlpha*0.5*so;
        ctx.globalAlpha=pit;ctx.fillStyle=cSeedPit;
        ctx.beginPath();
        ctx.ellipse(ss*0.12,ss*0.14,ss*0.72*so,ss*1.06*so,0,0,6.283);ctx.fill();
        ctx.globalAlpha=vis*so*(k===0?1:1-release);
        // La misma semilla que cae y que germina, sin excepción — y ahora se
        // TRAZA en vez de encenderse.
        seedDraw(ss,cSeed,cSeedLine,so);
        ctx.restore();
        ctx.globalAlpha=1;
      }
    }
    ctx.restore();
  }

  /* ---------- 2. el eje central ----------
     Los carpelos cuelgan de un eje fibroso. Sin él convergen a un punto y el
     corte se lee como gráfico de torta. Va dentro del mismo giro que ellos. */
  if(fan<0.4){
    ctx.globalAlpha=(1-clamp(fan*2.5));
    if(ctx.globalAlpha>0.004){
      ctx.fillStyle=cCore;
      ctx.beginPath();ctx.arc(0,0,RG*0.10,0,6.283);ctx.fill();
      ctx.strokeStyle=cCoreLine;ctx.lineWidth=Math.max(0.6,RG*0.007);
      ctx.beginPath();
      for(let k=0;k<GAJOS_TOTAL;k++){
        const a=k*0.6283-1.5708+0.31;
        ctx.moveTo(Math.cos(a)*RG*0.035,Math.sin(a)*RG*0.035);
        ctx.lineTo(Math.cos(a)*RG*0.155,Math.sin(a)*RG*0.155);
      }
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  ctx.restore();
  }

  /* ---------- 3. la fruta pelada: el albedo ----------
     La capa blanca esponjosa que queda cuando sale la cáscara. Es la que
     mantiene el principio que rige toda esta fase —la pulpa siempre es opaca y
     se revela por OCLUSIÓN, nunca subiendo el alpha— pero ahora ocluye algo que
     tiene sentido anatómico: debajo de la cáscara no hay pulpa expuesta, hay
     albedo, y los gajos aparecen recién cuando ese albedo se abre.

     Los diez surcos son los tabiques entre carpelos vistos desde afuera: son
     lo que anticipa por dónde se va a separar, y sin ellos la separación
     posterior se lee como un corte arbitrario en vez de como la fruta
     abriéndose por donde ya venía dividida. */
  const albedoA=clamp(peel*3.4);
  /* Un poco más chica que la cáscara: ese 7% ES el espesor de la corteza, y es
     lo que hace que la piel que queda pegada se lea envolviendo algo en vez de
     estar pintada encima. */
  const RA=R*0.93;
  /* El albedo NO se va bajando el alpha. Se abre desde el centro, y el agujero
     es lo que descubre los gajos.
     La diferencia no es de gusto. Media pantalla de blanco al 50% sobre la
     pulpa es un velo: los naranjas se van al gris y la fruta —justo en el frame
     más importante de la pieza— se ve descolorida. Además la fase que entra es
     una sección TRANSVERSAL y la que sale es una esfera vista de costado; dos
     proyecciones distintas fundidas por opacidad se leen como dos dibujos
     superpuestos, no como una cosa que se abre. Con el agujero, en cambio,
     todo lo que se ve está a plena opacidad en todo momento, y el movimiento
     —del centro hacia afuera— es el mismo que ya trae el rosetón. */
  /* ---- por dónde se rasga ----
     Era `rHole = RA · smooth(bare)`, un círculo creciendo desde el centro: el
     albedo se levantaba como un telón y los diez carpelos aparecían enteros y
     al mismo tiempo. Con rampa o sin rampa, eso se lee como un cambio de cuadro,
     porque nada en el dibujo dice POR DÓNDE se está abriendo.
     Una naranja pelada se abre por los tabiques. Así que el borde del agujero
     deja de ser un círculo y pasa a tener diez lóbulos: la rasgadura corre
     primero por cada tabique —que es donde el albedo es más fino— y recién
     después se come el centro de cada sector. Y cada sector arranca en su
     momento, con un retardo sacado de su propio hash: si los diez se rasgan
     juntos, los lóbulos se leen como un engranaje. */
  const HOLE=new Float32Array(GAJOS_TOTAL);
  for(let m=0;m<GAJOS_TOTAL;m++){
    const h=Math.sin((m+1)*45.164)*43758.5453, lag=(h-Math.floor(h))*0.34;
    HOLE[m]=smooth(clamp((bare-lag)/(1-lag)));
  }
  let holeMax=0; for(let m=0;m<GAJOS_TOTAL;m++) if(HOLE[m]>holeMax) holeMax=HOLE[m];
  const rHole=RA*holeMax*1.06;
  /* El contorno del desgarro, muestreado. Se usa dos veces —para restar el
     agujero del anillo de albedo y para trazar su canto— así que se construye
     una vez acá y no dos veces mal. Va en sentido HORARIO porque tiene que
     restar del círculo exterior, que va antihorario. */
  const holePath=(g,scale)=>{
    const NH=GAJOS_TOTAL*7;
    for(let q=NH;q>=0;q--){
      const t=q/NH*GAJOS_TOTAL, m=Math.floor(t)%GAJOS_TOTAL, fr=t-Math.floor(t);
      /* Dentro del sector, la rasgadura va más adelantada sobre los tabiques
         —los bordes— que sobre el medio. Eso es el lóbulo, y es lo que hace
         visible que se abre por donde la fruta ya venía dividida. */
      const lob=0.76+0.24*Math.abs(Math.cos(fr*Math.PI));
      const rr=lerp(HOLE[m],HOLE[(m+1)%GAJOS_TOTAL],fr)*RA*1.06*lob*scale;
      const a=(t/GAJOS_TOTAL)*6.283-1.5708+0.31;
      const x=Math.cos(a)*rr, y=Math.sin(a)*rr;
      if(q===NH) g.moveTo(x,y); else g.lineTo(x,y);
    }
  };
  if(albedoA>0.004&&holeMax<0.999){
    ctx.globalAlpha=albedoA;
    const gAl=ctx.createRadialGradient(LIGHT.x*RA*0.34,LIGHT.y*RA*0.34,RA*0.04,0,0,RA*1.06);
    gAl.addColorStop(0,shadeD(mixH(cAlbedo,'#FFFFFF',0.30),0.98));
    gAl.addColorStop(0.58,shadeD(cAlbedo,0.76));
    gAl.addColorStop(1,shadeD(mixH(cAlbedo,'#C6B79A',0.45),0.50));
    ctx.fillStyle=gAl;
    /* Anillo: el círculo de afuera y el agujero en sentido contrario.
       El `moveTo` no es opcional. `arc` arranca con un `lineTo` implícito desde
       el punto actual, así que sin él los dos círculos quedan cosidos por una
       recta, forman UN solo subtrazo y la regla de relleno no tiene dos
       contornos que restar: el agujero simplemente no aparece y el albedo se
       queda entero tapando la fruta hasta el final. */
    ctx.beginPath();
    ctx.arc(0,0,RA,0,6.283);
    if(rHole>0.4) holePath(ctx,1);
    ctx.fill();
    ctx.save();ctx.clip();
    /* ---- los tabiques, y el giro ----
       Un meridiano de azimut ψ, visto de costado, es una elipse de semieje
       horizontal R·|sen ψ| y vertical R. Eso era lo que se dibujaba, y estaba
       bien mientras la fruta se quedara de perfil.
       Ahora gira, así que el tabique se calcula punto por punto con la rotación
       de arriba: a latitud θ y azimut ψ, girado α sobre el eje horizontal,

           x = R·sen θ·sen ψ
           y = R·(cos θ·cos α − sen θ·cos ψ·sen α)
           z = R·(cos θ·sen α + sen θ·cos ψ·cos α)

       y sólo se traza el trozo con z > 0, que es el que da a la cámara. Ésa es
       la parte que hace el trabajo: al girar, el tabique de atrás se esconde y
       el de adelante barre hacia el frente, y lo que en α = 0 eran tres elipses
       concéntricas termina en α = π/2 siendo los DIEZ RADIOS del rosetón —
       exactamente los mismos que separan los carpelos que hay debajo.
       Cuando el albedo se abre, la fruta ya está girada y las divisiones ya
       coinciden. No queda nada que empalmar. */
    /* Marcados, no insinuados. Con alpha 0.30 los tabiques casi no se veían, y
       como el giro se lee EXCLUSIVAMENTE en ellos —la silueta de una esfera no
       cambia al girar— el resultado era una bola blanca y lisa quieta en la
       pantalla durante todo el movimiento. Un movimiento que no se ve no
       existe. Ahora son surcos, que además es lo que son: los tabiques entre
       carpelos empujan el albedo desde adentro y se marcan en la superficie. */
    ctx.strokeStyle=rgba(shadeD(mixH(cAlbedo,'#A8977A',0.62),0.44),0.52);
    ctx.lineWidth=Math.max(1,R*0.0085);
    {
      const ca=Math.cos(turn*1.5708), sa=tSin, K=26;
      ctx.beginPath();
      for(let m=0;m<GAJOS_TOTAL;m++){
        const psi=m*6.283/GAJOS_TOTAL-1.5708+0.31;
        const cp=Math.cos(psi), sp2=Math.sin(psi);
        let pen=false;
        for(let i=0;i<=K;i++){
          const th=i/K*Math.PI, st=Math.sin(th), ct=Math.cos(th);
          if(ct*sa+st*cp*ca<=0){ pen=false; continue; }   // cara de atrás
          const x=RA*st*sp2, y=RA*(ct*ca-st*cp*sa);
          if(pen) ctx.lineTo(x,y); else { ctx.moveTo(x,y); pen=true; }
        }
      }
      ctx.stroke();
    }
    // Textura esponjosa: el albedo no brilla, se apelmaza.
    if(R>60){
      ctx.globalAlpha=albedoA*0.34;
      stipple(0,0,R*0.91,rgba(shadeD('#B7A88C',0.34),0.55),(ux,uy)=>{
        const z=1-ux*ux-uy*uy;
        return clamp(0.80*(ux*LIGHT.x+uy*LIGHT.y)+0.58*Math.sqrt(z>0?z:0));
      },0.62,Math.max(0.6,R*0.0075));
    }
    ctx.restore();
    // Borde del desgarro: sin él el agujero se lee como un recorte, no como
    // albedo que se abre.
    if(rHole>1){
      ctx.globalAlpha=albedoA*0.7;
      ctx.strokeStyle=shadeD(mixH(cAlbedo,'#FFFFFF',0.45),0.95);
      ctx.lineWidth=Math.max(1,R*0.011);
      ctx.beginPath();holePath(ctx,1);ctx.stroke();
      /* Una segunda línea apenas por dentro, más tenue: el albedo tiene
         espesor, así que su canto roto no es un filo sino una franja. Sin ella
         el borde del desgarro es la única línea perfecta de la fase. */
      ctx.globalAlpha=albedoA*0.28;
      ctx.lineWidth=Math.max(1,R*0.022);
      ctx.beginPath();holePath(ctx,0.955);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  /* ---------- 4. la cáscara de ADELANTE ---------- */
  if(peelFade>0.004){
    ctx.globalAlpha=peelFade;
    drawPeelStrips(R,peel,1,peelEx,gRind,'#F4EDDD',rind);
    ctx.globalAlpha=1;
  }

  /* Puntilleo de la cáscara: la densidad sigue a la normal de la esfera, así
     que el volumen sale del propio granulado en vez de un gradiente. Los
     brillos quedan literalmente sin puntos. */
  // Se apaga apenas empieza el pelado: la cáscara ya se corrió y el puntilleo
  // quedaría pintando sobre el fondo.
  if(peel<0.34&&R>60){
    ctx.globalAlpha=(1-clamp(peel/0.34))*0.5;
    stipple(0,0,R*0.985,cRindStip,(ux,uy)=>{
      const z=1-ux*ux-uy*uy;
      return clamp(0.84*(ux*LIGHT.x+uy*LIGHT.y)+0.54*Math.sqrt(z>0?z:0));
    },0.85,Math.max(0.7,R*0.0065));
    // Cicatriz del cáliz: el cáliz quedó en la rama (zona C), acá queda su marca.
    ctx.globalAlpha=(1-clamp(peel/0.30))*0.85;
    const sx=Math.cos(-1.5708)*R*0.80, sy=Math.sin(-1.5708)*R*0.80;
    ctx.fillStyle=cScar;
    ctx.beginPath();ctx.ellipse(sx,sy,R*0.075,R*0.055,0,0,6.283);ctx.fill();
    ctx.fillStyle=cScarIn;
    ctx.beginPath();ctx.ellipse(sx,sy+R*0.006,R*0.040,R*0.028,0,0,6.283);ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.restore();

  /* ---------- la semilla que se va, y que es la que vuelve ----------
     Acá cierra el bucle, y es el único movimiento de la pieza que tiene que ser
     EXACTO en vez de creíble.
     El final era un destello blanco: la lámina se iba a blanco, el corte pasaba
     tapado y del otro lado empezaba otra semilla cayendo desde el borde de
     arriba. Funcionaba como transición y fallaba como argumento — la pieza dice
     que es la misma semilla la que vuelve, y taparla en el momento exacto en
     que tendría que verse volviendo es decir lo contrario.
     Ahora viaja. Sale del gajo en la pose que tenía dentro del carpelo y
     aterriza en la de `SEED_IN`: centro del encuadre, semilongitud 13 escalada
     por la cámara de apertura, y −0.2 rad. En pe = 0.95 esos tres números son,
     por construcción, los que `drawFallingSeed` usa en su primer cuadro. No hay
     empalme: es el mismo dibujo, calculado por dos caminos que dan lo mismo.
     Va FUERA de la rotación general y en coordenadas de pantalla, porque su
     destino es un punto del cuadro y no un punto de la fruta. Y va sin `vis`:
     todo lo demás se retira, ella no. */
  if(release>0.001&&seedOut){
    const r=smooth(release);
    const camS0=keyC(CAM_S,0);
    // El camino corto entre los dos ángulos. Interpolando el largo, la semilla
    // pega un giro entero de más justo cuando el ojo la está siguiendo.
    let dr=SEED_IN.rot-seedOut.rot;
    while(dr>Math.PI) dr-=6.2832;
    while(dr<-Math.PI) dr+=6.2832;
    ctx.save();
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(lerp(seedOut.x,W/2,r),
      // Un arco corto, no una recta: algo que se suelta describe una parábola.
      lerp(seedOut.y,H*0.52,r)-Math.sin(r*Math.PI)*R*0.22);
    ctx.rotate(seedOut.rot+dr*r);
    seedDraw(lerp(seedOut.s,SEED_IN.s*camS0,r),
      shadeD(SEED_BASE,0.82),'rgba(90,70,40,.45)',1);
    ctx.restore();
  }

  // ---------- etiquetas (fuera de la rotación) ----------
  const ink='#20180E';
  if(fan>0.12){
    for(let i=0;i<shown;i++){
      const sel=i===chosenGajo;
      // Escalonadas: aparecen una detrás de otra, no todas de golpe.
      const a=vis*clamp((fan-0.12-i*0.055)/0.34)*(sel?1:1-open*0.85);
      if(a<=0.004) continue;
      /* La guía nace en la punta del carpelo, así que TIENE que rehacer la
         misma cuenta que hizo el carpelo — el mismo reparto, el mismo retardo
         por gajo y el mismo largo. Cuando los números divergieron, las guías
         quedaron apuntando a donde los gajos ya no estaban: una lámina rotulada
         cuyos rótulos señalan al aire es peor que una sin rótulos. */
      const k=(i-(shown-1)/2)/Math.max(1,shown-1);
      const lead=(1-Math.abs(k))*0.20;
      const f=ease(clamp((fan-lead*0.5)/(1-lead*0.5)));
      const rowX=k*W*0.345, rowY=R0*0.26+Math.abs(k)*R0*0.09;
      const ang=lerp((i/GAJOS_TOTAL)*6.283-1.5708+0.31,-1.5708+k*0.42,f);
      const L=lerp(RG,RG*0.88,f);
      const HA=Math.PI/GAJOS_TOTAL-0.006;
      const tL=carpelX(1,L,HA,f);
      const tipX=cx+rowX*f+Math.cos(ang)*tL, tipY=cy+rowY*f+Math.sin(ang)*tL;
      /* Cinco nombres largos no entran uno al lado del otro arriba. Los de
         los extremos salen al costado, hacia el espacio libre, y sólo el del
         medio va arriba. Es la disposición de una lámina rotulada. */
      const side=Math.abs(k)>0.24?Math.sign(k):0;
      let lx,ly,align,el;
      if(side){
        // Escalonadas también de a pares: los dos de cada lado no pueden
        // quedar a la misma altura o se pisan entre ellos.
        const hw=carpelW(0.72,L,HA,f)*(1+open*0.5);
        const step=0.46+(1-Math.abs(k)*2)*0.34;
        lx=tipX+side*(hw+26); ly=cy+rowY*f-tL*step;
        align=side>0?'left':'right'; el=side*12;
      }else{
        lx=tipX; ly=tipY-26; align='center'; el=0;
      }
      ctx.globalAlpha=a*0.45;
      ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.lineCap='butt';
      ctx.beginPath();
      if(side){
        const ax=tipX+side*carpelW(0.72,L,HA,f)*0.6, ay=cy+rowY*f-tL*0.60;
        ctx.moveTo(ax,ay);ctx.lineTo(lx,ly);ctx.lineTo(lx+el,ly);
        ctx.stroke();ctx.fillStyle=ink;
        ctx.beginPath();ctx.arc(ax,ay,1.6,0,6.283);ctx.fill();
        ctx.globalAlpha=1;
        label(proj.gajos[i].name.toUpperCase(),lx+el+(side>0?6:-6),ly,align,12,ink,a*(sel?1:0.7),600);
        continue;
      }
      ctx.moveTo(tipX,tipY-4);
      ctx.lineTo(lx,ly);
      ctx.stroke();
      // Punto terminal donde nace: una guía que muere en el aire se ve descuidada.
      ctx.fillStyle=ink;
      ctx.beginPath();ctx.arc(tipX,tipY-4,1.6,0,6.283);ctx.fill();
      ctx.globalAlpha=1;
      const ox=el?el+(align==='left'?6:-6):0;
      label(proj.gajos[i].name.toUpperCase(),lx+ox,ly,align,12,ink,a*(sel?1:0.7),600);
    }
  }
  // nombre del proyecto
  if(enter>0.25){
    const a=vis*clamp((enter-0.25)/0.4)*(1-open*0.6);
    label(proj.name.toUpperCase(),cx,cy-R*1.30,'center',14,ink,a,600);
    label(proj.meta,cx,cy-R*1.30+21,'center',12,ink,a*0.68,500);
  }
  // ideas
  if(open>0.2){
    const seeds=PROJECTS[chosenFruit].gajos[chosenGajo].seeds;
    for(let k=0;k<seeds.length;k++){
      const a=vis*clamp((open-0.2-k*0.12)/0.35)*(k===0?1:1-release);
      label(IDEAS[seeds[k]],cx,cy+R*(1.16+k*0.17),'center',14,ink,a,600);
    }
    label('IDEAS THIS IS MADE OF',cx,cy+R*1.02,'center',11,ink,
      vis*clamp((open-0.2)/0.3)*0.62,500);
  }
  // devolver la luz de la escena
  LIGHT.amb=sceneAmb; LIGHT.exp=sceneExp; LIGHT.sunA=sceneSun; LIGHT.skyA=sceneSky;
  return enter;
}

/* ============ HUD ============
   Antes esta funcion buscaba once nodos por id y les escribia encima. Ahora la
   estructura es de React y el motor solo REPORTA — pero el reparto no es
   uniforme, y esa es la decision de diseno de toda la migracion:

     - lo que cambia unas pocas veces por scroll (etapa, edad, nota, esquema
       claro/oscuro, pista, acento) sale por `onHud`, ya con el mismo guardado
       por diferencia que tenia antes. React re-renderiza esas veces y nada mas.
     - lo que cambia TODOS los frames (opacidad y desplazamiento de las bandas,
       el punto del riel) se escribe por referencia, sin pasar por React. Son
       seis divs moviendose a 60 fps: reconciliar un arbol por frame para eso es
       pagar el precio de React sin comprar nada de React.

   Las bandas llegan con su `el` desde el componente; el motor no las busca. */
const bands=(host.bands||[]).map(b=>({el:b.el,from:b.from,to:b.to,vis:-1}));
let lastStage='',lastNote='',lastAge='',lastDark=null,lastAcc='',lastFrom='';
/* Lo escribe `frame()` mirando el fondo, y lo leen tanto el chrome como las
   bandas. Arranca en falso porque el primer cuadro del ciclo es de día. */
let bgDark=false;
function updateDOM(pe,u,orange){
  /* Acá se le escribía a cada banda un `data-scheme` sacado de qué tan oscuro
     estaba REALMENTE el fondo detrás del texto, y con eso la banda viraba entre
     tinta y hueso a lo largo del ciclo día/noche.
     Era la respuesta correcta a la pregunta vieja: mientras el texto caía
     directo sobre el dibujo, la legibilidad no era una propiedad del texto sino
     de su relación con el fondo, así que la tenía que mandar el fondo. Desde
     que cada banda vive en una cartela de papel, esa relación ya no existe —
     entre el texto y el dibujo hay una hoja— y lo único que quedaba del viraje
     era ver las cartelas cambiar de blanco a negro cada vez que pasa una noche.
     `bgDark` se sigue calculando: lo necesitan la marca, la navegación y el
     riel, que no tienen papel debajo y sin virar desaparecerían. */
  for(const b of bands){
    const sp=b.to-b.from,fd=Math.min(0.026,sp*0.32);
    const a=Math.min(smooth(clamp((pe-b.from)/fd)),1-smooth(clamp((pe-(b.to-fd))/fd)));
    if(Math.abs(a-b.vis)<0.004) continue;
    b.vis=a;
    if(!b.el) continue;
    b.el.style.opacity=a.toFixed(3);
    b.el.style.transform=`translateY(${((1-a)*26).toFixed(1)}px)`;
    b.el.style.visibility=a<0.01?'hidden':'visible';
  }
  const st=stageAt(pe);
  const al=ageLabel(key(AGE,pe));
  const fromTxt = carried && pe<0.45 ? 'grown from — '+carried : '';   // de que idea nacio este ciclo
  /* Las dos pistas —"Move to choose a fruit", "Move to open a segment"— se
     fueron con el puntero. No hay nada que pedirle al lector: la pieza corre
     sola. Un cartel que invita a hacer algo que no hace nada es peor que no
     tener cartel. */

  /* Un solo aviso por frame con los campos que cambiaron. Emitir el snapshot
     entero siempre obligaria a React a comparar seis strings en cada frame; el
     motor ya sabe cual cambio, asi que lo dice. */
  let d=null;
  if(st.name!==lastStage){lastStage=st.name;(d||(d={})).stage=st.name;}
  if(st.note!==lastNote){lastNote=st.note;(d||(d={})).note=st.note;}
  if(al!==lastAge){lastAge=al;(d||(d={})).age=al;}
  if(bgDark!==lastDark){lastDark=bgDark;(d||(d={})).dark=bgDark;}
  if(fromTxt!==lastFrom){lastFrom=fromTxt;(d||(d={})).from=fromTxt;}
  if(d) onHud(d);

  const acc=mixH('#6E9247',PROJECTS[chosenFruit].hue,orange);
  if(acc!==lastAcc){lastAcc=acc;onAccent(acc);}

  /* El riel marca el avance del SCROLL, no el de p: p es no lineal por
     construcción —esa es toda la gracia del reparto— así que un punto que
     siguiera a p se movería a saltos mientras la mano va pareja. */
  if(refs.cycleDot&&refs.cycleDot.current)
    refs.cycleDot.current.style.top=(u*100).toFixed(1)+'%';

  /* La etiqueta se apaga en el corte y vuelve del otro lado.
     El dibujo cruza el bucle sin costura —misma semilla, mismo tamaño, mismo
     cielo— pero el TEXTO no puede: "year 7.8 / ENDOSPERM" y "day 0 / DISPERSAL"
     son dos cosas distintas y no hay interpolación posible entre ellas. Antes lo
     tapaba el destello blanco junto con todo lo demás. Ahora que no hay
     destello, es lo único que sigue necesitando taparse, así que se tapa solo:
     se desvanece sobre el final de la vuelta y entra sobre el principio de la
     siguiente. Va por referencia y no por estado de React porque cambia todos
     los frames de esas dos ventanas. */
  if(refs.label&&refs.label.current){
    const lo=Math.min(clamp(pe/0.022),1-clamp((pe-0.928)/0.020));
    refs.label.current.style.opacity=lo.toFixed(3);
  }
}

/* ============ overlay de dev (?debug) ============
   Sin medición no hay optimización. El contexto sólo se instrumenta si el flag
   está puesto: envolver cada método cuesta, y la pieza normal no lo paga. */
const DEBUG=typeof location!=='undefined'&&/[?&]debug\b/.test(location.search||'');
/* `?at=0.84` arranca la reproducción en ese p exacto y `?hold` la congela ahí,
   sin tener que buscar el píxel de scroll a mano. Herramienta de taller: revisar
   el clímax cuadro por cuadro es lo que más se hace y lo más incómodo de hacer
   apuntando con la rueda. */
const AT=typeof location!=='undefined'&&/[?&]at=([\d.]+)/.exec(location.search||'');
const HOLD=typeof location!=='undefined'&&/[?&]hold\b/.test(location.search||'');
let dbgCalls=0,dbgShown=0,dbgJs=0,dbgFrame=0,dbgLast=0,dbgN=0;
const DBG_W={};
if(DEBUG){
  const proto=Object.getPrototypeOf(ctx);
  for(const k of Object.getOwnPropertyNames(proto)){
    let d;
    try{ d=Object.getOwnPropertyDescriptor(proto,k); }catch(e){ continue; }
    if(!d||typeof d.value!=='function'||k==='constructor') continue;
    const f=d.value;
    DBG_W[k]=function(){dbgCalls++;return f.apply(ctx,arguments);};
  }
}
/* Contar llamadas exige envolver cada método, y envolver 27 000 llamadas
   cuesta más que todo el frame junto: el propio contador mentiría sobre el
   costo. Así que se instrumenta uno de cada treinta frames, y el tiempo de JS
   se reporta sólo desde los frames limpios. */
function dbgInstrument(on){
  if(on){ for(const k in DBG_W) ctx[k]=DBG_W[k]; }
  else  { for(const k in DBG_W) delete ctx[k]; }
}
function drawDebug(pe){
  const L=['js '+dbgJs.toFixed(2)+' ms','frame '+dbgFrame.toFixed(1)+' ms',
           'ctx '+dbgShown,'p '+p.toFixed(4)+'  pe '+pe.toFixed(4),
           'fps '+(dbgFrame>0?(1000/dbgFrame).toFixed(0):'—')];
  ctx.save();ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.globalAlpha=0.82;ctx.fillStyle='#0B0F0C';
  ctx.fillRect(12,12,168,L.length*16+12);
  ctx.globalAlpha=1;
  ctx.fillStyle=dbgJs>6?'#F08C1C':'#8FCF6A';
  ctx.font='500 11px "IBM Plex Mono",ui-monospace,monospace';
  ctx.textAlign='left';ctx.textBaseline='middle';
  for(let i=0;i<L.length;i++) ctx.fillText(L[i],22,30+i*16);
  ctx.restore();
}

/* ============ loop ============ */
let last=performance.now();
function frame(now){
  let dbgT=0;
  if(DEBUG){
    dbgFrame=now-dbgLast;dbgLast=now;
    dbgInstrument((++dbgN%30)===0);
    dbgCalls=0;dbgT=performance.now();
  }
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  const t=now/1000;
  // Constante de tiempo ~0.26 s en vez de ~0.16 s: el seguimiento planea un
  // poco más y absorbe los tirones del scroll en vez de copiarlos.
  const k=REDUCED?1:1-Math.pow(0.02,dt);
  let dp=(target-p)*k;
  /* Tope de velocidad de reproducción. Por rápido que se scrollee, la pieza no
     avanza más de PMAX por segundo: el scroll deja de ser un cursor que salta
     y pasa a ser un acelerador. Si te pasás de largo, la animación sigue
     reproduciéndose hasta alcanzarte en vez de comerse las fases.
     No se aplica con prefers-reduced-motion: ahí seguir moviéndose después de
     soltar el scroll es exactamente lo que no se quiere. */
  if(!REDUCED&&!HOLD){
    const cap=PMAX*dt;
    if(dp>cap) dp=cap; else if(dp<-cap) dp=-cap;
  }
  if(!HOLD){ p+=dp; wrap(); }
  const pe=fold(p);

  const cyc=key([[0.25,0],[0.52,4],[0.70,7],[0.79,10],[0.95,11]],pe,t=>t);
  /* Once noches en el recorrido: pasando rápido se ven todas de golpe y
     estrobea. La amplitud se comprime con la velocidad de scroll y vuelve
     cuando se asienta. Se multiplica —no se desplaza— así que en pe < 0.25
     sigue dando 0 exacto y el bucle no se entera. */
  const inst=skipV?0:Math.abs(p-pPrev)/Math.max(1e-4,dt);
  skipV=false; pPrev=p;
  scrollV=REDUCED?0:lerp(scrollV,inst,1-Math.pow(0.05,dt));
  const calm=1-0.86*clamp((scrollV-0.030)/0.130);
  const night=pe<0.25?0:clamp(Math.sin(cyc*6.283-1.4)*1.5+0.25)*calm;
  const orange = pe<0.685 ? 0.03 : clamp(0.06+(Math.floor(cyc)-6)/3);

  const camY=keyC(CAM_Y,pe),camS=keyC(CAM_S,pe);
  const sky=skyColors(pe,night);
  /* Qué tan oscuro está REALMENTE el fondo detrás del texto.
     Esto lo decidía `STAGES[].dark`, un booleano escrito a mano por fase. El
     ciclo día/noche es continuo y se calcula aparte, así que ese booleano no
     sabe de qué color terminó el cielo: con la noche encima, a `Flush cycles`
     —marcada `dark:false`— le tocaba tinta oscura sobre un cielo oscuro, y el
     texto desaparecía. Ninguna constante puede saber eso; hay que mirarlo.
     Las bandas están centradas en vertical, así que lo que tienen detrás es el
     medio del cielo cuando la cámara está sobre la tierra y el estrato de
     arriba cuando está por debajo. */
  {
    const hhNow=H/2/camS;
    const skyFrac=clamp((0-(camY-hhNow))/Math.max(1,2*hhNow));
    const c=hx(mixL(SOIL[0].c,mixL(sky.a,sky.b,0.5),skyFrac));
    bgDark=(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255 < 0.42;
  }
  const mat=clamp((pe-0.465)/0.12);
  updateLight(pe,sky,night);   // una sola vez por frame; todo lo demás la consulta
  LABEL_HALO=rgba(sky.b,0.82);
  palettes(mat,clamp((pe-0.255)/0.185));

  /* La ventana en la que el fruto elegido se distingue del resto. Antes era la
     ventana de ELECCIÓN y la abría el puntero; ahora sólo señala, que es lo que
     tiene que pasar igual: el ojo necesita saber cuál de las naranjas es la que
     va a viajar antes de que empiece a viajar. */
  const picking = pe>0.745 && pe<0.818;

  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=sky.b;ctx.fillRect(0,0,W,H);

  /* La fase interior no termina: se retira. El segundo factor la lleva a CERO
     EXACTO en pe = 0.95, que es donde el bucle corta — y como la cámara de 0.95
     y la de 0 son el mismo par de números por construcción, lo que queda detrás
     cuando la lámina se va ya es, literalmente, el encuadre con el que abre la
     vuelta siguiente: cielo, y nada más, porque con esa cámara el suelo y el
     árbol quedan fuera de cuadro.
     Antes acá había un destello blanco que tapaba el corte. Tapar el corte era
     perder lo único que la pieza quiere decir. */
  const interior = pe>IN_ENTER[0]
    ? ramp(pe,IN_ENTER)*(1-clamp((pe-0.930)/0.020)) : 0;
  interiorNow=interior;

  if(interior<0.985){
    ctx.save();
    ctx.translate(W/2,H*0.52);ctx.scale(camS,camS);ctx.translate(0,-camY);
    const hw=W/2/camS,hh=H/2/camS;
    const view={x0:-hw,x1:hw,y0:camY-hh,y1:camY+hh,w:hw*2};
    ctx.globalAlpha=1-interior*0.96;
    drawSky(view,sky,night);
    drawSoil(view,camS);
    if(pe<LOOP_LEN){
      drawFallingSeed(pe/LOOP_LEN,camY,hh,carried?'#EFDFB4':null);
    } else {
      drawRoots(roots,pe,t,camS);
      if(pe<0.29) drawSeed(pe);
      /* El LOD usa una escala rebajada por el desvanecido: cuando la fruta
         viaja hacia el espectador la cámara se acerca y las hojas subirían a
         detalle completo justo mientras se van a 4% de opacidad debajo del
         interior. Dibujar nervaduras que nadie va a ver es lo que hacía perder
         el frame en el momento más dramático de la pieza. */
      drawTree(tree,t,pe,mat,camS*(1-interior*0.92),dt);
      if(pe>0.545) drawFlowers(tree,pe,orange,camS,camY,picking||interior>0?chosenFruit:-1);
    }
    drawAir(view,pe,t,night);   // el aire va delante de todo lo que atraviesa
    ctx.globalAlpha=1;
    ctx.restore();
  }

  if(interior>0) drawInterior(pe,t);

  drawBloom();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(dither){
    // Sólo sobre el cielo: es el único gradiente grande que bandea, y cubrir
    // la pantalla entera a DPR 2 son cinco millones de píxeles por frame.
    ctx.globalAlpha=0.010;ctx.fillStyle=dither;
    if(interior>0.5){
      // En la fase interior no hay cielo: el único gradiente grande es la
      // propia fruta, así que alcanza con su caja.
      const s=Math.min(W,H)*0.98;
      ctx.fillRect((W-s)/2,Math.max(0,H*0.47-s/2),s,s);
    }else{
      const hz=Math.min(H,Math.max(0,H*0.52-camY*camS)+24);
      if(hz>0) ctx.fillRect(0,0,W,hz);
    }
    ctx.globalAlpha=1;
  }
  /* Nubes de valor sobre el cielo. El dither de arriba resuelve el BANDEO —un
     problema de 8 bits— pero no agrega nada: deja el mismo degradado liso de dos
     paradas, que es la superficie más grande de la pieza y la única sin materia.
     Va en espacio de PANTALLA, junto al dither y por la misma razón: el cielo
     está lejos, no es un objeto del mundo, y si escalara con la cámara su
     tamaño de nube cambiaría al acercarse a mirar una raíz.
     Sólo por encima del horizonte, y no en la fase interior, donde no hay cielo. */
  if(haze&&interior<0.5){
    const hz=Math.min(H,Math.max(0,H*0.52-camY*camS)+24);
    if(hz>0){
      ctx.globalAlpha=0.055;ctx.fillStyle=haze;
      ctx.fillRect(0,0,W,hz);
      ctx.globalAlpha=1;
    }
  }
  /* El destello ya no existe. Tapaba el corte del bucle porque el corte se
     notaba; ahora la semilla que se suelta del gajo ES la que empieza la vuelta
     siguiente, en la misma posición y al mismo tamaño, así que no hay nada que
     tapar — y taparlo era justamente perder la única cosa que la pieza quiere
     decir. Se deja el nodo apagado en vez de sacarlo del árbol: es una línea
     menos de acoplamiento con React y cero costo. */
  if(refs.flash&&refs.flash.current) refs.flash.current.style.opacity='0';

  updateDOM(pe,pToS(p),orange);
  if(DEBUG){
    if(dbgN%30===0) dbgShown=dbgCalls;      // frame instrumentado: sólo la cuenta
    else dbgJs=performance.now()-dbgT;      // frame limpio: sólo el tiempo
    drawDebug(pe);
  }
  requestAnimationFrame(frame);
}

let rt;
addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(resize,180);});
resize();buildWorld();dither=buildDither();grit=buildGrit(0);haze=buildGrit(1);
buildBloom();readScroll();p=target;
if(AT){ p=target=clamp(parseFloat(AT[1])); pPrev=p; }
requestAnimationFrame(frame);

return {
  /* Diagnóstico. La pieza dejó de ser función de `pe` y sólo de `pe`: cuál
     proyecto se muestra depende de CUÁNTAS VUELTAS lleva, y eso es deliberado
     —es lo que reemplazó a elegir la fruta con el mouse—. Un invariante que se
     rompe a propósito hay que poder verificarlo, no sólo afirmarlo, así que el
     estado de la elección se puede leer desde afuera. No lo usa la página. */
  state(){ return {fruit:chosenFruit, gajo:chosenGajo, carried}; },
  destroy(){
    alive=false;
    clearTimeout(rt);
    if(rafId) globalThis.cancelAnimationFrame?.(rafId);
    for(const [type,fn,opts] of listeners) globalThis.removeEventListener(type,fn,opts);
    listeners.length=0;
  },
};
}
