// Original lab-only illustration, not a biological simulation or an asset derivative.
// Y is up; distances are scene units. Topology is rest geometry, never scaled by age.
export const STAGES = Object.freeze([
  { id: 'seed', progress: 0 },
  { id: 'roots', progress: 0.1 },
  { id: 'sprout', progress: 0.24 },
  { id: 'trunk', progress: 0.4 },
  { id: 'branches', progress: 0.62 },
  { id: 'leaves', progress: 1 },
].map(Object.freeze))

const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const ramp = (p, start, end) => clamp((p - start) / (end - start))
export const stageProgress = id => STAGES.find(stage => stage.id === id)?.progress ?? 0

export function createGrowthTopology(seed = 2026) {
  let state = Number.isFinite(seed) ? seed >>> 0 : 2026
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const nodes = [], leaves = []
  function segment(parent, attach, kind, level, delta, radius, start, end) {
    const id = nodes.length
    const length = Math.hypot(...delta)
    nodes.push(Object.freeze({ id, parent, attach, kind, level, length,
      delta: Object.freeze(delta), radius, start, end }))
    return id
  }
  function foliage(parent, count, start) {
    const phase = random() * Math.PI * 2
    for (let j = 0; j < count; j++) {
      const angle = phase + j * 2.399963 // alternate around each shoot, not in a plane
      leaves.push(Object.freeze({ id: leaves.length, parent,
        attach: 0.12 + j * 0.8 / Math.max(1, count - 1),
        direction: Object.freeze([Math.cos(angle), 0.35, Math.sin(angle)]),
        size: 0.16 + random() * 0.06, start: start + j * 0.012, end: 0.98 }))
    }
  }
  segment(-1, 0, 'root', 0, [0.06, -2, 0.04], 0.09, 0.02, 0.36)
  // This single continuous axis is the juvenile sprout AND the mature trunk.
  const trunk = segment(-1, 0, 'wood', 0, [0.08, 6, -0.05], 0.18, 0.17, 0.68)
  foliage(trunk, 4, 0.22)
  const rootParents = []
  for (let j = 0; j < 12; j++) {
    const angle = j * 2.399963 + random() * 0.25
    rootParents.push(segment(0, 0.08 + j * 0.065, 'root', 1,
      [Math.cos(angle) * 0.9, -0.3, Math.sin(angle) * 0.9], 0.035, 0.07 + j * 0.012, 0.48))
  }
  for (const parent of rootParents) {
    for (let j = 0; j < 2; j++) {
      const angle = random() * Math.PI * 2
      segment(parent, 0.4 + j * 0.35, 'root', 2,
        [Math.cos(angle) * 0.32, -0.23, Math.sin(angle) * 0.32], 0.014, 0.2, 0.57)
    }
  }
  // Breadth-first authored tiers; azimuths are actual XYZ geometry, not draw order.
  let parents = []
  for (let j = 0; j < 8; j++) {
    const angle = j * 2.399963 + random() * 0.3
    const parent = segment(trunk, 0.3 + j * 0.065, 'wood', 1,
      [Math.cos(angle) * 1.1, 0.65, Math.sin(angle) * 1.1], 0.075, 0.3 + j * 0.015, 0.77)
    foliage(parent, 4, 0.41)
    parents.push(parent)
  }
  const secondary = []
  for (const parent of parents) {
    for (let j = 0; j < 3; j++) {
      const angle = Math.atan2(nodes[parent].delta[2], nodes[parent].delta[0]) + (j - 1) * 0.85
      const child = segment(parent, 0.35 + j * 0.28, 'wood', 2,
        [Math.cos(angle) * 0.6, 0.45, Math.sin(angle) * 0.6], 0.032, 0.43 + j * 0.025, 0.86)
      foliage(child, 6, 0.5)
      secondary.push(child)
    }
  }
  for (const parent of secondary) {
    const angle = Math.atan2(nodes[parent].delta[2], nodes[parent].delta[0]) + (random() - 0.5)
    const child = segment(parent, 0.7, 'wood', 3,
      [Math.cos(angle) * 0.35, 0.28, Math.sin(angle) * 0.35], 0.014, 0.58, 0.92)
    foliage(child, 5, 0.62)
  }
  return Object.freeze({ seed, nodes: Object.freeze(nodes), leaves: Object.freeze(leaves) })
}

