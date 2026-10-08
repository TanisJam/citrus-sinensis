// The cycle's pure timeline, shared by the 3D engine. These are faithful copies
// of the 2D engine's constants and functions (src/engine/engine.js): the page,
// the bands, the sound and the 2D fallback all depend on the SAME p, so the 3D
// engine must read scroll, fold the loop and emit signals exactly the same way.
// tests/test-cycle-timeline.mjs pins these against the 2D source text.
import { STAGES, PROJECTS } from '../engine/engine.js'

export const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v
export const lerp = (a, b, t) => a + (b - a) * t
export const smooth = t => t * t * (3 - 2 * t)

export function key(stops, p, f) {
  if (p <= stops[0][0]) return stops[0][1]
  const n = stops.length
  if (p >= stops[n - 1][0]) return stops[n - 1][1]
  let i = 0; while (i < n - 2 && p > stops[i + 1][0]) i++
  const t = (p - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
  return lerp(stops[i][1], stops[i + 1][1], (f || smooth)(t))
}

// ---- The loop: 0.95-1.00 renders exactly what 0.00-0.05 renders.
export const LOOP_AT = 0.95, LOOP_LEN = 0.05
export const fold = p => Math.round((p >= LOOP_AT ? p - LOOP_AT : p) * 1e9) / 1e9

// ---- Scroll <-> p: weighted, piecewise linear (see the 2D engine for why).
const S_GROW = 0.58, S_END = 0.32
const P_LOOP = 0.05, P_END = 0.79, P_TAIL = 0.95
const GROW_REL = [
  [0.050, 0.135, 0.85], [0.135, 0.250, 0.70], [0.250, 0.300, 1.55], [0.300, 0.400, 0.62],
  [0.400, 0.520, 0.55], [0.520, 0.560, 0.85], [0.560, 0.632, 1.50], [0.632, 0.700, 0.95], [0.700, 0.790, 0.90],
]
const READ_REL = [
  [0.085, 0.165, 1.55], [0.195, 0.262, 1.45], [0.315, 0.400, 1.60], [0.440, 0.510, 1.50], [0.560, 0.622, 1.15],
]
const GROW_SEG = (() => {
  const cuts = new Set()
  for (const g of GROW_REL) { cuts.add(g[0]); cuts.add(g[1]) }
  for (const g of READ_REL) { cuts.add(g[0]); cuts.add(g[1]) }
  const xs = [...cuts].filter(x => x >= P_LOOP && x <= P_END).sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1], m = (a + b) / 2
    let w = 1
    for (const g of GROW_REL) if (m >= g[0] && m < g[1]) w = g[2]
    for (const g of READ_REL) if (m >= g[0] && m < g[1]) w *= g[2]
    out.push([a, b, w])
  }
  return out
})()
const GROW_K = S_GROW / GROW_SEG.reduce((a, g) => a + (g[1] - g[0]) * g[2], 0)
const WSEG = [[0, P_LOOP, 1], ...GROW_SEG.map(g => [g[0], g[1], g[2] * GROW_K]),
  [P_END, P_TAIL, S_END / (P_TAIL - P_END)], [P_TAIL, 1, 1]]
export function sToP(u) {
  let s = u
  for (const g of WSEG) {
    const w = (g[1] - g[0]) * g[2]
    if (s <= w) return g[0] + s / g[2]
    s -= w
  }
  return 1
}
export function pToS(p) {
  let s = 0
  for (const g of WSEG) {
    if (p <= g[0]) break
    s += (Math.min(p, g[1]) - g[0]) * g[2]
  }
  return s
}
// Playback speed cap and debt tolerance (p per second).
export const PMAX = 0.09, PLAG = PMAX

// ---- Stages, ages, labels.
export const stageAt = p => { let s = STAGES[0]; for (const q of STAGES) if (p >= q.p) s = q; return s }
export function ageLabel(d) {
  if (d < 1) return 'day 0'
  if (d < 75) return 'day ' + Math.round(d)
  if (d < 730) return 'month ' + Math.round(d / 30.4)
  const y = d / 365.25
  return 'year ' + (y < 10 ? y.toFixed(1) : Math.round(y))
}
// The 3D tree's own age at each stage, in days (the botanical model in
// src/lab/growth-model.js): seed in the air, buried and swelling, radicle, the
// shoot breaking the soil, flushes, the long juvenile phase, the first bloom at
// ~9 years, June drop, the cool nights that colour the fruit, ripe at ten.
export const AGE_3D = [[0, 0], [0.05, 0], [0.062, 1], [0.135, 8], [0.25, 20], [0.30, 45], [0.40, 365],
  [0.52, 3150], [0.56, 3272], [0.632, 3336], [0.70, 3420], [0.786, 3653], [0.95, 3660]]
export const ageAt = pe => key(AGE_3D, pe, t => t)

