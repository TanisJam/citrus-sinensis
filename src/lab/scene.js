import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadVerdantAsset } from './vendor/VerdantVegetation.js'
import { createAssetSlot } from './asset-slot.js'
import { sampleCamera, stageProgress } from './camera-timeline.js'

export function mountTreeScene(canvas, { onReady, onError, windEnabled, mode: initialMode = 'narrative', progress: initialProgress = 0 }) {
  const slot = createAssetSlot()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4f0e6')
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000)
  let renderer, controls, observer, floor, light, asset, frame
  let radius = 1, elapsed = 0, previous = 0, wind = windEnabled
  let mode = initialMode, progress = initialProgress, bounds
  const home = new THREE.Vector3()
  const target = new THREE.Vector3()

  function dispose() {
    if (slot.closed) return
    cancelAnimationFrame(frame)
    observer?.disconnect()
    canvas.removeEventListener('keydown', keydown)
    canvas.removeEventListener('webglcontextlost', contextLost)
    controls?.dispose()
    slot.close() // owns all model geometry, materials, wind patches and textures
    floor?.geometry.dispose()
    floor?.material.dispose()
    light?.shadow.dispose()
    // Do not force context loss: StrictMode immediately reuses this canvas.
    renderer?.dispose()
    scene.clear()
  }
  function fail(error) {
    if (slot.closed) return
    dispose()
    console.error('Tree lab:', error)
    onError()
  }
  function contextLost(event) {
    event.preventDefault()
    fail(new Error('WebGL context lost'))
  }
  function resize() {
    if (slot.closed) return
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (asset) {
      fitCamera()
      if (mode === 'narrative') applyProgress()
    }
  }
  function fitCamera() {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2)
    const limiting = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect))
    const distance = radius / Math.sin(limiting) * 1.12
    home.copy(target).add(new THREE.Vector3(0.85, 0.32, 1).normalize().multiplyScalar(distance))
    camera.near = radius / 100
    camera.far = Math.max(distance, camera.position.distanceTo(controls.target)) + radius * 30
    camera.updateProjectionMatrix()
    const currentDistance = camera.position.distanceTo(controls.target)
    // New limits must not let OrbitControls clamp an existing Explore pose on resize.
    controls.minDistance = currentDistance > 0 ? Math.min(radius * 0.15, currentDistance) : radius * 0.15
    controls.maxDistance = Math.max(distance * 2.5, currentDistance)
  }
  function applyProgress() {
    if (slot.closed || !asset || mode !== 'narrative') return
    const pose = sampleCamera(progress, bounds, camera.fov, camera.aspect)
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    controls.target.set(pose.target.x, pose.target.y, pose.target.z)
    camera.lookAt(controls.target)
  }
  function setMode(value) {
    if (slot.closed) return
    mode = value === 'explore' ? 'explore' : 'narrative'
    if (controls) controls.enabled = mode === 'explore'
    // OrbitControls installs touch-action:none even while disabled.
    canvas.style.touchAction = mode === 'explore' ? 'none' : 'auto'
  }
  function setProgress(value) {
    if (slot.closed || mode !== 'narrative') return
    progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
    applyProgress()
  }
  function reset() {
    if (slot.closed || !asset || mode !== 'explore') return
    camera.position.copy(home)
    controls.target.copy(target)
    controls.update()
  }
  function zoom(factor) {
    if (slot.closed || !asset || mode !== 'explore') return
    const offset = camera.position.clone().sub(controls.target)
    const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target).add(offset.setLength(distance))
    controls.update()
  }
  function rotate(horizontal, vertical) {
    if (slot.closed || !asset || mode !== 'explore') return
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    spherical.theta += horizontal
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, 0.15, controls.maxPolarAngle)
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
    controls.update()
  }
  function keydown(event) {
    if (slot.closed || mode !== 'explore') return
    const keys = {
      ArrowLeft: () => rotate(-0.12, 0), ArrowRight: () => rotate(0.12, 0),
      ArrowUp: () => rotate(0, -0.12), ArrowDown: () => rotate(0, 0.12),
      '+': () => zoom(0.85), '=': () => zoom(0.85), '-': () => zoom(1.18),
      Home: reset,
    }
    if (keys[event.key]) { event.preventDefault(); keys[event.key]() }
  }
  function animate(now) {
    if (slot.closed) return
    try {
      const delta = previous ? Math.min((now - previous) / 1000, 0.05) : 0
      previous = now
      if (wind) elapsed += delta
      asset.wind.strength = wind ? 1 : 0
      asset.update(delta, elapsed, camera)
      if (mode === 'explore') controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    } catch (error) { fail(error) }
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' })
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.maxPolarAngle = Math.PI / 2 - 0.03
    controls.enableDamping = false // direct response, including reduced-motion users
    setMode(mode)
    canvas.addEventListener('keydown', keydown)
    canvas.addEventListener('webglcontextlost', contextLost)
    observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    // Keep shader support installed even when the user's initial wind choice is off.
    loadVerdantAsset('/lab-assets/zelkova/', { windEnabled: true, windStrength: wind ? 1 : 0 }).then(loaded => {
      if (!slot.accept(loaded)) return
      asset = loaded
      try {
        scene.add(asset.root) // keep original base pivot, metres and scale
        bounds = new THREE.Box3().setFromObject(asset.root)
        const sphere = bounds.getBoundingSphere(new THREE.Sphere())
        radius = sphere.radius
        target.copy(sphere.center)
        floor = new THREE.Mesh(new THREE.PlaneGeometry(radius * 16, radius * 16), new THREE.MeshStandardMaterial({ color: '#e9e3d5', roughness: 1 }))
        floor.rotation.x = -Math.PI / 2
        floor.position.y = bounds.min.y - 0.01
        floor.receiveShadow = true
        scene.add(floor, new THREE.HemisphereLight('#fff9ec', '#857f67', 2))
        light = new THREE.DirectionalLight('#fff4da', 3)
        light.position.copy(target).add(new THREE.Vector3(1, 2, 1).multiplyScalar(radius * 2))
        light.target.position.copy(target)
        light.castShadow = true
        light.shadow.mapSize.set(1024, 1024)
        Object.assign(light.shadow.camera, { left: -radius * 1.4, right: radius * 1.4, top: radius * 1.4, bottom: -radius * 1.4, near: 0.1, far: radius * 12 })
        light.shadow.normalBias = 0.035
        scene.add(light, light.target)
        fitCamera()
        if (mode === 'explore') reset()
        else applyProgress()
        asset.update(0, 0, camera)
        renderer.render(scene, camera) // only announce success after an actual render
        onReady()
        frame = requestAnimationFrame(animate)
      } catch (error) { fail(error) }
    }).catch(fail)
  } catch (error) { fail(error) }

  return {
    dispose, reset, zoom, setMode, setProgress,
    setStage: stage => setProgress(stageProgress(stage)),
    setWind: value => { if (!slot.closed) wind = value },
  }
}
