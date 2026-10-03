import * as THREE from 'three'
import { createGrowthSample, sampleGrowth } from './growth-model.js'

// Original meshes; straight centerlines preserve every authored attachment.
const SIDES = 8
const STRIDE = SIDES * 2 + 2

function tubeGeometry(count) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * STRIDE * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * STRIDE * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const indices = []
  for (let slot = 0; slot < count; slot++) {
    const base = slot * STRIDE
    for (let side = 0; side < SIDES; side++) {
      const next = (side + 1) % SIDES
      indices.push(base + side, base + side + SIDES, base + next,
        base + next, base + side + SIDES, base + next + SIDES,
        base + SIDES * 2, base + side, base + next,
        base + SIDES * 2 + 1, base + next + SIDES, base + side + SIDES)
    }
  }
  geometry.setIndex(indices)
  geometry.boundingBox = new THREE.Box3()
  geometry.boundingSphere = new THREE.Sphere()
  return geometry
}

function leafGeometry() {
  // Petiole at origin, narrow neck, pointed elliptic blade and raised midrib.
  const positions = [0, 0, 0], indices = []
  const sections = 10
  for (let j = 1; j <= sections; j++) {
    const y = j / sections
    const blade = Math.max(0, (y - 0.12) / 0.88)
    const width = y <= 0.12 ? 0.012 : 0.24 * Math.sin(Math.PI * blade)
    const ridge = 0.035 * Math.sin(Math.PI * blade)
    positions.push(-width, y, 0, 0, y, ridge, width, y, 0)
    if (j === 1) indices.push(0, 1, 2, 0, 2, 3)
    else {
      const previous = 1 + (j - 2) * 3, current = previous + 3
      for (let side = 0; side < 2; side++) {
        indices.push(previous + side, current + side, previous + side + 1,
          previous + side + 1, current + side, current + side + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function createGrowthRenderer(topology) {
  const group = new THREE.Group()
  group.name = 'growth-tree'
  const geometries = new Set(), materials = new Set()
  const material = options => {
    const result = new THREE.MeshStandardMaterial(options)
    materials.add(result)
    return result
  }
  function add(name, geometry, surface, count) {
    geometries.add(geometry)
    const mesh = count === undefined ? new THREE.Mesh(geometry, surface) : new THREE.InstancedMesh(geometry, surface, count)
    mesh.name = name
    group.add(mesh)
    return mesh
  }
  const rootNodes = topology.nodes.filter(node => node.kind === 'root')
  const woodNodes = topology.nodes.filter(node => node.kind === 'wood')
  const roots = add('roots', tubeGeometry(rootNodes.length), material({ color: 0xc9b58e, roughness: 0.95 }))
  const wood = add('wood', tubeGeometry(woodNodes.length), material({ color: 0x79523a, roughness: 0.9 }))
  const leaves = add('leaves', leafGeometry(), material({ color: 0x28652e, roughness: 0.7, side: THREE.DoubleSide }), topology.leaves.length)
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  leaves.boundingBox = new THREE.Box3()
  leaves.boundingSphere = new THREE.Sphere()
  const reserve = add('seed-reserve', new THREE.SphereGeometry(1, 12, 8), material({ color: 0xf0e1b8, roughness: 0.85 }))
  const shellMaterial = material({ color: 0xc5ad7f, roughness: 0.95, side: THREE.DoubleSide })
  const shells = [0, 1].map(index => add(`seed-shell-${index}`, new THREE.SphereGeometry(1, 12, 8, index * Math.PI, Math.PI), shellMaterial))
  const soil = add('soil', new THREE.PlaneGeometry(9, 9), material({ color: 0xd2c2a4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }))
  soil.rotation.x = -Math.PI / 2
  const bounds = new THREE.Box3()
  const start = new THREE.Vector3(), end = new THREE.Vector3(), direction = new THREE.Vector3()
  const radial = new THREE.Vector3(), normal = new THREE.Vector3(), scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0), windAxis = new THREE.Vector3(1, 0, 0)
  const rotation = new THREE.Quaternion(), gust = new THREE.Quaternion(), matrix = new THREE.Matrix4()
  // Copy leaf pose into owned buffers: callers may immediately reuse their sample.
  const anchors = new Float64Array(topology.leaves.length * 3)
  const directions = new Float64Array(anchors.length), scales = new Float64Array(topology.leaves.length)
  let disposed = false, windEnabled = false, windTime = 0

  function setBounds(box, sphere) {
    box.copy(bounds)
    box.getBoundingSphere(sphere)
  }
  function updateTubes(mesh, nodes, sample) {
    const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal
    for (let slot = 0; slot < nodes.length; slot++) {
      const id = nodes[slot].id, offset = id * 3, base = slot * STRIDE
      start.fromArray(sample.starts, offset)
      end.fromArray(sample.ends, offset)
      direction.subVectors(end, start)
      const length = direction.length()
      if (length > 0) rotation.setFromUnitVectors(up, direction.divideScalar(length))
      else rotation.identity()
      const slope = length > 0 ? (sample.radii[id * 2] - sample.radii[id * 2 + 1]) / length : 0
      for (let ring = 0; ring < 2; ring++) {
        const center = ring ? end : start, radius = sample.radii[id * 2 + ring]
        for (let side = 0; side < SIDES; side++) {
          const angle = side * Math.PI * 2 / SIDES
          radial.set(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(rotation)
          positions.setXYZ(base + ring * SIDES + side, center.x + radial.x * radius, center.y + radial.y * radius, center.z + radial.z * radius)
          normal.set(Math.cos(angle), slope, Math.sin(angle)).normalize().applyQuaternion(rotation)
          normals.setXYZ(base + ring * SIDES + side, normal.x, normal.y, normal.z)
        }
        positions.setXYZ(base + SIDES * 2 + ring, center.x, center.y, center.z)
        normal.copy(up).multiplyScalar(ring ? 1 : -1).applyQuaternion(rotation)
        normals.setXYZ(base + SIDES * 2 + ring, normal.x, normal.y, normal.z)
      }
    }
    positions.needsUpdate = normals.needsUpdate = true
    setBounds(mesh.geometry.boundingBox, mesh.geometry.boundingSphere)
  }
  function updateWind(time, enabled) {
    if (disposed) return
    windTime = Number.isFinite(time) ? time : 0
    windEnabled = Boolean(enabled)
    for (let i = 0; i < scales.length; i++) {
      start.fromArray(anchors, i * 3)
      direction.fromArray(directions, i * 3).normalize()
      if (direction.lengthSq() > 0) rotation.setFromUnitVectors(up, direction)
      else rotation.identity()
      if (windEnabled) {
        gust.setFromAxisAngle(windAxis, 0.12 * Math.sin(windTime * 1.7 + i * 2.399963))
        rotation.multiply(gust)
      }
      scale.setScalar(scales[i])
      matrix.compose(start, rotation, scale)
      leaves.setMatrixAt(i, matrix)
    }
    leaves.instanceMatrix.needsUpdate = true
    // Rigid rotation about the petiole stays inside the model's 1.1*scale ball.
    setBounds(leaves.boundingBox, leaves.boundingSphere)
  }
  function updateGrowth(sample) {
    if (disposed) return
    bounds.min.set(sample.bounds.min.x, sample.bounds.min.y, sample.bounds.min.z)
    bounds.max.set(sample.bounds.max.x, sample.bounds.max.y, sample.bounds.max.z)
    updateTubes(roots, rootNodes, sample)
    updateTubes(wood, woodNodes, sample)
    anchors.set(sample.leafPositions)
    directions.set(sample.leafDirections)
    scales.set(sample.leafScales)
    reserve.position.fromArray(sample.seedPosition)
    reserve.scale.set(0.7, 1, 0.7).multiplyScalar(sample.seed[0])
    reserve.visible = sample.seed[0] > 0
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i], radius = sample.seed[1]
      shell.position.fromArray(sample.seedPosition)
      shell.position.z += (i ? -1 : 1) * radius * sample.seed[2] * 0.15
      shell.scale.set(0.7, 0.8, 0.6).multiplyScalar(radius)
      shell.visible = radius > 0
    }
    updateWind(windTime, windEnabled)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    leaves.dispose()
    for (const geometry of geometries) geometry.dispose()
    for (const surface of materials) surface.dispose()
    group.removeFromParent()
  }
  updateGrowth(sampleGrowth(topology, 0, createGrowthSample(topology)))
  return { group, bounds, updateGrowth, updateWind, dispose }
}
