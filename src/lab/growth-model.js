// Sweet orange (Citrus sinensis) grown from seed, in metres (Y up, soil at Y=0).
// Original procedural geometry; proportions and timing follow the sources listed
// in the README ("Fidelidad botánica"). A morphological model, not a physiological
// simulation: it fixes where and when organs appear, not why.
export const STAGES = Object.freeze([
  { id: 'seed', progress: 0 },
  { id: 'roots', progress: 0.08 },
  { id: 'sprout', progress: 0.18 },
  { id: 'trunk', progress: 0.3 },
  { id: 'branches', progress: 0.45 },
  { id: 'leaves', progress: 0.66 },
  { id: 'flowers', progress: 0.8 },
  { id: 'fruit', progress: 1 },
].map(Object.freeze))

// Plant age at each stage anchor, in days: sowing, radicle, emerged seedling,
// one year, branching juvenile tree, full canopy, first spring bloom (~9 y),
// ripe fruit (10 y).
export const STAGE_AGES = Object.freeze([0, 10, 45, 365, 1300, 3200, 3310, 3650])
export const SEED_DEPTH = 0.015
const GOLDEN = 2.399963 // ~137.5°, spiral (alternate) phyllotaxy
const DAY = 1 // ages are authored in days and converted to progress below
// Mature canopy envelope: ~5 m tall and wide, rounded, skirt down to ~0.2 m.
export const CROWN = Object.freeze({ y: 2.6, radius: 2.5, height: 2.4 })

const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const ramp = (p, start, end) => end > start ? clamp((p - start) / (end - start)) : p >= end ? 1 : 0
export const stageProgress = id => STAGES.find(stage => stage.id === id)?.progress ?? 0

// Ages are interpolated in log(1 + days) between anchors: days matter at the
// seed, years at the canopy, and the scroll stays readable for both.
export function progressAtAge(days) {
  const d = Math.max(0, Math.min(STAGE_AGES.at(-1), Number.isFinite(days) ? days : 0))
  let i = 0
  while (i < STAGE_AGES.length - 2 && d > STAGE_AGES[i + 1]) i++
  const a = Math.log1p(STAGE_AGES[i]), b = Math.log1p(STAGE_AGES[i + 1])
  const t = (Math.log1p(d) - a) / (b - a)
  return STAGES[i].progress + (STAGES[i + 1].progress - STAGES[i].progress) * t
}
export function ageAtProgress(progress) {
  const p = clamp(progress)
  let i = 0
  while (i < STAGES.length - 2 && p > STAGES[i + 1].progress) i++
  const t = (p - STAGES[i].progress) / (STAGES[i + 1].progress - STAGES[i].progress)
  return Math.expm1(Math.log1p(STAGE_AGES[i]) + (Math.log1p(STAGE_AGES[i + 1]) - Math.log1p(STAGE_AGES[i])) * t)
}

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = a => { const l = Math.hypot(...a) || 1; return scale(a, 1 / l) }
function perpendiculars(axis) {
  const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u = unit(cross(axis, helper))
  return [u, cross(axis, u)]
}
// Superellipsoid: rounded top, but fuller sides than an ellipsoid, like a citrus skirt.
export const inCrown = ([x, y, z]) => ((x * x + z * z) / CROWN.radius ** 2) + Math.abs((y - CROWN.y) / CROWN.height) ** 2.6 <= 1