export function createGrowthSample(topology) {
  const n = topology.nodes.length, l = topology.leaves.length
  return {
    progress: 0, stage: 'seed', stageIndex: 0, stageFraction: 0,
    // XYZ triples; growth is normalized rest-length extension; radii are base/tip pairs.
    starts: new Float64Array(n * 3), ends: new Float64Array(n * 3),
    growth: new Float64Array(n), lengths: new Float64Array(n), radii: new Float64Array(n * 2),
    // Positions are petiole anchors, directions fixed outward axes; scale unfolds there.
    leafPositions: new Float64Array(l * 3), leafDirections: new Float64Array(l * 3),
    leafScales: new Float64Array(l), seed: new Float64Array(3),
    seedPosition: new Float64Array([0, 0.04, 0]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  }
}

function include(bounds, x, y, z, radius) {
  bounds.min.x = Math.min(bounds.min.x, x - radius)
  bounds.min.y = Math.min(bounds.min.y, y - radius)
  bounds.min.z = Math.min(bounds.min.z, z - radius)
  bounds.max.x = Math.max(bounds.max.x, x + radius)
  bounds.max.y = Math.max(bounds.max.y, y + radius)
  bounds.max.z = Math.max(bounds.max.z, z + radius)
}

// No integration, topology edits or per-sample arrays/objects. Arbitrary seeks are exact.
export function sampleGrowth(topology, progress, out) {
  const p = clamp(progress)
  out.progress = p
  let stage = 0
  while (stage < STAGES.length - 1 && p >= STAGES[stage + 1].progress) stage++
  out.stageIndex = stage
  out.stage = STAGES[stage].id
  out.stageFraction = stage === STAGES.length - 1 ? 1 : ramp(p, STAGES[stage].progress, STAGES[stage + 1].progress)
  // Independent illustrative reserve and shell radii, plus shell opening fraction.
  out.seed[0] = 0.12 * (1 - ramp(p, 0.08, 0.48))
  out.seed[1] = 0.15 * (1 - ramp(p, 0.18, 0.58))
  out.seed[2] = ramp(p, 0.04, 0.24)
  const radius = Math.max(out.seed[0], out.seed[1])
  out.bounds.min.x = out.bounds.min.z = -radius
  out.bounds.max.x = out.bounds.max.z = radius
  out.bounds.min.y = 0.04 - radius
  out.bounds.max.y = 0.04 + radius
  for (const node of topology.nodes) {
    const i = node.id, offset = i * 3
    const support = node.parent < 0 ? 1 : out.growth[node.parent]
    const gate = node.parent < 0 ? 1 : clamp((support - node.attach) / (1 - node.attach))
    const g = Math.min(ramp(p, node.start, node.end), gate)
    out.growth[i] = g
    out.lengths[i] = node.length * g
    const base = node.radius * Math.sqrt(g) * (0.3 + 0.7 * ramp(p, node.start, 1))
    out.radii[i * 2] = base
    out.radii[i * 2 + 1] = base * 0.35
    for (let axis = 0; axis < 3; axis++) {
      // Hidden buds follow the growing parent tip; once visible the rest anchor is fixed.
      const start = node.parent < 0 ? 0 : out.starts[node.parent * 3 + axis]
        + topology.nodes[node.parent].delta[axis] * Math.min(support, node.attach)
      out.starts[offset + axis] = start
      out.ends[offset + axis] = start + node.delta[axis] * g
    }
    if (g > 0) {
      include(out.bounds, out.starts[offset], out.starts[offset + 1], out.starts[offset + 2], base)
      include(out.bounds, out.ends[offset], out.ends[offset + 1], out.ends[offset + 2], base)
    }
  }
  for (const leaf of topology.leaves) {
    const support = out.growth[leaf.parent], offset = leaf.id * 3
    const scale = leaf.size * Math.min(ramp(p, leaf.start, leaf.end), clamp((support - leaf.attach) / (1 - leaf.attach)))
    out.leafScales[leaf.id] = scale
    for (let axis = 0; axis < 3; axis++) {
      out.leafPositions[offset + axis] = out.starts[leaf.parent * 3 + axis]
        + topology.nodes[leaf.parent].delta[axis] * Math.min(support, leaf.attach)
      out.leafDirections[offset + axis] = leaf.direction[axis]
    }
    if (scale > 0) include(out.bounds, out.leafPositions[offset], out.leafPositions[offset + 1], out.leafPositions[offset + 2], scale * 1.1)
  }
  return out
}
