import * as THREE from 'three'

// The opened orange of the climax, in its own unit space: fruit centre at the
// origin, radius 1, stem end toward +Y. Anatomy, outside in: the flavedo (the
// coloured, oil-dotted rind), the albedo (white spongy pith), and ten carpels
// (the segments), each a wedge of juice vesicles in a thin membrane, with seeds.
// Every motion is a pure function of the climax ramps, so any seek is exact.
const CARPELS = 10, LUNES = 8, GAP = 0.025

const ease = t => t * t * (3 - 2 * t)

// One spherical lune of a shell between two angles around Y.
function luneGeometry(a0, a1, radius, thickness) {
  const geometry = new THREE.SphereGeometry(radius, 10, 18, a0, a1 - a0, 0, Math.PI)
  const inner = new THREE.SphereGeometry(radius - thickness, 10, 18, a0, a1 - a0, 0, Math.PI)
  inner.index.array.reverse()
  const merged = mergeGeometries([geometry, inner])
  geometry.dispose(); inner.dispose()
  return merged
}
function mergeGeometries(list) {
  const positions = [], normals = [], indices = []
  let offset = 0
  for (const g of list) {
    positions.push(...g.attributes.position.array)
    normals.push(...g.attributes.normal.array)
    for (const i of g.index.array) indices.push(i + offset)
    offset += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  out.setIndex(indices)
  out.computeVertexNormals()
  return out
}

// Half a carpel: a wedge between two angles, rounded to the fruit, closed by
// its membranes. Colours: deep juice orange inside, paler membrane outside.
function carpelHalfGeometry(a0, a1, inner, outer, juice) {
  const rings = 12, steps = 8
  const positions = [], colors = [], indices = []
  const membrane = juice.clone().lerp(new THREE.Color(0xfff1d6), 0.22)
  const height = r => 0.93 * Math.sqrt(Math.max(0, 1 - r * r)) + 0.02
  const grid = sign => {
    const ids = []
    for (let i = 0; i <= rings; i++) {
      const r = inner + (outer - inner) * i / rings, row = []
      for (let j = 0; j <= steps; j++) {
        const a = a0 + (a1 - a0) * j / steps
        positions.push(Math.cos(a) * r, sign * height(r), Math.sin(a) * r)
        // Juice vesicles: a faint, irregular grain of lighter and darker sacs.
        const grain = 0.06 * Math.sin(i * 12.9898 + j * 78.233 + sign * 3.1) * Math.sin(i * 4.1 - j * 9.7)
        const c = juice.clone().lerp(membrane, 0.1 + 0.45 * (i / rings) ** 3).offsetHSL(0, 0, grain)
        colors.push(c.r, c.g, c.b)
        row.push(positions.length / 3 - 1)
      }
      ids.push(row)
    }
    return ids
  }
  const top = grid(1), bottom = grid(-1)
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d)
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < steps; j++) {
      quad(top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])
      quad(bottom[i][j], bottom[i][j + 1], bottom[i + 1][j + 1], bottom[i + 1][j])
    }
  }
  // Membranes: the two flat sides and the outer and inner rims.
  for (let i = 0; i < rings; i++) {
    quad(top[i][0], bottom[i][0], bottom[i + 1][0], top[i + 1][0])
    quad(top[i][steps], top[i + 1][steps], bottom[i + 1][steps], bottom[i][steps])
  }
  for (let j = 0; j < steps; j++) {
    quad(top[rings][j], bottom[rings][j], bottom[rings][j + 1], top[rings][j + 1])
    quad(top[0][j], top[0][j + 1], bottom[0][j + 1], bottom[0][j])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createAnatomy() {
  const group = new THREE.Group()
  group.name = 'orange-anatomy'
  const body = new THREE.Group()
  group.add(body)
  const owned = new Set()
  const own = x => { owned.add(x); return x }
  const flavedoMaterial = own(new THREE.MeshStandardMaterial({ color: 0xf08a12, roughness: 0.55, transparent: true }))
  const pithMaterial = own(new THREE.MeshStandardMaterial({ color: 0xf6efdc, roughness: 0.95, transparent: true }))
  const carpelMaterial = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, transparent: true }))
  const seedMaterial = own(new THREE.MeshStandardMaterial({ color: 0xefdfb4, roughness: 0.7, transparent: true }))
  const juice = new THREE.Color(0xf07f0c)

  // Rind and pith: lunes that hinge open from the stylar (bottom) pole.
  const shell = (radius, thickness, material) => Array.from({ length: LUNES }, (_, k) => {
    const a0 = k * Math.PI * 2 / LUNES, a1 = (k + 1) * Math.PI * 2 / LUNES
    const pivot = new THREE.Group()
    pivot.position.set(0, -radius, 0)
    const mesh = new THREE.Mesh(own(luneGeometry(a0, a1, radius, thickness)), material)
    mesh.position.set(0, radius, 0)
    pivot.add(mesh)
    body.add(pivot)
    return { pivot, mesh, mid: (a0 + a1) / 2 }
  })
  const flavedo = shell(1, 0.05, flavedoMaterial)
  const albedo = shell(0.95, 0.07, pithMaterial)

  // Carpels: each wedge is two halves, so the chosen one can open on its seed.
  const carpels = Array.from({ length: CARPELS }, (_, k) => {
    const a0 = k * Math.PI * 2 / CARPELS + GAP, a1 = (k + 1) * Math.PI * 2 / CARPELS - GAP, mid = (a0 + a1) / 2
    const holder = new THREE.Group()
    body.add(holder)
    const halves = [[a0, mid], [mid, a1]].map(([b0, b1], h) => {
      const hinge = new THREE.Group()
      // Each half hinges on the carpel's outer rim, along its middle.
      hinge.position.set(Math.cos(mid) * 0.88, 0, Math.sin(mid) * 0.88)
      const mesh = new THREE.Mesh(own(carpelHalfGeometry(b0, b1, 0.1, 0.88, juice)), carpelMaterial)
      mesh.position.set(-Math.cos(mid) * 0.88, 0, -Math.sin(mid) * 0.88)
      mesh.userData.carpel = k
      hinge.add(mesh)
      holder.add(hinge)
      return { hinge, mesh, side: h ? 1 : -1 }
    })
    const seed = new THREE.Mesh(own(new THREE.SphereGeometry(1, 12, 8)), seedMaterial)
    // ~1 cm in a ~7.5 cm fruit: about a quarter of the radius.
    seed.scale.set(0.07, 0.13, 0.05)
    seed.position.set(Math.cos(mid) * 0.42, 0.05, Math.sin(mid) * 0.42)
    seed.rotation.set(0, -mid, Math.PI / 2)
    holder.add(seed)
    return { holder, halves, seed, mid }
  })
  const pickables = carpels.flatMap(c => c.halves.map(h => h.mesh))
  const anchor = new THREE.Vector3(), released = new THREE.Vector3()

  function setOpacity(material, value) {
    material.opacity = value
    material.transparent = value < 1
    material.depthWrite = value > 0.98
  }
  // state: enter, peel, exit, turn, bare, fan, open, rel (0..1), chosen carpel,
  // hovered carpel (or -1), and the project's ripe rind colour.
  function update(state) {
    flavedoMaterial.color.set(state.rind ?? 0xf08a12)
    // The rind opens like a flower from the bottom pole, then leaves.
    const peel = ease(state.peel), exit = ease(state.exit)
    for (const lune of flavedo) {
      lune.pivot.rotation.set(0, 0, 0)
      lune.pivot.rotateOnAxis(new THREE.Vector3(Math.sin(lune.mid), 0, -Math.cos(lune.mid)), -peel * 1.9)
      lune.pivot.position.set(Math.cos(lune.mid) * exit * 2.2, -1 - exit * 1.4, Math.sin(lune.mid) * exit * 2.2)
      lune.pivot.visible = exit < 1
    }
    setOpacity(flavedoMaterial, 1 - exit)
    // Turned to the cross-section, the white pith tears away in strips.
    const bare = ease(state.bare)
    for (const lune of albedo) {
      lune.pivot.rotation.set(0, 0, 0)
      lune.pivot.rotateOnAxis(new THREE.Vector3(Math.sin(lune.mid), 0, -Math.cos(lune.mid)), -bare * 1.4)
      lune.pivot.position.set(Math.cos(lune.mid) * bare * 1.8, -0.95 - bare * 0.6, Math.sin(lune.mid) * bare * 1.8)
      lune.pivot.visible = bare < 1
    }
    setOpacity(pithMaterial, 1 - bare)
    // Side view to cross-section: the stem end turns toward the viewer.
    body.rotation.set(ease(state.turn) * Math.PI / 2, 0, 0)
    // The carpels part into a fan; the chosen one opens; its seed comes out.
    const fan = ease(state.fan), open = ease(state.open), rel = ease(state.rel)
    for (const [k, c] of carpels.entries()) {
      const spread = fan * (0.55 + (k === state.chosen ? 0.25 * open : 0))
      c.holder.position.set(Math.cos(c.mid) * spread, 0, Math.sin(c.mid) * spread)
      const lift = k === state.hover ? 0.06 : 0
      c.holder.position.y = lift
      for (const half of c.halves) {
        half.hinge.rotation.set(0, k === state.chosen ? half.side * open * 0.9 : 0, 0)
      }
      c.seed.visible = k === state.chosen ? open > 0 : false
    c.seed.rotation.set(0, -c.mid, Math.PI / 2)
    c.holder.visible = true
    }
    const chosen = carpels[state.chosen]
    if (chosen) {
      chosen.seed.position.set(Math.cos(chosen.mid) * (0.42 + rel * 0.9), 0.05 + rel * 0.6, Math.sin(chosen.mid) * (0.42 + rel * 0.9))
      chosen.seed.updateMatrixWorld()
      released.setFromMatrixPosition(chosen.seed.matrixWorld)
    }
    setOpacity(carpelMaterial, 1)
    setOpacity(seedMaterial, 1)
    group.updateMatrixWorld(true)
  }
  // Where to pin a carpel's label: its outer rim, in world space.
  function carpelAnchor(k, out = anchor) {
    const c = carpels[k]
    return out.set(Math.cos(c.mid) * 0.95, 0, Math.sin(c.mid) * 0.95).applyMatrix4(c.holder.matrixWorld)
  }
  function seedWorld(out = released) { return out.copy(released) }
  // Everything but the released seed fades as the seed leaves.
  function setFade(value) {
    for (const m of [carpelMaterial, pithMaterial, flavedoMaterial]) setOpacity(m, Math.min(m.opacity, value))
    for (const c of carpels) c.holder.visible = value > 0.001
    const chosen = carpels.find(c => c.seed.visible)
    if (chosen) chosen.holder.visible = true
  }
  // Fly the released seed to a world position, upright like the next lap's seed.
  const local = new THREE.Vector3(), q = new THREE.Quaternion(), from = new THREE.Vector3()
  function placeSeed(k, world, t) {
    const c = carpels[k]
    if (!c) return
    from.copy(released)
    local.lerpVectors(from, world, t)
    c.holder.worldToLocal(local)
    c.seed.position.copy(local)
    c.holder.getWorldQuaternion(q).invert()
    c.seed.quaternion.slerp(q, t)
    c.seed.visible = true
    group.updateMatrixWorld(true)
  }
  function dispose() {
    for (const x of owned) x.dispose()
    owned.clear()
    group.removeFromParent()
  }
  update({ enter: 0, peel: 0, exit: 0, turn: 0, bare: 0, fan: 0, open: 0, rel: 0, chosen: 0, hover: -1 })
  return { group, update, carpelAnchor, seedWorld, setFade, placeSeed, pickables, dispose, CARPELS }
}
