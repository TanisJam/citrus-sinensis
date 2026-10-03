import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createGrowthTopology, createGrowthSample, sampleGrowth } from '../src/lab/growth-model.js'
import { createGrowthRenderer } from '../src/lab/growth-renderer.js'

const topology = createGrowthTopology(2026)
const sample = createGrowthSample(topology)
const renderer = createGrowthRenderer(topology)
const named = name => renderer.group.getObjectByName(name)
const roots = named('roots'), wood = named('wood'), leaves = named('leaves')
assert.equal(leaves.count, 300)
assert.ok(named('seed-reserve').visible)
assert.equal(named('soil').position.y, 0)
assert.equal(named('soil').material.depthWrite, false)
const resources = new Set(), identities = []
renderer.group.traverse(object => {
  for (const resource of [object.geometry, object.material, object.isInstancedMesh ? object : null]) {
    if (resource) resources.add(resource)
  }
  if (object.geometry) identities.push([object, object.geometry, object.material, object.geometry.attributes.position, object.geometry.attributes.normal, object.geometry.index, object.instanceMatrix])
})
const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3()
const near = (a, b) => assert.ok(Math.abs(a - b) < 2e-6, `${a} != ${b}`)
let previousActive = 0
for (let step = 0; step <= 300; step++) {
  sampleGrowth(topology, step / 300, sample)
  renderer.updateGrowth(sample)
  let active = 0
  for (const mesh of [roots, wood]) {
    const matching = topology.nodes.filter(node => node.kind === (mesh === roots ? 'root' : 'wood'))
    const positions = mesh.geometry.attributes.position
    matching.forEach((node, slot) => {
      active += sample.growth[node.id] > 0 ? 1 : 0
      for (let end = 0; end < 2; end++) {
        const center = slot * 18 + 16 + end
        for (let axis = 0; axis < 3; axis++) near(positions.array[center * 3 + axis], (end ? sample.ends : sample.starts)[node.id * 3 + axis])
        const radius = sample.radii[node.id * 2 + end]
        for (let side = 0; side < 8; side++) {
          vertex.fromBufferAttribute(positions, slot * 18 + end * 8 + side)
          near(vertex.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, center)), radius)
        }
      }
    })
    assert.ok([...positions.array, ...mesh.geometry.attributes.normal.array].every(Number.isFinite))
    assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius))
  }
  assert.ok(active >= previousActive)
  previousActive = active
  for (let i = 0; i < leaves.count; i++) {
    leaves.getMatrixAt(i, matrix)
    for (let axis = 0; axis < 3; axis++) near(matrix.elements[12 + axis], sample.leafPositions[i * 3 + axis])
    if (!sample.leafScales[i]) assert.equal(matrix.elements[0], 0)
  }
  const baseline = leaves.instanceMatrix.array.slice()
  renderer.updateWind(step * 0.17, true)
  if (step === 300) assert.notDeepEqual(leaves.instanceMatrix.array, baseline)
  for (let i = 0; i < leaves.count; i++) {
    leaves.getMatrixAt(i, matrix)
    for (let axis = 0; axis < 3; axis++) near(matrix.elements[12 + axis], sample.leafPositions[i * 3 + axis])
    for (let j = 0; j < leaves.geometry.attributes.position.count; j++) {
      vertex.fromBufferAttribute(leaves.geometry.attributes.position, j).applyMatrix4(matrix)
      assert.ok(vertex.distanceTo(leaves.boundingSphere.center) <= leaves.boundingSphere.radius + 2e-6)
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(vertex[axis] >= sample.bounds.min[axis] - 2e-6 && vertex[axis] <= sample.bounds.max[axis] + 2e-6)
      }
    }
  }
  renderer.updateWind(-step, false)
  assert.deepEqual(leaves.instanceMatrix.array, baseline)
  for (const [object, geometry, material, position, normal, index, instances] of identities) {
    assert.equal(object.geometry, geometry)
    assert.equal(object.material, material)
    assert.equal(geometry.attributes.position, position)
    assert.equal(geometry.attributes.normal, normal)
    assert.equal(geometry.index, index)
    assert.equal(object.instanceMatrix, instances)
  }
}
assert.equal(previousActive, 94)
assert.ok([...leaves.instanceMatrix.array].every(Number.isFinite))
const leafPosition = leaves.geometry.attributes.position
for (let i = 0; i < leafPosition.count; i++) assert.ok(vertex.fromBufferAttribute(leafPosition, i).length() <= 1.1)
assert.deepEqual([...leafPosition.array.slice(0, 3)], [0, 0, 0])
sampleGrowth(topology, 0.4, sample)
renderer.updateGrowth(sample)
const snapshot = wood.geometry.attributes.position.array.slice()
renderer.updateGrowth(sampleGrowth(topology, 1, sample))
renderer.updateGrowth(sampleGrowth(topology, 0.4, sample))
assert.deepEqual(wood.geometry.attributes.position.array, snapshot)
renderer.updateGrowth(sampleGrowth(topology, 0, sample))
assert.ok([...roots.geometry.attributes.position.array, ...wood.geometry.attributes.position.array].every(value => value === 0))
const disposed = new Map()
for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1))
renderer.dispose()
renderer.dispose()
renderer.updateGrowth(sample)
renderer.updateWind(1, true)
for (const resource of resources) assert.equal(disposed.get(resource), 1)
console.log('lab renderer: buffers, anchors, reversible wind and owned disposal passed')
