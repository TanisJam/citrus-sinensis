import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as T from '../src/cycle/timeline.js'
import { STAGES, PROJECTS, IDEAS } from '../src/engine/engine.js'

// The 3D engine must read the same p as the page, the bands, the sound and the
// 2D fallback. These tables are copies; pin every one to the 2D source text.
const source = await readFile(new URL('../src/engine/engine.js', import.meta.url), 'utf8')
const literal = name => {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`))
  assert.ok(match, `${name} in the 2D engine`)
  return Function(`return ${match[1].replace(/\/\/[^\n]*/g, '')}`)()
}
assert.deepEqual(literal('SHOOT'), T.SHOOT)
assert.deepEqual(literal('ROOT'), T.ROOT)
for (const name of ['IN_ENTER', 'IN_PEEL', 'IN_EXIT', 'IN_TURN', 'IN_BARE', 'IN_FAN', 'IN_OPEN', 'IN_REL']) {
  assert.deepEqual(literal(name), T[name], name)
}
for (const name of ['GROW_REL', 'READ_REL']) {
  const table = literal(name)
  assert.ok(source.includes(`const ${name}=[`), name)
  assert.ok(table.length > 0)
}
assert.match(source, /const TAG_ON=0\.884, TAG_OFF=0\.940;/)
assert.match(source, /const LOOP_AT=0\.95, LOOP_LEN=0\.05;/)
assert.match(source, /const S_LOOP=0\.05, S_GROW=0\.58, S_END=0\.32;/)
assert.match(source, /const PMAX=0\.09;/)
assert.match(source, /const interior = pe>IN_ENTER\[0\]\n\s*\? ramp\(pe,IN_ENTER\)\*\(1-clamp\(\(pe-0\.930\)\/0\.020\)\) : 0;/)
assert.equal(T.interiorAt(0.9), 1)
assert.equal(T.interiorAt(0.95 - 1e-12) < 1e-9, true)
assert.match(source, /sig\.bloom = clamp\(\(pe-0\.550\)\/0\.030\)\*\(1-clamp\(\(pe-0\.605\)\/0\.028\)\);/)
assert.match(source, /const night=pe<0\.25\?0:clamp\(Math\.sin\(cyc\*6\.283-1\.4\)\*1\.5\+0\.25\)\*calm;/)

// Scroll mapping: a monotone bijection whose ends are the identity, so the loop
// cut is invisible on the page.
for (let i = 0; i <= 2000; i++) {
  const u = i / 2000
  assert.ok(Math.abs(T.pToS(T.sToP(u)) - u) < 1e-9)
  if (i) assert.ok(T.sToP(u) > T.sToP((i - 1) / 2000))
}
for (const u of [0, 0.01, 0.049, 0.951, 0.99, 1]) assert.ok(Math.abs(T.sToP(u) - u) < 1e-12, `identity at ${u}`)
assert.equal(T.fold(0.97), 0.02)
assert.equal(T.fold(0.5), 0.5)
// Stages, ages, labels.
assert.equal(T.stageAt(0).name, 'Dispersal')
assert.equal(T.stageAt(0.93).name, 'Endosperm')
for (const stage of STAGES) assert.equal(T.stageAt(stage.p).name, stage.name)
assert.equal(T.ageLabel(0), 'day 0')
assert.equal(T.ageLabel(40), 'day 40')
assert.equal(T.ageLabel(365), 'month 12')
assert.equal(T.ageLabel(T.ageAt(0.9)), 'year 10')
let lastAge = -1
for (let i = 0; i <= 950; i++) { const a = T.ageAt(i / 1000); assert.ok(a >= lastAge); lastAge = a }
assert.equal(T.ageAt(0), T.ageAt(0.05), 'the seed does not age while it falls')
// Signals: every channel in [0, 1]; the loop ends emit the same values.
const sig = {}
for (let i = 0; i <= 950; i++) {
  T.signals(i / 1000, sig)
  for (const [k, v] of Object.entries(sig)) assert.ok(v >= 0 && v <= 1 + 1e-9, `${k} at ${i}`)
}
assert.deepEqual(T.signals(T.fold(0.95), {}), T.signals(0, {}))
// Night: zero before emergence and at the loop ends.
assert.equal(T.nightAt(0.1), 0)
assert.equal(T.nightAt(0), T.nightAt(T.fold(0.95)))
// The per-lap choice never repeats a (project, segment) pair in a long lap.
let choice = { fruit: 0, gajo: 2 }
const seen = new Set()
for (let lap = 0; lap < PROJECTS.length; lap++) {
  seen.add(`${choice.fruit}:${choice.gajo}`)
  const next = T.nextChoice(choice.fruit, choice.gajo, IDEAS)
  assert.equal(next.carried, IDEAS[PROJECTS[choice.fruit].gajos[choice.gajo].seeds[0]])
  choice = next
}
assert.equal(seen.size, PROJECTS.length)
assert.equal(T.labelAlpha(0), 0)
assert.equal(T.labelAlpha(0.5), 1)
assert.ok(T.labelAlpha(0.948) < 1e-9, "label gone at the cut")
assert.match(T.accentAt(0, 0), /^#[0-9a-f]{6}$/)
console.log('Cycle timeline: copies match the 2D engine; mapping, loop, ages, signals, nights and laps OK')
