import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CROWN, createGrowthTopology, createGrowthSample, sampleGrowth, SEED_SIZE } from '../src/lab/growth-model.js'
import { createGrowthRenderer, CAP } from '../src/lab/growth-renderer.js'

const topology = createGrowthTopology(2026)
const sample = createGrowthSample(topology)
const renderer = createGrowthRenderer(topology)
const named = name => renderer.group.getObjectByName(name)
const roots = named('roots'), wood = named('wood'), leaves = named('leaves'), thorns = named('thorns')
assert.equal(leaves.instanceMatrix.count, topology.leaves.length)
assert.equal(thorns.count, topology.thorns.length)
assert.equal(leaves.count, 0, 'no leaf is drawn on a sown seed')
assert.ok(named('seed-reserve').visible)
assert.equal(named('soil').position.y, 0)
assert.equal(named('soil').material.depthWrite, false)
const resources = new Set(), identities = []
renderer.group.traverse(object => {
  for (const resource of [object.geometry, object.material, object.isInstancedMesh ? object : null]) {
    if (resource) resources.add(resource)
  }
  if (object.geometry) identities.push([object, object.geometry, object.material, object.geometry.attributes.position, object.geometry.attributes.normal, object.geometry.index, object.instanceMatrix, object.instanceColor])
})
// Leaf mesh: unit length from the petiole base, inside the 1.1 ball the bounds assume.
const leafPosition = leaves.geometry.attributes.position
const vertex = new THREE.Vector3(), matrix = new THREE.Matrix4(), color = new THREE.Color()
for (let i = 0; i < leafPosition.count; i++) assert.ok(vertex.fromBufferAttribute(leafPosition, i).length() <= 1.1)
assert.deepEqual([...leafPosition.array.slice(3, 6)], [0, 0, 0], 'petiole midline starts at the anchor')
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 2e-6, `${label}: ${a} != ${b}`)
const probe = Array.from({ length: 60 }, (_, k) => Math.floor(k * topology.leaves.length / 60))
let previousActive = 0
for (let step = 0; step <= 120; step++) {
  sampleGrowth(topology, step / 120, sample)
  renderer.updateGrowth(sample)
  assert.equal(leaves.count, sample.leafCount)
  let active = 0
  for (const mesh of [roots, wood]) {
    const matching = topology.nodes.filter(node => node.kind === (mesh === roots ? 'root' : 'wood'))
    const positions = mesh.geometry.attributes.position
    matching.forEach((node, slot) => {
      active += sample.growth[node.id] > 0 ? 1 : 0
      for (let end = 0; end < 2; end++) {
        const center = slot * 18 + 16 + end
        // The cap's centre domes out along the axis by CAP radii.
        const from = new THREE.Vector3().fromArray(sample.starts, node.id * 3), to = new THREE.Vector3().fromArray(sample.ends, node.id * 3)
        const axisDir = to.clone().sub(from), len = axisDir.length()
        const domed = (end ? to : from).clone().addScaledVector(len > 0 ? axisDir.divideScalar(len) : axisDir, len > 0 ? (end ? 1 : -1) * CAP * Math.round(sample.radii[node.id * 2 + end] * 1e5) / 1e5 : 0)
        for (let axis = 0; axis < 3; axis++) near(positions.array[center * 3 + axis], domed.getComponent(axis), 'tube end')
        const radius = Math.round(sample.radii[node.id * 2 + end] * 1e5) / 1e5 // drawn on a 0.01 mm grid
        vertex.fromBufferAttribute(positions, slot * 18 + end * 8)
        near(vertex.distanceTo(end ? to : from), radius, 'ring radius')
      }
    })
    assert.ok([...positions.array, ...mesh.geometry.attributes.normal.array, ...mesh.geometry.attributes.color.array].every(Number.isFinite))
    assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius))
  }
  assert.ok(active >= previousActive)
  previousActive = active
  for (const i of probe.filter(i => i < leaves.count)) {
    leaves.getMatrixAt(i, matrix)
    for (let axis = 0; axis < 3; axis++) near(matrix.elements[12 + axis], sample.leafPositions[i * 3 + axis], 'leaf anchor')
    // The blade's upper side turns toward the light: up and out of the crown.
    if (sample.leafScales[i] > 0) {
      const [x, y, z] = sample.leafPositions.slice(i * 3, i * 3 + 3)
      const light = new THREE.Vector3(x / CROWN.radius, Math.max(0, (y - CROWN.y) / CROWN.height), z / CROWN.radius)
      light.multiplyScalar(Math.min(1, light.length())).add(new THREE.Vector3(0, 1, 0))
      assert.ok(new THREE.Vector3(matrix.elements[8], matrix.elements[9], matrix.elements[10]).dot(light) >= -1e-9, 'upper side faces the light')
    }
    leaves.getColorAt(i, color)
    assert.ok(color.g > color.r && color.g > color.b, 'leaves are green at every age')
  }
  // Wind is a rigid flutter about the petiole, in the vertex shader: the
  // instance frames never move, and any rotation of the 1.1 ball stays inside
  // the bounds, so checking the static frames bounds every gust.
  const baseline = leaves.instanceMatrix.array.slice()
  renderer.updateWind(step * 0.17, true)
  assert.deepEqual([renderer.wind.time.value, renderer.wind.strength.value], [step * 0.17, 1])
  assert.deepEqual(leaves.instanceMatrix.array, baseline, 'wind leaves the instance frames alone')
  for (const i of probe.filter(i => i < leaves.count && sample.leafScales[i] > 0)) {
    leaves.getMatrixAt(i, matrix)
    const reach = 1.1 * matrix.getMaxScaleOnAxis()
    for (const [k, axis] of ['x', 'y', 'z'].entries()) {
      const c = matrix.elements[12 + k]
      assert.ok(c - reach >= sample.bounds.min[axis] - 2e-6 && c + reach <= sample.bounds.max[axis] + 2e-6, 'swaying leaf inside bounds')
    }
  }
  renderer.updateWind(-step, false)
  assert.equal(renderer.wind.strength.value, 0, 'wind off is the static pose')
  for (const [object, geometry, material, position, normal, index, instances, colors] of identities) {
    assert.equal(object.geometry, geometry)
    assert.equal(object.material, material)
    assert.equal(geometry.attributes.position, position)
    assert.equal(geometry.attributes.normal, normal)
    assert.equal(geometry.index, index)
    assert.equal(object.instanceMatrix, instances)
    assert.equal(object.instanceColor, colors)
  }
}
assert.equal(previousActive, topology.nodes.length)
// A still canopy costs nothing per frame.
const still = leaves.instanceMatrix.version
renderer.updateWind(5, false)
assert.equal(leaves.instanceMatrix.version, still)
// Parting leaves out of a close-up is reversible, and survives growth updates
// that do not touch those leaves (they are not re-posed then).
{
  const k = Math.floor(leaves.count / 2), before = new THREE.Matrix4(), now = new THREE.Matrix4()
  leaves.getMatrixAt(k, before)
  renderer.fadeLeaves([k], 0.25)
  leaves.getMatrixAt(k, now)
  near(now.getMaxScaleOnAxis(), before.getMaxScaleOnAxis() * 0.25, 'faded leaf scale')
  renderer.updateGrowth(sample)
  leaves.getMatrixAt(k, now)
  near(now.getMaxScaleOnAxis(), before.getMaxScaleOnAxis() * 0.25, 'fade kept across updates')
  renderer.fadeLeaves([k], 1)
  leaves.getMatrixAt(k, now)
  for (let e = 0; e < 16; e++) near(now.elements[e], before.elements[e], 'unfaded leaf restored')
}
// Wood greens to bark, roots whiten to brown; thorns stand in leaf axils.
const woodColors = wood.geometry.attributes.color
const trunkSlot = topology.nodes.filter(n => n.kind === 'wood').findIndex(n => n.level === 0)
color.fromBufferAttribute(woodColors, trunkSlot * 18)
assert.ok(color.r > color.g * 0.85, 'old trunk is grey-brown, not green')
for (let i = 0; i < thorns.count; i++) {
  thorns.getMatrixAt(i, matrix)
  for (let axis = 0; axis < 3; axis++) near(matrix.elements[12 + axis], sample.thornPositions[i * 3 + axis], 'thorn anchor')
}
// Seed: ovoid reserve inside its coat at the sowing depth.
sampleGrowth(topology, 0, sample)
renderer.updateGrowth(sample)
const coat = named('seed-shell-0'), reserve = named('seed-reserve')
assert.deepEqual(coat.scale.toArray(), [...SEED_SIZE])
assert.ok(reserve.scale.y < coat.scale.y && reserve.scale.x < coat.scale.x)
assert.equal(coat.position.y, sample.seedPosition[1])
// Rewind is exact.
sampleGrowth(topology, 0.4, sample)
renderer.updateGrowth(sample)
const snapshot = wood.geometry.attributes.position.array.slice()
renderer.updateGrowth(sampleGrowth(topology, 1, sample))
renderer.updateGrowth(sampleGrowth(topology, 0.4, sample))
assert.deepEqual(wood.geometry.attributes.position.array, snapshot)
renderer.updateGrowth(sampleGrowth(topology, 0, sample))
// Unsprouted organs collapse to a point at their bud: no visible tube.
for (const mesh of [roots, wood]) {
  const positions = mesh.geometry.attributes.position.array
  for (let v = 0; v < positions.length / 3; v++) {
    const center = (Math.floor(v / 18) * 18 + 16) * 3
    for (let axis = 0; axis < 3; axis++) assert.equal(positions[v * 3 + axis], positions[center + axis])
  }
}
const disposed = new Map()
for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1))
renderer.dispose()
renderer.dispose()
renderer.updateGrowth(sample)
renderer.updateWind(1, true)
for (const resource of resources) assert.equal(disposed.get(resource), 1)
console.log('lab renderer: tubes, leaf frames and colours, thorns, seed, reversible wind and owned disposal passed')
