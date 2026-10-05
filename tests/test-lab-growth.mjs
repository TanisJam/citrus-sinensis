import assert from 'node:assert/strict'
import {
  createGrowthTopology, createGrowthSample, sampleGrowth, STAGES, STAGE_AGES, SEED_DEPTH, SEED_SIZE,
  stageProgress, progressAtAge, ageAtProgress, CROWN,
} from '../src/lab/growth-model.js'

const topology = createGrowthTopology(42)
assert.deepEqual(topology, createGrowthTopology(42))
assert.notDeepEqual(topology.nodes, createGrowthTopology(43).nodes)
assert.deepEqual(STAGES.map(s => s.id), ['seed', 'roots', 'sprout', 'trunk', 'branches', 'leaves'])
assert.equal(stageProgress('seed'), 0)
assert.equal(stageProgress('leaves'), 1)
assert.equal(stageProgress('unknown'), 0)
for (const [i, stage] of STAGES.entries()) {
  assert.equal(stageProgress(stage.id), stage.progress)
  assert.ok(Math.abs(progressAtAge(STAGE_AGES[i]) - stage.progress) < 1e-12, 'age anchors map to stage anchors')
  assert.ok(Math.abs(ageAtProgress(stage.progress) - STAGE_AGES[i]) < 1e-9)
  assert.equal(sampleGrowth(topology, stage.progress, createGrowthSample(topology)).stage, stage.id)
}
for (let d = 0; d <= 3650; d += 7) assert.ok(Math.abs(ageAtProgress(progressAtAge(d)) - d) < 1e-6, 'age <-> progress round trip')
topology.nodes.forEach((node, i) => {
  assert.equal(node.id, i)
  assert.ok(node.parent < i, 'parents precede children')
  assert.ok(node.end > node.start)
})
topology.leaves.forEach((leaf, i) => i && assert.ok(leaf.start >= topology.leaves[i - 1].start, 'leaves ordered by emergence'))

// Structural invariants over a dense seek: attachment, extension, thickening, buffers.
const out = createGrowthSample(topology)
const identities = Object.fromEntries(Object.entries(out).filter(([, v]) => ArrayBuffer.isView(v)))
const bounds = out.bounds
const previous = new Float64Array(topology.nodes.length)
const previousRadii = new Float64Array(out.radii.length)
const rest = JSON.stringify(topology)
for (let step = 0; step <= 400; step++) {
  const p = step / 400
  assert.equal(sampleGrowth(topology, p, out), out)
  assert.equal(out.progress, p)
  assert.equal(out.bounds, bounds)
  for (const [key, buffer] of Object.entries(identities)) assert.equal(out[key], buffer)
  for (let i = 0; i < topology.nodes.length; i++) {
    const node = topology.nodes[i], g = out.growth[i]
    assert.ok(g >= previous[i], `monotonic segment ${i}`)
    previous[i] = g
    assert.equal(out.lengths[i], node.length * g)
    assert.ok(out.radii[i * 2] >= out.radii[i * 2 + 1])
    if (node.parent >= 0) {
      const parent = topology.nodes[node.parent]
      for (let axis = 0; axis < 3; axis++) {
        const expected = out.starts[node.parent * 3 + axis] + parent.delta[axis] * Math.min(node.attach, out.growth[node.parent])
        assert.ok(Math.abs(out.starts[i * 3 + axis] - expected) < 1e-12)
      }
      if (g > 0) assert.ok(node.attach >= 1 ? out.growth[node.parent] === 1 : out.growth[node.parent] > node.attach)
    }
    for (let axis = 0; axis < 3; axis++) assert.equal(out.ends[i * 3 + axis], out.starts[i * 3 + axis] + node.delta[axis] * g)
  }
  // Wood and roots never thin, even when old leaves fall.
  out.radii.forEach((value, i) => assert.ok(value >= previousRadii[i] - 1e-15, `radius ${i} never shrinks`))
  previousRadii.set(out.radii)
  for (let i = out.leafCount; i < topology.leaves.length; i++) assert.equal(out.leafScales[i], 0, 'unborn leaves are past the drawn prefix')
  for (const buffer of Object.values(identities)) assert.ok(buffer.every(Number.isFinite))
  assert.equal(JSON.stringify(topology), rest, 'rest topology unchanged')
}
for (const p of [0, 0.1, 0.24, 0.4, 0.62, 1, 0.357, 0.83]) {
  sampleGrowth(topology, p, out)
  const before = JSON.stringify(out)
  sampleGrowth(topology, 0.91, out)
  sampleGrowth(topology, p, out)
  assert.equal(JSON.stringify(out), before, 'exact p-q-p including bounds and metadata')
}
for (const invalid of [NaN, Infinity, -Infinity, undefined, '0.5', -1]) {
  sampleGrowth(topology, invalid, out)
  assert.equal(out.progress, 0)
}

