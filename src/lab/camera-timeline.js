import { STAGES } from './growth-model.js'

const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

// top is relative to the sticky inset; no travel (or invalid geometry) means start.
export function scrollProgress(top, height, viewport) {
  if (![top, height, viewport].every(Number.isFinite) || viewport <= 0 || height <= viewport) return 0
  return clamp(-top / (height - viewport))
}

// Chapters are evenly spaced on the page; growth stage anchors are not. Map
// scroll piecewise-linearly so every chapter start is exactly its stage anchor.
export function growthProgress(scroll) {
  const p = clamp(scroll), last = STAGES.length - 1
  const i = Math.min(last - 1, Math.floor(p * last))
  const t = p * last - i
  return STAGES[i].progress + (STAGES[i + 1].progress - STAGES[i].progress) * t
}

export function chapterScroll(stage) {
  const index = STAGES.findIndex(item => item.id === stage)
  return index < 0 ? 0 : index / (STAGES.length - 1)
}

export const GROWTH_CAMERA_FOV = 42

// Pure growth-only fit: bounds are the current plant, including conservative wind
// padding, never soil or mature-tree bounds. Vectors match the legacy XYZ contract.
export function sampleGrowthCamera(bounds, progress, aspect, fov = GROWTH_CAMERA_FOV) {
  const axes = ['x', 'y', 'z']
  const valid = axes.every(k => Number.isFinite(bounds?.min?.[k]) && Number.isFinite(bounds?.max?.[k])
    && bounds.max[k] >= bounds.min[k]
    && Number.isFinite(bounds.max[k] - bounds.min[k]))
  const box = valid ? bounds : {
    min: { x: -0.15, y: -0.11, z: -0.15 }, max: { x: 0.15, y: 0.19, z: 0.15 },
  }
  const target = Object.fromEntries(axes.map(k => [k, box.min[k] / 2 + box.max[k] / 2]))
  const half = axes.map(k => Math.max(0.25, box.max[k] - box.min[k]) / 2)
  const p = clamp(progress)
  const azimuth = 0.5 + 0.08 * p * p * (3 - 2 * p)
  const elevation = 0.2
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth)
  const se = Math.sin(elevation), ce = Math.cos(elevation)
  // Orthonormal camera basis, Y-up: backward points from target toward eye.
  const right = [ca, 0, -sa]
  const up = [-sa * se, ce, -ca * se]
  const backward = [sa * ce, se, ca * ce]
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0)
  const safeFov = Number.isFinite(fov) && fov > 0 && fov < 180 ? fov : GROWTH_CAMERA_FOV
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const vertical = Math.tan(safeFov * Math.PI / 360) * 0.78
  const horizontal = vertical * safeAspect
  const near = 0.005
  let distance = 0, maxDepth = 0
  for (let corner = 0; corner < 8; corner++) {
    const offset = half.map((extent, i) => corner & (1 << i) ? extent : -extent)
    const z = dot(offset, backward)
    // Perspective depth is distance-z. Solve both projection inequalities
    // for every corner, rather than using a portrait-hostile bounding sphere.
    distance = Math.max(distance, z + Math.abs(dot(offset, right)) / horizontal,
      z + Math.abs(dot(offset, up)) / vertical, z + near * 2)
    maxDepth = Math.max(maxDepth, -z)
  }
  const position = Object.fromEntries(axes.map((k, i) => [k, target[k] + backward[i] * distance]))
  const far = distance + maxDepth + near * 2
  // Finite inputs can still overflow arithmetic (e.g. a subnormal aspect).
  if (![...Object.values(position), ...Object.values(target), far].every(Number.isFinite)) {
    return sampleGrowthCamera(undefined, p, 1)
  }
  return { position, target, fov: safeFov, near, far }
}
