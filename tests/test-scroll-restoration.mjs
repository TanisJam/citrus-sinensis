// Explicit browser regression: start Vite on 127.0.0.1:5177 before running.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const origin = 'http://127.0.0.1:5177'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const browser = await puppeteer.launch({
  // CHROME_PATH overrides; otherwise the first locally installed Chromium.
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
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.tree-lab-status')?.textContent.includes('listo'), { timeout: 60000 })
  await sleep(200)
}
async function state(page) {
  return page.evaluate(() => ({
    y: scrollY,
    stage: document.querySelector('[aria-label="Etapas del recorrido"] [aria-pressed="true"]')?.textContent,
    first: window.__firstPose,
    latest: window.__latestPose,
    persisted: window.__persisted,
    history: history.state,
    height: document.documentElement.scrollHeight,
  }))
}
try {
  for (const delay of [0, 1200]) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluateOnNewDocument(() => {
      addEventListener('pageshow', event => { window.__persisted = event.persisted })
    })
    const requests = []
    await page.setRequestInterception(true)
    page.on('request', async request => {
      const url = request.url()
      requests.push(url)
      if (url.includes('/src/lab/TreeLab.jsx')) await sleep(delay)
      // Observe actual first render camera without changing production modules.
      if (url.includes('/src/lab/scene.js')) {
        const response = await fetch(url)
        const source = await response.text()
        const observed = source.replaceAll('renderer.render(scene, camera)', `
          window.__latestPose = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() };
          window.__firstPose ??= window.__latestPose;
          renderer.render(scene, camera)`)
        await request.respond({ status: 200, contentType: 'application/javascript', body: observed })
      } else await request.continue()
    })
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await sleep(1500)
    check(`root network isolation (${delay})`, requests.some(url => /\/src\/lab\/(TreeLab|scene|lab\.css)|\/lab-assets\//.test(url)), false) // the root's own 3D engine shares the growth model, never the lab page
    for (const path of ['/lab/tree-3d', '/lab/tree-3d/']) {
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' })
      await ready(page)
      check(`fresh top ${path} (${delay})`, (await state(page)).y, 0)
      await page.evaluate(() => {
        history.replaceState({ existing: 'preserved' }, '')
        scrollTo(0, 1162)
      })
      await sleep(300)
      const before = await state(page)
      check(`baseline roots ${path} (${delay})`, before.stage, 'Raíces')
      const label = `${path} (import ${delay}ms)`
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.tree-lab-narrative')
      await sleep(100)
      check(`layout-ready native reload ${label}`, (await state(page)).y, before.y)
      await ready(page)
      const after = await state(page)
      check(`native reload ${label}`, after.y, before.y)
      check(`reload stage ${label}`, after.stage, before.stage)
      // Growth and camera are both restored: the first frame is the saved pose.
      check(`first rendered pose ${label}`, after.first, before.latest)
      check(`existing history state ${label}`, after.history.existing, 'preserved')
      await page.goBack({ waitUntil: 'domcontentloaded' })
      await page.goForward({ waitUntil: 'domcontentloaded' })
      await ready(page)
      check(`history forward ${path} (${delay})`, (await state(page)).y, before.y)
      // Test real traversal. If Chromium declines BFCache, the same assertion
      // protects the bounded cold-history fallback rather than faking BFCache.
      await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
      await page.goBack({ waitUntil: 'domcontentloaded' })
      await ready(page)
      const back = await state(page)
      check(`history back ${path} (${delay})`, back.y, before.y)
      console.log(`Traversal BFCache persisted: ${back.persisted}`)
      await page.goForward({ waitUntil: 'domcontentloaded' })
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' })
      await ready(page)
      check(`explicit fresh navigation ${path} (${delay})`, (await state(page)).y, 0)
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.goto(`${origin}/lab/tree-3d`, { waitUntil: 'domcontentloaded' })
    await ready(page)
    await page.evaluate(() => scrollTo(0, 1162))
    await sleep(200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await ready(page)
    const reduced = await state(page)
    check(`reduced-motion reload scroll (${delay})`, reduced.y, 1162)
    check(`reduced-motion remains manual (${delay})`, reduced.stage, 'Semilla')
    await page.close()
  }
  for (const failedModule of ['/src/lab/scroll-restoration.js', '/src/lab/TreeLab.jsx']) {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', request => request.url().includes(failedModule) ? request.abort() : request.continue())
    await page.goto(`${origin}/lab/tree-3d`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="alert"]')
    check(`import error fallback ${failedModule}`, await page.$eval('[role="alert"]', node => node.textContent.includes('No se pudo abrir')), true)
    check(`error exit link ${failedModule}`, await page.$eval('a', node => node.getAttribute('href')), '/')
    await page.close()
  }
} finally {
  await browser.close()
}
assert.deepEqual(failures, [], 'native scroll restoration regressions')
console.log('Native lab reload / history / fresh navigation / first pose / root isolation: OK')
