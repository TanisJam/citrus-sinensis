/* Carga el motor para los tests.
 *
 * Los cinco tests corrian sobre `c4.js` — el <script> recortado de ciclo.html
 * con una expresion regular. Ahora el motor es un modulo de la app React, y
 * este archivo es lo unico que hubo que agregar para que sigan valiendo: la
 * pieza cambio de casa, el invariante que verifican no.
 *
 * Dos detalles que no son adorno:
 *
 *   - `export` solo existe en el tope de un modulo ESM y los tests corren en
 *     CommonJS, asi que se quita. Es un reemplazo de texto y no toca una sola
 *     linea de logica.
 *   - `new Function` en vez de `eval`: el cuerpo se evalua contra el objeto
 *     global, que es exactamente donde los tests ponen sus dobles de
 *     `document`, `performance`, `requestAnimationFrame` y compania. Con `eval`
 *     directo, el motor tambien veria las variables locales del test — y una
 *     colision de nombres se leeria como un bug de la pieza.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src/engine/engine.js');

function loadEngine() {
  const src = fs.readFileSync(SRC, 'utf8').replace(/^export /gm, '');
  return new Function(src + '\nreturn createEngine;')();
}

/* El catalogo del motor: `IDEAS` y `PROJECTS`, que viven a nivel de modulo y no
   dentro de la fabrica. Los necesita el test del final, que verifica que la
   idea que se lleva cada vuelta sea la primera semilla del gajo que se abrio —
   y para eso tiene que poder mirar el catalogo REAL, no una copia escrita a
   mano que un dia divergiria en silencio y dejaria de probar nada. */
function meta() {
  const src = fs.readFileSync(SRC, 'utf8').replace(/^export /gm, '');
  return new Function(src + '\nreturn {IDEAS, PROJECTS, STAGES};')();
}

/* Las mismas SIETE bandas que declara `src/content/bands.jsx`. Se repiten aca a
   proposito: si los rangos de la pieza cambian, los tests tienen que fallar y
   obligar a mirarlos, no seguirlos en silencio.

   OJO — hoy esa promesa no se cumple: los cinco tests no importan esta
   constante, cada uno lleva su propia copia literal de los rangos. Ninguno
   afirma nada sobre las bandas (verifican fisica del motor: barrido, viento,
   identidad del bucle, ramificacion), asi que pasan con seis o con siete. Es
   duplicacion sin dueno, y se arregla haciendo que los tests importen de aca. */
const BAND_RANGES = [
  [0, 0.048], [0.085, 0.165], [0.195, 0.262],
  [0.315, 0.400], [0.440, 0.510], [0.560, 0.622],
  [0.636, 0.678],
];

module.exports = { loadEngine, meta, BAND_RANGES };
