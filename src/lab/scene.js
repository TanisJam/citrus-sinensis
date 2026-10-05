import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createGrowthTopology, createGrowthSample, sampleGrowth } from './growth-model.js'
import { createGrowthRenderer } from './growth-renderer.js'
import { GROWTH_CAMERA_FOV, sampleGrowthCamera } from './camera-timeline.js'

// Growth and narrative camera share one progress; Explore freezes both.
export function mountTreeScene(canvas, { onReady, onError, windEnabled, mode: initialMode = 'narrative', progress: initialProgress = 0 }) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4f0e6')
  const camera = new THREE.PerspectiveCamera(GROWTH_CAMERA_FOV, 1, 0.005, 100)
  const topology = createGrowthTopology(2026)
  const sample = createGrowthSample(topology)
  let renderer, controls, observer, plant, light, frame
  let closed = false, elapsed = 0, previous = 0, wind = windEnabled
  let mode = initialMode, progress = clampProgress(initialProgress)
  const home = { position: new THREE.Vector3(), target: new THREE.Vector3() }

  function clampProgress(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  }
  function dispose() {
    if (closed) return
    closed = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    canvas.removeEventListener('keydown', keydown)
    canvas.removeEventListener('webglcontextlost', contextLost)
    controls?.dispose()
    plant?.dispose() // owns every growth geometry, material and instance buffer
    // Do not force context loss: StrictMode immediately reuses this canvas.
    renderer?.dispose()
    scene.clear()
  }
  function fail(error) {
    if (closed) return
    dispose()
    console.error('Tree lab:', error)
    onError()
  }
  function contextLost(event) {
    event.preventDefault()
    fail(new Error('WebGL context lost'))
  }
  function grow() {
    sampleGrowth(topology, progress, sample)
    plant.updateGrowth(sample)
  }
  function fitCamera() {
    const pose = sampleGrowthCamera(plant.bounds, progress, camera.aspect)
    home.position.set(pose.position.x, pose.position.y, pose.position.z)
    home.target.set(pose.target.x, pose.target.y, pose.target.z)
    const span = home.position.distanceTo(home.target)
    // Explore may orbit or zoom past the fitted far plane; keep the plant clipped by neither.
    camera.near = pose.near
    camera.far = mode === 'explore' ? Math.max(pose.far, span * 4) : pose.far
    camera.updateProjectionMatrix()
    const current = camera.position.distanceTo(controls.target)
    // New limits must not let OrbitControls clamp an existing Explore pose on resize.
    controls.minDistance = Math.min(span * 0.2, current || Infinity)
    controls.maxDistance = Math.max(span * 2.5, current)
  }
  function applyProgress() {
    if (closed || !plant || mode !== 'narrative') return
    grow()
    fitCamera()
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    camera.lookAt(controls.target)
  }
  function resize() {
    if (closed) return
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (!plant) return
    if (mode === 'narrative') applyProgress()
    else fitCamera()
  }
  function setMode(value) {
    if (closed) return
    mode = value === 'explore' ? 'explore' : 'narrative'
    if (controls) controls.enabled = mode === 'explore'
    // OrbitControls installs touch-action:none even while disabled.
    canvas.style.touchAction = mode === 'explore' ? 'none' : 'auto'
    if (plant && mode === 'explore') fitCamera()
  }
  function setProgress(value) {
    if (closed || mode !== 'narrative') return
    progress = clampProgress(value)
    applyProgress()
  }
  function reset() {
    if (closed || !plant || mode !== 'explore') return
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    controls.update()
  }
  function zoom(factor) {
    if (closed || !plant || mode !== 'explore') return
    const offset = camera.position.clone().sub(controls.target)
    const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target).add(offset.setLength(distance))
    controls.update()
  }
  function rotate(horizontal, vertical) {
    if (closed || !plant || mode !== 'explore') return
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    spherical.theta += horizontal
    // Roots live below the soil datum: allow looking up from beneath it too.
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, 0.15, Math.PI - 0.15)
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
    controls.update()
  }
  function keydown(event) {
    if (closed || mode !== 'explore') return
    const keys = {
      ArrowLeft: () => rotate(-0.12, 0), ArrowRight: () => rotate(0.12, 0),
      ArrowUp: () => rotate(0, -0.12), ArrowDown: () => rotate(0, 0.12),
      '+': () => zoom(0.85), '=': () => zoom(0.85), '-': () => zoom(1.18),
      Home: reset,
    }
    if (keys[event.key]) { event.preventDefault(); keys[event.key]() }
  }
  function animate(now) {
    if (closed) return
    try {
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0
      previous = now
      if (wind) elapsed += delta
      plant.updateWind(elapsed, wind)
      if (mode === 'explore') controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    } catch (error) { fail(error) }
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' })
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.minPolarAngle = 0.15
    controls.maxPolarAngle = Math.PI - 0.15
    controls.enableDamping = false // direct response, including reduced-motion users
    plant = createGrowthRenderer(topology)
    scene.add(plant.group, new THREE.HemisphereLight('#fff9ec', '#b9ad8c', 2.2))
    light = new THREE.DirectionalLight('#fff4da', 2.4)
    light.position.set(4, 9, 6)
    scene.add(light)
    setMode(mode)
    canvas.addEventListener('keydown', keydown)
    canvas.addEventListener('webglcontextlost', contextLost)
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    // Explore restored from a mount keeps the growth at its saved progress.
    grow()
    fitCamera()
    camera.position.copy(home.position)
    controls.target.copy(home.target)
    camera.lookAt(controls.target)
    plant.updateWind(elapsed, wind)
    renderer.render(scene, camera) // only announce success after an actual render
    onReady()
    frame = requestAnimationFrame(animate)
  } catch (error) { fail(error) }

  return {
    dispose, reset, zoom, setMode, setProgress,
    setWind: value => { if (!closed) wind = value },
  }
}
