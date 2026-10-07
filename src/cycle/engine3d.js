import * as THREE from 'three'
import { PROJECTS, IDEAS, STAGES } from '../engine/engine.js'
import * as T from './timeline.js'
import { createGrowthTopology, createGrowthSample, sampleGrowth, progressAtAge, SEED_DEPTH, SEED_SIZE, CROWN } from '../lab/growth-model.js'
import { createGrowthRenderer } from '../lab/growth-renderer.js'
import { sampleGrowthCamera } from '../lab/camera-timeline.js'
import { createAnatomy } from './anatomy.js'
import { createSoil } from './soil.js'

// The cycle, in 3D: same contract as the 2D engine (createEngine(host) ->
// home/pick/state/destroy, onHud deltas, onAccent, onTick(pe, night, interior,
// sig), band/label/cycle-dot writes), so the page, the bands, the sound and the
// text index do not change. The scroll model, loop and signals come from
// ./timeline.js, pinned to the 2D engine by tests.
export function createEngine(host) {
  const { canvas, bands: bandsIn = [], refs = {}, onHud = () => {}, onAccent = () => {}, onTick = () => {} } = host
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  const search = typeof location !== 'undefined' ? location.search || '' : ''
  const AT = /[?&]at=([0-9.]+)/.exec(search)
  const HOLD = /[?&]hold\b/.test(search)
  const listeners = []
  const v3a = new THREE.Vector3()
  const listen = (type, fn, opts) => { addEventListener(type, fn, opts); listeners.push([type, fn, opts]) }

  // Throws without WebGL: the page then falls back to the 2D engine.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  let dpr = Math.min(devicePixelRatio || 1, 1.5)

  // ---------- The world: soil, sky, the tree.
  const world = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.005, 100)
  const hemi = new THREE.HemisphereLight('#fff9ec', '#a7ad86', 2.2)
  const sun = new THREE.DirectionalLight('#fff4da', 2.4)
  sun.position.set(4, 9, 6)
  world.add(hemi, sun)
  // Sky dome: zenith to horizon gradient, recoloured for dusk and night.
  // Below the horizon it is earth: through the translucent soil near the trunk
  // the roots read against dark ground, as in a cut, never against sky.
  const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, earth: { value: new THREE.Color('#3a2b1e') } }
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 w; void main(){ w = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 top, horizon, earth; varying vec3 w; void main(){ float h = clamp(w.y, 0., 1.); vec3 c = w.y < 0. ? mix(horizon, earth, smoothstep(.01, .12, -w.y)) : mix(horizon, top, pow(h, .55)); gl_FragColor = vec4(c, 1.); }',
  }))
  skyDome.renderOrder = -2
  skyDome.frustumCulled = false
  world.add(skyDome)
  // The ground, as a cutaway: roots against a section of earth, the surface
  // carrying on behind it (./soil.js).
  const earth = createSoil()
  world.add(earth.group)
  const topology = createGrowthTopology(20260807)
  const sample = createGrowthSample(topology)
  const plant = createGrowthRenderer(topology)
  world.add(plant.group)
  plant.group.getObjectByName('soil').visible = false
  const modelSeed = ['seed-reserve', 'seed-shell-0', 'seed-shell-1'].map(name => plant.group.getObjectByName(name))
  const seedBase = modelSeed.map(() => new THREE.Vector3()), seedShown = modelSeed.map(() => false)
  const fruitMesh = plant.group.getObjectByName('fruits')
  // The seed that falls at the start of every lap: the one released by the last.
  // One seed colour everywhere, so the released seed is the next lap's seed.
  const SEED_COLOR = '#f2e8cc'
  const fallingSeedMaterial = new THREE.MeshStandardMaterial({ color: SEED_COLOR, roughness: 0.7 })
  const fallingSeed = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fallingSeedMaterial)
  fallingSeed.scale.set(...SEED_SIZE)
  world.add(fallingSeed)
  const SEED_START = 0.22 // metres above the soil at pe = 0

  // ---------- The interior: the chosen orange, opened.
  const inside = new THREE.Scene()
  const insideCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 60)
  // The plate is lit evenly, like an anatomy plate; on the way in and out its
  // light is the world's, so the orange (and later the seed) does not change
  // look as it crosses from one to the other.
  const PLATE_SKY = new THREE.Color('#fff9ec'), PLATE_GROUND = new THREE.Color('#c9b9a0'), PLATE_SUN = new THREE.Color('#fff4da')
  const insideHemi = new THREE.HemisphereLight(PLATE_SKY, PLATE_GROUND, 2.1)
  inside.add(insideHemi)
  const insideSun = new THREE.DirectionalLight('#fff4da', 2.2)
  insideSun.position.set(2, 4, 6)
  inside.add(insideSun)
  const anatomy = createAnatomy()
  inside.add(anatomy.group)
  const PLATE = new THREE.Color('#efe6d2')
  inside.background = PLATE

  // ---------- Between the two: the world, the plate laid over it at the fade's
  // opacity, and the opened fruit drawn on top at full strength. Every layer
  // goes straight to the screen through the same pipeline as the frames on
  // either side, so the in-between frames cannot shift colour.
  const plateMaterial = new THREE.MeshBasicMaterial({ color: '#efe6d2', transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  const quadScene = new THREE.Scene()
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plateMaterial)
  quad.frustumCulled = false
  quadScene.add(quad)
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // ---------- Labels for the opened fruit (the text index carries them for AT).
  const overlay = document.createElement('div')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.className = 'engine3d-labels'
  Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '3', opacity: '0',
    font: '12px/1.4 "IBM Plex Mono", ui-monospace, monospace', color: '#2b2a24', letterSpacing: '0.04em' })
  const title = document.createElement('div')
  const ideasBox = document.createElement('div')
  const gloss = document.createElement('div')
  const keyList = document.createElement('div')
  const names = Array.from({ length: 5 }, () => document.createElement('div'))
  for (const el of [title, ideasBox, gloss, keyList, ...names]) { el.style.position = 'absolute'; overlay.appendChild(el) }
  Object.assign(gloss.style, { maxWidth: '30ch', fontStyle: 'italic' })
  document.body.appendChild(overlay)

  // ---------- Which oranges carry the projects: six ripe ones on the side the
  // camera sees, spread left to right like the 2D piece.
  sampleGrowth(topology, 1, sample)
  // Face the camera to the fullest side of the crown (the growth camera looks
  // from azimuth ~0.58; the whole view turns by VIEW_TURN around the trunk).
  const BINS = 24, density = new Float64Array(BINS)
  for (let i = 0; i < sample.leafCount; i++) {
    const y = sample.leafPositions[i * 3 + 1]
    if (sample.leafScales[i] <= 0 || y < 2.4 || y > 4.8) continue
    const a = Math.atan2(sample.leafPositions[i * 3], sample.leafPositions[i * 3 + 2])
    density[(Math.floor((a + Math.PI) / (Math.PI * 2) * BINS) + BINS) % BINS]++
  }
  let bestBin = 0, bestScore = -1
  for (let b = 0; b < BINS; b++) {
    let score = 0
    for (let k = -3; k <= 3; k++) score += density[(b + k + BINS) % BINS] * (4 - Math.abs(k))
    if (score > bestScore) { bestScore = score; bestBin = b }
  }
  const camAz = (bestBin + 0.5) / BINS * Math.PI * 2 - Math.PI, facing = [Math.sin(camAz), Math.cos(camAz)]
  const VIEW_TURN = camAz - 0.58
  const candidates = topology.fruits.map((f, i) => i).filter(i => topology.fruits[i].retained).map(i => {
    const x = sample.fruitPositions[i * 3], y = sample.fruitPositions[i * 3 + 1], z = sample.fruitPositions[i * 3 + 2]
    const r = Math.hypot(x, z) || 1
    // On the crown's outer surface, where oranges show on a real tree.
    const surface = (x * x + z * z) / CROWN.radius ** 2 + Math.abs((y - CROWN.y) / CROWN.height) ** 2.6
    return { i, y, surface, front: (x * facing[0] + z * facing[1]) / r, side: (x * facing[1] - z * facing[0]) }
  }).filter(c => c.front > 0.55 && c.y > 1.4 && c.y < 4 && c.surface > 0.72)
  candidates.sort((a, b) => a.side - b.side)
  // If the front is sparse, fall back to any ripe fruit rather than fail.
  const pool = candidates.length >= PROJECTS.length ? candidates
    : topology.fruits.map((f, i) => ({ i, side: i })).filter(c => topology.fruits[c.i].retained)
  const named = PROJECTS.map((_, k) => pool[Math.floor((k + 0.5) * pool.length / PROJECTS.length)].i)
  const hueColors = PROJECTS.map(p => new THREE.Color(p.hue))
  // Leaves between the close-up camera and each project orange are moved aside
  // while the camera comes in, like a hand parting the foliage.
  const outwardOf = i => new THREE.Vector3(sample.fruitPositions[i * 3], 0, sample.fruitPositions[i * 3 + 2]).normalize().add(new THREE.Vector3(0, 0.25, 0))
  const parted = named.map(i => {
    const f = new THREE.Vector3().fromArray(sample.fruitPositions, i * 3)
    const a = f.clone().addScaledVector(outwardOf(i), 0.05), b = f.clone().addScaledVector(outwardOf(i), 0.75)
    const line = new THREE.Line3(a, b), q = new THREE.Vector3(), out = []
    for (let k = 0; k < topology.leaves.length; k++) {
      line.closestPointToPoint(q.fromArray(sample.leafPositions, k * 3), true, v3a)
      if (v3a.distanceTo(q) < 0.16) out.push(k)
    }
    return out
  })
  const green = new THREE.Color(0x4b7a24), tint = new THREE.Color(), matrix = new THREE.Matrix4()

  // ---------- Scroll, loop, choice.
  let target = 0, p = 0, pPrev = 0, scrollV = 0, skipV = false
  let chosenFruit = 0, chosenGajo = 2, carried = null
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight
  function readScroll() { const m = maxScroll(); target = m > 0 ? T.clamp(T.sToP(T.clamp(scrollY / m))) : 0 }
  listen('scroll', readScroll, { passive: true })
  function wrap() {
    if (target <= 0.9992 || p < 0.9985) return
    const np = target - T.LOOP_AT
    target = np; p = np; pPrev = np; skipV = true
    const next = T.nextChoice(chosenFruit, chosenGajo, IDEAS)
    carried = next.carried; chosenFruit = next.fruit; chosenGajo = next.gajo
    scrollTo(0, T.pToS(np) * maxScroll())
  }

  // ---------- Pointer: hovering a named carpel writes its gloss.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(2, 2)
  let hover = -1, glossShown = 0, glossFor = -1
  listen('pointermove', e => { pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1) }, { passive: true })

  // ---------- Size.
  let width = 1, height = 1
  function resize() {
    width = innerWidth; height = innerHeight
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    camera.aspect = insideCamera.aspect = width / height
    camera.updateProjectionMatrix(); insideCamera.updateProjectionMatrix()
  }
  let rt
  listen('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120) })
  resize()

  // ---------- Growth, sampled only when the age actually changes.
  let lastModel = -1, partedFor = -1
  function grow(pe) {
    const days = T.ageAt(pe)
    const mp = Math.round(progressAtAge(days) * 20000) / 20000
    if (mp !== lastModel) {
      lastModel = mp
      sampleGrowth(topology, mp, sample)
      plant.updateGrowth(sample)
      for (const [i, m] of modelSeed.entries()) { seedBase[i].copy(m.scale); seedShown[i] = m.visible }
    }
    // Project oranges ripen to their own colour; the chosen one stands out.
    if (fruitMesh.count) {
      for (const [k, i] of named.entries()) {
        const c = sample.fruitColors[i]
        tint.copy(green).lerp(hueColors[k], c)
        fruitMesh.setColorAt(i, tint)
        if (k === chosenFruit) {
          // It leaves the branch when the opened fruit takes over: one orange
          // travelling, never two.
          const pop = 1 + 0.13 * T.smooth(T.clamp((pe - 0.786) / 0.02))
          const r = pe >= T.IN_ENTER[0] && pe < 0.93 ? 0 : sample.fruitScales[i] * pop
          matrix.makeScale(r, r, r).setPosition(sample.fruitPositions[i * 3], sample.fruitPositions[i * 3 + 1], sample.fruitPositions[i * 3 + 2])
          fruitMesh.setMatrixAt(i, matrix)
        }
      }
      fruitMesh.instanceColor.needsUpdate = true
      fruitMesh.instanceMatrix.needsUpdate = true
    }
    // Leaves in the close-up's path shrink back as the camera comes in, and
    // return when it leaves (or when another orange is the chosen one).
    if (partedFor !== chosenFruit) { if (partedFor >= 0) plant.fadeLeaves(parted[partedFor], 1); partedFor = chosenFruit }
    plant.fadeLeaves(parted[chosenFruit], 1 - T.smooth(T.clamp((pe - 0.762) / 0.022)))
    // The model's buried seed takes over from the falling one once it is covered,
    // and swells as it drinks (imbibition, up to +30%).
    const buried = pe >= 0.062
    const swell = T.imbibeAt(pe)
    modelSeed.forEach((m, i) => { m.visible = seedShown[i] && buried; m.scale.copy(seedBase[i]).multiplyScalar(swell) })
    fallingSeed.visible = !buried
    const fallT = T.clamp(pe / T.LOOP_LEN)
    const y = pe < T.LOOP_LEN ? T.lerp(SEED_START, SEED_SIZE[1], fallT * fallT) : T.lerp(SEED_SIZE[1], -SEED_DEPTH, T.smooth(T.clamp((pe - 0.05) / 0.012)))
    fallingSeed.position.set(0, y, 0)
    fallingSeedMaterial.color.set(SEED_COLOR)
  }

  // ---------- The camera, stage by stage.
  const fitPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), near: 0.005, far: 50 }
  const tmpA = { position: new THREE.Vector3(), target: new THREE.Vector3() }
  const tmpB = { position: new THREE.Vector3(), target: new THREE.Vector3() }
  // Seen from a little below: sky behind the falling seed, as in the 2D piece,
  // and the horizon rising into view as it reaches the soil.
  const seedDir = new THREE.Vector3(Math.sin(0.5) * Math.cos(-0.22), Math.sin(-0.22), Math.cos(0.5) * Math.cos(-0.22))
  // The seed sits in the lower third, clear of the title card.
  function seedPose(out, y) {
    out.target.set(0, y + 0.017, 0)
    out.position.set(0, y, 0).addScaledVector(seedDir, 0.11).add(new THREE.Vector3(0, 0.017, 0))
    out.position.y = Math.max(out.position.y, 0.004)
    return out
  }
  function undergroundPose(out) {
    const b = sample.bounds
    out.target.set((b.min.x + b.max.x) / 2, Math.min((b.min.y + b.max.y) / 2, -SEED_DEPTH), (b.min.z + b.max.z) / 2)
    const span = Math.max(0.05, b.max.y - b.min.y, (b.max.x - b.min.x) * 0.8)
    const d = span / (2 * Math.tan(21 * Math.PI / 180) * 0.78) * Math.max(1, 1 / camera.aspect)
    out.position.set(out.target.x + Math.sin(0.5) * d, Math.min(out.target.y - 0.002, -0.004), out.target.z + Math.cos(0.5) * d)
    return out
  }
  function fit(out, mp) {
    const pose = sampleGrowthCamera(sample.bounds, mp, camera.aspect, 42)
    out.position.set(pose.position.x, pose.position.y, pose.position.z).applyAxisAngle(Y_AXIS, VIEW_TURN)
    out.target.set(pose.target.x, pose.target.y, pose.target.z).applyAxisAngle(Y_AXIS, VIEW_TURN)
    return out
  }
  const Y_AXIS = new THREE.Vector3(0, 1, 0)
  const flowerFocus = (() => {
    sampleGrowth(topology, progressAtAge(3310), sample)
    // The densest open cluster on the side the camera sees, at eye height.
    const open = []
    for (let i = 0; i < topology.flowers.length; i++) if (sample.flowerScales[i] > 0) open.push(i)
    let best = open[0], score = -Infinity
    const at = i => [sample.flowerPositions[i * 3], sample.flowerPositions[i * 3 + 1], sample.flowerPositions[i * 3 + 2]]
    for (const i of open) {
      const [x, y, z] = at(i), r = Math.hypot(x, z) || 1
      if ((x * facing[0] + z * facing[1]) / r < 0.6 || y < 1.2 || y > 3) continue
      let near = 0
      for (const j of open) { const [a, b, c] = at(j); if ((a - x) ** 2 + (b - y) ** 2 + (c - z) ** 2 < 0.04) near++ }
      const s = near + r * 2
      if (s > score) { score = s; best = i }
    }
    return new THREE.Vector3().fromArray(sample.flowerPositions, best * 3)
  })()
  lastModel = -1
  function closePose(out, point, distance) {
    const out2 = new THREE.Vector3(point.x, 0, point.z).normalize()
    out.target.copy(point)
    out.position.copy(point).addScaledVector(out2, distance).add(new THREE.Vector3(0, distance * 0.25, 0))
    // The same path the leaves were parted along.
    return out
  }
  const fruitPoint = new THREE.Vector3()
  function blend(a, b, t, out) {
    out.position.lerpVectors(a.position, b.position, t)
    out.target.lerpVectors(a.target, b.target, t)
    return out
  }
  // Diving onto a point: the distance changes at a constant rate (the image
  // grows evenly instead of rushing at the end), and the aim follows the zoom.
  const za = new THREE.Vector3(), zb = new THREE.Vector3()
  function zoomBlend(a, b, t, out) {
    za.subVectors(a.position, a.target); zb.subVectors(b.position, b.target)
    const la = Math.max(1e-4, za.length()), lb = Math.max(1e-4, zb.length())
    const d = Math.exp(T.lerp(Math.log(la), Math.log(lb), t))
    const s = Math.abs(la - lb) < 1e-6 ? t : T.clamp((la - d) / (la - lb))
    out.target.lerpVectors(a.target, b.target, s)
    za.divideScalar(la).lerp(zb.divideScalar(lb), s).normalize()
    out.position.copy(out.target).addScaledVector(za, d)
    return out
  }
  const pose = { position: new THREE.Vector3(), target: new THREE.Vector3() }
  function direct(pe) {
    const mp = progressAtAge(T.ageAt(pe))
    if (pe < 0.05) return seedPose(pose, fallingSeed.position.y)
    if (pe < 0.062) return blend(seedPose(tmpA, fallingSeed.position.y), undergroundPose(tmpB), T.smooth((pe - 0.05) / 0.012), pose)
    if (pe < 0.25) return undergroundPose(pose)
    if (pe < 0.30) return blend(undergroundPose(tmpA), fit(tmpB, mp), T.smooth((pe - 0.25) / 0.05), pose)
    fit(fitPose, mp)
    // While the fruit sets and colours, walk up to the crown: the roots drop
    // out of frame and the oranges read at their real size among the leaves.
    if (pe >= 0.632) {
      const k = T.smooth(T.clamp((pe - 0.64) / 0.06))
      if (k > 0) {
        tmpB.target.copy(fitPose.target).setY(T.lerp(fitPose.target.y, CROWN.y, k))
        tmpB.position.subVectors(fitPose.position, fitPose.target).multiplyScalar(1 - 0.48 * k).add(tmpB.target)
        fitPose.position.copy(tmpB.position); fitPose.target.copy(tmpB.target)
      }
    }
    if (pe >= 0.56 && pe < 0.632) {
      const k = T.smooth(T.clamp((pe - 0.56) / 0.032)) * (1 - T.smooth(T.clamp((pe - 0.6) / 0.032)))
      return zoomBlend(fitPose, closePose(tmpA, flowerFocus, 0.24), k, pose)
    }
    if (pe >= 0.786) {
      const i = named[chosenFruit]
      fruitPoint.fromArray(sample.fruitPositions, i * 3)
      const k = T.smooth(T.clamp((pe - 0.786) / 0.026))
      return zoomBlend(fitPose, closePose(tmpA, fruitPoint, T.lerp(0.55, 0.32, k)), k, pose)
    }
    return blend(fitPose, fitPose, 0, pose)
  }

  // ---------- Day, night, and whether the page sits on dark.
  const SKY_DAY = new THREE.Color('#dfe7e4'), SKY_DUSK = new THREE.Color('#c99b7a'), SKY_NIGHT = new THREE.Color('#22324a')
  const ZENITH_DAY = new THREE.Color('#7fa6c6'), ZENITH_NIGHT = new THREE.Color('#0e1a2e')
  const SUN = new THREE.Color('#fff4da'), MOON = new THREE.Color('#9fb6dd')
  const SOIL = new THREE.Color('#3a2b1e')
  const skyFog = new THREE.Fog(SOIL, 25, 85)
  const sky = new THREE.Color()
  const luma = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  let brandDark = false, navDark = false

  // ---------- HUD, bands, rail, label, accent: the 2D engine's writes.
  const bands = bandsIn.map(b => ({ ...b, vis: -1 }))
  const last = {}
  let lastAccent = ''
  const sig = {}
  function updateDOM(pe, u, night, interior, orange, dark) {
    for (const b of bands) {
      const a = T.bandAlpha(b, pe)
      if (Math.abs(a - b.vis) < 0.004) continue
      b.vis = a
      if (!b.el) continue
      b.el.style.opacity = a.toFixed(3)
      b.el.style.transform = `translateY(${((1 - a) * 26).toFixed(1)}px)`
      b.el.style.visibility = a < 0.01 ? 'hidden' : 'visible'
    }
    const st = T.stageAt(pe)
    const next = {
      stage: st.name, note: st.note, age: T.ageLabel(T.ageAt(pe)), dark, brandDark, navDark,
      from: carried && pe < 0.45 ? 'grown from — ' + carried : '',
      project: chosenFruit, tag: pe >= T.TAG_ON && pe < T.TAG_OFF,
    }
    let delta = null
    for (const [k, v] of Object.entries(next)) if (last[k] !== v) { last[k] = v; (delta ||= {})[k] = v }
    if (delta) onHud(delta)
    // Sound signals; bud and leaf are how much of the plant is growing now.
    let growing = 0
    for (let i = 0; i < topology.nodes.length; i += 7) { const g = sample.growth[i]; if (g > 0 && g < 1) growing++ }
    T.signals(pe, sig, T.clamp(growing / (topology.nodes.length / 7) * 6), T.clamp(sample.leafCount / 6000))
    onTick(pe, night, interior, sig)
    const accent = T.accentAt(chosenFruit, orange)
    if (accent !== lastAccent) { lastAccent = accent; onAccent(accent) }
    if (refs.cycleDot?.current) refs.cycleDot.current.style.top = (u * 100).toFixed(1) + '%'
    if (refs.label?.current) refs.label.current.style.opacity = T.labelAlpha(pe).toFixed(3)
    if (refs.flash?.current) refs.flash.current.style.opacity = '0'
  }

  // ---------- The opened fruit: entry from the canopy, labels, hover, the seed.
  const entryNDC = new THREE.Vector3(), seedNDC = new THREE.Vector3(), v3 = new THREE.Vector3(), ORIGIN = new THREE.Vector3()
  function placeInside(pe, interior) {
    const narrow = width < 900 && height > 560
    const fanned = T.ramp(pe, T.IN_FAN)
    // Centred like the 2D plate, a little above the middle (the specimen label
    // and the project tag hold the bottom); on a tall narrow screen it sits
    // lower, under the stacked labels. Room for the opening rind, then for the row.
    const reach = T.lerp(2.1, narrow ? 2.1 : 2.2, fanned)
    const d = reach / Math.tan(21 * Math.PI / 180) / Math.min(1, insideCamera.aspect) * (narrow ? T.lerp(0.78, 0.92, fanned) : 1)
    const lookY = narrow ? reach * 0.14 : -reach * 0.1
    insideCamera.position.set(0, lookY + 0.15, d)
    insideCamera.lookAt(0, lookY, 0)
    insideCamera.updateMatrixWorld()
    // Light the opened fruit from where the sun was, relative to the eye, so the
    // orange keeps its look as it leaves the branch.
    insideSun.position.copy(sun.position).normalize().transformDirection(camera.matrixWorldInverse)
      .transformDirection(insideCamera.matrixWorld).multiplyScalar(10)
    // Plate light only while the plate is up; the world's light at both ends.
    const plateLight = T.smooth(T.ramp(pe, T.IN_ENTER)) * (1 - T.smooth(T.clamp((pe - 0.93) / 0.016)))
    insideHemi.color.copy(hemi.color).lerp(PLATE_SKY, plateLight)
    insideHemi.groundColor.copy(hemi.groundColor).lerp(PLATE_GROUND, plateLight)
    insideHemi.intensity = T.lerp(hemi.intensity, 2.1, plateLight)
    insideSun.color.copy(sun.color).lerp(PLATE_SUN, plateLight)
    insideSun.intensity = T.lerp(sun.intensity, 2.2, plateLight)
    const enter = T.smooth(T.ramp(pe, T.IN_ENTER))
    // Arrive from where the fruit was on screen, at the size it had there.
    entryNDC.copy(fruitPoint).project(camera)
    v3.set(entryNDC.x, entryNDC.y, 0.5).unproject(insideCamera)
    const dir = v3.sub(insideCamera.position).normalize()
    const start = insideCamera.position.clone().addScaledVector(dir, d)
    // Same apparent size as the orange on the branch: radius over distance.
    const rWorld = sample.fruitScales[named[chosenFruit]] * 1.13
    const r0 = rWorld * d / Math.max(0.05, camera.position.distanceTo(fruitPoint))
    anatomy.group.position.lerpVectors(start, ORIGIN, enter)
    anatomy.group.scale.setScalar(T.lerp(r0, 1, enter))
    // Hover a named carpel to read what it is about.
    hover = -1
    if (interior > 0.9 && fanned > 0.5) {
      raycaster.setFromCamera(pointer, insideCamera)
      const hit = raycaster.intersectObjects(anatomy.pickables, false)[0]
      if (hit && hit.object.userData.carpel < PROJECTS[chosenFruit].gajos.length) hover = hit.object.userData.carpel
    }
    const gajos = PROJECTS[chosenFruit].gajos
    anatomy.update({ peel: T.ramp(pe, T.IN_PEEL), exit: T.ramp(pe, T.IN_EXIT), turn: T.ramp(pe, T.IN_TURN),
      bare: T.ramp(pe, T.IN_BARE), fan: fanned, open: T.ramp(pe, T.IN_OPEN), rel: T.ramp(pe, T.IN_REL),
      chosen: chosenGajo, hover, rind: hueColors[chosenFruit].getHex(), named: gajos.length, step: narrow ? 0.62 : 1.05 })
    // The fruit is drawn over the world at full strength on the way in; on the
    // way out everything but the travelling seed fades with the plate.
    const exitFade = pe > 0.9 ? interior : 1
    // The released seed flies to where the next lap's seed hangs, at its size.
    if (pe > T.IN_REL[0]) {
      // Same screen point and the same apparent size as the dispersal seed:
      // half-length over distance must match, so solve for the distance.
      seedNDC.set(0, SEED_START, 0).project(seedCam)
      // Home before the world fades back in, so the two seeds coincide.
      const k = T.smooth(T.clamp((pe - T.IN_REL[0]) / 0.004))
      v3.set(seedNDC.x, seedNDC.y, 0.5).unproject(insideCamera)
      const ray = v3.sub(insideCamera.position).normalize()
      const angular = SEED_SIZE[1] / 0.11, seedHalf = 0.13 * anatomy.group.scale.x
      const goal = insideCamera.position.clone().addScaledVector(ray, seedHalf / angular)
      anatomy.setFade(Math.min(1 - k, exitFade))
      anatomy.placeSeed(chosenGajo, goal, k)
    } else anatomy.setFade(exitFade)
    // Labels: project, its ideas, the five named carpels, and the hovered gloss.
    const project = PROJECTS[chosenFruit], gajo = gajos[chosenGajo]
    const labelsOn = T.clamp((pe - 0.866) / 0.02) * (1 - T.clamp((pe - 0.93) / 0.012))
    overlay.style.opacity = labelsOn.toFixed(3)
    if (labelsOn > 0) {
      const opened = T.ramp(pe, T.IN_OPEN)
      title.innerHTML = `<div style="letter-spacing:.24em;font-weight:600">${project.name.toUpperCase()}</div><div style="opacity:.65;letter-spacing:.14em;margin-top:6px">${project.meta}</div>`
      Object.assign(title.style, { left: '50%', top: narrow ? '84px' : '52px', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' })
      ideasBox.innerHTML = `<div style="opacity:.6;letter-spacing:.18em;margin-bottom:8px">IDEAS THIS IS MADE OF</div>` +
        gajo.seeds.map(s => `<div style="font-weight:600;letter-spacing:.08em;margin-top:4px">${IDEAS[s]}</div>`).join('')
      Object.assign(ideasBox.style, { left: '50%', top: narrow ? '150px' : '76%', transform: 'translateX(-50%)', textAlign: 'center', width: 'max-content', maxWidth: narrow ? 'calc(100vw - 40px)' : '34ch',
        opacity: T.lerp(0.45 * fanned, 1, opened).toFixed(2) })
      const namesOn = fanned * (1 - 0.6 * opened)
      names.forEach((el, k) => {
        el.style.display = k < gajos.length ? 'block' : 'none'
        if (k >= gajos.length) return
        el.textContent = narrow ? `${k + 1}` : gajos[k].name.toUpperCase()
        el.style.letterSpacing = '.16em'
        el.style.opacity = (namesOn * (k === chosenGajo || k === hover ? 1 : 0.62)).toFixed(2)
        el.style.fontWeight = k === chosenGajo ? '600' : '400'
        anatomy.carpelAnchor(k, v3).project(insideCamera)
        el.style.left = `${((v3.x + 1) / 2 * width).toFixed(0)}px`
        el.style.top = `${((1 - v3.y) / 2 * height).toFixed(0)}px`
        el.style.transform = 'translate(-50%, -160%)'
        el.style.whiteSpace = 'nowrap'
      })
      if (hover !== glossFor) { glossFor = hover; glossShown = 0 }
      const about = hover >= 0 ? gajos[hover].about : ''
      glossShown = REDUCED ? about.length : Math.min(about.length, glossShown + 2)
      gloss.textContent = about.slice(0, glossShown)
      Object.assign(gloss.style, narrow ? { left: '20px', top: '330px' } : { left: '50%', top: '66%', transform: 'translateX(-50%)', textAlign: 'center' })
      // On a tall narrow screen the carpels carry numbers; the key names them.
      keyList.style.display = narrow ? 'block' : 'none'
      if (narrow) {
        keyList.innerHTML = gajos.map((g, k) => `<div style="opacity:${k === chosenGajo ? 1 : 0.65};font-weight:${k === chosenGajo ? 600 : 400}">${k + 1}  ${g.name}</div>`).join('')
        Object.assign(keyList.style, { left: '20px', top: '222px', opacity: fanned.toFixed(2) })
      }
    }
  }
  const seedCam = new THREE.PerspectiveCamera(42, 1, 0.001, 10)

  // ---------- Frame loop.
  let rafId = 0, prevT = 0, alive = true, frameMs = 16, slow = 0, drops = 0, nightShown = 0, prevNightT = 0
  function frame(now) {
    if (!alive) return
    const t0 = performance.now()
    const dt = Math.min(0.05, (now - prevT) / 1000 || 0); prevT = now
    const k = REDUCED ? 1 : 1 - Math.pow(0.02, dt)
    let dp = (target - p) * k
    if (!REDUCED && !HOLD) {
      const cap = T.PMAX * dt * Math.max(1, Math.abs(target - p) / T.PLAG)
      if (dp > cap) dp = cap; else if (dp < -cap) dp = -cap
    }
    if (!HOLD) { p += dp; wrap() }
    const pe = T.fold(p)
    const inst = skipV ? 0 : Math.abs(p - pPrev) / Math.max(1e-4, dt)
    skipV = false; pPrev = p
    scrollV = REDUCED ? 0 : T.lerp(scrollV, inst, 1 - Math.pow(0.05, dt))
    // Night eases over time (~1/3 s), so a dawn never lands inside one frame
    // however fast the page is scrolled.
    const nightNow = T.nightAt(pe, T.calmAt(scrollV))
    nightShown = REDUCED || !prevNightT ? nightNow : T.lerp(nightShown, nightNow, 1 - Math.exp(-dt / 0.33))
    prevNightT = 1
    const night = nightShown
    const orange = T.orangeAt(pe)
    const interior = T.interiorAt(pe)

    // The world behind the interior is already the next lap's first frame.
    const worldPe = pe >= 0.93 ? 0 : pe
    // Wind first: growth then parts the leaves in front of the chosen orange.
    plant.updateWind(now / 1000, !REDUCED && worldPe > 0.3)
    grow(worldPe)
    // The next lap's seed appears only once the released one has reached it.
    if (pe >= 0.93 && pe < T.IN_REL[0] + 0.004) fallingSeed.visible = false
    const view = direct(worldPe)
    camera.position.copy(view.position)
    camera.lookAt(view.target)
    // Composition: while a text band is up, the subject moves to the free side
    // of the screen (below it on a tall narrow screen) and steps back a
    // little, as a lens shift, so the 3D view itself does not change.
    let fx = 0, fy = 0, room = 0
    const narrowView = width < 900 && height > 560
    for (const b of bands) {
      if (/\bc\b/.test(b.align ?? '')) continue
      const a = T.bandAlpha(b, pe)
      if (a <= 0) continue
      room = Math.max(room, a)
      if (narrowView) fy += 0.17 * a
      else fx += (/\br\b/.test(b.align ?? '') ? -0.21 : 0.21) * a
    }
    camera.zoom = 1 / (1 + 0.18 * room)
    if (fx || fy) camera.setViewOffset(width, height, -fx * width, -fy * height, width, height)
    else camera.clearViewOffset()
    const span = view.position.distanceTo(view.target)
    camera.near = Math.max(0.0005, span * 0.02); camera.far = Math.max(span * 4 + 20, 130)
    camera.updateProjectionMatrix()
    seedCam.aspect = camera.aspect; seedCam.position.copy(seedPose(tmpA, SEED_START).position); seedCam.lookAt(tmpA.target); seedCam.updateProjectionMatrix(); seedCam.updateMatrixWorld()
    // Sky by day and night. Underground the camera is in the cut, in front of
    // the section, so there is no switch between sky and soil anywhere.
    sky.copy(SKY_DAY).lerp(SKY_DUSK, Math.min(1, night * 2) * 0.35).lerp(SKY_NIGHT, night)
    world.background = null
    world.fog = skyFog
    // Moonlight keeps the tree legible at night, blue and dim.
    hemi.intensity = 2.2 * (1 - 0.38 * night); sun.intensity = 2.4 * (1 - 0.3 * night)
    sun.color.copy(SUN).lerp(MOON, night)
    skyUniforms.horizon.value.copy(sky)
    skyUniforms.top.value.copy(ZENITH_DAY).lerp(SKY_DUSK, Math.min(1, night * 2) * 0.25).lerp(ZENITH_NIGHT, night)
    earth.update({ camera, target: view.target, span, light: 1 - 0.55 * night, haze: sky })
    skyDome.position.copy(camera.position)
    skyFog.color.copy(sky)
    const bg = interior > 0.5 ? inside.background : skyFog.color
    const l = luma(bg)
    const dark = l < 0.42
    brandDark = brandDark ? l < 0.45 : l < 0.39
    navDark = brandDark

    if (interior > 0) placeInside(pe, interior)
    else overlay.style.opacity = '0'
    if (interior <= 0) renderer.render(world, camera)
    else if (interior >= 1) renderer.render(inside, insideCamera)
    else {
      renderer.render(world, camera)
      renderer.autoClear = false
      plateMaterial.opacity = interior
      renderer.render(quadScene, quadCamera)
      inside.background = null
      renderer.clearDepth()
      renderer.render(inside, insideCamera)
      inside.background = PLATE
      renderer.autoClear = true
    }
    updateDOM(pe, T.pToS(p), night, interior, orange, dark)

    // Lower the resolution, never raise it, if frames stay slow.
    frameMs = T.lerp(frameMs, performance.now() - t0, 0.1)
    if (frameMs > 28 && dpr > 0.75) { if (++slow > 90) { dpr = Math.max(0.75, dpr - 0.25); drops++; slow = 0; resize() } } else slow = 0
    rafId = requestAnimationFrame(frame)
  }

  readScroll(); p = target
  if (AT) { p = target = T.clamp(parseFloat(AT[1])); pPrev = p }
  rafId = requestAnimationFrame(frame)

  return {
    home() { scrollTo(0, 0); target = 0; p = 0; pPrev = 0; skipV = true },
    pick(i) {
      const n = PROJECTS.length
      chosenFruit = ((i % n) + n) % n
      const np = 0.74
      target = np; p = np; pPrev = np; skipV = true
      scrollTo(0, T.pToS(np) * maxScroll())
    },
    state() { return { fruit: chosenFruit, gajo: chosenGajo, carried, dpr, calibrated: true, speed: 1, frameMs, drops, renderer: '3d' } },
    destroy() {
      alive = false
      clearTimeout(rt)
      cancelAnimationFrame(rafId)
      for (const [type, fn, opts] of listeners) removeEventListener(type, fn, opts)
      listeners.length = 0
      overlay.remove()
      plant.dispose(); anatomy.dispose(); earth.dispose()
      fallingSeed.geometry.dispose(); fallingSeedMaterial.dispose()
      quad.geometry.dispose(); plateMaterial.dispose()
      renderer.dispose()
    },
  }
}
export { STAGES, PROJECTS, IDEAS }
