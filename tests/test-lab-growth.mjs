import assert from 'node:assert/strict'
import { createGrowthTopology, createGrowthSample, sampleGrowth, STAGES, stageProgress } from '../src/lab/growth-model.js'

const topology = createGrowthTopology(42)
assert.deepEqual(topology, createGrowthTopology(42))
assert.notDeepEqual(topology.nodes, createGrowthTopology(43).nodes)
assert.ok(topology.nodes.length >= 60 && topology.nodes.length <= 100)
assert.ok(topology.leaves.length >= 200 && topology.leaves.length <= 400)
assert.deepEqual(STAGES.map(s => s.id), ['seed', 'roots', 'sprout', 'trunk', 'branches', 'leaves'])
assert.equal(stageProgress('seed'), 0)
assert.equal(stageProgress('leaves'), 1)
assert.equal(stageProgress('unknown'), 0)
for (const stage of STAGES) {
  assert.equal(stageProgress(stage.id), stage.progress)
  const anchor = sampleGrowth(topology, stage.progress, createGrowthSample(topology))
  assert.equal(anchor.stage, stage.id)
}

const out = createGrowthSample(topology)
const identities = Object.fromEntries(Object.entries(out).filter(([, v]) => ArrayBuffer.isView(v)))
const bounds = out.bounds
const snapshot = () => JSON.stringify(out)
const previous = new Float64Array(topology.nodes.length)
const previousRadii = new Float64Array(out.radii.length)
const previousLeaves = new Float64Array(out.leafScales.length)
const rest = JSON.stringify(topology)
let earlyLeaves = false
for (let step = 0; step <= 1000; step++) {
  const p = step / 1000
  assert.equal(sampleGrowth(topology, p, out), out)
  assert.equal(out.progress, p)
  assert.equal(out.bounds, bounds)
  for (const [key, buffer] of Object.entries(identities)) assert.equal(out[key], buffer)
  for (let i = 0; i < topology.nodes.length; i++) {
    const node = topology.nodes[i]
    const g = out.growth[i]
    assert.ok(g >= previous[i], `monotonic segment ${i}`)
    previous[i] = g
    assert.equal(out.lengths[i], node.length * g, 'scene length vs normalized extension')
    assert.ok(out.radii[i * 2] >= out.radii[i * 2 + 1])
    if (node.parent >= 0) {
      const parent = topology.nodes[node.parent]
      for (let axis = 0; axis < 3; axis++) {
        const expected = out.starts[node.parent * 3 + axis] + parent.delta[axis] * Math.min(node.attach, out.growth[node.parent])
        assert.ok(Math.abs(out.starts[i * 3 + axis] - expected) < 1e-12)
      }
      if (g > 0) assert.ok(out.growth[node.parent] > node.attach)
    }
    for (let axis = 0; axis < 3; axis++) {
      assert.equal(out.ends[i * 3 + axis], out.starts[i * 3 + axis] + node.delta[axis] * g)
    }
  }
  for (let i = 0; i < topology.leaves.length; i++) {
    const leaf = topology.leaves[i]
    if (out.leafScales[i] > 0) {
      assert.ok(out.growth[leaf.parent] > leaf.attach)
      if (p < 0.4) earlyLeaves = true
    }
    for (let axis = 0; axis < 3; axis++) {
      const expected = out.starts[leaf.parent * 3 + axis] + topology.nodes[leaf.parent].delta[axis] * Math.min(leaf.attach, out.growth[leaf.parent])
      assert.equal(out.leafPositions[i * 3 + axis], expected)
    }
  }
  for (const buffer of Object.values(identities)) assert.ok(buffer.every(Number.isFinite))
  for (const [current, last] of [[out.radii, previousRadii], [out.leafScales, previousLeaves]]) {
    current.forEach((value, i) => assert.ok(value >= last[i]))
    last.set(current)
  }
  assert.equal(JSON.stringify(topology), rest, 'rest topology unchanged')
}
assert.ok(earlyLeaves, 'attached juvenile foliage before trunk/leafy phases')
sampleGrowth(topology, 0.12, out)
assert.ok(out.growth[0] > 0 && out.growth[1] === 0, 'taproot before sprout')
assert.ok(topology.nodes.some((n, i) => i > 1 && n.kind === 'root' && out.growth[i] > 0), 'early laterals')
sampleGrowth(topology, 0, out)
assert.ok(out.seed[0] > 0 && out.seed[1] > 0)
assert.ok(out.growth.every(g => g === 0))
for (const invalid of [NaN, Infinity, -Infinity, undefined, '0.5', -1]) {
  sampleGrowth(topology, invalid, out)
  assert.equal(out.progress, 0)
}
sampleGrowth(topology, 2, out)
assert.equal(out.progress, 1)
assert.ok(out.growth.every(g => g === 1))
assert.ok(out.leafScales.every(s => s > 0))
assert.ok(out.bounds.max.y > 5.8 && out.bounds.max.y < 7)
assert.ok(out.bounds.min.y < -1.9 && out.bounds.min.y > -2.5)
const width = out.bounds.max.x - out.bounds.min.x
assert.ok(width > 3 && width < 5.5, `crown width ${width}`)
const wood = topology.nodes.filter(n => n.kind === 'wood' && n.parent > 1)
assert.ok(wood.some(n => n.delta[2] > 0.2) && wood.some(n => n.delta[2] < -0.2))
assert.ok(wood.some(n => n.level === 3), 'multilevel branching')
const [a, b, c] = topology.nodes.filter(n => n.parent === 1).map(n => n.delta)
const volume = a[0] * (b[1] * c[2] - b[2] * c[1])
  - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
assert.ok(Math.abs(volume) > 0.1, 'primary branches span 3D, not a plane')
const scaffolds = topology.nodes.filter(n => n.parent === 1)
const reach = n => Math.hypot(n.delta[0], n.delta[2])
assert.ok(scaffolds.every((n, i) => !i || (n.attach > scaffolds[i - 1].attach && reach(n) < reach(scaffolds[i - 1]))), 'dome: higher scaffolds reach less')
assert.ok(out.bounds.max.y - topology.nodes[1].delta[1] > 1.2, 'crown rises well above the trunk tip')
assert.ok(topology.leaves.some(l => l.attach < 0.5), 'foliage along shoots, not only tips')
for (const p of [0, 0.1, 0.24, 0.4, 0.62, 1, 0.357]) {
  sampleGrowth(topology, p, out)
  const before = snapshot()
  sampleGrowth(topology, 0.91, out)
  sampleGrowth(topology, p, out)
  assert.equal(snapshot(), before, 'exact p-q-p including bounds and metadata')
  sampleGrowth(topology, Math.min(1, p + 1e-8), out)
  const old = JSON.parse(before)
  for (const key of Object.keys(identities)) {
    for (let i = 0; i < out[key].length; i++) assert.ok(Math.abs(out[key][i] - old[key][i]) < 1e-6, `continuous ${key}`)
  }
}
console.log(`growth model: ${topology.nodes.length} segments, ${topology.leaves.length} leaves; dense attachment/rewind checks passed`)
