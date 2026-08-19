/* Genera la tarjeta social — `public/og.jpg`.
 *
 * LA TARJETA SE RENDERIZA CON LA PIEZA, no se dibuja aparte. El fondo es un
 * cuadro REAL del canvas en p=0.78: viraje de color, de noche, con el árbol
 * cargado y la raíz a la vista. Ese cuadro dice de una sola vez lo que la pieza
 * tarda un recorrido en contar —semilla, árbol, fruta— y deja el tercio
 * izquierdo en cielo limpio, que es donde entra el texto.
 *
 * Y el texto se inyecta como DOM y se fotografía JUNTO con el canvas, en vez de
 * dibujarse a mano sobre la imagen. Así usa las mismas fuentes que ya cargó la
 * página —Fraunces, Source Serif, IBM Plex Mono— y no una aproximación que se
 * desalinea la primera vez que alguien toca la tipografía de la pieza.
 *
 * El costo de esto es que necesita la pieza CORRIENDO:
 *
 *     pnpm dev                      # en otra terminal
 *     pnpm og                       # usa http://localhost:5173
 *     pnpm og http://localhost:5174 # o el puerto que haya tocado
 *
 * Hay que volver a correrlo cuando cambie el nombre, el subtítulo o el dibujo.
 * Es manual a propósito: son treinta segundos que se pagan una vez por cambio,
 * contra montar un navegador en cada `build`.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEST = resolve(HERE, '../public/og.jpg')
const BASE = process.argv[2] || 'http://localhost:5173'

/* El punto del ciclo. No es arbitrario: 0.78 es "Colour break" y es el único
   cuadro donde se ven las tres cosas a la vez —fruta madura, copa entera,
   raíz—. Antes de ahí la fruta está verde; después, la cámara se mete adentro
   de una sola fruta y se pierde el árbol. */
const AT = 0.78

/* Chrome no viene con `puppeteer-core`: hay que decirle cuál usar. Se puede
   pisar con CHROME_PATH para no depender de dónde lo dejó el caché. */
const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  `${process.env.HOME}/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
].find(p => existsSync(p))

if (!CHROME) {
  console.error('No encuentro Chrome. Pasalo con CHROME_PATH=/ruta/al/chrome pnpm og')
  process.exit(1)
}

mkdirSync(dirname(DEST), { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()

/* 1200x630 es la relación que piden Open Graph y Twitter; `deviceScaleFactor:2`
   la saca a 2400x1260 para que no se vea blanda en pantallas densas. Los
   consumidores la reescalan solos. */
page.setDefaultTimeout(15000)
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 })

try {
  await page.goto(`${BASE}/?at=${AT}&hold`, { waitUntil: 'networkidle0' })
} catch {
  console.error(`No pude abrir ${BASE}. ¿Está corriendo \`pnpm dev\`?`)
  await browser.close()
  process.exit(1)
}

/* La puerta bloquea el scroll y tapa la pieza, así que hay que entrar. En
   silencio: la tarjeta no necesita audio y un AudioContext de más sólo demora. */
await page.waitForSelector('.gate-quiet')
await page.click('.gate-quiet')
/* `p` persigue al scroll con amortiguación y `?at=` lo fija, pero el árbol se
   construye y se asienta igual: llegar no es estar. */
await new Promise(r => setTimeout(r, 2500))

await page.evaluate(() => {
  /* Fuera la interfaz. La tarjeta es el dibujo más el título, nada más — y
     `#grain` se va también porque el ruido es lo peor que le puede pasar a un
     JPEG. */
  for (const s of ['.band', '.label', '.nav', '.brand', '.cycle', '.hint', '.snd', '#grain'])
    document.querySelectorAll(s).forEach(el => (el.style.display = 'none'))

  const og = document.createElement('div')
  og.innerHTML = `
    <div class="og-scrim"></div>
    <div class="og-text">
      <p class="og-kicker">Citrus &times; sinensis</p>
      <h1 class="og-name">Mauricio<br>Romero</h1>
      <p class="og-tag">Software, writing, and the systems behind it &mdash;<br>grown from one seed, in one loop.</p>
      <p class="og-url">mnr.ar</p>
    </div>`
  document.body.appendChild(og)

  const css = document.createElement('style')
  css.textContent = `
    /* Velo suave a la izquierda. El cielo de noche ya es oscuro, pero el cuadro
       cambia con la hora del ciclo y la legibilidad del nombre no puede quedar
       colgando de eso. */
    .og-scrim{position:fixed;inset:0;z-index:99;
      background:linear-gradient(100deg,
        rgba(9,11,20,.80) 0%,
        rgba(9,11,20,.62) 26%,
        rgba(9,11,20,.20) 46%,
        rgba(9,11,20,0) 62%)}
    .og-text{position:fixed;left:76px;top:0;height:100%;width:520px;z-index:100;
      display:flex;flex-direction:column;justify-content:center;color:#F4EFE6}
    .og-kicker{margin:0 0 20px;font-family:"IBM Plex Mono",monospace;
      font-weight:500;font-size:14px;letter-spacing:.26em;text-transform:uppercase;
      color:#E9A03C}
    .og-name{margin:0;font-family:"Fraunces",Georgia,serif;font-weight:600;
      font-size:88px;line-height:.94;letter-spacing:-.015em;
      font-variation-settings:"opsz" 144,"SOFT" 0}
    .og-tag{margin:26px 0 0;font-family:"Source Serif 4",Georgia,serif;
      font-style:italic;font-size:23px;line-height:1.48;color:#DCD5C6}
    .og-url{margin:38px 0 0;font-family:"IBM Plex Mono",monospace;
      font-weight:600;font-size:15px;letter-spacing:.22em;text-transform:uppercase;
      color:#F4EFE6;opacity:.9}`
  document.head.appendChild(css)
})

/* Sin esto la foto puede salir con la fuente de respaldo: las webfonts cargan
   por su cuenta y el nodo ya está en el DOM antes de que terminen. */
await page.evaluate(() => document.fonts.ready)
await new Promise(r => setTimeout(r, 400))

/* JPEG y no PNG. El cuadro es un degradé fotográfico de punta a punta —cielo,
   tierra, follaje— que es el peor caso para la compresión sin pérdida: en PNG
   pesaba 1.6 MB. A calidad 88 baja a ~200 KB sin diferencia visible, y el peso
   importa porque esto lo busca un crawler con paciencia corta. */
await page.screenshot({ path: DEST, type: 'jpeg', quality: 88 })
await browser.close()
console.log('og.jpg escrita en public/ — 2400x1260, desde p=' + AT)
