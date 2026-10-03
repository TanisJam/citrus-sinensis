import assert from 'node:assert/strict'
import { GROWTH_CAMERA_FOV, sampleGrowthCamera } from '../src/lab/camera-timeline.js'
import { STAGES, createGrowthTopology, createGrowthSample, sampleGrowth } from '../src/lab/growth-model.js'

const axes = ['x', 'y', 'z']
const sub = (a, b) => axes.map(k => a[k] - b[k])
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = v => { const length = Math.hypot(...v); return v.map(value => value / length) }
const distance = (a, b) => Math.hypot(...sub(a, b))
const corners = box => Array.from({ length: 8 }, (_, c) => Object.fromEntries(axes.map((k, i) => [k, c & (1 << i) ? box.max[k] : box.min[k]])))

// Project every bounds corner through a Y-up lookAt camera, like PerspectiveCamera.
function assertFramed(pose, box, aspect, label) {
  assert.ok([...Object.values(pose.position), ...Object.values(pose.target), pose.fov, pose.near, pose.far].every(Number.isFinite), label)
  const forward = unit(sub(pose.target, pose.position))
  const right = unit(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const tan = Math.tan(pose.fov * Math.PI / 360)
  for (const corner of corners(box)) {
    const offset = sub(corner, pose.position)
    const depth = dot(offset, forward)
    assert.ok(depth >= pose.near - 1e-9 && depth <= pose.far + 1e-9, `${label}: corner between clip planes`)
    assert.ok(Math.abs(dot(offset, up) / depth / tan) <= 0.78 + 1e-9, `${label}: vertical margin`)
    assert.ok(Math.abs(dot(offset, right) / depth / (tan * aspect)) <= 0.78 + 1e-9, `${label}: horizontal margin`)
  }
}

const topology = createGrowthTopology(2026)
const sample = createGrowthSample(topology)
const at = p => structuredClone(sampleGrowth(topology, p, sample).bounds)
const aspects = [16 / 9, 1.5, 1, 390 / 600, 390 / 844]
assert.equal(GROWTH_CAMERA_FOV, 42)

let previous
for (let step = 0; step <= 300; step++) {
  const p = step / 300, box = at(p), before = structuredClone(box)
  for (const aspect of aspects) {
    const pose = sampleGrowthCamera(box, p, aspect)
    assertFramed(pose, box, aspect, `p=${p} aspect=${aspect}`)
    assert.equal(pose.fov, 42)
    assert.equal(pose.near, 0.005)
    assert.deepEqual(sampleGrowthCamera(box, p, aspect), pose, 'deterministic, no accumulated state')
  }
  assert.deepEqual(box, before, 'sampling never mutates bounds')
  const pose = sampleGrowthCamera(box, p, 1.5)
  // Bounds only grow by small steps; the camera must follow without stage jumps.
  if (previous) assert.ok(distance(pose.position, previous.position) < 0.35, `continuous at ${p}`)
  previous = pose
}
// Soil is not in renderer bounds: the seed starts close and the adult is farther.
const seed = sampleGrowthCamera(at(0), 0, 1.5), adult = sampleGrowthCamera(at(1), 1, 1.5)
assert.ok(distance(seed.position, seed.target) < 2, 'seed is framed closely')
assert.ok(distance(adult.position, adult.target) > 4 * distance(seed.position, seed.target), 'camera widens with growth')
assert.ok(at(1).min.y < -1, 'adult framing includes roots below the soil datum')

// Every stage anchor is identical whether sought directly or reached by scrolling back.
const forward = STAGES.map(stage => sampleGrowthCamera(at(stage.progress), stage.progress, 1.5))
for (let p = 1; p >= 0; p -= 0.01) sampleGrowthCamera(at(p), p, 1.5)
assert.deepEqual(STAGES.map(stage => sampleGrowthCamera(at(stage.progress), stage.progress, 1.5)), forward)

// Alternate FOV and a deep diagonal box still fit, including the depth of near corners.
const deep = { min: { x: -4, y: -1, z: -6 }, max: { x: 3, y: 5, z: 7 } }
for (const aspect of aspects) for (const fov of [30, 42, 70]) {
  assertFramed(sampleGrowthCamera(deep, 0.5, aspect, fov), deep, aspect, `deep fov=${fov}`)
}
// Guards: invalid bounds, projection and progress fall back to finite defaults.
const fallback = sampleGrowthCamera(undefined, 0, 1)
for (const box of [null, {}, { min: { x: 0, y: 0, z: 0 }, max: { x: NaN, y: 1, z: 1 } },
  { min: { x: 1, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } }, { min: { x: -Infinity, y: 0, z: 0 }, max: { x: 0, y: 1, z: 1 } }]) {
  assert.deepEqual(sampleGrowthCamera(box, 0, 1), fallback, 'invalid bounds use the small seed box')
}
assertFramed(fallback, { min: { x: -0.15, y: -0.11, z: -0.15 }, max: { x: 0.15, y: 0.19, z: 0.15 } }, 1, 'fallback')
for (const [fov, aspect] of [[NaN, NaN], [0, 0], [180, -1]]) {
  assert.deepEqual(sampleGrowthCamera(at(0.5), 0.5, aspect, fov), sampleGrowthCamera(at(0.5), 0.5, 1), 'invalid projection uses defaults')
}
assert.deepEqual(sampleGrowthCamera(at(1), 2, 1), sampleGrowthCamera(at(1), 1, 1))
assert.deepEqual(sampleGrowthCamera(at(0), NaN, 1), sampleGrowthCamera(at(0), 0, 1))
const flat = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
assertFramed(sampleGrowthCamera(flat, 0, 1), { min: { x: -0.125, y: -0.125, z: -0.125 }, max: { x: 0.125, y: 0.125, z: 0.125 } }, 1, 'degenerate min span')
assert.ok(Object.values(sampleGrowthCamera(at(0.5), 0.5, Number.MIN_VALUE).position).every(Number.isFinite), 'overflow falls back')
console.log('lab growth camera: framing, clip planes, continuity, reversal and guards passed')