// Botanical checks against the sources cited in the README.
const at = days => sampleGrowth(topology, progressAtAge(days), out)
const wood = topology.nodes.filter(n => n.kind === 'wood'), roots = topology.nodes.filter(n => n.kind === 'root')
const tip = i => out.ends.slice(i * 3, i * 3 + 3)
const highestWood = () => Math.max(...wood.map(n => out.growth[n.id] > 0 ? tip(n.id)[1] : -Infinity))
// Seed: ovoid ~12 x 6.5 mm, sown 1-2 cm deep; polyembryony gives ~3 seedlings.
assert.deepEqual([...SEED_SIZE].map(v => v * 2000), [6.5, 12, 4.5])
assert.ok(SEED_DEPTH >= 0.01 && SEED_DEPTH <= 0.02)
at(0)
assert.ok(out.bounds.max.y < 0, 'seed is buried')
assert.equal(wood.filter(n => n.parent < 0).length, 3, 'three embryos, three shoots')
// Radicle first (~day 8-10); hypogeal germination: the shoot emerges ~day 18-25.
at(15)
assert.ok(roots.some(n => out.growth[n.id] > 0) && highestWood() < 0, 'radicle before the shoot breaks the soil')
at(18); assert.ok(highestWood() < 0)
at(30); assert.ok(highestWood() > 0, 'emerged by day 30')
assert.ok(out.seed[0] > 0, 'cotyledons still buried and feeding the seedling')
at(400); assert.equal(out.seed[0], 0); assert.equal(out.seed[1], 0)
// Juvenile seedling: thorny (one ~1.5 cm thorn per leaf axil), ~0.3-0.5 m at one year.
at(365)
assert.ok(highestWood() > 0.3 && highestWood() < 0.5, `one-year height ${highestWood()}`)
assert.ok(topology.thorns.length > 20)
for (const thorn of topology.thorns) assert.ok(thorn.size >= 0.009 && thorn.size <= 0.021)
assert.ok(topology.thorns.every(t => topology.nodes[t.parent].level <= 1), 'thorns only on trunk and main limbs')
// Scaffolds: 3-4 limbs from ~0.5-0.85 m.
const scaffolds = wood.filter(n => n.level === 1 && topology.nodes[n.parent].level === 0)
assert.equal(scaffolds.length, 4)
const restStart = id => { at(3650); return out.starts[id * 3 + 1] }
for (const s of scaffolds) { const y = restStart(s.id); assert.ok(y > 0.45 && y < 0.85, `scaffold height ${y}`) }
// Mature (~10 y): 4.5-6 m tall, similar spread, ~13-17 cm trunk, rounded crown.
at(3650)
const trunkBase = wood.find(n => n.level === 0 && n.parent < 0 && topology.nodes.some(c => c.parent === n.id && c.level === 0))
assert.ok(highestWood() > 4.4 && highestWood() < 6, `mature height ${highestWood()}`)
const trunkDiameter = out.radii[trunkBase.id * 2] * 2
assert.ok(trunkDiameter > 0.13 && trunkDiameter < 0.17, `trunk diameter ${trunkDiameter}`)
const alive = topology.leaves.filter(l => out.leafScales[l.id] > 0)
const spread = Math.max(...alive.map(l => Math.hypot(out.leafPositions[l.id * 3], out.leafPositions[l.id * 3 + 2]))) * 2
assert.ok(spread > 4 && spread < 6, `canopy spread ${spread}`)
assert.ok(alive.length > 7000, `dense mature canopy, ${alive.length} leaves`)
// Leaves live 2-3 years, so the mature foliage sits on the outside of the crown.
const radial = l => Math.hypot(out.leafPositions[l.id * 3], (out.leafPositions[l.id * 3 + 1] - CROWN.y) * CROWN.radius / CROWN.height, out.leafPositions[l.id * 3 + 2])
const outer = alive.filter(l => radial(l) > 1.5).length / alive.length
assert.ok(outer > 0.75, `peripheral foliage ${outer}`)
assert.ok(topology.leaves.filter(l => l.drop < Infinity).every(l => ageAtProgress(l.drop) - ageAtProgress(l.start) >= 399))
// Adult leaves: blade 7-15 cm (85% of the modelled leaf), petiole the rest.
const adult = topology.leaves.filter(l => [2, 3, 4].includes(topology.nodes[l.parent].level))
for (const leaf of adult) assert.ok(leaf.size * 0.85 >= 0.07 && leaf.size * 0.85 <= 0.15)
// Roots: shallow laterals spread past the canopy edge; ~80% of fine roots in the top 40 cm.
const lateralReach = Math.max(...roots.map(n => Math.hypot(tip(n.id)[0], tip(n.id)[2])))
assert.ok(lateralReach > spread / 2, `roots ${lateralReach} reach past the dripline ${spread / 2}`)
const fine = roots.filter(n => n.level === 3)
assert.ok(fine.filter(n => tip(n.id)[1] > -0.4).length / fine.length >= 0.8, 'feeder roots are shallow')
assert.ok(out.bounds.min.y > -2, 'rooting depth within ~1.2-2 m')
console.log(`growth model: ${topology.nodes.length} segments, ${topology.leaves.length} leaves, ${topology.thorns.length} thorns; structure, rewind and botanical ranges passed`)
