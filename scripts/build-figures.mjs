/* Genera las figuras del post — capturas REALES de la pieza.
 *
 * Misma decision que `build-og.mjs`, por la misma razon: el post afirma que la
 * pieza no tiene ni una sola imagen, asi que ilustrarlo con dibujos de afuera
 * seria desmentirlo en su propia pagina. Cada figura es un cuadro del canvas en
 * un `p` exacto, sacado con `?at=&hold`, que es la misma herramienta de taller
 * que se usa para revisar el climax cuadro por cuadro.
 *
 * Escribe FUERA de este repo, en el sitio de contenido, porque la pieza y el
 * blog son dos proyectos separados y las figuras son del post, no de la pieza.
 *
 *     pnpm dev                                    # en otra terminal
 *     pnpm figures                                # usa localhost:5173 y la ruta por defecto
 *     pnpm figures http://localhost:5175 /otra/ruta
 *
 * Manual a proposito, igual que la tarjeta social: hay que volver a correrlo
 * cuando cambie el dibujo, o las figuras quedan mostrando una pieza que ya no
 * existe.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:5173'
const DEST = resolve(process.argv[3] || '../portfolio-v3/public/assets/posts/citrus')

/* Los momentos. Cada uno esta anclado a una etapa de STAGES y a un pasaje del
   post: la figura ilustra algo que el texto afirma, no decora el scroll.
 *
 * Y los `at` NO estan elegidos a ojo. El cielo cicla ocho noches sobre el
 * recorrido, asi que la mitad de las etapas cae de noche y sale ilegible sobre
 * papel. Se midio la luma media del canvas cada 0.02 y se corrio cada figura al
 * pico de luz mas cercano a su etapa. Por eso `bloom` es 0.600 y no la antesis
 * exacta en 0.560: ahi la escena esta a 48 de luma y aca a 152. */
const FIGURES = [
  { file: 'seed',        at: 0.060, of: 'Toca tierra y arranca. Sin pausa: la semilla es recalcitrante.' },
  { file: 'roots',       at: 0.280, of: 'La raiz sigue el agua — el trazo que se dibujaba con lineTo recto.' },
  { file: 'flush',       at: 0.380, of: 'Juvenil y espinoso. Los pulsos alternados de raiz y brote.' },
  { file: 'canopy',      at: 0.500, of: 'La copa que estaba hueca hasta que aparecieron los brotes interiores.' },
  { file: 'bloom',       at: 0.600, of: 'Antesis. La camara entra: acercar no agrega dibujo, destapa el que ya estaba.' },
  { file: 'calyx',       at: 0.680, of: 'Despues de la caida quedan las estrellitas verdes del caliz.' },
  { file: 'colour',      at: 0.760, of: 'El color avanza una noche fria por vez, no con el scroll.' },
  { file: 'peel',        at: 0.856, of: 'La linea de pelado: debajo pegada a la esfera, arriba por la tangente.' },
  { file: 'carpels',     at: 0.930, of: 'Los gajos con nombre. La metafora, hecha dibujo.' },
  /* El par del bucle. Estos dos TIENEN que salir iguales: es lo que el test de
     identidad ya prueba, ahora mirable. No salen byte a byte identicos porque
     el viento corre contra el reloj y la captura no congela el tiempo — el test
     si lo congela, y por eso el test es la prueba y esto es la ilustracion.
   *
   * Y van al FINAL de la zona espejada (0.048 / 0.998) y no al principio. En
   * 0.03 la camara esta casi toda en cielo vacio: los dos cuadros salen iguales
   * y no se ve, porque no hay nada que comparar. La afirmacion necesita dibujo
   * adentro para poder leerse. */
  { file: 'loop-end',    at: 0.998, of: 'El final del recorrido.' },
  { file: 'loop-start',  at: 0.048, of: 'El principio. Es el mismo cuadro.' },
]

const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
].find(p => existsSync(p))

if (!CHROME) {
  console.error('No encuentro Chrome. Pasalo con CHROME_PATH=/ruta/al/chrome pnpm figures')
  process.exit(1)
}

mkdirSync(DEST, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--autoplay-policy=no-user-gesture-required'],
})

/* La columna del post mide 68ch — unos 700px. A escala 2 eso son 1400, asi que
   900x563 a escala 2 (1800x1126) ya sobra y 2000 era peso de mas. La calidad
   baja a 78 por el mismo motivo: el peor caso son las figuras de dia, donde la
   copa entera es detalle de alta frecuencia y el JPEG se dispara. */
for (const fig of FIGURES) {
  const page = await browser.newPage()
  page.setDefaultTimeout(20000)
  await page.setViewport({ width: 900, height: 563, deviceScaleFactor: 2 })

  try {
    await page.goto(`${BASE}/?at=${fig.at}&hold`, { waitUntil: 'networkidle0' })
  } catch {
    console.error(`No pude abrir ${BASE}. ¿Está corriendo \`pnpm dev\`?`)
    await browser.close()
    process.exit(1)
  }

  /* La puerta tapa la pieza y bloquea el scroll. En silencio: una figura no
     necesita audio y un AudioContext de mas solo demora. */
  await page.waitForSelector('.gate-quiet')
  await page.click('.gate-quiet')
  /* `?at=` fija la posicion, pero el arbol se construye y se asienta igual.
     Llegar no es estar. */
  await new Promise(r => setTimeout(r, 2600))

  await page.evaluate(() => {
    /* Fuera la interfaz: la figura es el dibujo. `#grain` se va porque el ruido
       es lo peor que le puede pasar a un JPEG. */
    for (const s of ['.band', '.label', '.nav', '.brand', '.cycle', '.hint', '.snd', '#grain'])
      document.querySelectorAll(s).forEach(el => (el.style.display = 'none'))
  })
  await new Promise(r => setTimeout(r, 500))

  await page.screenshot({ path: `${DEST}/${fig.file}.jpg`, type: 'jpeg', quality: 78 })
  console.log(`${fig.file}.jpg`.padEnd(20), `p=${fig.at}`.padEnd(10), fig.of)
  await page.close()
}

await browser.close()
console.log(`\n${FIGURES.length} figuras en ${DEST}`)
