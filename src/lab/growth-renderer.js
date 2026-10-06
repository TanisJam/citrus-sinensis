import * as THREE from 'three'
import { CROWN, SEED_SIZE, createGrowthSample, sampleGrowth } from './growth-model.js'

// Original meshes; straight centerlines preserve every authored attachment.
const SIDES = 8
const STRIDE = SIDES * 2 + 2

function tubeGeometry(count) {
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'color']) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * STRIDE * 3), 3).setUsage(THREE.DynamicDrawUsage))
  }
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

// Sweet orange leaf, unit length along +Y from the petiole base, upper side +Z:
// a short narrowly winged petiole, the articulation, then an elliptic-ovate
// blade with a short acuminate tip, faintly crenulate margin, folded midrib and
// a gentle downward arch.
function leafGeometry() {
  const PETIOLE = 0.15, ACROSS = [-1, 0, 1]
  const rows = []
  for (const t of [0, 0.09, PETIOLE]) {
    // Narrow obovate wing that pinches to the joint with the blade.
    rows.push([t, t === PETIOLE ? 0.006 : 0.008 + 0.03 * Math.sin(Math.PI * t / 0.15) ** 0.8])
  }
  for (let j = 1; j <= 10; j++) {
    const u = j / 10, t = PETIOLE + (1 - PETIOLE) * u
    let half = 0.2 * Math.sin(Math.PI * u ** 0.8) ** 1.05
    if (u > 0.82) half *= 1 - 0.55 * ((u - 0.82) / 0.18) ** 1.5 // acuminate tip
    half *= 1 + 0.025 * Math.sin(u * 44) // crenulate margin
    rows.push([t, j === 10 ? 0 : half])
  }
  const positions = [], indices = []
  for (const [t, half] of rows) {
    for (const a of ACROSS) {
      // Halves rise from a sunken midrib; the blade arches down toward the tip.
      positions.push(a * half, t, 0.15 * Math.abs(a * half) - 0.09 * t * t)
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < ACROSS.length - 1; c++) {
      const i = r * ACROSS.length + c, k = i + ACROSS.length
      indices.push(i, i + 1, k, i + 1, k + 1, k)
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

// Straight axillary thorn, base at the origin.
function thornGeometry() {
  const geometry = new THREE.ConeGeometry(0.09, 1, 6)
  geometry.translate(0, 0.5, 0)
  return geometry
}

const color = hex => new THREE.Color(hex)
// Young shoots are smooth yellow-green; bark turns greyish-green, old trunks grey-brown.
const SHOOT = color(0x6f9a34), BARK = color(0x858a70), OLD_BARK = color(0x6a6157)
const ROOT_TIP = color(0xf1e9d2), ROOT_OLD = color(0x8c6c4b)
// Flush leaves open light green and harden to dark glossy green.
const LEAF_YOUNG = color(0xa3c75a), LEAF_MATURE = color(0x245a20)

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
  const roots = add('roots', tubeGeometry(rootNodes.length), material({ vertexColors: true, roughness: 0.95 }))
  const wood = add('wood', tubeGeometry(woodNodes.length), material({ vertexColors: true, roughness: 0.85 }))
  const leafSurface = material({ color: 0xffffff, roughness: 0.38, side: THREE.DoubleSide })
  // The underside is paler and matte.
  leafSurface.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.55, 0.26), 0.35);')
  }
  const leaves = add('leaves', leafGeometry(), leafSurface, topology.leaves.length)
  const thorns = add('thorns', thornGeometry(), material({ color: 0x7d8a47, roughness: 0.6 }), topology.thorns.length)
  for (const mesh of [leaves, thorns]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.boundingBox = new THREE.Box3()
    mesh.boundingSphere = new THREE.Sphere()
  }
  leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(topology.leaves.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
  // Seed: buried cotyledons inside a creamy, split seed coat.
  const reserve = add('seed-reserve', new THREE.SphereGeometry(1, 16, 12), material({ color: 0xf4ecd4, roughness: 0.8 }))
  const shellMaterial = material({ color: 0xe6d9b8, roughness: 0.95, side: THREE.DoubleSide })
  const shells = [0, 1].map(index => add(`seed-shell-${index}`, new THREE.SphereGeometry(1, 16, 12, index * Math.PI, Math.PI), shellMaterial))
  const soil = add('soil', new THREE.PlaneGeometry(9, 9), material({ color: 0xd2c2a4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }))
  soil.rotation.x = -Math.PI / 2
  const bounds = new THREE.Box3()
  const start = new THREE.Vector3(), end = new THREE.Vector3(), direction = new THREE.Vector3()
  const radial = new THREE.Vector3(), normal = new THREE.Vector3(), scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), face = new THREE.Vector3(), light = new THREE.Vector3()
  const rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4(), gust = new THREE.Matrix4()
  const tint = new THREE.Color(), bark = new THREE.Color()
  // Copy leaf pose into owned buffers: callers may immediately reuse their sample.
  const anchors = new Float64Array(topology.leaves.length * 3)
  const directions = new Float64Array(anchors.length), scales = new Float64Array(topology.leaves.length)
  let disposed = false, windEnabled = false, windTime = 0

  function setBounds(box, sphere) {
    box.copy(bounds)
    box.getBoundingSphere(sphere)
  }
  function updateTubes(mesh, nodes, sample, isRoot) {
    const { position: positions, normal: normals, color: colors } = mesh.geometry.attributes
    for (let slot = 0; slot < nodes.length; slot++) {
      const id = nodes[slot].id, offset = id * 3, base = slot * STRIDE
      start.fromArray(sample.starts, offset)
      end.fromArray(sample.ends, offset)
      direction.subVectors(end, start)
      const length = direction.length()
      if (length > 0) rotation.setFromUnitVectors(up, direction.divideScalar(length))
      else rotation.identity()
      const slope = length > 0 ? (sample.radii[id * 2] - sample.radii[id * 2 + 1]) / length : 0
      const age = sample.maturity[id]
      if (isRoot) tint.copy(ROOT_TIP).lerp(ROOT_OLD, age)
      else tint.copy(SHOOT).lerp(bark.copy(BARK).lerp(OLD_BARK, Math.min(1, sample.radii[id * 2] / 0.04)), age)
      for (let ring = 0; ring < 2; ring++) {
        const center = ring ? end : start, radius = sample.radii[id * 2 + ring]
        for (let s = 0; s < SIDES; s++) {
          const angle = s * Math.PI * 2 / SIDES, vertex = base + ring * SIDES + s
          radial.set(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(rotation)
          positions.setXYZ(vertex, center.x + radial.x * radius, center.y + radial.y * radius, center.z + radial.z * radius)
          normal.set(Math.cos(angle), slope, Math.sin(angle)).normalize().applyQuaternion(rotation)
          normals.setXYZ(vertex, normal.x, normal.y, normal.z)
          colors.setXYZ(vertex, tint.r, tint.g, tint.b)
        }
        positions.setXYZ(base + SIDES * 2 + ring, center.x, center.y, center.z)
        normal.copy(up).multiplyScalar(ring ? 1 : -1).applyQuaternion(rotation)
        normals.setXYZ(base + SIDES * 2 + ring, normal.x, normal.y, normal.z)
        colors.setXYZ(base + SIDES * 2 + ring, tint.r, tint.g, tint.b)
      }
    }
    positions.needsUpdate = normals.needsUpdate = colors.needsUpdate = true
    setBounds(mesh.geometry.boundingBox, mesh.geometry.boundingSphere)
  }
  // Leaf frame: length along its direction; the blade turns toward the light,
  // i.e. up and out of the crown, as leaves on a citrus canopy surface do.
  function poseLeaves() {
    for (let i = 0; i < leaves.count; i++) {
      direction.fromArray(directions, i * 3).normalize()
      start.fromArray(anchors, i * 3)
      // Outward only sideways or upward: low and seedling leaves still face the sky.
      light.set(start.x / CROWN.radius, Math.max(0, (start.y - CROWN.y) / CROWN.height), start.z / CROWN.radius)
      light.multiplyScalar(Math.min(1, light.length())).add(up)
      side.crossVectors(direction, light)
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
      side.normalize()
      face.crossVectors(side, direction)
      if (face.dot(light) < 0) { side.negate(); face.negate() }
      matrix.makeBasis(side, direction, face)
      // Wind flutters the blade about the petiole's hinge axis.
      if (windEnabled) matrix.multiply(gust.makeRotationX(0.14 * Math.sin(windTime * 1.7 + i * 2.399963)))
      matrix.scale(scale.setScalar(scales[i]))
      matrix.setPosition(start)
      leaves.setMatrixAt(i, matrix)
    }
    leaves.instanceMatrix.needsUpdate = true
    // Rigid rotation about the petiole stays inside the model's 1.1*scale ball.
    setBounds(leaves.boundingBox, leaves.boundingSphere)
  }
  function updateWind(time, enabled) {
    if (disposed) return
    const was = windEnabled
    windTime = Number.isFinite(time) ? time : 0
    windEnabled = Boolean(enabled)
    // A still canopy needs no per-frame work.
    if (windEnabled || was) poseLeaves()
  }
  function updateGrowth(sample) {
    if (disposed) return
    bounds.min.set(sample.bounds.min.x, sample.bounds.min.y, sample.bounds.min.z)
    bounds.max.set(sample.bounds.max.x, sample.bounds.max.y, sample.bounds.max.z)
    updateTubes(roots, rootNodes, sample, true)
    updateTubes(wood, woodNodes, sample, false)
    anchors.set(sample.leafPositions)
    directions.set(sample.leafDirections)
    scales.set(sample.leafScales)
    // Unborn leaves (sorted last) are not drawn at all.
    leaves.count = sample.leafCount
    for (let i = 0; i < leaves.count; i++) {
      tint.copy(LEAF_YOUNG).lerp(LEAF_MATURE, sample.leafMaturity[i])
      leaves.instanceColor.setXYZ(i, tint.r, tint.g, tint.b)
    }
    leaves.instanceColor.needsUpdate = true
    for (let i = 0; i < topology.thorns.length; i++) {
      direction.fromArray(sample.thornDirections, i * 3).normalize()
      rotation.setFromUnitVectors(up, direction)
      matrix.compose(start.fromArray(sample.thornPositions, i * 3), rotation, scale.setScalar(sample.thornScales[i]))
      thorns.setMatrixAt(i, matrix)
    }
    thorns.instanceMatrix.needsUpdate = true
    setBounds(thorns.boundingBox, thorns.boundingSphere)
    const [w, h, d] = SEED_SIZE
    reserve.position.fromArray(sample.seedPosition)
    reserve.scale.set(w * 0.88, h * 0.9, d * 0.85).multiplyScalar(sample.seed[0])
    reserve.visible = sample.seed[0] > 0
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i], fraction = sample.seed[1]
      shell.position.fromArray(sample.seedPosition)
      // The coat splits along its seam as the radicle pushes out.
      shell.position.z += (i ? -1 : 1) * d * sample.seed[2] * 0.35
      shell.scale.set(w, h, d).multiplyScalar(fraction)
      shell.visible = fraction > 0
    }
    poseLeaves()
  }
  function dispose() {
    if (disposed) return
    disposed = true
    leaves.dispose()
    thorns.dispose()
    for (const geometry of geometries) geometry.dispose()
    for (const surface of materials) surface.dispose()
    group.removeFromParent()
  }
  updateGrowth(sampleGrowth(topology, 0, createGrowthSample(topology)))
  return { group, bounds, updateGrowth, updateWind, dispose }
}
