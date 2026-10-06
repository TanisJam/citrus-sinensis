// Actual-WebGL proof of the growth route. Starts its own Vite server; needs a
// local Chromium (CHROME_PATH overrides). Screenshots stay in memory as hashes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'

const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? [
    '/home/tanisjam/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].find(existsSync),
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const titles = ['Semilla', 'Raíces', 'Brote', 'Tronco', 'Ramas', 'Copa', 'Flores', 'Naranjas']
const failures = []
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); console.log(`PASS ${name}`) }
  catch { failures.push(name); console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`) }
}

async function open(viewport, reduced = false) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.setViewport(viewport)
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  // Observe GPU resource counts without adding production debug globals.
  await page.setRequestInterception(true)
  page.on('request', async request => {
    if (!request.url().includes('/src/lab/scene.js')) return request.continue()
    const source = await (await fetch(request.url())).text()
    const observed = source.replaceAll('renderer.render(scene, camera)', `
      window.__labMemory = { ...renderer.info.memory };
      renderer.render(scene, camera)`)
    await request.respond({ status: 200, contentType: 'application/javascript', body: observed })
  })
  await page.goto(`${origin}/lab/tree-3d`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('.tree-lab-status')?.textContent.includes('listo'), { timeout: 60000 })
  return { page, errors }
}
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
async function frame(page) {
  await settle(page)
  return createHash('sha1').update(await (await page.$('#tree-lab-canvas')).screenshot()).digest('hex')
}
const click = (page, text) => page.evaluate(label => [...document.querySelectorAll('.tree-lab button')].find(button => button.textContent.startsWith(label)).click(), text)
const pressed = page => page.$eval('[aria-label="Etapas del recorrido"] [aria-pressed="true"]', button => button.textContent)
const read = (page, script) => page.evaluate(script)

try {
  const isolated = await browser.newPage()
  const requests = []
  isolated.on('request', request => requests.push(request.url()))
  await isolated.goto(`${origin}/`, { waitUntil: 'load' })
  await new Promise(done => setTimeout(done, 1000))
  check('root loads no lab or Three.js modules', requests.some(url => /\/src\/lab\/|\/lab-assets\/|\/three[/.]/.test(url)), false)
  await isolated.close()

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 390, height: 600 }]) {
    const label = `${viewport.width}x${viewport.height}`
    const { page, errors } = await open(viewport)
    check(`starts as a seed at the top ${label}`, [await pressed(page), await read(page, () => scrollY)], ['Semilla', 0])
    await click(page, 'Viento') // static leaves make every frame comparable
    const memory = await read(page, () => window.__labMemory)
    const forward = []
    for (const title of titles) {
      await click(page, title)
      forward.push(await frame(page))
      check(`anchor ${title} ${label}`, await pressed(page), title)
    }
    check(`distinct growth frames ${label}`, new Set(forward).size, titles.length)
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    check(`page end is fully grown ${label}`, [await frame(page), await pressed(page)], [forward.at(-1), 'Naranjas'])
    const backward = []
    for (const title of [...titles].reverse()) { await click(page, title); backward.unshift(await frame(page)) }
    check(`stage buttons rewind exactly ${label}`, backward, forward)
    // Native scroll between anchors: going past and coming back is the same frame.
    const middle = await read(page, () => Math.round((document.documentElement.scrollHeight - innerHeight) * 0.47))
    await page.evaluate(y => scrollTo(0, y), middle)
    const between = await frame(page)
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    await frame(page)
    await page.evaluate(y => scrollTo(0, y), middle)
    check(`scroll reversal is exact ${label}`, await frame(page), between)
    check(`intermediate frame is not an anchor ${label}`, forward.includes(between), false)
    check(`narrative keeps native touch scrolling ${label}`, await page.$eval('#tree-lab-canvas', canvas => canvas.style.touchAction), 'auto')

    await click(page, 'Explorar')
    check(`explore owns touch gestures ${label}`, await page.$eval('#tree-lab-canvas', canvas => canvas.style.touchAction), 'none')
    // Explore widens the far plane, so compare against its own first frame.
    const frozen = await frame(page)
    await page.evaluate(() => scrollBy(0, 600))
    check(`explore freezes growth and pose under scroll ${label}`, await frame(page), frozen)
    await page.focus('#tree-lab-canvas')
    await page.keyboard.press('ArrowLeft')
    const turned = await frame(page)
    check(`explore arrow keys orbit ${label}`, turned !== frozen, true)
    await page.keyboard.press('-')
    check(`explore zoom key ${label}`, (await frame(page)) !== turned, true)
    await page.setViewport({ ...viewport, height: viewport.height - 1 })
    await page.setViewport(viewport)
    await settle(page)
    await click(page, 'Recorrido')
    await page.evaluate(y => scrollTo(0, y), middle)
    check(`returning to the tour follows the page again ${label}`, await frame(page), between)
    check(`GPU resources stay fixed while growing ${label}`, await read(page, () => window.__labMemory), memory)
    check(`no page errors ${label}`, errors, [])
    await page.close()
  }

  const { page, errors } = await open({ width: 1440, height: 900 }, true)
  check('reduced motion starts without wind', await read(page, () => [...document.querySelectorAll('button')].some(button => button.textContent === 'Viento: desactivado')), true)
  const still = await frame(page)
  await page.evaluate(() => scrollBy(0, 1500))
  check('reduced motion: scrolling does not animate growth', [await frame(page), await pressed(page)], [still, 'Semilla'])
  // Element screenshots may nudge the viewport, so compare around the click itself.
  const before = await read(page, () => scrollY)
  await click(page, 'Ramas')
  check('reduced motion: stage buttons change growth in place', [await pressed(page), await read(page, () => scrollY), (await frame(page)) !== still], ['Ramas', before, true])
  check('reduced motion: no page errors', errors, [])
  await page.close()
} finally {
  await browser.close()
  await server.close()
}
assert.deepEqual(failures, [], 'growth browser regressions')
console.log('Growth route in WebGL: anchors / reversal / explore / reduced motion / mobile / resources / root isolation OK')
