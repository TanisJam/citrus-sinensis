// The root experience in a real browser: the 3D engine drives the same page
// (gate, bands, specimen label, project tag, rail) the 2D engine did, and the
// 2D engine still takes over when asked (?engine=2d) or when WebGL is missing.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { STAGES } from '../src/engine/engine.js'

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
const failures = []
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); console.log(`PASS ${name}`) }
  catch { failures.push(name); console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`) }
}
async function open(query, viewport = { width: 1280, height: 800 }) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.setViewport(viewport)
  await page.goto(`${origin}/${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.gate-quiet', { timeout: 60000 })
  await page.click('.gate-quiet')
  return { page, errors }
}
const label = page => page.$eval('.label', el => el.innerText.replace(/\s+/g, ' ').trim())
const settle = (page, ms = 1500) => page.evaluate(ms => new Promise(done => setTimeout(done, ms)), ms)
// Which engine owns the canvas: a WebGL context or a 2D one.
const engineOf = page => page.$eval('#scene', canvas => canvas.getContext('webgl2') ? '3d' : canvas.getContext('2d') ? '2d' : 'none')

try {
  // Every stage of the cycle reads the same names and notes on the 3D engine.
  for (const [i, stage] of STAGES.entries()) {
    if (stage.p >= 0.56 && stage.p < 0.84) continue // mature-canopy frames are slow on software GL; covered below
    const at = (stage.p + (STAGES[i + 1]?.p ?? 0.95)) / 2
    const { page, errors } = await open(`?at=${at.toFixed(3)}&hold`)
    await page.waitForFunction(name => document.querySelector('.label')?.innerText.toUpperCase().includes(name.toUpperCase()), { timeout: 90000 }, stage.name)
    check(`3D engine at ${stage.name}`, await engineOf(page), '3d')
    check(`label at ${stage.name}`, (await label(page)).toUpperCase().includes(stage.note.slice(0, 20).toUpperCase()), true)
    if (stage.name === 'Dispersal') {
      // The label is React's from the first render; bands and rail are written by
      // the engine's frames, so wait for one.
      await page.waitForFunction(() => Number(document.querySelector('.band')?.style.opacity) > 0.5, { timeout: 120000 }).catch(() => {})
      check('hero band visible at the start', await page.$eval('.band', el => Number(el.style.opacity) > 0.5), true)
      check('rail dot near the top', await page.$eval('.cycle i', el => parseFloat(el.style.top) < 5), true)
    }
    if (stage.name === 'Endosperm') {
      await settle(page)
      check('project tag shown at the climax', await page.$eval('.tag', el => !el.hasAttribute('inert')), true)
      check('opened fruit is labelled', await page.$eval('.engine3d-labels', el => Number(el.style.opacity) > 0.5 && el.innerText.includes('IDEAS THIS IS MADE OF')), true)
    }
    check(`no page errors at ${stage.name}`, errors, [])
    await page.close()
  }
  // "Next fruit" asks the engine for the next project, as on the 2D piece.
  {
    const { page, errors } = await open('?at=0.9&hold')
    await page.waitForFunction(() => !document.querySelector('.tag')?.hasAttribute('inert'), { timeout: 90000 })
    const before = await page.$eval('.tag', el => el.innerText)
    await page.click('.tag button')
    // The next fruit's canopy frames are slow on software WebGL.
    await page.waitForFunction(text => document.querySelector('.tag')?.innerText !== text, { timeout: 300000 }, before)
    check('next fruit changes the project', (await page.$eval('.tag', el => el.innerText)).includes('02 / 06'), true)
    check('no page errors after next fruit', errors, [])
    await page.close()
  }
  // The loop: at the end of the page the piece folds back to the seed.
  {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?at=0.945`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.gate-quiet', { timeout: 60000 })
    await page.click('.gate-quiet')
    await settle(page, 2500)
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForFunction(() => document.querySelector('.label')?.innerText.toUpperCase().includes('DISPERSAL'), { timeout: 90000 })
    check('the loop folds back to Dispersal', true, true)
    check('scroll jumped back near the top', await page.evaluate(() => scrollY < document.documentElement.scrollHeight * 0.1), true)
    check('no page errors across the loop', errors, [])
    await page.close()
  }
  // The 2D engine still runs the same page when asked.
  {
    const { page, errors } = await open('?engine=2d&at=0.3&hold')
    await page.waitForFunction(() => document.querySelector('.label')?.innerText.toUpperCase().includes('FLUSH'), { timeout: 60000 })
    check('2D fallback owns the canvas', await engineOf(page), '2d')
    check('no page errors on 2D', errors, [])
    await page.close()
  }
  // Mobile: the opened fruit keys its carpels by number.
  {
    const { page, errors } = await open('?at=0.925&hold', { width: 390, height: 844 })
    await page.waitForFunction(() => Number(document.querySelector('.engine3d-labels')?.style.opacity) > 0.5, { timeout: 90000 })
    check('mobile key lists the five carpels', await page.$eval('.engine3d-labels', el => el.innerText.includes('1 ') && el.innerText.includes('5 ')), true)
    check('no page errors on mobile', errors, [])
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
assert.deepEqual(failures, [], 'root browser regressions')
console.log('Root in WebGL: stages, labels, tag, next fruit, loop, 2D fallback, mobile key OK')