export function createGrowthTopology(seed = 2026) {
  let state = Number.isFinite(seed) ? seed >>> 0 : 2026
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const between = (a, b) => a + (b - a) * random()
  const P = days => progressAtAge(days * DAY)
  const nodes = [], leaves = [], thorns = [], restStart = []
  const origin = [0, -SEED_DEPTH, 0]

  // attach is the normalized rest distance on the parent; 1 continues an axis.
  function segment(parent, attach, kind, level, delta, start, end, base) {
    const id = nodes.length
    const from = parent < 0 ? base : add(restStart[parent], nodes[parent].delta, attach)
    restStart.push(from)
    nodes.push({ id, parent, attach, kind, level, length: Math.hypot(...delta),
      delta: Object.freeze(delta), start, end: Math.max(end, start + 1e-4), next: -1,
      // Green shoots turn to bark over about a year.
      matureAt: P(ageAtProgress(start) + 365),
      origin: Object.freeze(parent < 0 ? base : [0, 0, 0]) })
    if (parent >= 0 && attach === 1) nodes[parent].next = id
    return id
  }
  // A shoot or root axis made of segments that elongate one after another, with
  // tropism bending the direction and an optional crown envelope cut.
  function axis({ parent, attach = 1, base, kind, level, direction, lengths, startDay, endDay,
    tropism = [0, 0, 0], wander = 0, envelope = false }) {
    const ids = []
    let dir = unit(direction), at = parent, fraction = attach
    const total = lengths.reduce((a, b) => a + b, 0)
    let elapsed = 0
    for (const length of lengths) {
      const from = at < 0 ? base : add(restStart[at], nodes[at].delta, fraction)
      let len = length
      if (envelope && !inCrown(add(from, dir, len))) {
        let lo = 0, hi = len
        for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; inCrown(add(from, dir, mid)) ? lo = mid : hi = mid }
        len = lo
        if (len < 0.02) break
      }
      const s = P(startDay + (endDay - startDay) * elapsed / total)
      elapsed += length
      const e = P(startDay + (endDay - startDay) * elapsed / total)
      const id = segment(at, fraction, kind, level, scale(dir, len), s, e, base)
      ids.push(id)
      if (len < length) break
      at = id; fraction = 1
      const [u, v] = perpendiculars(dir)
      const angle = random() * Math.PI * 2
      dir = unit(add(add(dir, tropism), add(scale(u, Math.cos(angle)), v, Math.sin(angle)), wander))
    }
    return ids
  }
  const dayOf = p => ageAtProgress(p)
  // Leaves sit at nodes along the shoot, alternate in a 137.5° spiral, angled
  // out from the stem and drooping slightly. Thorns (juvenile) stand in the axil.
  function foliage(node, count, { lifespan = 900, size = [0.11, 0.17], thorny = false, from = 0.1 } = {}) {
    const n = nodes[node], axisDir = unit(n.delta), [u, v] = perpendiculars(axisDir)
    let phase = random() * Math.PI * 2
    for (let j = 0; j < count; j++) {
      const attach = from + (1 - from) * (j + 0.5) / count
      phase += GOLDEN
      const radial = add(scale(u, Math.cos(phase)), v, Math.sin(phase))
      // Leaves point forward along the shoot (~45°), drooping slightly.
      const direction = unit(add(add(scale(axisDir, 0.8), radial, 0.75), [0, -0.2, 0]))
      const start = n.start + (n.end - n.start) * attach + 1e-4
      const born = dayOf(start)
      // Leaves reach ~80% size within 1-2 months, then live 2-3 years.
      const end = P(born + 45)
      const drop = born + lifespan < STAGE_AGES.at(-1) ? P(born + lifespan) : Infinity
      leaves.push(Object.freeze({ id: leaves.length, parent: node, attach, direction: Object.freeze(direction),
        size: between(size[0], size[1]), start, end: Math.max(end, start + 1e-4),
        drop, dropEnd: drop === Infinity ? Infinity : P(born + lifespan + 30),
        // Young flush leaves are light green; they darken and harden in ~2 months.
        matureAt: P(born + 60) }))
      if (thorny) {
        thorns.push(Object.freeze({ id: thorns.length, parent: node, attach,
          direction: Object.freeze(unit(add(axisDir, radial, 0.55))),
          size: between(0.009, 0.021), start, end: Math.max(P(born + 30), start + 1e-4) }))
      }
    }
  }

  // Polyembryony: sweet orange seeds often hold ~3 embryos (mostly nucellar).
  // All three germinate; the most vigorous becomes the tree, the others stall.
  const seedTop = add(origin, [0, 0.006, 0]), seedBottom = add(origin, [0, -0.006, 0])
  // Radicle first (~day 8), then a taproot that slows to ~0.9 m.
  const taproot = axis({ parent: -1, base: seedBottom, kind: 'root', level: 0, direction: [0.02, -1, 0.01],
    lengths: [0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.2], startDay: 8, endDay: 1800,
    tropism: [0, -0.2, 0], wander: 0.06 })
  // Hypogeal germination: the epicotyl emerges ~day 20 while cotyledons stay buried.
  const heights = [[0.016, 24], [0.035, 36], [0.05, 48], [0.08, 80], [0.13, 130], [0.2, 200], [0.28, 280], [0.35, 365],
    [0.45, 450], [0.55, 540], [0.65, 620], [0.8, 720], [1, 880], [1.3, 1080], [1.6, 1300], [2, 1600], [2.5, 1950], [3, 2300], [3.5, 2650], [3.9, 2950], [4.3, 3200]]
  const trunk = []
  {
    let at = -1, dir = [0, 1, 0], top = seedTop[1], previousDay = 18
    for (const [height, day] of heights) {
      const length = (height - top) / dir[1]
      const id = segment(at, 1, 'wood', 0, scale(dir, length), P(previousDay), P(day), seedTop)
      trunk.push(id)
      // Sympodial flushes: each flush ends and the next starts from a bud, a slight zig-zag.
      const [u, v] = perpendiculars(dir), angle = random() * Math.PI * 2
      dir = unit(add(add([0, 1, 0], u, Math.cos(angle) * 0.07), v, Math.sin(angle) * 0.07))
      top = height; previousDay = day; at = id
    }
  }
  // Juvenile stem: one unifoliate leaf per ~2.5 cm internode, a thorn in each axil.
  // Seedling leaves start small (~3 cm) and reach adult size within the first years.
  for (const [i, id] of trunk.slice(1).entries()) {
    if (i < 13) {
      const grown = Math.min(1, i / 9)
      foliage(id, Math.max(1, Math.round(nodes[id].length / (0.018 + 0.012 * grown))),
        { thorny: true, size: [0.03 + 0.05 * grown, 0.045 + 0.075 * grown] })
    } else foliage(id, 6)
  }
  // The two weaker sibling seedlings: a few centimetres, a few leaves, then they stall.
  for (const [dx, dz, height, last] of [[0.004, 0.003, 0.06, 120], [-0.003, 0.004, 0.03, 90]]) {
    const base = add(seedTop, [dx, 0, dz])
    const ids = axis({ parent: -1, base, kind: 'wood', level: 5, direction: [dx * 12, 1, dz * 12],
      lengths: [0.016, height * 0.5, height * 0.5], startDay: 22, endDay: last, wander: 0.08 })
    foliage(ids[1], 2, { size: [0.025, 0.04], lifespan: 400 })
    axis({ parent: -1, base: add(seedBottom, [dx, 0, dz]), kind: 'root', level: 5, direction: [dx * 20, -1, dz * 20],
      lengths: [0.02, 0.03], startDay: 12, endDay: last, wander: 0.1 })
  }

  // A fibrous root system: from the first weeks the taproot carries many short
  // laterals, branched again, mostly in the top ~30 cm.
  for (const host of taproot.slice(0, 6)) {
    const count = Math.round(nodes[host].length / 0.02)
    for (let j = 0; j < count; j++) {
      const attach = (j + 0.5) / count, a = random() * Math.PI * 2
      const born = dayOf(nodes[host].start + (nodes[host].end - nodes[host].start) * attach) + between(4, 20)
      if (born > 3500) continue
      const deep = restStart[host][1] + nodes[host].delta[1] * attach
      const length = between(0.04, 0.14) * (deep > -0.35 ? 1 : 0.5)
      const lateral = axis({ parent: host, attach, kind: 'root', level: 2,
        direction: [Math.cos(a), between(-0.5, -0.1), Math.sin(a)], lengths: [length * 0.5, length * 0.5],
        startDay: born, endDay: born + between(30, 90), wander: 0.35 })
      for (const id of lateral) {
        if (random() < 0.6) {
          const b = random() * Math.PI * 2, fineStart = dayOf(nodes[id].end) + 10
          axis({ parent: id, attach: between(0.3, 1), kind: 'root', level: 3, direction: [Math.cos(b), between(-0.6, 0.1), Math.sin(b)],
            lengths: [between(0.02, 0.05)], startDay: fineStart, endDay: fineStart + 30, wander: 0.3 })
        }
      }
    }
  }
  // Mature framework: shallow laterals from the root collar (most feeder roots in
  // the top ~25-40 cm) spreading past the canopy edge (~2.5 m), a few sinkers.
  const lateralRoots = []
  for (let j = 0; j < 14; j++) {
    const host = taproot[j % 3]
    const angle = j * GOLDEN + random() * 0.3
    const startDay = 40 + j * 45
    lateralRoots.push(axis({ parent: host, attach: between(0.2, 0.9), kind: 'root', level: 1,
      direction: [Math.cos(angle), -0.06, Math.sin(angle)], lengths: Array(16).fill(between(0.17, 0.21)),
      startDay, endDay: 3500, tropism: [0, 0.02, 0], wander: 0.14 }))
  }
  const fineRoots = (host, count) => {
    for (let f = 0; f < count; f++) {
      const fd = unit(nodes[host].delta), [fu, fv] = perpendiculars(fd), a = random() * Math.PI * 2
      const fineStart = dayOf(nodes[host].end) + between(10, 120)
      if (fineStart > 3580) continue
      axis({ parent: host, attach: between(0.2, 1), kind: 'root', level: 3,
        direction: add(add(add(fd, fu, Math.cos(a) * 1.6), fv, Math.sin(a) * 1.6), [0, -0.3, 0]), lengths: [between(0.04, 0.1)],
        startDay: fineStart, endDay: fineStart + 45, wander: 0.25 })
    }
  }
  for (const [k, lateral] of lateralRoots.entries()) {
    for (const [i, host] of lateral.entries()) {
      fineRoots(host, 1)
      const d = unit(nodes[host].delta), [u] = perpendiculars(d), side = i % 2 ? 1 : -1
      const start = dayOf(nodes[host].end) + between(30, 200)
      if (start > 3400 || !i) continue
      const sub = axis({ parent: host, attach: between(0.3, 0.9), kind: 'root', level: 2,
        direction: add(add(d, u, side * 1.2), [0, -0.05, 0]), lengths: [0.14, 0.13, 0.12],
        startDay: start, endDay: Math.min(3600, start + 600), wander: 0.3 })
      for (const id of sub) fineRoots(id, 2)
    }
    // Sinker roots drop from a few laterals about a metre out.
    if (k % 3 === 0) {
      const host = lateral[Math.min(6, lateral.length - 1)]
      const start = dayOf(nodes[host].end) + 100
      if (start < 3300) {
        axis({ parent: host, attach: 0.7, kind: 'root', level: 2, direction: [0, -1, 0],
          lengths: [0.2, 0.2, 0.2], startDay: start, endDay: Math.min(3600, start + 900), wander: 0.1 })
      }
    }
  }

  // Scaffolds: 3-4 main limbs from ~55-80 cm, leaving at wide angles and curving
  // up to 45-60°; the leader continues within the rounded crown.
  const top = heights.findIndex(([height]) => height >= 0.8)
  const limbs = [trunk.slice(top)]
  const scaffoldHosts = trunk.filter((_, i) => heights[i][0] > 0.55 && heights[i][0] <= 0.8)
  for (let j = 0; j < 4; j++) {
    const host = scaffoldHosts[j % scaffoldHosts.length]
    const angle = j * (Math.PI / 2) + random() * 0.5
    const start = dayOf(nodes[host].end) + 20 + j * 30
    limbs.push(axis({ parent: host, attach: between(0.3, 0.95), kind: 'wood', level: 1,
      direction: [Math.cos(angle), 0.45, Math.sin(angle)], lengths: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.55],
      startDay: start, endDay: 2300, tropism: [0, 0.18, 0], wander: 0.06, envelope: true }))
    // Vigorous young limbs are leafy and thorny too.
    limbs.at(-1).slice(0, 3).forEach((id, k) => foliage(id, Math.round(nodes[id].length / 0.03), { thorny: k < 2 }))
  }
  // Secondary branches, twigs, then the current flush shoots on the outside.
  const outward = id => {
    const p = add(restStart[id], nodes[id].delta, 1)
    return unit([p[0] + 1e-6, 0, p[2]])
  }
  // Secondary branches leave the leader and limbs in every direction, including
  // outward-down for the low skirt; the crown envelope stops them at the surface,
  // so twigs and flushes fill the outside of a dense, rounded canopy.
  // Every shoot tip ends in flushes, including the leader and limbs: no bare tips.
  const twigs = limbs.map(limb => limb.at(-1))
  const turn = (o, a, rise) => unit([o[0] * Math.cos(a) - o[2] * Math.sin(a), rise, o[0] * Math.sin(a) + o[2] * Math.cos(a)])
  // Space-colonization-lite: targets spread evenly over the crown surface; each
  // secondary branch grows from the nearest limb toward one, so no sector of the
  // canopy is left empty.
  const hosts = limbs.flatMap((limb, l) => limb.slice(l ? 1 : 0))
  const uses = new Map()
  const TARGETS = 96, SKIRT = 24
  for (let k = 0; k < TARGETS + SKIRT; k++) {
    // An extra ring of targets keeps the low skirt full, as on an unpruned citrus.
    const y = k < TARGETS ? 1 - 1.85 * (k + 0.5) / TARGETS : -0.25 - 0.5 * (k - TARGETS + 0.5) / SKIRT
    const r = Math.sqrt(1 - y * y), a = k * GOLDEN + (k < TARGETS ? 0 : 0.7)
    const target = [Math.cos(a) * r * CROWN.radius * 0.95, CROWN.y + Math.sign(y) * Math.abs(y) ** (2 / 2.6) * CROWN.height * 0.95, Math.sin(a) * r * CROWN.radius * 0.95]
    let host = -1, best = Infinity
    for (const id of hosts) {
      const p = add(restStart[id], nodes[id].delta, 0.7)
      const d = Math.hypot(...add(target, p, -1)) * (1 + 0.6 * (uses.get(id) ?? 0))
      if (d < best) { best = d; host = id }
    }
    uses.set(host, (uses.get(host) ?? 0) + 1)
    for (let k2 = 0; k2 < 1; k2++) {
      {
        const start = dayOf(nodes[host].end) + between(20, 100)
        if (start > 3400) continue
        const from = add(restStart[host], nodes[host].delta, 0.7)
        const reach = Math.hypot(...add(target, from, -1))
        const dir = unit(add(target, from, -1))
        const low = from[1] < 1.5
        const count = Math.max(1, Math.round(reach / 0.35))
        const branch = axis({ parent: host, attach: 0.7, kind: 'wood', level: 2, direction: dir,
          // Vigorous shoots extend roughly 0.6-0.8 m a year.
          lengths: Array(count).fill(reach / count), startDay: start, endDay: Math.min(3550, start + reach * between(450, 600)),
          tropism: [0, low ? -0.02 : 0.03, 0], wander: 0.1, envelope: true })
        if (branch.length) twigs.push(branch.at(-1))
        for (const segmentId of branch) {
          foliage(segmentId, 6)
          for (let t = 0; t < 1; t++) {
            const twigStart = dayOf(nodes[segmentId].end) + between(30, 120)
            if (twigStart > 3450) continue
            const twig = axis({ parent: segmentId, attach: between(0.3, 1), kind: 'wood', level: 3,
              direction: turn(outward(segmentId), between(-1.5, 1.5), between(-0.45, 0.8)),
              lengths: [0.12, 0.12, 0.12, 0.12], startDay: twigStart, endDay: Math.min(3600, twigStart + between(120, 240)),
              wander: 0.28, envelope: true })
            for (const id of twig) foliage(id, 4)
            if (twig.length) twigs.push(twig.at(-1))
          }
        }
      }
    }
  }
  const lastSeason = []
  // One flush soon after its twig, then the current ones that form the mature
  // outer leaf layer; older leaves fall, so the interior ends up bare.
  for (const host of twigs) {
    for (let f = 0; f < 4; f++) {
      const ready = dayOf(nodes[host].end) + between(30, 120)
      const start = f === 0 ? ready : Math.max(ready, between(2850, 3500))
      if (start > 3590) continue
      const dir = turn(outward(host), between(-1.5, 1.5), between(-0.3, 0.9))
      const shoot = axis({ parent: host, attach: between(0.5, 1), kind: 'wood', level: 4, direction: dir,
        lengths: [between(0.12, 0.28)], startDay: start, endDay: Math.min(3640, start + 30), wander: 0.1, envelope: true })
      // Leaves spread along the flush with ~1.5-3 cm internodes.
      if (shoot.length) foliage(shoot[0], Math.max(4, Math.round(nodes[shoot[0]].length / 0.02)), { from: 0.1 })
      if (shoot.length && start < 3240) lastSeason.push(shoot[0])
    }
  }
  // First bloom (~9 years, after the juvenile phase): one intense spring bloom
  // with the spring flush. Flowers come from leaf axils, singly or in small
  // groups, on leafy flowering shoots of the new flush and leafless ones on last
  // season's wood. The tree carries 60-200k flowers; these are a representative
  // fraction. Under 2% set fruit: most drop as flowers or as fruitlets in the
  // June drop, and ~90% of what stays hangs in the outer canopy.
  const flowers = []
  const BLOOM = 3300
  function flower(node, attach, leafy) {
    const n = nodes[node], axisDir = unit(n.delta), [u, v] = perpendiculars(axisDir), a = random() * Math.PI * 2
    const opens = BLOOM + between(-12, 14)
    flowers.push({ parent: node, attach, leafy,
      direction: unit(add(add(scale(axisDir, 0.7), add(scale(u, Math.cos(a)), v, Math.sin(a)), 0.6), [0, 0.25, 0])),
      size: between(0.04, 0.055), bud: P(opens - 30), open: P(opens), fall: P(opens + between(14, 24)) })
  }
  for (const host of twigs) {
    if (random() < 0.8) {
      const start = between(3260, 3285)
      const shoot = axis({ parent: host, attach: between(0.6, 1), kind: 'wood', level: 4,
        direction: turn(outward(host), between(-1.3, 1.3), between(0, 0.9)), lengths: [between(0.05, 0.12)],
        startDay: start, endDay: start + 25, wander: 0.1, envelope: true })
      if (shoot.length) {
        const leavesOn = Math.max(1, Math.round(nodes[shoot[0]].length / 0.02))
        foliage(shoot[0], leavesOn, { from: 0.1 })
        flower(shoot[0], 1, true)
        for (let k = Math.floor(random() * 4); k > 0; k--) flower(shoot[0], between(0.4, 0.9), true)
      }
    }
    // Leafless inflorescences: 1-6 flowers from axils of last season's wood.
    for (let k = Math.floor(random() * 7); k > 0; k--) flower(host, between(0.5, 1), false)
  }
  // Most bloom sits on the outer shell: last season's flush shoots flower from
  // their axils, so the whole crown surface turns white.
  for (const shoot of lastSeason) {
    if (random() < 0.15) continue
    for (let k = 1 + Math.floor(random() * 4); k > 0; k--) flower(shoot, between(0.45, 1), false)
  }
  // Fruitlets: most flowers start one after petal fall; ~80% of them fall in
  // the June drop. Leafy, single-flower shoots hold their fruit best.
  const fruits = []
  const fruitlets = flowers.map((f, id) => [f, id]).filter(() => random() < 0.7)
  const weight = f => f.leafy && f.attach === 1 ? 3 : f.leafy ? 1.5 : 1
  const mean = fruitlets.reduce((sum, [f]) => sum + weight(f), 0) / fruitlets.length
  for (const [f, id] of fruitlets) {
    const held = random() < 480 / fruitlets.length * weight(f) / mean
    const fallDay = ageAtProgress(f.fall)
    fruits.push(Object.freeze({ flower: id, parent: f.parent, attach: f.attach, retained: held,
      // Stage I (cell division) is slow for ~9 weeks, stage II expands to full size.
      set: f.fall, slow: P(fallDay + 63), full: P(fallDay + between(200, 240)),
      drop: held ? Infinity : P(fallDay + between(25, 70)),
      // Colour break with the cool autumn nights; orange about a month later.
      breakAt: P(between(3560, 3590)), ripe: P(between(3615, 3640)),
      size: between(0.065, 0.09) }))
  }
  // Ordered by emergence, so a renderer can draw only the prefix already born.
  const ordered = leaves.sort((a, b) => a.start - b.start).map((leaf, id) => Object.freeze({ ...leaf, id }))
  return Object.freeze({
    seed, nodes: Object.freeze(nodes.map(Object.freeze)), leaves: Object.freeze(ordered), thorns: Object.freeze(thorns),
    flowers: Object.freeze(flowers.map((f, id) => Object.freeze({ ...f, id, direction: Object.freeze(f.direction) }))),
    fruits: Object.freeze(fruits),
  })
}

