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

const { scrollProgress, sampleCamera, stageProgress } = await import('../src/lab/camera-timeline.js')
assert.equal(scrollProgress(100, 1000, 400), 0)
assert.equal(scrollProgress(-300, 1000, 400), 0.5)
assert.equal(scrollProgress(-900, 1000, 400), 1)
for (const args of [[NaN, 1000, 400], [0, Infinity, 400], [-10, 400, 400], [-10, 0, 400], [-10, 1000, 0], [-10, 1000, -1]]) {
  assert.equal(scrollProgress(...args), 0, 'invalid or zero travel stays at start')
}
const bounds = { min: { x: -3, y: 0, z: -2 }, max: { x: 3, y: 10, z: 2 } }
const before = structuredClone(bounds)
const pose = (p, box = bounds, aspect = 1.5) => sampleCamera(p, box, 38, aspect)
const anchors = [0, 0.5, 1].map(p => pose(p))
assert.deepEqual(anchors.map(p => p.stage), ['trunk', 'canopy', 'whole'])
for (const [i, stage] of ['trunk', 'canopy', 'whole'].entries()) {
  assert.equal(stageProgress(stage), i / 2)
  assert.deepEqual(pose(stageProgress(stage)), anchors[i], 'manual and scroll anchors agree')
}
assert.deepEqual(pose(-1), anchors[0])
assert.deepEqual(pose(2), anchors[2])
assert.deepEqual(pose(NaN), anchors[0])
const distance = (a, b) => Math.hypot(...['x', 'y', 'z'].map(k => a[k] - b[k]))
assert.ok(distance(anchors[0].target, anchors[1].target) > 3, 'details have distinct anatomy targets')
let previousStage = 0
for (let i = 0; i <= 100; i++) {
  const p = i / 100, current = pose(p)
  assert.deepEqual(current, pose(p), 'deterministic')
  const stageIndex = ['trunk', 'canopy', 'whole'].indexOf(current.stage)
  assert.ok(stageIndex >= previousStage, 'stage order never reverses')
  previousStage = stageIndex
  for (const point of [current.position, current.target]) assert.ok(Object.values(point).every(Number.isFinite))
  if (i) assert.ok(distance(current.position, pose(p - 0.01).position) < 1, 'continuous path')
}
assert.ok(distance(pose(0.5 - 1e-6).position, pose(0.5 + 1e-6).position) < 1e-4)
const transformed = Object.fromEntries(Object.entries(bounds).map(([key, point]) => [key,
  Object.fromEntries(Object.entries(point).map(([axis, value]) => [axis, value * 3 + 7])),
]))
for (const p of [0, 0.23, 0.5, 1]) {
  for (const key of ['position', 'target']) for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(pose(p, transformed)[key][axis] - (pose(p)[key][axis] * 3 + 7)) < 1e-9)
  }
}
const portrait = pose(1, bounds, 390 / 600)
const radius = Math.hypot(6, 10, 4) / 2
const limiting = Math.atan(Math.tan(38 * Math.PI / 360) * (390 / 600))
assert.ok(distance(portrait.position, portrait.target) * Math.sin(limiting) >= radius, 'portrait fits whole bounding sphere')
assert.ok(distance(portrait.position, portrait.target) > distance(anchors[2].position, anchors[2].target))
for (const [fov, aspect] of [[NaN, NaN], [0, 0], [180, -1]]) {
  assert.deepEqual(sampleCamera(0.5, bounds, fov, aspect), sampleCamera(0.5, bounds, 38, 1), 'invalid projection uses a finite default')
}
assert.deepEqual(bounds, before, 'sampling never mutates bounds')
console.log('Camera timeline: clamping / anchors / continuity / transforms / portrait fit OK')

// The loader cannot abort a GLB parse: late arrivals must be disposed, not mounted.
const { createAssetSlot } = await import('../src/lab/asset-slot.js')
let disposed = 0
const asset = () => ({ dispose: () => disposed++ })
const slot = createAssetSlot()
slot.close()
slot.close()
assert.equal(slot.accept(asset()), false)
assert.equal(disposed, 1)
const mounted = createAssetSlot()
assert.equal(mounted.accept(asset()), true)
mounted.close()
mounted.close()
assert.equal(disposed, 2)
let resolve
const pending = new Promise(done => { resolve = done })
const late = createAssetSlot()
const completion = pending.then(value => late.accept(value))
late.close()
resolve(asset())
assert.equal(await completion, false)
assert.equal(disposed, 3)
assert.equal(late.closed, true) // rejected loads must not update a closed view either
console.log('Asset ownership / late-load cleanup: OK')

// Exercise the unmodified vendor contract without a GPU or network.
const THREE = await import('three')
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
const { loadVerdantAsset } = await import('../src/lab/vendor/VerdantVegetation.js')
assert.equal(THREE.REVISION, '185')
const originalLoad = GLTFLoader.prototype.loadAsync
const originalFetch = globalThis.fetch
const originalDocument = globalThis.document
const root = new THREE.Group()
const geometry = new THREE.BoxGeometry(1, 2, 1)
const texture = new THREE.Texture()
const material = new THREE.MeshStandardMaterial({ map: texture })
root.add(new THREE.Mesh(geometry, material))
const counts = { geometry: 0, material: 0, texture: 0 }
for (const [key, resource] of Object.entries({ geometry, material, texture })) {
  resource.addEventListener('dispose', () => counts[key]++)
}
try {
  globalThis.document = { baseURI: 'https://example.test/' }
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`../public/lab-assets/zelkova/${url.pathname.split('/').at(-1)}`, import.meta.url))) })
  GLTFLoader.prototype.loadAsync = async url => {
    assert.equal(url, 'https://example.test/lab-assets/zelkova/models/asset.glb')
    return { scene: root }
  }
  const loaded = await loadVerdantAsset('/lab-assets/zelkova/', { windEnabled: true, windStrength: 0 })
  assert.equal(loaded.root, root)
  assert.equal(root.scale.x, 1)
  assert.equal(root.position.y, 0)
  loaded.update(0, 0)
  assert.equal(root.children[0].material, material, 'wind off restores static material')
  loaded.wind.strength = 1
  loaded.update(0.016, 1)
  assert.notEqual(root.children[0].material, material, 'wind on uses shader material')
  loaded.dispose()
  loaded.dispose()
  loaded.update(0.016, 2)
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 })
  globalThis.fetch = async () => ({ ok: false, status: 404 })
  await assert.rejects(loadVerdantAsset('/lab-assets/zelkova/'), /manifest.json: HTTP 404/)
} finally {
  GLTFLoader.prototype.loadAsync = originalLoad
  globalThis.fetch = originalFetch
  globalThis.document = originalDocument
}
console.log('Vendor r185 wind / disposal / missing-asset contract: OK')
