/* ============================================================
   EL SONIDO. Sintetizado entero.

   No hay un solo archivo de audio en el proyecto, igual que no hay una sola
   imagen: la pieza dibuja su mundo con math y ahora también lo suena con math.
   Un banco de samples sería el único insumo externo de la obra.

   La decisión de fondo es la misma que la del motor de dibujo, y conviene
   dejarla escrita porque acá el costo de equivocarse es peor:

     la pieza NO CORRE EN TIEMPO, CORRE EN SCROLL.

   `p` sale de la posición de scroll. El lector es el cabezal de reproducción:
   va, vuelve, para en seco, o pega un tirón y se come tres etapas. Eso hace
   imposible un track lineal, y obliga a las dos reglas que rigen este archivo:

     1. `p` MUEVE UN ESTADO, NUNCA UN CABEZAL. Las camas son bucles de ruido que
        nunca paran y lo único que `p` toca es su ganancia y su filtro.
        Scrolleás para atrás y el sonido vuelve para atrás, porque no hay una
        línea de tiempo que rebobinar.

        La música —el piano, abajo— cumple la misma regla por otro camino, y
        vale entender por qué, porque una música con motivo y acordes parece
        romperla: el motivo y la armonía corren en TIEMPO real y `p` no elige
        cuándo suena cada nota, elige QUÉ PROGRESIÓN está dando vueltas debajo.
        Volver para atrás no rebobina nada; cambia la progresión. No hay ninguna
        secuencia guardada.
     2. NADA SE GENERA POR SAMPLE EN VIVO. El camino intuitivo para hacer ruido
        es `ScriptProcessorNode`, que está deprecado y corre EN EL MAIN THREAD:
        pelearía contra el rAF del motor y tiraría abajo el trabajo de
        performance que la pieza ya tiene hecho. Acá el ruido se hornea una vez
        en un `AudioBuffer` y lo loopea `AudioBufferSourceNode`. El costo por
        frame es CERO: lo reproduce el audio thread y el main ni se entera.

   Lo que sí pasa por frame son cinco llamadas a `setTargetAtTime`, que es
   exactamente el método que existe para un parámetro movido por un control de
   usuario. Escribir `param.value` sesenta veces por segundo daría escalones
   audibles (zipper noise) y con un scrub errático sería peor.
   ============================================================ */
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/* Interpolación por tramos, con la misma forma que `key()` del motor: una
   lista [p, valor] ordenada y búsqueda lineal. Son listas de seis entradas —
   un binario acá sería más código que trabajo ahorrado. */
function env(pts, p) {
  if (p <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (p <= b[0]) return a[1] + (b[1] - a[1]) * ((p - a[0]) / (b[0] - a[0] || 1));
  }
  return pts[pts.length - 1][1];
}

/* ============ el material: ruido horneado ============
   Un buffer de ruido loopeado tiene una costura: el último sample no continúa
   al primero y eso se oye como un clic, una vez por vuelta. Se arregla
   generando de más y cruzando la cola sobre la cabeza con ganancia de potencia
   constante (sin/cos, no lineal: con lineal el cruce pierde energía en el medio
   y el ruido "respira" en cada vuelta).

   Después del cruce, `out[0]` ES la continuación de `out[n-1]`, así que la
   costura desaparece de verdad en vez de disimularse. */
function bakeNoise(ctx, seconds, kind) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const xf = Math.floor(sr * 0.5);
  const raw = new Float32Array(n + xf);

  if (kind === 'brown') {
    /* Marrón: -6 dB por octava. Es el integrador con fuga; el divisor evita
       que la caminata se vaya de rango y quede DC apoyado en el buffer. */
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      raw[i] = last * 3.5;
    }
  } else {
    /* Rosa: -3 dB por octava, método refinado de Paul Kellet. Son seis polos
       en paralelo aproximando la pendiente; la alternativa honesta es un banco
       de filtros de verdad, que cuesta mucho más para una diferencia que acá,
       debajo de un bandpass, no se escucha. */
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  const buf = ctx.createBuffer(1, n, sr);
  const out = buf.getChannelData(0);
  out.set(raw.subarray(0, n));
  for (let i = 0; i < xf; i++) {
    const t = (i / xf) * Math.PI * 0.5;
    out[i] = raw[i] * Math.sin(t) + raw[n + i] * Math.cos(t);
  }
  return buf;
}

/* ============ el espacio: impulse response sintetizada ============
   `ConvolverNode` normalmente come un .wav grabado en una iglesia. No hace
   falta: ruido con decaimiento exponencial da un reverb sorprendentemente
   bueno, y así la promesa de cero archivos queda intacta.

   El polo de un solo coeficiente antes del decaimiento es lo que evita que la
   cola suene metálica. Esto es un campo abierto, no una placa. */
function bakeIR(ctx, seconds, decay) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.28;
      d[i] = lp * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}

/* ============ las camas ============
   Las cuatro capas continuas, con su envolvente sobre `pe`.

   Todas cierran el bucle: `fold()` manda `pe` de 0.95 a 0 de un frame al otro,
   así que el valor en 0.95 TIENE que ser el mismo que en 0 o se oye el corte,
   igual que se vería en el dibujo. Por eso la tierra vuelve al final — que
   narrativamente es lo que pasa: la pieza termina en Endosperm, semillas otra
   vez, que es exactamente de donde salió. */
const EARTH = [[0, 1], [0.20, 0.92], [0.30, 0.16], [0.80, 0.06], [0.90, 0.52], [0.95, 1]];
const AIR   = [[0, 0.04], [0.25, 0.26], [0.45, 0.70], [0.70, 1], [0.84, 0.55], [0.95, 0.04]];
/* Los insectos existen sólo en una ventana. La pieza ya lo dice en Anthesis:
   "the scent is the tree paying insects in advance". Antes de que haya flor no
   hay nada que pagar, y después de Colour break la transacción terminó. */
const BUGS  = [[0.48, 0], [0.545, 1], [0.66, 0.85], [0.72, 0], [0.95, 0]];

/* Y el ancho de banda del viento sale del tamaño de la copa. No es una
   metáfora suelta: cuanto más grande el árbol, más superficie tiene para
   romper el aire, y más ancho es el espectro que devuelve. La misma curva que
   engorda la copa abre el filtro. */
const AIR_HZ = [[0, 240], [0.25, 320], [0.45, 700], [0.70, 1400], [0.84, 900], [0.95, 240]];

/* El fondo entero, en un solo lugar. Las camas son la cama —tienen que estar
   abajo, no al lado— y los cuatro hechos físicos quedan afuera de este factor a
   propósito: bajar todo por igual no cambiaría nada, sólo alejaría la pieza.
   Lo que se busca es que la emergencia y el desgarro tengan aire por delante.

   Va acá y no en el grafo porque los envíos —el del aire al reverb, el trémolo
   de los insectos— cuelgan de la salida de cada cama: bajar la ganancia de la
   cama baja el seco y el mojado en la misma proporción, y la mezcla interna
   queda intacta. Un nodo bus después de los envíos secaría el aire.

   BAJÓ DE 0.22 A 0.11, Y NO ES UN AJUSTE DE GUSTO. El ruido no tiene silencio
   adentro: corre siempre, sin ataque y sin final, y esa continuidad es
   exactamente lo que el oído lee como PRESIÓN. Un ruido de fondo al borde de lo
   audible se percibe como aire; el mismo ruido cuatro decibeles más arriba se
   percibe como algo que no para. Y ahora, además, hay mucho más arriba: quince
   sonidos del mundo y un piano. La cama tiene que hacerle lugar a todo eso. */
const BEDS = 0.11;