// ---- Signals for the sound (same shapes as the 2D engine).
export const SHOOT = [[0.22, 0], [0.25, 0.05], [0.27, 0.10], [0.29, 0.10],
  [0.32, 0.22], [0.335, 0.22], [0.36, 0.34], [0.375, 0.34],
  [0.40, 0.47], [0.42, 0.47], [0.45, 0.60], [0.465, 0.60],
  [0.49, 0.72], [0.505, 0.72], [0.53, 0.84], [0.555, 0.90], [0.62, 0.97], [0.70, 1]]
export const ROOT = [[0.11, 0], [0.16, 0.16], [0.205, 0.30], [0.25, 0.33], [0.27, 0.33],
  [0.30, 0.45], [0.32, 0.45], [0.35, 0.56], [0.37, 0.56],
  [0.40, 0.66], [0.42, 0.66], [0.45, 0.76], [0.47, 0.76],
  [0.50, 0.85], [0.52, 0.85], [0.56, 0.93], [0.63, 0.98], [0.70, 1]]
export const IN_ENTER = [0.812, 0.018], IN_PEEL = [0.836, 0.026], IN_EXIT = [0.856, 0.018]
export const IN_TURN = [0.866, 0.018], IN_BARE = [0.886, 0.024], IN_FAN = [0.916, 0.020]
export const IN_OPEN = [0.936, 0.008], IN_REL = [0.942, 0.008]
export const TAG_ON = 0.884, TAG_OFF = 0.940
export const ramp = (pe, r) => clamp((pe - r[0]) / r[1])
export const imbibeAt = pe => key([[0.05, 1], [0.10, 1.22], [0.17, 1.3]], pe)

export function signals(pe, sig, bud = 0, leaf = 0) {
  sig.root = key(ROOT, pe)
  sig.shoot = key(SHOOT, pe)
  sig.fall = pe < LOOP_LEN ? pe / LOOP_LEN : 1
  sig.imbibe = (imbibeAt(pe) - 1) / 0.3
  sig.bud = bud
  sig.leaf = leaf
  sig.bloom = clamp((pe - 0.550) / 0.030) * (1 - clamp((pe - 0.605) / 0.028))
  sig.enter = ramp(pe, IN_ENTER)
  sig.peel = ramp(pe, IN_PEEL)
  sig.exit = ramp(pe, IN_EXIT)
  sig.turn = ramp(pe, IN_TURN)
  sig.bare = ramp(pe, IN_BARE)
  sig.fan = ramp(pe, IN_FAN)
  sig.open = ramp(pe, IN_OPEN)
  sig.rel = ramp(pe, IN_REL)
  return sig
}

// ---- Day and night: eight nights, densest where the cold colours the fruit,
// flattened while scrolling fast so they never strobe.
export const nightCycles = pe => key([[0.25, 0], [0.52, 2], [0.70, 4], [0.79, 7], [0.95, 8]], pe, t => t)
export const nightAt = (pe, calm = 1) => pe < 0.25 ? 0 : clamp(Math.sin(nightCycles(pe) * 6.283 - 1.4) * 1.5 + 0.25) * calm
export const calmAt = speed => 1 - 0.86 * clamp((speed - 0.030) / 0.130)
// How far the ripe colour has come, following the count of cold nights.
export const orangeAt = pe => pe < 0.685 ? 0.03 : clamp(0.06 + (Math.floor(nightCycles(pe)) - 3) / 3)

// ---- Colour.
const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const o2 = n => { n = n < 0 ? 0 : n > 255 ? 255 : Math.round(n); return (n < 16 ? '0' : '') + n.toString(16) }
export function mixH(a, b, t) {
  const A = hx(a), B = hx(b)
  return '#' + o2(lerp(A[0], B[0], t)) + o2(lerp(A[1], B[1], t)) + o2(lerp(A[2], B[2], t))
}
export const accentAt = (fruit, orange) => mixH('#6E9247', PROJECTS[fruit].hue, orange)

// ---- Per-lap choice: each lap shows another project, and the segment steps
// by two so the (project, segment) pair does not repeat until the long lap.
export function nextChoice(fruit, gajo, ideas) {
  const carried = ideas[PROJECTS[fruit].gajos[gajo].seeds[0]]
  const next = (fruit + 1) % PROJECTS.length
  return { carried, fruit: next, gajo: (gajo + 2) % PROJECTS[next].gajos.length }
}

// ---- Band visibility, as the 2D engine writes it.
export function bandAlpha(b, pe) {
  const sp = b.to - b.from, fd = Math.min(0.026, sp * 0.32)
  return Math.min(smooth(clamp((pe - b.from) / fd)), 1 - smooth(clamp((pe - (b.to - fd)) / fd)))
}
// The label fades over the loop cut and returns on the other side.
export const labelAlpha = pe => Math.min(clamp(pe / 0.022), 1 - clamp((pe - 0.928) / 0.020))
// How far the interior phase has come: in with the fruit's entry, out to
// exactly zero at the loop cut, where the frame is the next lap's first.
export const interiorAt = pe => pe > IN_ENTER[0] ? ramp(pe, IN_ENTER) * (1 - clamp((pe - 0.930) / 0.020)) : 0