export function createGrowthSample(topology) {
  const n = topology.nodes.length, l = topology.leaves.length, t = topology.thorns.length
  const fl = topology.flowers.length, fr = topology.fruits.length
  return {
    progress: 0, stage: 'seed', stageIndex: 0, stageFraction: 0, ageDays: 0, leafCount: 0, flowersDirty: false,
    // XYZ triples; growth is normalized rest-length extension; radii are base/tip pairs.
    starts: new Float64Array(n * 3), ends: new Float64Array(n * 3),
    growth: new Float64Array(n), lengths: new Float64Array(n), radii: new Float64Array(n * 2),
    // 0 = new green tissue, 1 = mature (bark on wood, dark leathery leaves).
    maturity: new Float64Array(n), load: new Float64Array(n),
    leafPositions: new Float64Array(l * 3), leafDirections: new Float64Array(l * 3),
    leafScales: new Float64Array(l), leafMaturity: new Float64Array(l),
    thornPositions: new Float64Array(t * 3), thornDirections: new Float64Array(t * 3), thornScales: new Float64Array(t),
    // Flowers: bud size, then open corolla size; fruits: centre, radius, colour 0 green..1 orange.
    flowerPositions: new Float64Array(fl * 3), flowerDirections: new Float64Array(fl * 3),
    budScales: new Float64Array(fl), flowerScales: new Float64Array(fl),
    fruitPositions: new Float64Array(fr * 3), fruitScales: new Float64Array(fr), fruitColors: new Float64Array(fr),
    // Reserve (cotyledon) and seed-coat fractions, and how far the coat has split.
    seed: new Float64Array(3), seedPosition: new Float64Array([0, -SEED_DEPTH, 0]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  }
}

// Seed: ovoid ~12 x 6.5 x 4.5 mm. Half-extents in metres, Y along the long axis.
export const SEED_SIZE = Object.freeze([0.00325, 0.006, 0.00225])
// Pipe-model thickening: cross-section follows the leaf area (or root length) a
// stem has ever supported, so wood never thins when old leaves drop.
const WOOD_PIPE = 0.075 ** 2 / 56000 // ~15 cm trunk at maturity
const ROOT_PIPE = 0.07 ** 2 / 260 // root collar about as thick as the trunk
// New tissue is ~1.6 mm (shoots) or ~1 mm (roots) across; a year of secondary
// growth adds a few millimetres even before leaf area demands it.
const MIN_WOOD = 0.0008, MIN_ROOT = 0.0005, YEAR_WOOD = 0.0022, YEAR_ROOT = 0.0012

function include(bounds, x, y, z, radius) {
  bounds.min.x = Math.min(bounds.min.x, x - radius)
  bounds.min.y = Math.min(bounds.min.y, y - radius)
  bounds.min.z = Math.min(bounds.min.z, z - radius)
  bounds.max.x = Math.max(bounds.max.x, x + radius)
  bounds.max.y = Math.max(bounds.max.y, y + radius)
  bounds.max.z = Math.max(bounds.max.z, z + radius)
}

// The hot loops read flat typed copies of the (frozen) topology, built once.
const packs = new WeakMap()
function pack(topology) {
  let pk = packs.get(topology)
  if (pk) return pk
  const { nodes, leaves } = topology
  const delta = new Float64Array(nodes.length * 3), origin = new Float64Array(nodes.length * 3)
  nodes.forEach((n, i) => { delta.set(n.delta, i * 3); origin.set(n.origin, i * 3) })
  const leafDir = new Float64Array(leaves.length * 3)
  leaves.forEach((l, i) => leafDir.set(l.direction, i * 3))
  pk = { delta, origin, leafDir, bloom: topology.flowers.reduce((m, f) => Math.min(m, f.bud), 1) }
  packs.set(topology, pk)
  return pk
}

// No integration, topology edits or per-sample arrays/objects. Arbitrary seeks are exact.
export function sampleGrowth(topology, progress, out) {
  const pk = pack(topology)
  const p = clamp(progress)
  out.progress = p
  out.ageDays = ageAtProgress(p)
  let stage = 0
  while (stage < STAGES.length - 1 && p >= STAGES[stage + 1].progress) stage++
  out.stageIndex = stage
  out.stage = STAGES[stage].id
  out.stageFraction = stage === STAGES.length - 1 ? 1 : ramp(p, STAGES[stage].progress, STAGES[stage + 1].progress)
  // The coat splits as the radicle emerges; buried cotyledons feed the seedling
  // for ~2 months and wither; the empty coat decays within the first year.
  out.seed[0] = 1 - ramp(p, progressAtAge(20), progressAtAge(120))
  out.seed[1] = 1 - ramp(p, progressAtAge(90), progressAtAge(365))
  out.seed[2] = ramp(p, progressAtAge(6), progressAtAge(14))
  const seedRadius = SEED_SIZE[1] * Math.max(out.seed[0], out.seed[1] * 1.05)
  out.bounds.min.x = out.bounds.min.z = -seedRadius
  out.bounds.max.x = out.bounds.max.z = seedRadius
  out.bounds.min.y = -SEED_DEPTH - seedRadius
  out.bounds.max.y = -SEED_DEPTH + seedRadius
  const { nodes, leaves, thorns } = topology
  for (const node of nodes) {
    const i = node.id, offset = i * 3
    const support = node.parent < 0 ? 1 : out.growth[node.parent]
    const gate = node.parent < 0 ? 1 : node.attach >= 1 ? (support >= 1 ? 1 : 0)
      : clamp((support - node.attach) / (1 - node.attach))
    const g = Math.min(ramp(p, node.start, node.end), gate)
    out.growth[i] = g
    out.lengths[i] = node.length * g
    out.maturity[i] = g > 0 ? ramp(p, node.start, node.matureAt) : 0
    out.load[i] = node.kind === 'root' ? node.length * g : 0
    const reach = Math.min(support, node.attach), po = node.parent * 3
    for (let axis = 0; axis < 3; axis++) {
      // Hidden buds follow the growing parent tip; once visible the rest anchor is fixed.
      const start = node.parent < 0 ? pk.origin[offset + axis] : out.starts[po + axis] + pk.delta[po + axis] * reach
      out.starts[offset + axis] = start
      out.ends[offset + axis] = start + pk.delta[offset + axis] * g
    }
  }
  // Leaves are sorted by emergence: stop at the first unborn one, and clear
  // whatever a later seek had written beyond it, so any seek order is exact.
  let born = 0
  while (born < leaves.length && p >= leaves[born].start) born++
  for (let i = born; i < out.leafCount; i++) {
    out.leafScales[i] = out.leafMaturity[i] = 0
    for (let axis = 0; axis < 3; axis++) out.leafPositions[i * 3 + axis] = out.leafDirections[i * 3 + axis] = 0
  }
  out.leafCount = born
  for (let k = 0; k < born; k++) {
    const leaf = leaves[k]
    const support = out.growth[leaf.parent], offset = leaf.id * 3
    const grown = Math.min(ramp(p, leaf.start, leaf.end), clamp((support - leaf.attach) / (1 - leaf.attach)))
    // Abscission after the leaf's 2-3 year life; its wood keeps the thickening.
    out.leafScales[leaf.id] = leaf.size * grown * (1 - ramp(p, leaf.drop, leaf.dropEnd))
    out.leafMaturity[leaf.id] = grown > 0 ? ramp(p, leaf.start, leaf.matureAt) : 0
    out.load[leaf.parent] += grown * (leaf.size / 0.11) ** 2
    const reach = Math.min(support, leaf.attach), po = leaf.parent * 3, lo = k * 3
    for (let axis = 0; axis < 3; axis++) {
      out.leafPositions[offset + axis] = out.starts[po + axis] + pk.delta[po + axis] * reach
      out.leafDirections[offset + axis] = pk.leafDir[lo + axis]
    }
  }
  for (const thorn of thorns) {
    const support = out.growth[thorn.parent], offset = thorn.id * 3
    out.thornScales[thorn.id] = thorn.size * Math.min(ramp(p, thorn.start, thorn.end), clamp((support - thorn.attach) / (1 - thorn.attach)))
    for (let axis = 0; axis < 3; axis++) {
      out.thornPositions[offset + axis] = out.starts[thorn.parent * 3 + axis]
        + nodes[thorn.parent].delta[axis] * Math.min(support, thorn.attach)
      out.thornDirections[offset + axis] = thorn.direction[axis]
    }
  }
  // Children always follow parents, so one reverse pass sums distal load.
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].parent >= 0 && nodes[nodes[i].parent].kind === nodes[i].kind) out.load[nodes[i].parent] += out.load[i]
  }
  for (const node of nodes) {
    const i = node.id, g = out.growth[i]
    const root = node.kind === 'root'
    const juvenile = (root ? MIN_ROOT : MIN_WOOD) * Math.min(1, g * 4) + (root ? YEAR_ROOT : YEAR_WOOD) * out.maturity[i] * (node.level <= 1 ? 1 : 0.4)
    out.radii[i * 2] = g > 0 ? Math.max(juvenile, Math.sqrt((root ? ROOT_PIPE : WOOD_PIPE) * out.load[i])) : 0
  }
  for (const node of nodes) {
    const i = node.id, base = out.radii[i * 2]
    // The tip meets the continuing segment, but never thins when that one is newborn.
    const next = node.next >= 0 ? out.radii[node.next * 2] : 0
    out.radii[i * 2 + 1] = Math.min(base, Math.max(next, base * 0.4))
    if (out.growth[i] > 0) {
      const offset = i * 3
      include(out.bounds, out.starts[offset], out.starts[offset + 1], out.starts[offset + 2], base)
      include(out.bounds, out.ends[offset], out.ends[offset + 1], out.ends[offset + 2], base)
    }
  }
  for (const leaf of leaves) {
    const s = out.leafScales[leaf.id], o = leaf.id * 3
    if (s > 0) include(out.bounds, out.leafPositions[o], out.leafPositions[o + 1], out.leafPositions[o + 2], s * 1.1)
  }
  for (const thorn of thorns) {
    const s = out.thornScales[thorn.id], o = thorn.id * 3
    if (s > 0) include(out.bounds, out.thornPositions[o], out.thornPositions[o + 1], out.thornPositions[o + 2], s * 1.1)
  }
  // Bloom and fruit only exist late in the cycle: skip them before, but clear
  // whatever a later seek left, so every seek order stays exact.
  const blooming = topology.flowers.length && p >= pk.bloom
  if (!blooming) {
    if (out.flowersDirty) {
      for (const key of ['flowerPositions', 'flowerDirections', 'budScales', 'flowerScales', 'fruitPositions', 'fruitScales', 'fruitColors']) out[key].fill(0)
      out.flowersDirty = false
    }
    return out
  }
  out.flowersDirty = true
  for (const f of topology.flowers) {
    const support = out.growth[f.parent], o = f.id * 3, born = support >= f.attach ? 1 : 0
    // A bud swells for ~a month, the corolla opens over a few days, petals fall.
    out.budScales[f.id] = born * f.size * 0.3 * ramp(p, f.bud, f.open) * (1 - ramp(p, f.open, f.open + (f.fall - f.open) * 0.3))
    out.flowerScales[f.id] = born * f.size * ramp(p, f.open - (f.fall - f.open) * 0.2, f.open + (f.fall - f.open) * 0.2) * (1 - ramp(p, f.fall - (f.fall - f.open) * 0.15, f.fall))
    const reach = Math.min(support, f.attach), po = f.parent * 3
    for (let axis = 0; axis < 3; axis++) {
      out.flowerPositions[o + axis] = out.starts[po + axis] + pk.delta[po + axis] * reach
      out.flowerDirections[o + axis] = f.direction[axis]
    }
    const s = Math.max(out.budScales[f.id], out.flowerScales[f.id])
    if (s > 0) include(out.bounds, out.flowerPositions[o], out.flowerPositions[o + 1], out.flowerPositions[o + 2], s * 0.6)
  }
  for (let i = 0; i < topology.fruits.length; i++) {
    const fruit = topology.fruits[i], f = topology.flowers[fruit.flower], o = i * 3
    // Stage I slow growth to ~1.5 cm, stage II expansion to full size; dropped
    // fruitlets fall at the abscission zone and are gone.
    const diameter = 0.004 + 0.011 * ramp(p, fruit.set, fruit.slow) + (fruit.size - 0.015) * ramp(p, fruit.slow, fruit.full) ** 0.8
    const r = p >= fruit.set ? diameter / 2 * (1 - ramp(p, fruit.drop, fruit.drop + 0.002)) : 0
    out.fruitScales[i] = r
    out.fruitColors[i] = 0.5 * ramp(p, fruit.breakAt, fruit.ripe) + 0.5 * ramp(p, fruit.ripe, fruit.ripe + 0.004)
    // The fruit hangs below its stem, heavier as it grows.
    out.fruitPositions[o] = out.flowerPositions[f.id * 3]
    out.fruitPositions[o + 1] = out.flowerPositions[f.id * 3 + 1] - r - 0.008 * Math.min(1, r / 0.03)
    out.fruitPositions[o + 2] = out.flowerPositions[f.id * 3 + 2]
    if (r > 0) include(out.bounds, out.fruitPositions[o], out.fruitPositions[o + 1], out.fruitPositions[o + 2], r * 1.05)
  }
  return out
}