/* ============================================================
   LA MÚSICA. Un motivo que vuelve, y la armonía moviéndose abajo.

   Reemplaza al jardín de gotas. Un suikinkutsu era un OBJETO que sonaba; esto
   es alguien tocando. Y la diferencia que más importa no es el timbre: el
   jardín estaba construido alrededor del SILENCIO —huecos de diez segundos
   entre gota y gota— y esto es CONTINUO. Nunca para.

   ---- de dónde sale: kankyō ongaku ----

   `Music for Nine Post Cards` (Hiroshi Yoshimura, 1982) es el disco que esto
   quiere ser: grabado en casa con un Fender Rhodes, hecho para el Hara Museum
   de Tokio, inspirado —dice él— en "el movimiento de las nubes, la sombra de un
   árbol en verano, el sonido de la lluvia, la nieve en un pueblo". `Kankyō
   ongaku` (環境音楽), música ambiental: no una obra que uno mira de frente,
   sino algo que se traba con un espacio y corre el lugar donde uno está parado.
   Ashikawa, que le puso el nombre al género, lo definió mejor que nadie: debe
   "flotar como humo y volverse parte del entorno".

   Y el disco está construido con UNA regla, que es la que manda en este archivo:

     el Rhodes repite UN SOLO MOTIVO, con su propia firma rítmica, mientras la
     ARMONÍA DEBAJO cambia de una iteración a otra.

   Eso es lo contrario de una melodía generativa que vaga. Un motivo. Vuelve. El
   acorde de abajo se movió. Esa vuelta es lo que le da al que escucha un lugar
   donde pararse, y es lo que un generador de notas al azar no puede producir
   jamás: sin repetición no hay forma, y sin forma la música no descansa, sólo
   sigue.

   Detrás están Satie —la `musique d'ameublement`, música de mobiliario— y
   Harold Budd, que es Satie con dos toneladas de eco encima.

   POR QUÉ UN RHODES Y NO UN PIANO DE COLA. No es gusto, es honestidad técnica.
   Un piano acústico creíble necesita doce o dieciséis parciales INARMÓNICOS por
   nota —la cuerda es rígida y sus modos no caen en múltiplos enteros— más la
   resonancia por simpatía de todas las cuerdas sin apagador. Sin eso suena a
   juguete, y con eso son doscientos osciladores. Un Rhodes es una púa de metal
   golpeando una barra: casi una sinusoide, con una campanita inarmónica arriba
   que se apaga enseguida. Tres osciladores por nota y ES el instrumento. Y es
   el instrumento del disco.

   ---- picos y valles, que es lo que casi me como ----

   Acá hubo un tono Shepard —esa ilusión de altura que sube para siempre— y se
   fue, con razón. Un Shepard funciona BORRANDO toda referencia de llegada: no
   hay nota más aguda, no hay dónde apoyarse, nada llega nunca. Por eso Zimmer
   puso tres a la vez en `Dunkirk`. Es una máquina de tensión sin resolver, y
   acá lo que hace falta es exactamente lo contrario.

   Una música que relaja necesita RESPIRAR: llegar y soltar. Lo que la hace
   respirar acá son dos arcos de largos distintos, y ninguno de los dos corre en
   el scroll:

     EL ARCO CORTO es la vuelta de la progresión. Sube hacia el medio y RESUELVE
     al volver a la tónica. El pico dinámico y el pico armónico caen juntos a
     propósito: si el momento más lleno no coincide con el acorde que llega, no
     se siente una llegada, se siente un ruido más fuerte.

     EL ARCO LARGO son casi tres minutos, y modula cuánto pesa el corto. Es lo
     que hace que dos vueltas de la misma progresión no se sientan iguales.

   Los dos períodos son INCONMENSURABLES —no son múltiplos entre sí— que es el
   motor de `Music for Airports`: Eno le dio a cada bucle un largo distinto y la
   pieza se compone sola sin volver nunca a coincidir.

   ---- y cómo hace un videojuego para que esto no corte ----

   Es el mismo problema: el estado cambia cuando el jugador quiere y la música
   no puede pegar un salto. La industria tiene dos respuestas y sólo una sirve.

     `horizontal re-sequencing` — saltar de un segmento a otro. Necesita un
     CABEZAL. Prohibido acá: el lector va y vuelve, y rebobinaría la música.

     `vertical layering` — todas las capas suenan siempre y lo único que se mueve
     son las GANANCIAS. El estado no elige qué suena: elige cuánto suena cada
     cosa. Que es la regla 1 de este archivo, descubierta por otra gente para
     otro problema.

   Y trae una lección que no teníamos: los cambios se CUANTIZAN. Nada entra ni
   sale donde caiga; todo espera al próximo pulso. Es lo que separa una música
   que responde de una música que se sacude.
   ============================================================ */

/* ---- el motivo ----
   La firma de la pieza, y lo único que se repite igual a sí mismo.

   Los grados NO son notas: son índices dentro del acorde que esté sonando. El
   mismo contorno cae sobre `am9` y sobre `fmaj7` y suena a lo mismo dicho de
   otra manera, que es exactamente lo que hace Yoshimura — la figura se repite y
   lo que se movió es el suelo. Guardarlo en alturas absolutas lo ataría a un
   acorde y habría que escribir un motivo por acorde.

   `t` está en pulsos desde el arranque de la figura, `v` es el peso relativo.
   El ritmo es irregular a propósito —1½, 1, 1½, 1, 2½— porque una figura
   pareja se vuelve un reloj, y un reloj no descansa. */
const MOTIF = [
  { d: 0, t: 0.0, v: 1.00 },
  { d: 2, t: 1.5, v: 0.68 },
  { d: 1, t: 2.5, v: 0.60 },
  { d: 3, t: 4.0, v: 0.86 },
  { d: 2, t: 5.0, v: 0.52 },
];
/* Cada cuántos pulsos vuelve a empezar. Más largo que la figura: el hueco al
   final es parte del motivo, y es lo que deja oír el acorde solo antes de que
   la figura vuelva a caer encima. */
const MOTIF_SPAN = 8;

/* ---- la armonía ----
   Todo en La eólico y sin un solo tritono: ninguna combinación choca, no hay
   sensible, y por lo tanto no hay obligación de resolver a ningún lado. Ésa es
   la mitad de por qué esto descansa. La otra mitad son los voicings: séptimas y
   novenas, sin terceras apiladas — el vocabulario de Satie y de Budd, que suena
   a quieto y no a canción.

   Semitonos desde la tónica: 0=A 2=B 3=C 5=D 7=E 8=F 10=G.

   EL ORDEN DE CADA ACORDE IMPORTA y no es decorativo: el motivo pide grados por
   índice, así que el primer elemento es la nota sobre la que cae el golpe
   fuerte de la figura. Están escritos con la fundamental primero por eso. */
const CHORDS = {
  am9:   [0, 7, 3, 2],    // A E C B — la casa. Abierto, sin resolver.
  dm7:   [5, 0, 8, 3],    // D A F C — se hunde, sin ponerse triste.
  fmaj7: [8, 3, 0, 7],    // F C A E — el más ancho y el más luminoso.
  cmaj7: [3, 10, 7, 2],   // C G E B — la única claridad franca del ciclo.
  gsus2: [10, 5, 0, 2],   // G D A B — cuartas: ni mayor ni menor, suspendido.
  em7:   [7, 2, 10, 5],   // E B G D — el más frío.
};

/* Las fases, por `p`. Una PROGRESIÓN, no una bolsa: los acordes se recorren en
   orden, porque una progresión sorteada no es una progresión. Lo que `p` elige
   es CUÁL progresión está dando vueltas, y ahí está la regla otra vez: volver
   para atrás no rebobina la armonía, cambia la progresión.

   Y TODAS EMPIEZAN Y TERMINAN DONDE PUEDEN RESOLVER. El primer acorde de cada
   progresión es su reposo, porque el arco dinámico está construido para caer
   ahí: la vuelta entera es un respiro que empieza y termina en el mismo lugar.

   `hold` es cuántos pulsos dura cada acorde, `oct` el registro, `dens` la
   probabilidad de que una nota del motivo suene. Ahí está el `jo-ha-kyū`
   (序破急), la forma de la música japonesa tradicional: la aceleración
   "constante pero extremadamente gradual, a veces apenas perceptible" del
   gagaku. Sólo que acá no corre en el reloj — corre en `p`. El que acelera la
   pieza es el lector, bajando. Si sube, la desacelera.

   LA ÚLTIMA ENTRADA REPITE LA PRIMERA A PROPÓSITO, como todas las curvas de
   este archivo: `fold()` manda `p` de 0.95 a 0 de un frame al otro, y si la
   música no llegara al final con la misma progresión, el mismo registro y la
   misma densidad, la costura se oiría. */
const CYCLE = [
  { at: 0.00, prog: ['am9', 'dm7'],                     hold: 12, oct: 2, dens: 0.52 },
  { at: 0.25, prog: ['am9', 'fmaj7', 'cmaj7', 'gsus2'], hold: 10, oct: 2, dens: 0.72 },
  { at: 0.48, prog: ['cmaj7', 'gsus2', 'fmaj7', 'am9'], hold: 8,  oct: 3, dens: 0.92 },
  { at: 0.72, prog: ['dm7', 'em7', 'am9', 'fmaj7'],     hold: 9,  oct: 2, dens: 0.78 },
  { at: 0.86, prog: ['am9', 'dm7'],                     hold: 12, oct: 2, dens: 0.52 },
];

/* La tónica, y el pulso.

   Cincuenta y dos por minuto es más lento que un corazón en reposo, y ésa es la
   medida: por debajo del pulso propio, el cuerpo no sigue a la música, la
   música lo sigue a uno. Es el tempo de las `Gymnopédies`.

   El pulso NO se oye —no hay percusión, no hay acento— pero está, y es lo que
   hace que esto suene tocado y no sorteado. */
const TONIC = 55;   // La1, y de ahí para arriba por octavas.
const PULSE = 60 / 52;

/* El arco largo, en segundos. Casi tres minutos, y un número que no es múltiplo
   de nada que haya acá: la vuelta de la progresión dura entre veintisiete y
   treinta y siete segundos, así que el pico grande cae en un lugar distinto de
   la progresión cada vez y dos vueltas nunca se sienten iguales. */
const SLOW = 173;

/* Cuánto aire tiene la música por delante de las camas, y cuánto pesa la
   resonancia contra las notas. La resonancia es la que hace que esto sea
   CONTINUO —entre nota y nota nunca hay silencio— y por eso mismo tiene que
   estar más abajo de lo que uno cree: si se la escucha, es un pad, y un pad
   cansa. */
const VOICE = [[0, 0.5], [0.25, 0.8], [0.48, 1], [0.72, 0.9], [0.86, 0.5], [0.95, 0.5]];
const PAD   = [[0, 0.42], [0.25, 0.34], [0.48, 0.26], [0.72, 0.34], [0.86, 0.42], [0.95, 0.42]];

/* Cuánto se agenda por adelantado y cada cuánto se revisa. `setTimeout` se
   desvía diez milisegundos o más por layout, render o GC, así que las notas NO
   se pueden disparar desde el reloj de JS: se AGENDAN contra el reloj de audio,
   que es exacto, y el de JS sólo decide cuándo mirar.

   El horizonte cubre dos pulsos y no más. Todo lo agendado ya no se puede
   cambiar: uno largo dejaría cayendo notas del acorde viejo mucho después de
   que el lector cambió de fase. */
const LOOK_MS = 180;
const HORIZON = PULSE * 2;

/* Con qué frecuencia canta un pájaro, en segundos. Largo a propósito: un canto
   cada diez segundos es un campo, uno cada dos es un pajarera. */
const BIRD_GAP = [9, 26];

/* Lo que se le pasa a `tick` cuando el motor no manda señales — los tests
   arman el motor sin host completo. Todo en cero significa "nada se está
   moviendo", que es exactamente lo que hay que sonar en ese caso. */
const NO_SIG = { root: 0, shoot: 0, bloom: 0, enter: 0, peel: 0, exit: 0, turn: 0, bare: 0, fan: 0, rel: 0 };

