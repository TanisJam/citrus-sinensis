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

  /* Lo que el motor estaba haciendo en el frame anterior, para poder sacar la
     velocidad de crecimiento. Es lo único de este archivo que necesita
     acordarse del frame pasado. */
  let rootPrev = 0, shootPrev = 0, rootVel = 0, shootVel = 0;
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
    world.gain.value = 0.85;
    world.connect(master);

    /* ---- LA RAÍZ CAVANDO ----
       Tierra desplazándose, que es lo más sordo que hay: ruido marrón por un
       pasabanda bajo y angosto. No tiene nada arriba de 400 Hz porque abajo de
       la tierra no hay aire que lleve los agudos, y ese recorte es la mitad de
       lo que hace que suene enterrado.

       Sin envío al reverb, a propósito: una cola implicaría un espacio, y bajo
       tierra no hay espacio, hay materia. */
    const dig = bed(brown, 'bandpass', 190, 1.4);
    dig.g.connect(world);

    /* ---- EL BROTE SUBIENDO ----
       Fibra estirándose. Más arriba y más ancho que la raíz, con envío, porque
       esto sí pasa en el aire. El filtro se abre con el tamaño del brote. */
    const rise = bed(pink, 'bandpass', 420, 2.2);
    rise.g.connect(world);
    const riseSend = ctx.createGain();
    riseSend.gain.value = 0.35;
    rise.g.connect(riseSend).connect(verb);

    /* ---- el bus del conjunto ----
       Las tres voces cuelgan de acá y no del master, por la misma razón que
       `BEDS` existe: el envío al reverb sale DESPUÉS, así que bajar este nodo
       baja el seco y el mojado en la misma proporción y la mezcla interna del
       conjunto no se toca. Es el sitio donde `p` decide cuánto aire tiene la
       música por delante de las camas. */
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

    L = { earth, air, bugs, night, trem, pink, brown, chirp, drift, voices, pad, padBus, world, dig, rise };
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

  /* ---- LA SEMILLA CAE EN LA TIERRA ----
     Tierra, no piedra: lo que define el sonido es lo que NO tiene. Sin cola,
     sin brillo, sin resonancia — la tierra se traga el impacto, y esa ausencia
     es todo el material. Un thump grave que muere en un cuarto de segundo y un
     puñado de granos secos alrededor. */
  function evSeedFall() {
    const t = ctx.currentTime;
    body(150, 58, 0.20, 0.30, t, 'sine', 0.08);
    const v = noiseVoice(L.brown, 'lowpass', 900, 190, 0.8, 0.16, 0.06, t);
    decay(v.g.gain, t, 0.16, 0.22, 0.002);
    /* Los granos: tierra suelta saltando. Tres o cuatro, desparramados en
       ochenta milisegundos, que es lo que tarda en asentarse. */
    for (let i = 0; i < 4; i++) {
      const a = t + rnd(0.01, 0.09);
      const q = noiseVoice(L.pink, 'bandpass', rnd(1400, 2600), 900, 3, 0.03, 0, a);
      decay(q.g.gain, a, 0.03, rnd(0.03, 0.07), 0.001);
    }
  }

  /* ---- LA SEMILLA SE ABRE ----
     Dos cosas a la vez y en este orden: la testa cediendo —un crujido chiquito
     y seco— y detrás el hinchamiento de la imbibición, que es lo que la abrió.
     El crujido primero: la causa se oye después del efecto sólo en las
     películas. */
  function evSeedSplit() {
    const t = ctx.currentTime;
    const v = noiseVoice(L.pink, 'bandpass', 1600, 700, 5, 0.22, 0.2, t);
    const g = v.g.gain;
    g.setValueAtTime(0.0008, t);
    /* Dentado: la cáscara no cede pareja, cede de a fibras. Cinco mordidas
       alcanzan porque es una semilla, no un tronco. */
    for (let i = 0; i < 5; i++) {
      const a = t + (i / 5) * 0.18;
      g.setValueAtTime(rnd(0.04, 0.13), a);
      g.setValueAtTime(0.02, a + 0.014);
    }
    g.exponentialRampToValueAtTime(0.0008, t + 0.22);
    /* Y el agua entrando: ataque lento, todo grave, nada arriba de 300 Hz.
       Empieza tarde a propósito — la semilla se abre porque se hinchó, pero lo
       que se oye primero es lo que se rompe. */
    const w = noiseVoice(L.brown, 'lowpass', 110, 280, 0.9, 1.3, 0.15, t + 0.05);
    decay(w.g.gain, t + 0.05, 1.3, 0.17, 0.5);
  }

  /* ---- UNA RAMIFICACIÓN ----
     El brote no crece parejo: `SHOOT` tiene escalones, y cada escalón es un
     `flush` — un pulso en el que el cítrico saca madera nueva y para. Esto
     suena una vez por escalón.

     Madera, o sea: un cuerpo corto con la altura bajando (la fibra que cede) y
     nada de cola. Cuanto más avanzado el árbol, más grave, porque la rama es
     más gruesa. */
  function evBranch(k, at) {
    const t = when(at);
    const f = 260 * Math.pow(0.72, k * 1.6);
    body(f, f * 0.55, 0.13, 0.16, t, 'triangle', 0.35);
    const v = noiseVoice(L.pink, 'bandpass', 2200, 1100, 4, 0.05, 0.25, t);
    decay(v.g.gain, t, 0.05, 0.09, 0.002);
  }

  /* ---- FOLLAJE SALIENDO ----
     No es un sonido, son muchos: una hoja que se abre no hace ruido, un flush
     entero sí. Se arma con granos —siete a once impulsitos de ruido agudo
     desparramados en medio segundo— y lo que lo hace leer como hojas y no como
     estática es que los granos NO son parejos: se amontonan al principio y se
     ralean, como cualquier cosa que se abre de golpe y después se acomoda. */
  function evFoliage(amount, at) {
    const t = when(at);
    const n = 7 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      /* El cuadrado del azar es lo que amontona: valores chicos son más
         probables que grandes, así que la mayoría cae temprano. */
      const u = Math.random() * Math.random();
      const a = t + u * 0.55;
      const hz = rnd(2600, 5200);
      const q = noiseVoice(L.pink, 'bandpass', hz, hz * 0.55, 6, 0.055, 0.3, a);
      decay(q.g.gain, a, 0.055, rnd(0.02, 0.055) * amount, 0.004);
    }
  }

  /* ---- LA FLOR SE ABRE ----
     El sonido más difícil de la lista, porque una flor no hace ruido. Entonces
     no se sintetiza el hecho: se sintetiza lo que el hecho SIGNIFICA. La nota
     de campo lo dice — "the scent is the tree paying insects in advance" —, así
     que esto es un pago: dos armónicos limpios con ataque lentísimo, una quinta
     abierta, apareciendo desde nada. Sin percusión, sin ataque, sin ruido. Lo
     único de toda la pieza que suena a que alguien puso algo ahí a propósito.
     Que es exactamente lo que hace la planta. */
  function evBloom() {
    const t = ctx.currentTime;
    for (const [mul, lvl, dur] of [[1, 0.055, 2.6], [1.5, 0.032, 2.2], [3, 0.016, 1.6]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 660 * mul;
      o.detune.value = rnd(-4, 4);
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(L.world);
      const s = ctx.createGain();
      s.gain.value = 0.7;
      g.connect(s).connect(verbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /* ---- LOS PÉTALOS CAEN: UN VIENTITO ----
     Una ráfaga, no una cama: sube y baja en dos segundos. Lo que la hace ráfaga
     y no "shhh" es que el filtro barre HACIA ARRIBA y vuelve — el aire que
     acelera se abre de espectro, igual que hace el viento en la copa, y la
     misma curva que engorda la copa abre el filtro en la cama del aire. */
  function evPetalFall() {
    const t = ctx.currentTime;
    const dur = 2.1;
    const src = ctx.createBufferSource();
    src.buffer = L.pink;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 0.9;
    flt.frequency.setValueAtTime(320, t);
    flt.frequency.exponentialRampToValueAtTime(1500, t + dur * 0.42);
    flt.frequency.exponentialRampToValueAtTime(280, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + dur * 0.38);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt).connect(g).connect(L.world);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s).connect(verbSend);
    src.start(t, Math.random() * L.pink.duration);
    src.stop(t + dur + 0.1);
  }

  /* ---- LA FRUTA LLEGA Y SE PLANTA ----
     Es lo único de la pieza que se mueve HACIA el espectador, así que el sonido
     tiene que acercarse: un cuerpo que sube de altura y de volumen durante un
     segundo largo, y al final se asienta. El golpe del final es blando y
     redondo — una naranja pesa y no rebota. */
  function evArrive() {
    const t = ctx.currentTime;
    const dur = 1.5;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(96, t + dur);
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + dur * 0.88);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.5);
    o.connect(g).connect(L.world);
    o.start(t);
    o.stop(t + dur + 0.6);
    /* El aire que trae adelante. Barre hacia abajo mientras el cuerpo sube:
       dos direcciones opuestas es lo que hace que algo se lea como que se
       acerca y no como que simplemente crece. */
    const v = noiseVoice(L.pink, 'bandpass', 1800, 320, 1.2, dur, 0.35, t);
    const vg = v.g.gain;
    vg.setValueAtTime(0.0008, t);
    vg.exponentialRampToValueAtTime(0.14, t + dur * 0.8);
    vg.exponentialRampToValueAtTime(0.0008, t + dur);
    /* Y el asiento. */
    body(120, 46, 0.34, 0.22, t + dur, 'sine', 0.25);
  }

  /* ---- LA CÁSCARA SE ABRE ----
     El sonido más rico de la pieza y el más agradecido de sintetizar, porque un
     desgarro es exactamente ruido filtrado con la densidad subiendo. Lo que lo
     hace sonar a fibra rompiéndose y no a un "shhh" es que la envolvente sea
     DENTADA: las mordidas programadas encima son las fibras cediendo de a una.

     Y arriba de todo va lo que hace que sea un CÍTRICO y no una caja: al
     romperse, la cáscara ESCUPE aceite esencial por las glándulas. Son chorros
     brevísimos y agudos, tres o cuatro, y sin ellos esto podría ser cualquier
     cosa que se rasga. */
  function evPeel() {
    const t = ctx.currentTime;
    const dur = 1.1;
    const v = noiseVoice(L.pink, 'bandpass', 800, 2400, 5, dur, 0.4, t);
    const g = v.g.gain;
    g.setValueAtTime(0.0008, t);
    g.exponentialRampToValueAtTime(0.20, t + 0.55);
    for (let i = 0; i < 13; i++) {
      const a = t + 0.05 + (i / 13) * (dur - 0.2);
      const lvl = 0.04 + 0.17 * (i / 13);
      g.setValueAtTime(lvl * rnd(0.35, 1), a);
      g.setValueAtTime(lvl, a + 0.012);
    }
    g.exponentialRampToValueAtTime(0.0008, t + dur);
    /* Los chisguetes de aceite. */
    for (let i = 0; i < 4; i++) {
      const a = t + rnd(0.1, dur * 0.8);
      const q = noiseVoice(L.pink, 'highpass', 4200, 6800, 0.7, 0.045, 0.45, a);
      decay(q.g.gain, a, 0.045, rnd(0.03, 0.075), 0.002);
    }
  }

  /* ---- LA FRUTA GIRA ----
     Un movimiento, y los movimientos no tienen ataque. Todo el sonido está en
     el barrido: el filtro sube y vuelve mientras la ganancia hace una campana
     completa, así que no hay ningún instante que se pueda señalar como "acá
     empezó". Que es lo que uno oye cuando algo pesado rota. */
  function evTurn() {
    const t = ctx.currentTime;
    const dur = 1.2;
    const src = ctx.createBufferSource();
    src.buffer = L.brown;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 2.2;
    flt.frequency.setValueAtTime(220, t);
    flt.frequency.exponentialRampToValueAtTime(900, t + dur * 0.5);
    flt.frequency.exponentialRampToValueAtTime(240, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt).connect(g).connect(L.world);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s).connect(verbSend);
    src.start(t, Math.random() * L.brown.duration);
    src.stop(t + dur + 0.1);
  }

  /* ---- EL ALBEDO SE RASGA ----
     Hermano del pelado, pero el albedo es ESPONJA, no fibra: más grave, más
     sordo, mordidas más blandas y más juntas. Si sonara igual que la cáscara,
     los dos movimientos serían el mismo movimiento hecho dos veces. */
  function evBare() {
    const t = ctx.currentTime;
    const dur = 1.3;
    const v = noiseVoice(L.pink, 'bandpass', 420, 1100, 2.4, dur, 0.5, t);
    const g = v.g.gain;
    g.setValueAtTime(0.0008, t);
    g.exponentialRampToValueAtTime(0.17, t + 0.6);
    for (let i = 0; i < 17; i++) {
      const a = t + 0.05 + (i / 17) * (dur - 0.2);
      const lvl = 0.05 + 0.12 * (i / 17);
      g.setValueAtTime(lvl * rnd(0.6, 1), a);
      g.setValueAtTime(lvl, a + 0.02);
    }
    g.exponentialRampToValueAtTime(0.0008, t + dur);
  }

  /* ---- LOS GAJOS SE DESPLIEGAN ----
     Diez carpelos separándose, y por eso son DIEZ sonidos y no uno. Cada uno es
     un micro-desgarro húmedo, y van subiendo de altura a medida que se abren —
     lo que queda por separar es cada vez menos, y menos material suena más
     agudo. Es el sonido de abrir una naranja con las manos, que cualquiera
     reconoce sin poder decir por qué. */
  function evFan() {
    const t = ctx.currentTime;
    for (let i = 0; i < 10; i++) {
      const a = when(t + (i / 10) * 1.15 + rnd(-0.02, 0.02));
      const hz = 900 * Math.pow(1.09, i);
      const v = noiseVoice(L.pink, 'bandpass', hz, hz * 1.5, 7, 0.14, 0.45, a);
      const g = v.g.gain;
      g.setValueAtTime(0.0008, a);
      g.exponentialRampToValueAtTime(rnd(0.05, 0.09), a + 0.02);
      /* Dos mordidas por gajo: un tabique cede en dos tiempos, no en uno. */
      g.setValueAtTime(0.03, a + 0.05);
      g.exponentialRampToValueAtTime(0.0008, a + 0.14);
    }
  }

  /* ---- UN PÁJARO ----
     Lo que hace que un silbido suene a pájaro y no a un theremín es que la
     altura NO SE QUEDA QUIETA en ningún momento: cada sílaba es un glissando
     corto, y las sílabas van encadenadas sin silencio adentro. Una nota plana,
     aunque tenga vibrato, suena a máquina.

     Va altísimo —dos a cinco kilohercios— porque ahí es donde canta un pájaro
     chico, y es justo la banda donde ni las camas ni el piano tienen nada. Se
     mete solo en el hueco que dejaron los otros, sin pelear con nadie. */
  function evBird(at) {
    const t = when(at);
    const n = 2 + ((Math.random() * 3) | 0);
    const base = rnd(2100, 3400);
    let a = t;
    for (let i = 0; i < n; i++) {
      const dur = rnd(0.07, 0.16);
      const f0 = base * rnd(0.86, 1.18);
      /* Sube o baja, pero nunca se queda: es lo único que importa. */
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

  /* ---- LA SEMILLA SE SUELTA ----
     El último sonido de la vuelta, y por eso el más difícil de acertar: si
     suena a final, la pieza termina, y la pieza NO termina — esa semilla es la
     que va a estar cayendo en el primer cuadro de la vuelta siguiente. Así que
     tiene que sonar a que algo se desprende y queda disponible: limpio, corto,
     agudo, con cola larga y nada de peso.

     Y la altura es LA TÓNICA, la misma de la que sale toda la armonía. Es lo
     único de la pieza que se permite un guiño: la semilla suena la nota con la
     que la música va a volver a empezar. */
  function evRelease() {
    const t = ctx.currentTime;
    /* El desprendimiento: húmedo y brevísimo. */
    const v = noiseVoice(L.pink, 'bandpass', 2400, 3600, 8, 0.07, 0.4, t);
    decay(v.g.gain, t, 0.07, 0.11, 0.003);
    /* Y la nota. Dos parciales nada más: esto no es un instrumento, es una
       campanita. */
    for (const [mul, lvl, dur] of [[8, 0.075, 2.8], [16.05, 0.022, 1.4]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = TONIC * mul;
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(L.world);
      const s = ctx.createGain();
      s.gain.value = 0.75;
      g.connect(s).connect(verbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
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

  /* ============ qué dispara cada hecho ============
     Un golpe suena cuando una señal del motor CRUZA un umbral hacia arriba. No
     cuando está por encima: cuando lo cruza. La diferencia es todo, porque el
     lector puede quedarse parado justo en el borde con el temblor del trackpad
     y sin la distinción eso dispararía veinte veces por segundo.

     Ninguno de estos umbrales inventa un momento. Casi todos leen una rampa que
     el motor ya usa para dibujar: `enter` es la fruta llegando, `peel` la
     cáscara abriéndose, `fan` los carpelos separándose. El sonido y el dibujo
     no pueden desincronizarse porque son el mismo número. */
  const HITS = [
    /* La caída de la semilla ocupa el primer 0.05 del ciclo, así que el
       impacto va al final de ese tramo y no al principio. */
    { key: 'fall',    read: (p, s) => p,       thr: 0.047, fire: evSeedFall },
    { key: 'split',   read: (p, s) => p,       thr: 0.062, fire: evSeedSplit },
    /* La flor: apenas abre, no cuando está abierta del todo. */
    { key: 'bloom',   read: (p, s) => s.bloom, thr: 0.08,  fire: evBloom },
    /* Y los pétalos caen cuando `bloom` ya viene cayendo — por eso éste lee `p`
       directo: es el único que ocurre en la BAJADA de una curva, y detectarlo
       como cruce hacia arriba de la curva invertida sería más difícil de leer
       que poner el número. */
    { key: 'petals',  read: (p, s) => p,       thr: 0.612, fire: evPetalFall },
    /* Apenas arranca la llegada: el sonido tiene que acompañar el movimiento
       entero, no anunciarlo cuando ya terminó. */
    { key: 'arrive',  read: (p, s) => s.enter, thr: 0.02,  fire: evArrive },
    { key: 'peel',    read: (p, s) => s.peel,  thr: 0.04,  fire: evPeel },
    { key: 'turn',    read: (p, s) => s.turn,  thr: 0.04,  fire: evTurn },
    { key: 'bare',    read: (p, s) => s.bare,  thr: 0.04,  fire: evBare },
    { key: 'fan',     read: (p, s) => s.fan,   thr: 0.03,  fire: evFan },
    { key: 'release', read: (p, s) => s.rel,   thr: 0.04,  fire: evRelease },
  ];

  /* LOS FLUSH. `SHOOT` no es una rampa: son escalones, porque el cítrico se
     construye en pulsos —crece la raíz o crece el brote, nunca los dos a la
     vez— y cada escalón es un brote nuevo con su madera y sus hojas.

     Estos umbrales son las mesetas de esa curva. No están elegidos a ojo: son
     los valores donde `SHOOT` se planta antes de dar el próximo salto. */
  const FLUSH = [0.05, 0.10, 0.22, 0.34, 0.47, 0.60, 0.72, 0.84];

  /* Cuánto tiene que bajar una señal por debajo del umbral para volver a
     armarse. Es la histéresis, y sin ella el borde se vuelve un tartamudeo. */
  const ARM = 0.012;

  function rearm(p, sig) {
    for (const e of HITS) armed[e.key] = e.read(p, sig) < e.thr;
    for (let i = 0; i < FLUSH.length; i++) armed['fl' + i] = sig.shoot < FLUSH[i];
  }

  function fireEvents(p, sig) {
    /* Dos cosas que NO son un recorrido y no tienen que disparar nada: el
       pliegue del bucle, que manda `pe` de 0.95 a 0 de un frame al otro, y un
       salto de scroll grande. Un salto de más de medio ciclo no es alguien
       recorriendo la pieza, es un corte — y disparar diez sonidos juntos al
       aterrizar sería la peor forma posible de llegar a ningún lado. */
    if (pPrev < 0 || Math.abs(p - pPrev) > 0.5) {
      pPrev = p;
      rearm(p, sig);
      return;
    }

    for (const e of HITS) {
      const v = e.read(p, sig);
      if (!armed[e.key]) { if (v < e.thr - ARM) armed[e.key] = true; continue; }
      if (v >= e.thr) { armed[e.key] = false; e.fire(); }
    }

    /* Cada flush: primero la madera, y el follaje DESPUÉS. Ese medio segundo de
       distancia no es un adorno rítmico — es el orden en que ocurre. Primero
       hay rama, después hay hoja; una hoja no se abre en el aire. */
    for (let i = 0; i < FLUSH.length; i++) {
      const k = 'fl' + i;
      if (!armed[k]) { if (sig.shoot < FLUSH[i] - ARM) armed[k] = true; continue; }
      if (sig.shoot >= FLUSH[i]) {
        armed[k] = false;
        const at = ctx.currentTime;
        evBranch(i / FLUSH.length, at);
        /* Los primeros flush casi no tienen hojas y los últimos son una copa
           entera: el follaje crece con el árbol, como corresponde. */
        evFoliage(0.35 + 0.65 * (i / (FLUSH.length - 1)), at + rnd(0.35, 0.6));
      }
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

    /* ---- LAS DOS FRICCIONES ----
       Lo único de la pieza que suena mientras algo se MUEVE, y no cuando algo
       ocurre. La raíz y el brote no hacen un ruido al empezar: hacen ruido
       mientras avanzan, y se callan cuando se detienen.

       Y lo que manda no es cuánto creció sino CUÁN RÁPIDO está creciendo — la
       derivada, no el valor. Con el valor, un árbol grande sonaría fuerte para
       siempre; con la derivada, el sonido existe sólo mientras hay movimiento,
       que es lo que hace la fricción de verdad.

       De acá sale gratis algo que vale la pena mirar: como el motor alterna los
       dos flujos —el cítrico crece de raíz o de brote, nunca los dos a la vez—
       las dos capas se van turnando solas. Nadie lo programó. Está en la forma
       de las curvas, y el sonido simplemente lo delata.

       El suavizado es fuerte (0.09) porque la derivada por frame es ruidosa: sin
       filtrar, cualquier tirón del trackpad sería un golpe de ruido. */
    const dRoot = Math.abs(sig.root - rootPrev);
    const dShoot = Math.abs(sig.shoot - shootPrev);
    rootPrev = sig.root;
    shootPrev = sig.shoot;
    /* El pliegue del bucle manda las señales de 1 a 0 de un frame al otro. Eso
       es un salto, no un crecimiento, y sin este descarte sonaría como si el
       árbol entero creciera de golpe justo en la costura. */
    if (dRoot < 0.02) rootVel += (dRoot - rootVel) * 0.09;
    if (dShoot < 0.02) shootVel += (dShoot - shootVel) * 0.09;

    L.dig.g.gain.setTargetAtTime(clamp(rootVel * 320) * 0.16, t, 0.10);
    L.rise.g.gain.setTargetAtTime(clamp(shootVel * 320) * 0.10, t, 0.10);
    /* El brote se abre de espectro a medida que sube: fibra tierna abajo,
       madera arriba. Es el mismo criterio que abre el filtro del viento con el
       tamaño de la copa. */
    L.rise.flt.frequency.setTargetAtTime(420 + 760 * sig.shoot, t, 0.25);

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
    for (const n of [L.earth, L.air, L.bugs, L.night, L.dig, L.rise]) { try { n.src.stop(); } catch {} }
    for (const o of [L.chirp, L.drift]) { try { o.stop(); } catch {} }
    /* Las catorce cuerdas del pedal no tienen final propio: se encienden al
       construir y suenan hasta acá. */
    for (const v of L.pad) { try { v.o.stop(); } catch {} }
    ctx.close().catch(() => {});
    built = false;
  }

  return { tick, enter, setMuted, destroy, get entered() { return entered; }, get muted() { return muted; } };
}
