import * as THREE from 'three'
import { CROWN, SEED_SIZE, createGrowthSample, sampleGrowth } from './growth-model.js'

// Original meshes; straight centerlines preserve every authored attachment.
const SIDES = 8
const STRIDE = SIDES * 2 + 2
export const CAP = 0.85

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
  const positions = [], colors = [], indices = []
  for (const [t, half] of rows) {
    for (const a of ACROSS) {
      // Halves rise from a sunken midrib; the blade arches down toward the tip.
      positions.push(a * half, t, 0.15 * Math.abs(a * half) - 0.09 * t * t)
      // Shading: a pale midrib fading to a darker margin; petiole a touch paler.
      const k = a === 0 ? (t <= PETIOLE ? 1.2 : 1.32) : 0.86
      colors.push(k, k, k * (a === 0 ? 0.92 : 1))
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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
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

// Orange blossom, unit diameter, facing +Y: five thick waxy white petals,
// a ring of 20-25 stamens with yellow anthers, and a green pistil.
function flowerGeometry() {
  const positions = [], colors = [], indices = []
  const vertex = (x, y, z, c) => { positions.push(x, y, z); colors.push(...c); return positions.length / 3 - 1 }
  const PETAL = [0.97, 0.96, 0.9], STAMEN = [0.95, 0.92, 0.7], ANTHER = [0.95, 0.78, 0.15], PISTIL = [0.45, 0.62, 0.2]
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5, ca = Math.cos(a), sa = Math.sin(a)
    const rows = []
    for (let j = 0; j <= 6; j++) {
      const r = 0.05 + 0.45 * j / 6
      // Oblong petal with a blunt tip, cupped then gently reflexed.
      const w = 0.17 * Math.sin(Math.PI * Math.min(1, (j + 0.6) / 7)) ** 0.7
      const y = 0.22 * r - 0.28 * r * r
      rows.push([-1, 0, 1].map(c => vertex(ca * r - sa * w * c, y + 0.03 * Math.abs(c), sa * r + ca * w * c, PETAL)))
    }
    for (let j = 0; j < rows.length - 1; j++) {
      for (let c = 0; c < 2; c++) indices.push(rows[j][c], rows[j + 1][c], rows[j][c + 1], rows[j][c + 1], rows[j + 1][c], rows[j + 1][c + 1])
    }
  }
  for (let k = 0; k < 22; k++) {
    const a = k * Math.PI * 2 / 22, r = 0.07, ca = Math.cos(a), sa = Math.sin(a), t = 0.012
    const b0 = vertex(ca * r - sa * t, 0.02, sa * r + ca * t, STAMEN), b1 = vertex(ca * r + sa * t, 0.02, sa * r - ca * t, STAMEN)
    const top = vertex(ca * r * 1.3, 0.24, sa * r * 1.3, ANTHER)
    indices.push(b0, b1, top)
  }
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, b = (k + 1) * Math.PI / 3
    const p0 = vertex(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03, PISTIL), p1 = vertex(Math.cos(b) * 0.03, 0, Math.sin(b) * 0.03, PISTIL)
    const tip = vertex(0, 0.2, 0, PISTIL)
    indices.push(p0, tip, p1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

// Sweet orange: near-spherical, slightly flattened, with a pebbly rind of oil glands.
function fruitGeometry() {
  const geometry = new THREE.SphereGeometry(1, 28, 20)
  const position = geometry.attributes.position, v = new THREE.Vector3(), colors = []
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const glands = Math.sin(v.x * 61 + v.y * 37) * Math.sin(v.y * 53 - v.z * 41) * Math.sin(v.z * 47 + v.x * 29)
    const pebble = 1 + 0.008 * glands
    position.setXYZ(i, v.x * pebble, v.y * pebble * 0.95, v.z * pebble)
    // Oil glands catch the light; the stem end stays a little greener and the
    // stylar end has its small darker scar.
    const k = 1 + 0.06 * glands - 0.1 * Math.max(0, v.y - 0.82) / 0.18 - 0.18 * Math.max(0, -v.y - 0.95) / 0.05
    colors.push(k * (1 - 0.05 * Math.max(0, v.y - 0.7)), k, k * (1 - 0.1 * Math.max(0, v.y - 0.7)))
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const color = hex => new THREE.Color(hex)
// Green fruit, the colour break (chlorophyll gone, carotenoids showing), ripe orange.
const FRUIT_GREEN = color(0x4b7a24), FRUIT_BREAK = color(0xc9a42a), FRUIT_RIPE = color(0xf08a12)
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
  const leafSurface = material({ color: 0xffffff, vertexColors: true, roughness: 0.38, side: THREE.DoubleSide })
  // Wind (see updateWind) rotates each blade about its petiole on the GPU; the
  // underside is paler and matte.
  const wind = { time: { value: 0 }, strength: { value: 0 } }
  leafSurface.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = wind.time
    shader.uniforms.uWind = wind.strength
    const flutter = 'float wa = uWind * 0.14 * sin(uWindTime * 1.7 + float(gl_InstanceID) * 2.399963); float wc = cos(wa), ws = sin(wa);'
    shader.vertexShader = 'uniform float uWindTime, uWind;\n' + shader.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${flutter}\nobjectNormal = vec3(objectNormal.x, wc * objectNormal.y - ws * objectNormal.z, ws * objectNormal.y + wc * objectNormal.z);`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vec3(transformed.x, wc * transformed.y - ws * transformed.z, ws * transformed.y + wc * transformed.z);')
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
  const buds = add('flower-buds', new THREE.SphereGeometry(1, 8, 6), material({ color: 0xf3efdd, roughness: 0.55 }), topology.flowers.length)
  const flowers = add('flowers', flowerGeometry(), material({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }), topology.flowers.length)
  const fruits = add('fruits', fruitGeometry(), material({ color: 0xffffff, vertexColors: true, roughness: 0.55 }), topology.fruits.length)
  // Each fruit hangs on its stalk (the old pedicel) and keeps a green calyx at the top.
  const stalkGeometry = new THREE.CylinderGeometry(1, 1.3, 1, 6, 1, true).translate(0, -0.5, 0)
  const stalks = add('fruit-stalks', stalkGeometry, material({ color: 0x6b7a3a, roughness: 0.7 }), topology.fruits.length)
  const calyces = add('fruit-calyces', new THREE.SphereGeometry(1, 10, 5).scale(1, 0.4, 1), material({ color: 0x55702c, roughness: 0.6 }), topology.fruits.length)
  fruits.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(topology.fruits.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
  for (const mesh of [buds, flowers, fruits, stalks, calyces]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.boundingBox = new THREE.Box3()
    mesh.boundingSphere = new THREE.Sphere()
  }
  // Seed: buried cotyledons inside a creamy, split seed coat.
  const reserve = add('seed-reserve', new THREE.SphereGeometry(1, 16, 12), material({ color: 0xf4ecd4, roughness: 0.8 }))
  const shellMaterial = material({ color: 0xf2e8cc, roughness: 0.9, side: THREE.DoubleSide })
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
  const shades = new Int16Array(topology.leaves.length).fill(-1), dirty = new Uint8Array(topology.leaves.length)
  // A viewer may shrink chosen leaves out of the way (a hand parting foliage);
  // growth keeps posing them with that factor, and setting it back restores them.
  const leafFade = new Float32Array(topology.leaves.length).fill(1)
  anchors.fill(NaN)
  let disposed = false, windEnabled = false, windTime = 0

  function setBounds(box, sphere) {
    box.copy(bounds)
    box.getBoundingSphere(sphere)
  }
  // Radii are drawn on a 0.01 mm grid and bark age in 1/64 steps, so a tube's
  // look is a pure function of these keys: unchanged segments are skipped,
  // which is most of a grown tree on most frames, and every seek stays exact.
  const tubeCache = new Map()
  function updateTubes(mesh, nodes, sample, isRoot) {
    const { position: positions, normal: normals, color: colors } = mesh.geometry.attributes
    let cache = tubeCache.get(mesh)
    if (!cache) tubeCache.set(mesh, cache = new Float32Array(nodes.length * 9).fill(NaN))
    let changed = false
    for (let slot = 0; slot < nodes.length; slot++) {
      const id = nodes[slot].id, offset = id * 3, base = slot * STRIDE
      const key = [sample.starts[offset], sample.starts[offset + 1], sample.starts[offset + 2],
        sample.ends[offset], sample.ends[offset + 1], sample.ends[offset + 2],
        Math.round(sample.radii[id * 2] * 1e5), Math.round(sample.radii[id * 2 + 1] * 1e5), Math.round(sample.maturity[id] * 64)]
      let same = true
      for (let k = 0; k < 9; k++) if (cache[slot * 9 + k] !== Math.fround(key[k])) { same = false; cache[slot * 9 + k] = key[k] }
      if (same) continue
      changed = true
      start.fromArray(sample.starts, offset)
      end.fromArray(sample.ends, offset)
      direction.subVectors(end, start)
      const length = direction.length()
      if (length > 0) rotation.setFromUnitVectors(up, direction.divideScalar(length))
      else rotation.identity()
      const r0 = key[6] / 1e5, r1 = key[7] / 1e5, age = key[8] / 64
      const slope = length > 0 ? (r0 - r1) / length : 0
      if (isRoot) tint.copy(ROOT_TIP).lerp(ROOT_OLD, age)
      else tint.copy(SHOOT).lerp(bark.copy(BARK).lerp(OLD_BARK, Math.min(1, r0 / 0.04)), age)
      for (let ring = 0; ring < 2; ring++) {
        const center = ring ? end : start, radius = ring ? r1 : r0
        for (let s = 0; s < SIDES; s++) {
          const angle = s * Math.PI * 2 / SIDES, vertex = base + ring * SIDES + s
          radial.set(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(rotation)
          positions.setXYZ(vertex, center.x + radial.x * radius, center.y + radial.y * radius, center.z + radial.z * radius)
          normal.set(Math.cos(angle), slope, Math.sin(angle)).normalize().applyQuaternion(rotation)
          normals.setXYZ(vertex, normal.x, normal.y, normal.z)
          colors.setXYZ(vertex, tint.r, tint.g, tint.b)
        }
        // Domed ends: the cap's centre stands out along the axis, so a growing
        // tip is blunt and rounded, never a cut or a needle (joints hide it).
        const dome = length > 0 ? (ring ? 1 : -1) * radius * CAP : 0
        positions.setXYZ(base + SIDES * 2 + ring, center.x + direction.x * dome, center.y + direction.y * dome, center.z + direction.z * dome)
        normal.copy(up).multiplyScalar(ring ? 1 : -1).applyQuaternion(rotation)
        normals.setXYZ(base + SIDES * 2 + ring, normal.x, normal.y, normal.z)
        colors.setXYZ(base + SIDES * 2 + ring, tint.r, tint.g, tint.b)
      }
    }
    if (changed) positions.needsUpdate = normals.needsUpdate = colors.needsUpdate = true
    setBounds(mesh.geometry.boundingBox, mesh.geometry.boundingSphere)
  }
  // Leaf frame: length along its direction; the blade turns toward the light,
  // i.e. up and out of the crown, as leaves on a citrus canopy surface do.
  function poseLeaves(from = 0, to = leaves.count, only = null) {
    for (let i = from; i < to; i++) {
      if (only && !only[i]) continue
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
      matrix.scale(scale.setScalar(scales[i] * leafFade[i]))
      matrix.setPosition(start)
      leaves.setMatrixAt(i, matrix)
    }
    leaves.instanceMatrix.needsUpdate = true
    // Rigid rotation about the petiole stays inside the model's 1.1*scale ball.
    setBounds(leaves.boundingBox, leaves.boundingSphere)
  }
  // Wind flutters each blade about its petiole's hinge axis, in the vertex
  // shader: no per-frame work on the CPU, and turning it off is exact.
  function updateWind(time, enabled) {
    if (disposed) return
    windTime = Number.isFinite(time) ? time : 0
    windEnabled = Boolean(enabled)
    wind.time.value = windTime
    wind.strength.value = windEnabled ? 1 : 0
  }
  function fadeLeaves(list, value) {
    if (disposed) return
    let any = false
    for (const i of list) {
      if (leafFade[i] === value) continue
      leafFade[i] = value
      if (i < leaves.count && Number.isFinite(anchors[i * 3])) { poseLeaves(i, i + 1); any = true }
    }
    if (any) leaves.instanceMatrix.needsUpdate = true
  }
  function updateGrowth(sample) {
    if (disposed) return
    bounds.min.set(sample.bounds.min.x, sample.bounds.min.y, sample.bounds.min.z)
    bounds.max.set(sample.bounds.max.x, sample.bounds.max.y, sample.bounds.max.z)
    updateTubes(roots, rootNodes, sample, true)
    updateTubes(wood, woodNodes, sample, false)
    // Unborn leaves (sorted last) are not drawn at all; of the rest, only the
    // ones that moved, grew or changed colour are rewritten.
    leaves.count = sample.leafCount
    let anyLeaf = false
    for (let i = 0; i < leaves.count; i++) {
      const o = i * 3, m = Math.round(sample.leafMaturity[i] * 64)
      const moved = anchors[o] !== sample.leafPositions[o] || anchors[o + 1] !== sample.leafPositions[o + 1] || anchors[o + 2] !== sample.leafPositions[o + 2]
        || scales[i] !== sample.leafScales[i] || directions[o] !== sample.leafDirections[o] || directions[o + 1] !== sample.leafDirections[o + 1]
        || directions[o + 2] !== sample.leafDirections[o + 2] || shades[i] !== m
      dirty[i] = moved ? 1 : 0
      if (!moved) continue
      anyLeaf = true
      for (let a = 0; a < 3; a++) { anchors[o + a] = sample.leafPositions[o + a]; directions[o + a] = sample.leafDirections[o + a] }
      scales[i] = sample.leafScales[i]
      if (shades[i] !== m) {
        shades[i] = m
        tint.copy(LEAF_YOUNG).lerp(LEAF_MATURE, sample.leafMaturity[i])
        leaves.instanceColor.setXYZ(i, tint.r, tint.g, tint.b)
        leaves.instanceColor.needsUpdate = true
      }
    }
    for (let i = 0; i < topology.thorns.length; i++) {
      direction.fromArray(sample.thornDirections, i * 3).normalize()
      rotation.setFromUnitVectors(up, direction)
      matrix.compose(start.fromArray(sample.thornPositions, i * 3), rotation, scale.setScalar(sample.thornScales[i]))
      thorns.setMatrixAt(i, matrix)
    }
    thorns.instanceMatrix.needsUpdate = true
    setBounds(thorns.boundingBox, thorns.boundingSphere)
    for (let i = 0; i < topology.flowers.length; i++) {
      direction.fromArray(sample.flowerDirections, i * 3).normalize()
      rotation.setFromUnitVectors(up, direction)
      start.fromArray(sample.flowerPositions, i * 3)
      const bud = sample.budScales[i]
      buds.setMatrixAt(i, matrix.compose(start, rotation, scale.set(bud * 0.55, bud, bud * 0.55)))
      flowers.setMatrixAt(i, matrix.compose(start, rotation, scale.setScalar(sample.flowerScales[i])))
    }
    for (let i = 0; i < topology.fruits.length; i++) {
      const r = sample.fruitScales[i]
      matrix.compose(start.fromArray(sample.fruitPositions, i * 3), rotation.identity(), scale.setScalar(r))
      fruits.setMatrixAt(i, matrix)
      // From the twig (where the flower was) down into the top of the fruit.
      const f = topology.fruits[i].flower
      end.fromArray(sample.flowerPositions, f * 3)
      const stalk = Math.max(0, end.y - (start.y + r * 0.9))
      const thick = r > 0 ? 0.0012 + 0.012 * r : 0
      stalks.setMatrixAt(i, matrix.compose(end, rotation, scale.set(thick, stalk, thick)))
      start.y += r * 0.94
      calyces.setMatrixAt(i, matrix.compose(start, rotation, scale.setScalar(r * 0.16)))
      const c = sample.fruitColors[i]
      tint.copy(FRUIT_GREEN).lerp(FRUIT_BREAK, Math.min(1, c * 2)).lerp(FRUIT_RIPE, Math.max(0, c * 2 - 1))
      fruits.instanceColor.setXYZ(i, tint.r, tint.g, tint.b)
    }
    // Outside the bloom and fruit windows these meshes draw nothing at all.
    buds.count = sample.budScales.some(v => v > 0) ? topology.flowers.length : 0
    flowers.count = sample.flowerScales.some(v => v > 0) ? topology.flowers.length : 0
    fruits.count = stalks.count = calyces.count = sample.fruitScales.some(v => v > 0) ? topology.fruits.length : 0
    for (const mesh of [buds, flowers, fruits, stalks, calyces]) {
      mesh.instanceMatrix.needsUpdate = true
      setBounds(mesh.boundingBox, mesh.boundingSphere)
    }
    fruits.instanceColor.needsUpdate = true
    const [w, h, d] = SEED_SIZE
    reserve.position.fromArray(sample.seedPosition)
    reserve.scale.set(w * 0.88, h * 0.9, d * 0.85).multiplyScalar(sample.seed[0])
    reserve.visible = sample.seed[0] > 0
    for (let i = 0; i < shells.length; i++) {
      const shell = shells[i], fraction = sample.seed[1]
      // The coat splits along its seam from the micropylar (lower) end, where
      // the radicle pushes out: the halves gape below and stay joined above.
      const open = (i ? 1 : -1) * 0.32 * sample.seed[2], top = h * fraction
      shell.rotation.x = open
      shell.position.fromArray(sample.seedPosition)
      shell.position.y += top - top * Math.cos(open)
      shell.position.z -= top * Math.sin(open)
      shell.scale.set(w, h, d).multiplyScalar(fraction)
      shell.visible = fraction > 0
    }
    if (anyLeaf) poseLeaves(0, leaves.count, dirty)
    else setBounds(leaves.boundingBox, leaves.boundingSphere)
  }
  function dispose() {
    if (disposed) return
    disposed = true
    for (const mesh of [leaves, thorns, buds, flowers, fruits, stalks, calyces]) mesh.dispose()
    for (const geometry of geometries) geometry.dispose()
    for (const surface of materials) surface.dispose()
    group.removeFromParent()
  }
  updateGrowth(sampleGrowth(topology, 0, createGrowthSample(topology)))
  return { group, bounds, updateGrowth, updateWind, fadeLeaves, dispose, wind }
}