export function createAudio() {
  let ctx = null, master = null, verbSend = null, L = null;
  let built = false, muted = false, entered = false;
  let pPrev = -1;
  const armed = Object.create(null);
  /* Dónde está parado el lector, para el conjunto. Lo escribe `tick` y lo lee el
     planificador, que corre en otro reloj y no recibe frames. */
  let pNow = 0;
  let timer = null;
  /* El pulso, que no se oye pero manda. `beatAt` es el próximo pulso EN EL
     RELOJ DE AUDIO y `beat` lo cuenta desde que arrancó el sonido: todo —cada
     nota, cada cambio de acorde— cae en esta grilla, que es la cuantización que
     usa cualquier música adaptativa de videojuego para que un cambio de estado
     no se oiga como un tropiezo.

     `progIdx` avanza por la progresión. No es un cabezal: nadie lo puede
     rebobinar, sólo avanza, y lo que `p` cambia es SOBRE QUÉ avanza. */
  let beatAt = 0, beat = 0, progIdx = 0, chordNow = null;

  /* Y lo que el planificador de pájaros necesita saber y no puede ver: corre en
     su propio reloj y no recibe frames. */
  let nightNow = 0, shootNow = 0, birdNext = 0;

  /* ---- una cama: fuente en bucle, filtro, ganancia ---- */
  function bed(buffer, type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    /* Cada capa entra en un punto distinto del mismo buffer. Si todas
       arrancaran en cero, cuatro copias del mismo ruido se sumarían en fase y
       el resultado sería una sola capa más fuerte, no cuatro. */
    src.loopStart = 0;
    src.loopEnd = buffer.duration;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = freq;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(flt).connect(g);
    src.start(0, Math.random() * buffer.duration);
    return { src, flt, g };
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    /* El reverb es un ENVÍO, no un insert: la tierra tiene que sonar seca
       —bajo tierra no hay cola— y el aire mojado. Con el convolver en serie no
       habría forma de tener las dos cosas. */
    const verb = ctx.createConvolver();
    verb.buffer = bakeIR(ctx, 2.4, 2.6);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.34;
    verb.connect(verbOut).connect(master);
    verbSend = verb;

    const brown = bakeNoise(ctx, 6, 'brown');
    const pink = bakeNoise(ctx, 6, 'pink');

    /* TIERRA. Marrón con lowpass agresivo: bajo tierra no hay aire, todo lo que
       llega, llega amortiguado. Seca, sin envío al reverb. */
    const earth = bed(brown, 'lowpass', 180, 0.7);
    earth.g.connect(master);

    /* AIRE. Rosa por un bandpass que se abre con la copa, y con envío: el
       viento en un árbol es lo único de la pieza que ocurre en un espacio. */
    const air = bed(pink, 'bandpass', 240, 0.8);
    air.g.connect(master);
    const airSend = ctx.createGain();
    airSend.gain.value = 0.5;
    air.g.connect(airSend).connect(verb);

    /* INSECTOS. Bandpass angosto y alto sobre ruido rosa, cortado por un
       cuadrado: el chirrido no es un tono, es ruido pulsado. El segundo LFO,
       lento y en un período que no es múltiplo del primero, es lo que evita
       que se oiga como una máquina — el mismo truco que el motor ya usa en el
       dibujo para que la copa nunca vuelva a la misma pose. */
    const bugs = bed(pink, 'bandpass', 3400, 16);
    const trem = ctx.createGain();
    trem.gain.value = 0.34;
    bugs.g.connect(trem).connect(master);
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 21;
    const chirpAmt = ctx.createGain();
    chirpAmt.gain.value = 0.34;
    chirp.connect(chirpAmt).connect(trem.gain);
    chirp.start();
    const drift = ctx.createOscillator();
    drift.type = 'sine';
    drift.frequency.value = 0.073;
    const driftAmt = ctx.createGain();
    driftAmt.gain.value = 5.5;
    drift.connect(driftAmt).connect(chirp.frequency);
    drift.start();

    /* NOCHE. Una cama propia, muy grave y muy baja. No reemplaza nada: se suma
       debajo, que es lo que hace el aire frío de verdad. */
    const night = bed(brown, 'lowpass', 90, 0.7);
    night.g.connect(master);

    /* ---- el bus de los hechos del mundo ----
       Todo lo que suena porque algo está pasando en el dibujo cuelga de acá, y
       eso no es orden por el orden: son quince sonidos, y sin un lugar donde
       pesarlos todos juntos contra la música y contra las camas, balancearlos
       sería tocar quince números. */
    const world = ctx.createGain();
    world.gain.value = 1;
    world.connect(master);

    /* ---- el bus de la música ----
       El piano y su resonancia cuelgan de acá, separados del bus del mundo, y
       la separación es lo que permite pesar una cosa contra la otra con un solo
       número. El envío al reverb sale DESPUÉS, así que bajar este nodo baja el
       seco y el mojado en la misma proporción: la mezcla interna no se toca. */
    const voices = ctx.createGain();
    voices.gain.value = 0;
    voices.connect(master);
    const voicesSend = ctx.createGain();
    voicesSend.gain.value = 0.42;
    voices.connect(voicesSend).connect(verb);

    /* ---- EL PEDAL DE SOSTÉN ----
       La capa que hace que esto sea CONTINUO. Entre nota y nota del piano nunca
       hay silencio, y no porque las notas sean muchas sino porque debajo hay
       algo que no para: en un piano real, con el pedal pisado, todas las
       cuerdas quedan libres y vibran por simpatía con lo que se toca. Eso es lo
       que suena acá.

       Y es el `vertical layering` del videojuego en su forma más pura: catorce
       osciladores encendidos PARA SIEMPRE, y un acorde no es un disparo sino un
       patrón de ganancias sobre ellos. Una nota que sigue en el acorde nuevo no
       se vuelve a atacar, no se cruza con una copia de sí misma, simplemente
       nunca dejó de sonar — que es exactamente lo que hace una cuerda sin
       apagador.

       Siete clases de altura por dos octavas, en un registro fijo y grave: la
       resonancia de un pedal vive DEBAJO de lo que se toca. Puesta arriba
       competiría con las notas en vez de sostenerlas. */
    const padBus = ctx.createGain();
    padBus.gain.value = 1;
    const padTone = ctx.createBiquadFilter();
    padTone.type = 'lowpass';
    padTone.frequency.value = 1500;
    padTone.Q.value = 0.4;
    padBus.connect(padTone).connect(voices);

    const pad = [];
    for (const pc of [0, 2, 3, 5, 7, 8, 10]) {
      for (const oct of [1, 2]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = TONIC * Math.pow(2, pc / 12 + oct);
        /* Un par de cents de desafinación fija por voz. Osciladores clavados en
           afinación perfecta suenan a sintetizador; un piano se afina a mano y
           ninguna cuerda queda exacta. Es el batido lentísimo que hace que una
           capa sostenida no se muera. */
        o.detune.value = (pad.length % 2 ? 1 : -1) * (1.6 + (pad.length % 3) * 1.2);
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g).connect(padBus);
        o.start();
        pad.push({ pc, oct, o, g });
      }
    }

    L = { earth, air, bugs, night, trem, pink, brown, chirp, drift, voices, pad, padBus, world };
    /* Las capas de movimiento se arman después de `L` porque leen los buffers
       y el bus de ahí: la tabla es declarativa y el grafo lo monta ella. */
    buildFlows();
    built = true;
    return true;
  }

  /* ============================================================
     LOS HECHOS DEL MUNDO.

     Todo lo que suena acá es algo que se está VIENDO. Ésa es la única regla, y
     es la que separa esto de una interfaz: un "ding" al cruzar un umbral es un
     sonido de UI, y trece de esos convertirían la pieza en un menú. Acá suena
     la semilla cuando toca la tierra, la cáscara cuando se abre, los gajos
     cuando se separan — cosas que pasan, no estados que cambian.

     Y NINGUNO DE ESTOS TIEMPOS ESTÁ ESCRITO ACÁ. Vienen todos del motor, en
     `sig`, porque el motor es el que sabe cuándo la raíz está creciendo y
     cuándo se rasga el albedo. Copiar esas curvas de este lado sería tener el
     mismo movimiento escrito dos veces y garantizado que se despegan.

     Dos familias, y la diferencia importa:

       LOS GOLPES — cosas que ocurren en un instante. Se disparan al cruzar un
       umbral, con histéresis para que quedarse quieto en el borde no los
       repita.

       LAS FRICCIONES — cosas que DURAN mientras algo se mueve. La raíz y el
       brote no hacen un ruido cuando empiezan: hacen ruido MIENTRAS crecen, y
       se callan cuando el crecimiento se detiene. Y como el motor alterna raíz
       y brote —el cítrico se construye en pulsos, nunca las dos cosas a la
       vez— eso se va a oír solo, sin que nadie lo programe.
     ============================================================ */

  const rnd = (a, b) => a + Math.random() * (b - a);

  /* NADA SE PROGRAMA EN EL PASADO, y esto no es una precaución teórica: varios
     de estos sonidos llevan una desviación aleatoria que puede ser NEGATIVA
     —los gajos se corren ±20 ms para no caer en fila, el motivo ±18 ms para no
     sonar a secuenciador— y si el evento cae en los primeros milisegundos de
     vida del contexto, esa resta lo manda a tiempo negativo. `setValueAtTime`
     con un tiempo negativo no se ignora: tira una excepción, y la excepción
     mata el resto del sonido.

     Un solo lugar donde arreglarlo, en vez de un `Math.max` repartido por
     quince funciones. */
  const when = at => (at > 0 ? Math.max(at, ctx.currentTime) : ctx.currentTime);

  /* Una voz de ruido con su filtro barriendo. `at` va explícito porque varios
     de estos sonidos son ráfagas de golpes escalonados y no todos caen ahora. */
  function noiseVoice(buffer, type, f0, f1, q, dur, send, at) {
    const t = when(at);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    const g = ctx.createGain();
    /* Nace en silencio y no en 1, que es el default. La envolvente se programa
       un instante después de crear el nodo, y en ese hueco el grafo ya está
       corriendo: arrancar abierto deja pasar un par de samples a fondo, que es
       exactamente el clic que la envolvente existe para evitar. */
    g.gain.value = 0.0008;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(flt).connect(g).connect(L.world);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(verbSend);
    }
    src.start(t, Math.random() * buffer.duration);
    src.stop(t + dur + 0.1);
    return { g, t, dur };
  }

  /* La rampa exponencial NO puede llegar a cero — por eso todas las colas
     mueren en 0.0008 y no en 0. Es el error clásico de Web Audio: apuntar a 0
     tira una excepción y corta el sonido de golpe. */
  function decay(v, t, dur, peak, attack = 0.006) {
    v.setValueAtTime(0.0008, t);
    v.exponentialRampToValueAtTime(peak, t + attack);
    v.exponentialRampToValueAtTime(0.0008, t + dur);
  }

  /* Un cuerpo con altura: lo que le da peso a un golpe. Sin esto todos los
     sonidos del mundo son ruido filtrado y se parecen entre sí. */
  function body(f0, f1, dur, peak, at, type = 'sine', send = 0) {
    const t = when(at);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    decay(g.gain, t, dur, peak, Math.min(0.02, dur * 0.1));
    o.connect(g).connect(L.world);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(verbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ============================================================
   LO QUE SE MUEVE.

   Éste es el segundo intento y conviene dejar escrito por qué el primero
   estaba mal, porque el error era conceptual y es fácil de repetir.

   La primera versión disparaba un sonido al CRUZAR un umbral: la cáscara
   empezaba a abrirse y se lanzaba una envolvente de un segundo. Una vez
   lanzada, esa envolvente corría contra el reloj del audio y ya no le importaba
   dónde estaba el lector. Tres consecuencias, y las tres se oían:

     · scrolleando despacio, el sonido terminaba y el resto de la animación
       quedaba MUDA — la cáscara seguía abriéndose en silencio;
     · scrolleando rápido, el sonido quedaba atrás;
     · y volviendo para atrás NO SONABA NADA, porque un disparo no tiene marcha
       atrás.

   Lo correcto es que una transformación NO SEA UN EVENTO SINO UN ESTADO: el
   sonido es una función de cuánto se está moviendo la cosa, en este instante.
   Si el lector se detiene, se detiene. Si vuelve, suena igual — la cáscara
   volviéndose a poner hace el mismo ruido que la cáscara abriéndose, porque es
   la misma fibra rozando.

   ---- por qué la velocidad se normaliza, que es lo único fino de acá ----

   Las transformaciones duran cosas MUY distintas: la raíz tarda 0.59 de `p` en
   crecer entera y la fruta tarda 0.018 en llegar. O sea que con el mismo scroll
   la señal de la fruta se mueve TREINTA VECES más rápido que la de la raíz. Sin
   corregir eso, el pelado revienta y la raíz no se oye — que es exactamente lo
   que pasaba.

   La corrección es multiplicar la derivada por el LARGO de la transformación:

       ds/frame · span  ≈  dp/frame

   y `dp/frame` es la velocidad de scroll, igual para todos. Después cada capa
   se pesa con su propia ganancia, que ya es una decisión de mezcla y no de
   escala.

   Ojo con lo que NO se hace acá: no se usa `dp` directo. Tiene que ser la
   derivada de CADA señal, porque `ROOT` y `SHOOT` tienen mesetas —el cítrico
   crece de raíz o de brote, nunca los dos a la vez— y durante una meseta el
   lector avanza pero la raíz no se mueve. Con `dp` sonaría igual; con la
   derivada real, se calla. Esa alternancia sale sola y no la programó nadie.

   ---- la cola ----

   El suavizado es ASIMÉTRICO y ahí está lo que se siente: sube en tres cuadros
   y baja en medio segundo. Si el lector frena en mitad del pelado, el sonido
   sigue cediendo un segundo largo y muere solo, en vez de cortarse. Un
   `setTargetAtTime` simétrico no puede hacer esto: la constante de tiempo es
   una sola para las dos direcciones.

   ---- los granos ----

   Un desgarro no es una textura: son FIBRAS cediendo de a una, y una fibra es
   un disparo. Entonces la TASA de granos sale del movimiento —`acc += d · rate`
   y cada vez que pasa de uno, se rompe una fibra— y no de un reloj. Sin
   movimiento no se rompe nada, que es lo que pasa de verdad. Y como la
   velocidad es absoluta, yendo para atrás también se rompen: eso es lo que se
   oye cuando la cáscara se vuelve a poner.
   ============================================================ */

  /* La velocidad de scroll de referencia, en señal por frame. Sale de medir: un
     recorrido cómodo de la pieza mueve `p` unas nueve cienmilésimas por cuadro.
     Es el número que convierte "cuánto se movió" en "cuánto suena", y el que
     estaba mal por un factor de veinte en la versión anterior — por eso las
     raíces no se escuchaban. */
  const VEL_REF = 0.00012;

  /* Subir toma tres cuadros; bajar, medio segundo. Ver la nota sobre la cola. */
  const RISE = 0.30, FALL = 0.030;

  /* Un salto de scroll más grande que esto no es alguien recorriendo la pieza,
     es un corte — y la derivada de un corte es enorme. Se descarta, si no el
     pliegue del bucle sonaría como si el mundo entero se moviera de golpe. */
  const JUMP = 0.02;

  /* ---- LA TABLA ----
     Cada transformación del dibujo, con de qué señal sale y cómo suena. Es
     declarativa a propósito: con dieciséis de éstas escritas a mano, cambiar el
     criterio de una significaría acordarse de cambiarlo en dieciséis lugares.

       `span`  cuánto dura la transformación en `p` — el normalizador
       `hz`    el filtro se mueve DENTRO de la transformación, así que el timbre
               evoluciona mientras la cosa se abre en vez de ser un color fijo
       `rate`  granos por unidad de movimiento; 0 = textura pura, sin fibras */
  const FLOWS = [
    /* LA SEMILLA CAYENDO. Aire, y el filtro se abre a medida que gana
       velocidad: algo que cae rápido corta más aire. */
    { key: 'fall', span: 0.05, buf: 'pink', type: 'bandpass', hz: [240, 800], q: 1.4,
      gain: 0.132, send: 0.4, rate: 0 },

    /* LA SEMILLA HINCHÁNDOSE. Agua entrando en un tejido: todo grave, nada
       arriba de 300 Hz, y unos pocos crujidos afinados de la testa tensándose. */
    { key: 'imbibe', span: 0.12, buf: 'brown', type: 'lowpass', hz: [110, 260], q: 0.9,
      gain: 0.36, send: 0.15, rate: 70,
      grain: { buf: 'pink', type: 'bandpass', q: 22, dur: 0.10, lvl: 0.054, send: 0.3,
               tuned: true, oct: [3, 4] } },

    /* LA RAÍZ ABRIÉNDOSE PASO. Sonaba a TORMENTA y el motivo es medible: un
       pasabanda de Q 1.5 sobre ruido marrón es una banda anchísima, y una banda
       ancha grave ES un trueno. Ahora la textura queda en un piso apenas
       audible —el roce de la tierra, nada más— y el sonido lo llevan los
       granos: piedritas y raicillas cediendo, cada una con su altura, sacada
       del acorde. Sin envío al reverb: abajo no hay espacio, hay materia. */
    { key: 'root', span: 0.59, buf: 'brown', type: 'lowpass', hz: [110, 220], q: 0.7,
      gain: 0.264, send: 0, rate: 300,
      grain: { buf: 'brown', type: 'bandpass', q: 16, dur: 0.13, lvl: 0.12, send: 0.06,
               tuned: true, oct: [1, 2] } },

    /* EL TALLO SUBIENDO. Fibra estirándose: una capa MUY baja, porque lo que
       hace el trabajo son los crujidos de las ramas, no esto. */
    { key: 'shoot', span: 0.48, buf: 'pink', type: 'bandpass', hz: [300, 700], q: 3.2,
      gain: 0.108, send: 0.35, rate: 0 },

    /* CADA RAMA BROTANDO. Acá había ocho bips. La señal es cuántas ramas están
       creciendo EN ESTE INSTANTE, así que la densidad de crujidos sube con el
       flush y baja cuando el árbol descansa. Afinados: un brote que cruje en
       una nota del acorde deja de ser un ruidito y pasa a ser parte de la
       música. */
    { key: 'bud', span: 0.48, buf: 'pink', type: 'bandpass', hz: [500, 1000], q: 4,
      gain: 0.0528, send: 0.4, rate: 700,
      grain: { buf: 'pink', type: 'bandpass', q: 20, dur: 0.13, lvl: 0.052, send: 0.5,
               tuned: true, oct: [2, 3] } },

    /* LAS HOJAS ABRIENDO. Lo que sonaba a ruido blanco, y por dos razones a la
       vez: un pasaaltos ancho arriba de 2 kHz es `sharpness` pura —la métrica
       de Zwicker que mide exactamente cuánto molesta un sonido— y encima los
       granos atacaban con un escalón, que tiene espectro plano.

       Ahora no hay textura de banda ancha en absoluto: son SÓLO granos, con
       campana de Hann, resonantes y afinados. Y bajaron de octava: una hoja
       chica resuena agudo, pero el registro de 3 a 5 kHz es donde el oído más
       se cansa, así que el follaje vive una octava más abajo de lo que sería
       "realista". Suena mejor y no se nota, que es el intercambio correcto. */
    { key: 'leaf', span: 0.48, buf: 'pink', type: 'bandpass', hz: [900, 1400], q: 3,
      gain: 0.165, send: 0.5, rate: 1500,
      grain: { buf: 'pink', type: 'bandpass', q: 26, dur: 0.075, lvl: 0.165, send: 0.55,
               tuned: true, oct: [3, 4] } },

    /* LA FLOR. Aire fino, sin granos: una corola no cruje. */
    { key: 'bloom', span: 0.055, buf: 'pink', type: 'bandpass', hz: [800, 1800], q: 2.2,
      gain: 0.132, send: 0.65, rate: 0 },

    /* LA NARANJA ACERCÁNDOSE. Sonaba a TRUENO, y literalmente lo era: ruido
       marrón con un pasabajos barriendo hacia abajo es la receta de manual de
       un trueno. El error de fondo era usar RUIDO para algo que tiene cuerpo —
       una naranja es una masa compacta, no una turbulencia.

       Ahora la textura es un hilo mínimo y el peso lo lleva `enterBody()`, que
       son notas del acorde en el registro grave hinchándose. Un cuerpo que se
       acerca gana graves y gana ARMÓNICOS, no ruido. */
    { key: 'enter', span: 0.018, buf: 'brown', type: 'lowpass', hz: [600, 200], q: 0.8,
      gain: 0.1728, send: 0.3, rate: 0 },

    /* LA CÁSCARA ABRIÉNDOSE. **Mauricio dijo que ésta está bien**, así que se
       toca lo mínimo: sólo hereda la campana de Hann y la ley de potencias, que
       la mejoran sin cambiarle el carácter. Sigue SIN afinar a propósito — una
       cáscara rompiéndose no tiene altura musical, y es justamente ese contraste
       el que hace que se destaque del resto. */
    { key: 'peel', span: 0.026, buf: 'pink', type: 'bandpass', hz: [700, 2400], q: 4,
      gain: 0.792, send: 0.4, rate: 2600,
      grain: { buf: 'pink', type: 'bandpass', hz: [1400, 3800], q: 9, dur: 0.055, lvl: 0.22, send: 0.4 },
      spray: { every: 7, buf: 'pink', type: 'highpass', hz: [4200, 6800], q: 0.7, dur: 0.035, lvl: 0.176, send: 0.5 } },

    /* LA CÁSCARA YÉNDOSE. Aire, y se apaga hacia arriba. */
    { key: 'exit', span: 0.018, buf: 'pink', type: 'bandpass', hz: [900, 2200], q: 1.6,
      gain: 0.12, send: 0.55, rate: 0 },

    /* EL GIRO. Un movimiento no tiene ataque: todo está en el barrido. */
    { key: 'turn', span: 0.018, buf: 'brown', type: 'bandpass', hz: [180, 620], q: 3.2,
      gain: 0.24, send: 0.4, rate: 0 },

    /* EL ALBEDO RASGÁNDOSE. Hermano del pelado, pero el albedo es ESPONJA: más
       grave, más sordo, granos más blandos y más largos. */
    { key: 'bare', span: 0.024, buf: 'pink', type: 'bandpass', hz: [340, 900], q: 3,
      gain: 0.672, send: 0.5, rate: 2000,
      grain: { buf: 'brown', type: 'bandpass', hz: [380, 800], q: 7, dur: 0.10, lvl: 0.2352, send: 0.5 } },

    /* LOS GAJOS SEPARÁNDOSE. Diez tabiques cediendo, húmedos. Afinados y con Q
       alto: separar una naranja tiene una musicalidad rara que se pierde si se
       la hace con ruido. */
    { key: 'fan', span: 0.020, buf: 'pink', type: 'bandpass', hz: [700, 1500], q: 6,
      gain: 0.558, send: 0.45, rate: 2200,
      grain: { buf: 'pink', type: 'bandpass', q: 18, dur: 0.09, lvl: 0.248, send: 0.45,
               tuned: true, oct: [3, 4] } },

    /* EL GAJO ELEGIDO ABRIÉNDOSE. Una sola membrana: húmedo, corto, afinado
       arriba. */
    { key: 'open', span: 0.008, buf: 'pink', type: 'bandpass', hz: [1200, 2400], q: 7,
      gain: 0.4464, send: 0.5, rate: 2600,
      grain: { buf: 'pink', type: 'bandpass', q: 24, dur: 0.07, lvl: 0.1984, send: 0.5,
               tuned: true, oct: [4, 5] } },
  ];

  /* ============================================================
     LOS DOS CONTACTOS.

     Lo único que queda como evento en toda la pieza, y sobreviven por una razón
     precisa: un contacto ES instantáneo. No hay nada que scrollear adentro de
     dos superficies tocándose — la transformación dura cero. Todo lo demás pasó
     a ser flujo.

     Y son BLANDOS. Un golpe seco es lo que sonaba antes y es lo que había que
     sacar: la semilla no golpea la tierra, se APOYA. La diferencia está en el
     ataque —cincuenta milisegundos en vez de dos— y en que no hay nada arriba
     de 600 Hz. Un ataque rápido con agudos es un impacto; sin agudos y con
     ataque lento es un peso que se asienta.
     ============================================================ */

  /* LA SEMILLA APOYÁNDOSE EN LA TIERRA. Lo que define este sonido es lo que NO
     tiene: sin cola, sin brillo, sin resonancia. La tierra se traga el impacto,
     y esa ausencia es todo el material. */
  function evSeedRest() {
    const t = ctx.currentTime;
    /* EL TIEMPO DE CONTACTO ES TODO. La versión anterior atacaba en cincuenta
       milisegundos y todavía sonaba seca; el research lo explica y es lo mismo
       que hace el fieltro del martillo de un piano: un material blando AMORTIGUA
       LOS MODOS ALTOS durante el contacto. Lo que vuelve seco a un golpe no es
       el volumen, son los agudos que sobreviven al impacto.

       Entonces: contacto largo —ciento veinte milisegundos, que para un impacto
       es una eternidad—, nada por encima de 260 Hz, y una caída lenta. Deja de
       ser un golpe y pasa a ser un peso que se asienta. */
    const t0 = 0.12;

    /* Tres modos, y los agudos se apagan MUCHO antes que el grave, que es lo
       que hace cualquier cuerpo blando golpeado contra algo blando. Si duraran
       lo mismo, sonaría a tambor. */
    for (const [hz, lvl, dur] of [[58, 0.16, 0.75], [96, 0.055, 0.34], [142, 0.020, 0.16]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(hz * 1.14, t);
      /* La altura baja un poco mientras el contacto se aplana: la tierra cede y
         el modo se afloja. */
      o.frequency.exponentialRampToValueAtTime(hz, t + t0 * 2);
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(L.world);
      const sn = ctx.createGain();
      sn.gain.value = 0.15;
      g.connect(sn).connect(verbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    /* Y la tierra cediendo debajo. Un pasabajos cerrado y ataque lento: esto es
       lo que lo vuelve tierra y no madera, y no lleva un solo agudo. */
    const v = noiseVoice(L.brown, 'lowpass', 300, 130, 0.7, 0.45, 0.05, t);
    decay(v.g.gain, t, 0.45, 0.085, 0.10);
  }

  /* LA SEMILLA SOLTÁNDOSE DEL GAJO. El último sonido de la vuelta, y por eso el
     más difícil de acertar: si suena a final, la pieza termina, y la pieza NO
     termina — esa semilla es la que va a estar cayendo en el primer cuadro de la
     vuelta siguiente. Tiene que sonar a que algo se desprende y queda
     disponible: limpio, corto, con cola larga y nada de peso.

     La altura es LA TÓNICA, la misma de la que sale toda la armonía. Es el
     único guiño que se permite la pieza: la semilla suena la nota con la que la
     música va a volver a empezar. */
  function evRelease() {
    const t = ctx.currentTime;
    const v = noiseVoice(L.pink, 'bandpass', 2200, 3400, 8, 0.06, 0.4, t);
    decay(v.g.gain, t, 0.06, 0.075, 0.004);
    for (const [mul, lvl, dur] of [[8, 0.065, 2.8], [16.05, 0.018, 1.4]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = TONIC * mul;
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(L.world);
      const s = ctx.createGain();
      s.gain.value = 0.75;
      g.connect(s).connect(verbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /* ---- UN PÁJARO ----
     No es una transformación: es un habitante. No depende del scroll y por eso
     sigue siendo un evento — un pájaro canta cuando quiere, no cuando lo mirás.

     Lo que hace que un silbido suene a pájaro y no a un theremín es que la
     altura NO SE QUEDA QUIETA en ningún momento: cada sílaba es un glissando
     corto y van encadenadas sin silencio adentro. Va altísimo —dos a cinco
     kilohercios— porque ahí canta un pájaro chico, y es justo la banda donde ni
     las camas ni el piano tienen nada: se mete solo en el hueco que dejaron los
     demás. */
  function evBird(at) {
    const t = when(at);
    const n = 2 + ((Math.random() * 3) | 0);
    const base = rnd(2100, 3400);
    let a = t;
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.07, 0.16);
      const f0 = base * rnd(0.86, 1.18);
      const f1 = f0 * (Math.random() < 0.6 ? rnd(1.15, 1.5) : rnd(0.65, 0.87));
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, a);
      o.frequency.exponentialRampToValueAtTime(f1, a + dur);
      g.gain.setValueAtTime(0.0008, a);
      g.gain.exponentialRampToValueAtTime(rnd(0.020, 0.042), a + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0008, a + dur);
      o.connect(g).connect(L.world);
      /* Envío generoso: un pájaro suena LEJOS, y lo que dice que está lejos es
         la cola, no el volumen. */
      const s = ctx.createGain();
      s.gain.value = 0.8;
      g.connect(s).connect(verbSend);
      o.start(a);
      o.stop(a + dur + 0.05);
      a += dur + rnd(0.01, 0.06);
    }
  }

  /* ---- construir las capas ----
     Cada flujo tiene su propia fuente de ruido en bucle, y eso es una decisión
     con costo: son dieciséis fuentes corriendo siempre. Compartir una sola
     entre todas habría sido más barato, pero las capas que suenan juntas
     —la raíz y el tallo turnándose, el pelado y la cáscara yéndose— quedarían
     con ruido CORRELACIONADO, que se oye como una sola cosa filtrada de dos
     maneras en vez de dos cosas distintas. El costo real de una fuente en
     bucle es una lectura de memoria por sample en el audio thread; el main ni
     se entera, que es la regla 2 del archivo. */
  function buildFlows() {
    for (const f of FLOWS) {
      const src = ctx.createBufferSource();
      src.buffer = f.buf === 'brown' ? L.brown : L.pink;
      src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = f.type;
      flt.frequency.value = f.hz[0];
      flt.Q.value = f.q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(flt).connect(g).connect(L.world);
      if (f.send) {
        const s = ctx.createGain();
        s.gain.value = f.send;
        g.connect(s).connect(verbSend);
      }
      /* Cada una entra en un punto distinto del mismo buffer: si todas
         arrancaran en cero, las que comparten material se sumarían en fase. */
      src.start(0, Math.random() * src.buffer.duration);
      f.src = src; f.flt = flt; f.g = g;
      /* El estado del flujo: dónde estaba la señal, a qué velocidad va, y
         cuánta fibra lleva acumulada sin romper. */
      f.prev = 0; f.vel = 0; f.acc = 0; f.grains = 0;
    }
  }

  /* ---- un grano: una fibra cediendo ----
     Es lo único de la pieza que crea nodos fuera del planificador, y por eso
     está acotado: como mucho tres por cuadro. La tasa sale del movimiento, así
     que un scrub violento pediría cientos y el tope los recorta — se pierde
     densidad, no se pierde el frame. */
  /* ---- LA VENTANA DEL GRANO ----
     Ochenta puntos de una campana de Hann, calculada una vez. Es el arreglo más
     importante de este archivo y conviene entender por qué.

     Los granos atacaban con una rampa exponencial de cuatro milisegundos, o sea
     casi un escalón. Y un escalón tiene ESPECTRO PLANO: cada grano metía su
     propio clic de banda ancha. Cien granos por segundo de eso no suenan a
     hojas, suenan a RUIDO BLANCO — que es exactamente lo que se escuchaba.

     Una ventana de Hann no tiene esquinas: empieza en cero con derivada cero y
     termina igual. El grano no aporta nada más que su propio contenido, y ahí
     recién se oye lo que el grano ES en vez de oír el borde. */
  const HANN = (() => {
    const n = 80, w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    return w;
  })();

  const pick = a => a[(Math.random() * a.length) | 0];

  /* ---- un grano ----
     Un resonador excitado por un chispazo de ruido, que es síntesis modal
     escrita con los nodos que hay: un pasabanda de Q alto golpeado por un
     impulso corto ES un oscilador amortiguado. Con Q bajo el resultado es una
     banda de ruido —viento— y con Q alto es una nota con cuerpo. Ésa es toda la
     diferencia entre lo que ensuciaba y lo que no.

     Y AFINADO. Cuando `spec.tuned` está puesto, la altura del grano sale del
     ACORDE QUE EL PIANO ESTÁ TOCANDO en este momento. Es el cambio que hace que
     el mundo deje de ensuciar la música y pase a formar parte de ella: las
     hojas ya no son una banda de ruido encima del acorde, son el acorde dicho
     por otra cosa. Es lo mismo que hace un buen diseño de sonido de película
     cuando afina los ambientes a la tonalidad de la escena. */
  function grain(spec, s) {
    const src = ctx.createBufferSource();
    src.buffer = spec.buf === 'brown' ? L.brown : L.pink;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = spec.type;
    flt.Q.value = spec.q;

    if (spec.tuned) {
      const set = chordNow || CHORDS.am9;
      const oct = spec.oct[0] + ((Math.random() * (spec.oct[1] - spec.oct[0] + 1)) | 0);
      flt.frequency.value = TONIC * Math.pow(2, pick(set) / 12 + oct);
    } else {
      /* Sin afinar, la altura sigue el avance de la transformación: las
         primeras fibras de una cáscara no suenan como las últimas. */
      flt.frequency.value = spec.hz[0] + (spec.hz[1] - spec.hz[0]) * s;
    }

    const g = ctx.createGain();
    const t = ctx.currentTime;

    /* EL TAMAÑO SIGUE UNA LEY DE POTENCIAS, y no es una decoración
       estadística: los sistemas que crujen —papel arrugándose, una cáscara
       cediendo, la corteza terrestre— responden con eventos discretos cuyos
       tamaños se distribuyen así. Muchos chiquitos, pocos grandes, alguno
       enorme. Es la misma ley que cuenta los terremotos.

       Con tamaños parejos, que es lo que había, cien granos suenan a una
       máquina emitiendo cien veces lo mismo. Con ley de potencias suenan a algo
       que se está rompiendo. */
    const size = Math.pow(Math.random(), 2.6);

    /* DOS COMPENSACIONES, y sin ellas los granos no se oyen. Las dos salen de
       cómo funcionan las herramientas, no del gusto:

         POR EL Q — un pasabanda deja pasar un ancho de banda proporcional a
         `f0/Q`, así que subir el Q de 6 a 26 para ganar altura definida tiró la
         energía a la cuarta parte. La potencia que pasa va con 1/Q, entonces la
         amplitud se recupera con la raíz. Sin esto, "más armonioso" significa
         "más callado", que fue exactamente lo que pasó.

         POR LA VENTANA — una campana de Hann vale 0.5 de media y llega al pico
         a la mitad del grano, no al principio. Comparada con la envolvente
         anterior —que saltaba al pico en cuatro milisegundos— entrega bastante
         menos, aunque suene mucho mejor. */
    const qComp = Math.sqrt(spec.q / 6);
    const lvl = spec.lvl * (0.25 + 2.4 * size) * qComp * 1.7;
    /* Y los grandes duran más que los chicos, como en cualquier cosa que cede:
       una fibra gruesa tarda más en romperse. */
    const dur = spec.dur * (0.55 + 1.5 * size);

    /* La campana, escalada al nivel de este grano. Sin ataque y sin caída
       programados aparte: la ventana ES la envolvente. */
    const env = new Float32Array(HANN.length);
    for (let i = 0; i < HANN.length; i++) env[i] = HANN[i] * lvl;
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(env, t, dur);

    src.connect(flt).connect(g).connect(L.world);
    if (spec.send) {
      const sn = ctx.createGain();
      sn.gain.value = spec.send;
      g.connect(sn).connect(verbSend);
    }
    src.start(t, Math.random() * src.buffer.duration);
    src.stop(t + dur + 0.05);
  }

  /* ---- EL CUERPO DE LA NARANJA QUE SE ACERCA ----
     Lo que reemplaza al trueno. Una masa que viene hacia uno no es turbulencia:
     es un CUERPO, y un cuerpo tiene armónicos, no ruido. Son tres notas graves
     del acorde que está sonando, hinchándose juntas.

     Y es un flujo, no un evento: se lo llama de a pedacitos mientras la fruta
     avanza, así que si el lector frena, deja de crecer. Cada llamada es un
     pulso corto que se solapa con el anterior, y la suma de pulsos solapados es
     una masa continua que sigue al scroll — que es la misma idea de los granos,
     con granos largos y afinados en vez de cortos y secos. */
  function enterBody(s, drive) {
    const t = ctx.currentTime;
    const set = chordNow || CHORDS.am9;
    const dur = rnd(0.9, 1.5);
    /* Sube de registro mientras se acerca: no de altura musical —sigue siendo
       el mismo acorde— sino de octava, así que crece sin desafinar contra el
       piano. */
    const oct = s < 0.45 ? 0 : 1;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = TONIC * Math.pow(2, pick(set) / 12 + oct);
    o.detune.value = rnd(-6, 6);
    const lvl = 0.10 * drive * (0.45 + 0.9 * s);
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, lvl), t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(L.world);
    const sn = ctx.createGain();
    sn.gain.value = 0.4;
    g.connect(sn).connect(verbSend);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /* ---- el frame de los flujos ----
     Corre dentro de `tick`, o sea sesenta veces por segundo, y todo lo que hace
     por capa son dos `setTargetAtTime`. Los granos son la excepción y están
     topeados. */
  function flowTick(sig, t) {
    for (const f of FLOWS) {
      const s = clamp(sig[f.key] || 0);

      /* La derivada, multiplicada por el largo de la transformación. Ver la
         nota de arriba: sin ese factor, la fruta acercándose sería treinta
         veces más fuerte que la raíz creciendo por el solo hecho de durar
         menos. */
      let d = Math.abs(s - f.prev) * f.span;
      f.prev = s;
      /* El pliegue del bucle y los saltos de scroll no son movimiento. */
      if (d > JUMP * f.span) d = 0;

      /* Sube en tres cuadros, baja en medio segundo. La asimetría ES la cola:
         al frenar, la fibra sigue cediendo sola un rato en vez de cortarse. */
      f.vel += (d - f.vel) * (d > f.vel ? RISE : FALL);

      const drive = clamp(f.vel / VEL_REF);
      f.g.gain.setTargetAtTime(drive * f.gain, t, 0.04);
      /* El timbre evoluciona DENTRO de la transformación: la cáscara no suena
         igual recién abierta que a la mitad. */
      f.flt.frequency.setTargetAtTime(f.hz[0] + (f.hz[1] - f.hz[0]) * s, t, 0.08);

      /* La naranja acercándose necesita CUERPO, no ruido, así que además de su
         hilo de textura suelta notas graves del acorde mientras avanza. Va acá
         y no en la tabla porque es la única capa que no se hace con ruido. */
      if (f.key === 'enter' && drive > 0.05) {
        f.acc += drive * 0.09;
        if (f.acc >= 1) { f.acc -= 1; enterBody(s, drive); }
        continue;
      }

      if (!f.rate) continue;
      /* Las fibras. Se acumulan con el movimiento y se rompen de a una: sin
         scroll no se rompe ninguna, y yendo para atrás se rompen igual porque
         la velocidad es absoluta. Eso es la cáscara volviéndose a poner. */
      f.acc += d * f.rate;
      let n = 0;
      while (f.acc >= 1 && n < 3) {
        f.acc -= 1; n++;
        grain(f.grain, s);
        f.grains++;
        if (f.spray && f.grains % f.spray.every === 0) grain(f.spray, s);
      }
      if (f.acc > 3) f.acc = 3;
    }
  }

  /* ============ el pedal: cambiar de acorde sin cortar ============
     No hay ataque. Un acorde no empieza: se convierte en el siguiente. Lo único
     que pasa acá son catorce rampas de ganancia, y las voces que ya estaban en
     su valor NO SE MUEVEN — ese "no se mueven" es toda la continuidad de la
     pieza. Dos acordes vecinos comparten dos o tres notas, y esas notas siguen
     sonando a través del cambio como si nada hubiera pasado. Es la conducción
     de voces por nota común, que es la razón de que una armonía compleja pueda
     moverse sin que nada salte.

     El cruce es LARGO, casi tres segundos, y ahí está la mitad del sonido: las
     notas que entran y las que salen conviven un buen rato y el acorde pasa por
     formas que no están escritas en ninguna tabla.

     Se llama con `at` cuantizado al pulso, siempre. Es la lección del
     videojuego: nada cambia donde caiga. */
  function chord(name, at) {
    const set = CHORDS[name];
    chordNow = set;
    for (const v of L.pad) {
      const i = set.indexOf(v.pc);
      /* Las notas de arriba del acorde, más bajas, y la octava alta a la mitad:
         el peso tiene que estar en la fundamental o esto deja de ser una
         resonancia y se vuelve un pad. */
      const lvl = i < 0 ? 0 : 0.075 * Math.pow(0.74, i) * (v.oct === 2 ? 0.5 : 1);
      v.g.gain.setTargetAtTime(lvl, at, 0.95);
    }
  }

  /* ============ el piano: un Rhodes ============
     Una púa de metal golpeada por un martillito de fieltro, con una barra
     resonadora al lado. Tres cosas y nada más:

       EL CUERPO — casi una sinusoide. Un Rhodes tiene mucho menos arriba que un
       piano de cola, y por eso cansa menos: es todo fundamental.

       LA CAMPANA — la púa. Un parcial INARMÓNICO bien agudo que se apaga mucho
       antes que el cuerpo. Es lo único que delata al instrumento, y si dura
       tanto como el cuerpo el resultado suena a órgano en vez de a algo
       golpeado. Se escala con el CUADRADO de la velocidad porque así se comporta
       el instrumento: cuanto más suave se toca un Rhodes, menos campana tiene, y
       esto se toca muy suave casi todo el tiempo.

       EL GOLPE — dos milisegundos de ruido. No se escucha por separado; sin él
       la nota no ARRANCA, aparece. */
  function note(pc, oct, at, vel) {
    const hz = TONIC * Math.pow(2, pc / 12 + oct);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz;
    const g = ctx.createGain();
    /* Los graves duran más que los agudos, en un Rhodes y en cualquier cosa que
       vibre. Y la cola es larga a propósito: el solapamiento entre una nota y la
       siguiente es lo que hace que esto no tenga silencios adentro. */
    const dur = 6.5 * Math.pow(1.5, -Math.log2(hz / 220)) + rnd(-0.5, 1.1);
    g.gain.setValueAtTime(0.0008, at);
    /* Ataque de cinco milisegundos: un martillo de fieltro no es un click, pero
       tampoco es una rampa. El decaimiento es exponencial porque una cuerda
       pierde energía en proporción a la que le queda. */
    g.gain.exponentialRampToValueAtTime(vel, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.connect(g).connect(L.voices);
    o.start(at);
    o.stop(at + dur + 0.05);

    /* Un refuerzo una octava abajo, muy por debajo. No es una nota: es el cuerpo
       del instrumento respondiendo, y es lo que le da peso a un Rhodes que si no
       suena a flauta con ataque. */
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = hz * 0.5;
    sg.gain.setValueAtTime(0.0008, at);
    sg.gain.exponentialRampToValueAtTime(vel * 0.30, at + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0008, at + dur * 0.8);
    sub.connect(sg).connect(L.voices);
    sub.start(at);
    sub.stop(at + dur * 0.8 + 0.05);

    /* La campana de la púa. Inarmónica a propósito: un múltiplo entero se
       fundiría con el cuerpo y desaparecería, y lo que hace sonar a Rhodes es
       justamente que la púa NO está afinada con la barra. */
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = 'sine';
    b.frequency.value = hz * 6.27;
    bg.gain.setValueAtTime(0.0008, at);
    bg.gain.exponentialRampToValueAtTime(vel * vel * 0.9 + 0.001, at + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0008, at + 0.45);
    b.connect(bg).connect(L.voices);
    b.start(at);
    b.stop(at + 0.55);

    /* El golpe del martillo. */
    const src = ctx.createBufferSource();
    src.buffer = L.pink;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1800;
    flt.Q.value = 0.9;
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.0008, at);
    ig.gain.exponentialRampToValueAtTime(vel * 0.09, at + 0.002);
    ig.gain.exponentialRampToValueAtTime(0.0008, at + 0.045);
    src.connect(flt).connect(ig).connect(L.voices);
    src.start(at, Math.random() * L.pink.duration);
    src.stop(at + 0.1);
  }

  /* ============ el planificador ============
     Corre en el reloj de JS pero no dispara nada: sólo mira hacia adelante y
     agenda contra el reloj de audio. Los dos relojes hacen lo que cada uno sabe
     hacer — el de JS es impreciso pero puede correr código, el de audio es
     exacto pero no llama a nadie. */
  function phase(p) {
    let g = CYCLE[0];
    for (const q of CYCLE) { if (p >= q.at) g = q; }
    return g;
  }

  /* ============ EL ARCO ============
     Lo que hace que la pieza respire, y lo que le faltaba cuando esto era un
     tono Shepard: picos y valles.

     EL ARCO CORTO es la vuelta de la progresión, de cero a uno. Vale cero en el
     primer acorde —el reposo, la tónica— y llega a uno en el medio. O sea que
     el momento más lleno cae en el acorde más lejos de casa, y la vuelta a casa
     llega con la música vaciándose. Eso es una llegada, y no se puede fingir
     subiendo el volumen en cualquier lado: si el pico dinámico no coincide con
     el pico armónico, no se siente resolución, se siente un ruido más fuerte.

     La curva es `sin` elevado a 1.4, o sea ASIMÉTRICA: sube despacio, se queda
     un rato arriba y cae. Un `sin` pelado sube y baja igual, y eso se oye como
     una máquina respirando.

     EL ARCO LARGO son casi tres minutos y no modula el volumen: modula CUÁNTO
     PESA el arco corto. Cuando está abajo, la vuelta de la progresión apenas se
     mueve y la música queda casi plana; cuando está arriba, la misma vuelta
     tiene un pico marcado. Por eso dos vueltas iguales no se sienten iguales.

     Y no es un cabezal: es una función del reloj, sin estado y sin material
     guardado. Scrollear no lo mueve — el lector cambia la progresión, el tiempo
     cambia el aliento. Son dos cosas distintas y tienen que serlo, porque si no
     alguien quieto no oiría nunca un arco. */
  function arc(g, now) {
    const span = g.prog.length * g.hold;
    const k = ((beat % span) + span) % span / span;
    const short = Math.pow(Math.sin(Math.PI * k), 1.4);
    const slow = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * now) / SLOW));
    return { short, depth: short * slow, k };
  }

  function schedule() {
    if (!built || muted || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const g = phase(pNow);

    /* Al arrancar, o después de una pausa larga —una pestaña oculta, el sonido
       apagado un rato—, el pulso quedó en el pasado. Ponerse al día dispararía
       de golpe todo lo que "faltó", que es la peor forma posible de volver a una
       música que se trata de la calma. */
    if (beatAt < now) { beatAt = now + 0.12; beat = 0; }

    while (beatAt < now + HORIZON) {
      const a = arc(g, beatAt);

      /* EL ACORDE. Cae en el pulso, siempre — la cuantización del videojuego. Y
         avanza por la progresión EN ORDEN: una progresión sorteada no es una
         progresión, es una bolsa. */
      if (beat % g.hold === 0) {
        chord(g.prog[progIdx % g.prog.length], beatAt);
        progIdx++;
      }

      /* EL MOTIVO. Vuelve cada `MOTIF_SPAN` pulsos, siempre con el mismo ritmo,
         y lo que cambió abajo es el acorde. Es la regla entera de Yoshimura, y
         es lo que le da a esto una forma reconocible en vez de un goteo. */
      if (beat % MOTIF_SPAN === 0) {
        const set = chordNow || CHORDS.am9;
        for (const m of MOTIF) {
          /* La primera nota SIEMPRE suena. Es la que hace que la figura se
             reconozca: si el arranque puede faltar, cada vuelta es una figura
             distinta y no hay motivo, hay notas. Las demás entran según el
             arco, y ahí está el valle — abajo del todo queda la figura pelada,
             dos notas, y el acorde sonando solo. */
          if (m.t > 0 && Math.random() > g.dens * (0.35 + 0.65 * a.depth)) continue;

          const pc = set[m.d % set.length];
          /* El registro se abre en el pico. Media octava de contorno alcanza:
             subir la mano cuando la música crece es lo que hace cualquiera que
             toque, y es una segunda forma de decir lo mismo que dice el
             volumen. */
          const oct = g.oct + (m.d >= 2 && a.depth > 0.55 ? 1 : 0);
          /* Y el toque también. Un pico que sólo tiene más notas suena más
             ocupado; un pico que además se toca más fuerte suena más lleno. */
          const vel = m.v * (0.055 + 0.075 * a.depth) * rnd(0.88, 1.12);
          /* Nadie toca en la grilla exacta. Veinte milisegundos de mugre humana
             es la diferencia entre alguien tocando y un secuenciador. */
          note(pc, oct, when(beatAt + m.t * PULSE + rnd(-0.018, 0.018)), vel);
        }
      }

      beat++;
      beatAt += PULSE;
    }

    /* LOS PÁJAROS. Van acá y no en los golpes porque no dependen de que pase
       nada: dependen de que HAYA algo. Un pájaro necesita dos condiciones —que
       sea de día y que haya dónde pararse— y las dos salen del motor.

       Y NO se cuantizan al pulso, que es lo único de la pieza que se sale de la
       grilla a propósito. Un pájaro que canta en compás es un instrumento; lo
       que hace que se lea como parte del mundo y no de la música es justamente
       que le pasa por al lado. */
    const day = 1 - nightNow;
    const perch = clamp((shootNow - 0.12) / 0.3);
    const chance = day * day * perch;
    if (birdNext < now) birdNext = now + rnd(1, 5);
    if (chance > 0.12 && birdNext < now + HORIZON) {
      evBird(birdNext);
      /* Cuanto más de día y más copa, más seguido. El rango sigue siendo largo:
         un canto cada nueve segundos ya es un campo lleno. */
      birdNext += rnd(BIRD_GAP[0], BIRD_GAP[1]) / (0.35 + chance);
    } else if (birdNext < now + HORIZON) {
      birdNext = now + rnd(4, 9);
    }
  }

  /* ============ qué dispara los dos contactos ============
     Quedan dos umbrales en toda la pieza, y no es poco código borrado: eran
     diez, y nueve de ellos se volvieron flujos. Un contacto suena cuando una
     señal CRUZA su umbral hacia arriba — no cuando está por encima, cuando lo
     cruza. La distinción importa porque el lector puede quedarse quieto justo
     en el borde con el temblor del trackpad, y sin ella eso dispararía veinte
     veces por segundo. */
  const HITS = [
    /* La semilla llega al suelo al final de su caída. */
    { key: 'rest', read: s => s.fall, thr: 0.985, fire: evSeedRest },
    /* Y se suelta del gajo al final de la vuelta. */
    { key: 'release', read: s => s.rel, thr: 0.30, fire: evRelease },
  ];

  /* Cuánto tiene que bajar una señal por debajo del umbral para volver a
     armarse. Es la histéresis, y sin ella el borde se vuelve un tartamudeo. */
  const ARM = 0.02;

  function rearm(sig) {
    for (const e of HITS) armed[e.key] = e.read(sig) < e.thr;
  }

  function fireEvents(p, sig) {
    /* Dos cosas que NO son un recorrido y no tienen que disparar nada: el
       pliegue del bucle, que manda `pe` de 0.95 a 0 de un frame al otro, y un
       salto de scroll grande. Un salto de más de medio ciclo no es alguien
       recorriendo la pieza, es un corte. */
    if (pPrev < 0 || Math.abs(p - pPrev) > 0.5) {
      pPrev = p;
      rearm(sig);
      return;
    }
    for (const e of HITS) {
      const v = e.read(sig);
      if (!armed[e.key]) { if (v < e.thr - ARM) armed[e.key] = true; continue; }
      if (v >= e.thr) { armed[e.key] = false; e.fire(); }
    }
    pPrev = p;
  }

  /* ============ el frame ============
     Lo único que corre sesenta veces por segundo. Cinco `setTargetAtTime` y una
     comparación de umbrales: el presupuesto de esto es despreciable al lado de
     un frame de dibujo, que es exactamente la idea. */
  function tick(p, nightRaw, interiorRaw, sigRaw) {
    if (!built || muted || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const night = clamp(nightRaw || 0);
    const sig = sigRaw || NO_SIG;

    /* 50 ms sobre las ganancias y 90 ms sobre los filtros. El motor ya suaviza
       `p` con una constante de ~0.26 s, así que lo que llega acá viene planchado
       y esto sólo tiene que matar el escalón entre frames. */
    const G = 0.05, F = 0.09;

    L.earth.g.gain.setTargetAtTime(env(EARTH, p) * 0.30 * BEDS, t, G);
    /* De noche el viento se calma y los insectos toman el campo. Los dos salen
       del mismo número, que el motor ya calcula para el cielo: el sonido no
       inventa una noche propia, escucha la que se está dibujando. */
    L.air.g.gain.setTargetAtTime(env(AIR, p) * (1 - 0.42 * night) * 0.24 * BEDS, t, G);
    L.air.flt.frequency.setTargetAtTime(env(AIR_HZ, p), t, F);
    /* Los insectos son DE NOCHE, y ahora en serio: antes sonaban al 55% incluso
       a pleno sol, que es la mitad del volumen por una cosa que de día no está.
       Ahora el día los apaga casi del todo y la noche los trae. */
    L.bugs.g.gain.setTargetAtTime(env(BUGS, p) * (0.12 + 1.05 * night) * 0.13 * BEDS, t, G);
    L.night.g.gain.setTargetAtTime(night * 0.16 * BEDS, t, G);

    /* La música. DOS ganancias, y nada más — todo lo que `p` le hace por frame.

       Las notas no aparecen acá y vale entender por qué: la altura vive adentro
       de cada nota y queda fijada en el momento de agendarla. Una nota que ya
       está sonando no cambia, igual que en un piano de verdad. Lo que `p` mueve
       no es ningún sonido en curso: es el acorde del que van a salir los
       siguientes. */
    L.voices.gain.setTargetAtTime(env(VOICE, p) * 0.5, t, G);
    L.padBus.gain.setTargetAtTime(env(PAD, p), t, G);

    /* ---- TODO LO QUE SE MUEVE ----
       Dieciséis capas, y por capa dos `setTargetAtTime`. El presupuesto sigue
       siendo despreciable al lado de un frame de dibujo, que es la idea de
       siempre: lo caro lo hace el audio thread.

       Acá vivían dos fricciones sueltas —la raíz y el tallo— escritas a mano.
       Ahora son dos filas de una tabla de dieciséis, y con el normalizador
       arreglado: el factor que tenían estaba calibrado como si el scroll fuera
       veinte veces más rápido, y por eso las raíces no se escuchaban. */
    flowTick(sig, t);

    /* El planificador necesita saber dónde está parado el lector, y `tick` es lo
       único que lo sabe. Se guardan y no se usan acá: el que los lee corre en su
       propio reloj. */
    pNow = p;
    nightNow = night;
    shootNow = sig.shoot;

    fireEvents(p, sig);
  }

  /* ============ la puerta ============
     `AudioContext` nace `suspended` si se crea antes de un gesto de usuario, y
     el scroll NO cuenta como gesto en Chrome. Por eso esto se llama desde el
     click del botón y no desde el montaje del componente: es la única forma de
     que suene. */
  /* El planificador se prende y se apaga con el sonido. Dejarlo corriendo en
     silencio no costaría casi nada en CPU, pero seguiría creando y tirando
     nodos para frases que nadie va a oír, y al volver el conjunto arrancaría en
     un punto arbitrario de su propia deriva en vez de empezar.

     El pulso vuelve a cero y el contador también, así que lo primero que pasa
     al volver es un acorde: `beat % hold === 0` se cumple en el pulso cero. La
     resonancia tiene que estar antes que la primera nota, no después. */
  function startEnsemble() {
    if (timer !== null) return;
    beatAt = 0;
    beat = 0;
    timer = setInterval(schedule, LOOK_MS);
    schedule();
  }

  function stopEnsemble() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  async function enter({ sound }) {
    entered = true;
    if (!sound) { muted = true; return; }
    if (!built && !build()) return;
    try { await ctx.resume(); } catch { return; }
    muted = false;
    /* Entrada larga a propósito: la pieza empieza bajo tierra y el sonido tiene
       que aparecer, no encenderse. */
    master.gain.setTargetAtTime(1, ctx.currentTime, 1.1);
    startEnsemble();
  }

  async function setMuted(m) {
    muted = m;
    if (m) {
      stopEnsemble();
      if (built) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
      return;
    }
    /* Se construye acá y no antes porque el toggle también es un click, o sea
       un gesto válido: alguien que entró en silencio y después cambia de idea
       no debería haber pagado un AudioContext mientras tanto. */
    if (!built && !build()) return;
    try { await ctx.resume(); } catch { return; }
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    startEnsemble();
  }

  /* Con la pestaña oculta el rAF del motor se frena, así que `tick` deja de
     llegar y el sonido se congelaría en el último valor — una nota sostenida
     saliendo de una pestaña que no se ve. */
  function onVis() {
    if (!built) return;
    /* El planificador también para. Con el contexto suspendido `currentTime` se
       congela, así que seguir agendando amontonaría gotas todas sobre el mismo
       instante y al volver caerían todas juntas. */
    if (document.hidden) { stopEnsemble(); ctx.suspend().catch(() => {}); }
    else if (!muted) { ctx.resume().catch(() => {}); startEnsemble(); }
  }
  document.addEventListener('visibilitychange', onVis);

  function destroy() {
    document.removeEventListener('visibilitychange', onVis);
    stopEnsemble();
    if (!built) return;
    for (const n of [L.earth, L.air, L.bugs, L.night]) { try { n.src.stop(); } catch {} }
    /* Las dieciséis capas de movimiento tampoco tienen final propio. */
    for (const f of FLOWS) { try { f.src.stop(); } catch {} }
    for (const o of [L.chirp, L.drift]) { try { o.stop(); } catch {} }
    /* Las catorce cuerdas del pedal no tienen final propio: se encienden al
       construir y suenan hasta acá. */
    for (const v of L.pad) { try { v.o.stop(); } catch {} }
    ctx.close().catch(() => {});
    built = false;
  }

  return { tick, enter, setMuted, destroy, get entered() { return entered; }, get muted() { return muted; } };
}
