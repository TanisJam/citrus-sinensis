import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isTreeLabRoute } from '../src/route.js'

for (const path of ['/lab/tree-3d', '/lab/tree-3d/']) {
  assert.equal(isTreeLabRoute(path), true, path)
}
for (const path of ['/', '/lab', '/lab/tree-3d-more', '/lab/tree-3d/child', '/lab/tree-3d//', '/LAB/tree-3d', '/blog', '/projects', '/resume', '/es']) {
  assert.equal(isTreeLabRoute(path), false, path)
}
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)))
assert.deepEqual(config.redirects, [{
  source: '/(.*)', has: [{ type: 'host', value: 'mnr.ar' }],
  destination: 'https://www.mnr.ar/$1', permanent: true,
}])
assert.deepEqual(config.rewrites, [
  { source: '/lab/tree-3d', destination: '/index.html' },
  { source: '/lab/tree-3d/', destination: '/index.html' },
  { source: '/(.+)', destination: 'https://mauricioromero.vercel.app/$1' },
])
const rewrite = path => config.rewrites.find(rule => new RegExp(`^${rule.source}$`).test(path))
for (const path of ['/lab/tree-3d', '/lab/tree-3d/']) assert.equal(rewrite(path).destination, '/index.html')
assert.equal(rewrite('/'), undefined)
for (const path of ['/blog', '/blog/new-post', '/projects', '/resume', '/es', '/lab/tree-3d/child', '/lab/tree-3d-more']) {
  assert.equal(rewrite(path).destination, 'https://mauricioromero.vercel.app/$1', path)
}
console.log('Route and rewrite isolation: OK')

// Lazy bootstrap reserves this entry's layout, with a bounded fallback only
// when native restoration was already clamped by the short initial document.
const { prepareLabScrollRestoration } = await import('../src/lab/scroll-restoration.js')
function bootstrapFixture({ path = '/lab/tree-3d', type = 'reload', state = null } = {}) {
  const listeners = new Map()
  const host = {
    location: { pathname: path },
    performance: { getEntriesByType: () => [{ type }] },
    document: { documentElement: { scrollHeight: 2792 }, querySelector: () => ({}) },
    history: { state, replaceState(next) { this.state = next } },
    scrollY: 1162,
    scrollTo({ top }) { this.scrollY = top },
    addEventListener(name, listener) { listeners.set(name, listener) },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name) },
  }
  return { host, listeners, fire: (name, event = {}) => listeners.get(name)?.(event) }
}
const fixture = bootstrapFixture({ state: { existing: { value: 7 } } })
const initial = prepareLabScrollRestoration(fixture.host)
assert.equal(initial.loadingHeight, undefined)
fixture.fire('scroll')
fixture.fire('pagehide', { persisted: true })
assert.deepEqual(fixture.host.history.state.existing, { value: 7 }, 'do not replace existing state')
assert.equal(fixture.listeners.has('pagehide'), false, 'pagehide handler is detached')
fixture.fire('pageshow', { persisted: true })
assert.equal(fixture.listeners.has('pagehide'), true, 'BFCache resumes entry capture')
const saved = structuredClone(fixture.host.history.state)
initial.dispose()
assert.equal(fixture.listeners.size, 0, 'bootstrap cleanup removes handlers')
for (const type of ['reload', 'back_forward']) {
  const next = bootstrapFixture({ state: saved, type })
  const geometry = prepareLabScrollRestoration(next.host)
  assert.equal(geometry.loadingHeight, 2792)
  next.host.scrollY = 0
  geometry.restore()
  assert.equal(next.host.scrollY, 1162, 'bounded fallback restores the actual saved viewport')
  next.host.scrollY = 0
  geometry.restore()
  assert.equal(next.host.scrollY, 0, 'restoration is one-shot')
  next.host.document.querySelector = () => null
  next.host.document.documentElement.scrollHeight = 900
  next.fire('pagehide')
  assert.deepEqual(next.host.history.state, saved, 'short bootstrap never overwrites saved geometry')
  geometry.dispose()
}
for (const options of [
  { state: saved, type: 'navigate' },
  { state: saved, path: '/lab/tree-3d/' },
  { state: saved, path: '/' },
  { state: 'opaque-state' },
  { state: { __treeLabLoadingGeometry: { path: '/lab/tree-3d', height: Infinity, y: 1162 } } },
]) {
  const next = bootstrapFixture(options)
  const geometry = prepareLabScrollRestoration(next.host)
  assert.equal(geometry.loadingHeight, undefined, 'fresh / other path / opaque entries are not restored')
  next.host.scrollY = 0
  geometry.restore()
  assert.equal(next.host.scrollY, 0, 'no invented progress on fresh navigation')
  if (options.path === '/') assert.equal(next.listeners.size, 0, 'root installs no handlers')
  if (typeof options.state === 'string') {
    next.fire('scroll')
    assert.equal(next.host.history.state, options.state, 'opaque existing state is not overwritten')
  }
  geometry.dispose()
}
const native = bootstrapFixture({ state: saved })
const nativeGeometry = prepareLabScrollRestoration(native.host)
native.host.scrollY = 800
nativeGeometry.restore()
assert.equal(native.host.scrollY, 800, 'native restoration or user movement wins')
nativeGeometry.dispose()
const unavailable = bootstrapFixture()
Object.defineProperty(unavailable.host.history, 'state', { get() { throw new Error('unavailable') } })
const safe = prepareLabScrollRestoration(unavailable.host)
assert.equal(safe.loadingHeight, undefined)
assert.doesNotThrow(() => unavailable.fire('pagehide'))
safe.dispose()
const departing = bootstrapFixture()
prepareLabScrollRestoration(departing.host)
departing.fire('pagehide', { persisted: false })
assert.equal(departing.listeners.size, 0, 'non-BFCache departure removes all handlers')
console.log('Lab bootstrap geometry / entry isolation / BFCache lifecycle / unavailable history: OK')

const { scrollProgress, growthProgress, chapterScroll } = await import('../src/lab/camera-timeline.js')
const { STAGES } = await import('../src/lab/growth-model.js')
assert.equal(scrollProgress(100, 1000, 400), 0)
assert.equal(scrollProgress(-300, 1000, 400), 0.5)
assert.equal(scrollProgress(-900, 1000, 400), 1)
for (const args of [[NaN, 1000, 400], [0, Infinity, 400], [-10, 400, 400], [-10, 0, 400], [-10, 1000, 0], [-10, 1000, -1]]) {
  assert.equal(scrollProgress(...args), 0, 'invalid or zero travel stays at start')
}
// Six evenly spaced chapters land exactly on the six uneven growth anchors.
for (const [i, stage] of STAGES.entries()) {
  assert.equal(chapterScroll(stage.id), i / (STAGES.length - 1))
  assert.equal(growthProgress(chapterScroll(stage.id)), stage.progress, 'manual and scroll anchors agree')
}
assert.equal(chapterScroll('unknown'), 0)
for (const [input, expected] of [[-1, 0], [NaN, 0], [2, 1], [Infinity, 0]]) assert.equal(growthProgress(input), expected)
let previousGrowth = 0
for (let i = 1; i <= 1000; i++) {
  const g = growthProgress(i / 1000)
  assert.ok(g >= previousGrowth && g - previousGrowth < 0.003, 'monotone and continuous, so scrolling back rewinds')
  previousGrowth = g
}
console.log('Chapter timeline: clamping / six stage anchors / monotone continuity OK')
