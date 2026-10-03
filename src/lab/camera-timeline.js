const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

// top is relative to the sticky inset; no travel (or invalid geometry) means start.
export function scrollProgress(top, height, viewport) {
  if (![top, height, viewport].every(Number.isFinite) || viewport <= 0 || height <= viewport) return 0
  return clamp(-top / (height - viewport))
}

export function stageProgress(stage) {
  return { trunk: 0, canopy: 0.5, whole: 1 }[stage] ?? 0
}

export function sampleCamera(progress, bounds, fov, aspect) {
  const p = clamp(progress)
  const size = Object.fromEntries(['x', 'y', 'z'].map(k => [k, bounds.max[k] - bounds.min[k]]))
  const center = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (bounds.min[k] + bounds.max[k]) / 2]))
  const radius = Math.hypot(size.x, size.y, size.z) / 2
  const vertical = (Number.isFinite(fov) && fov > 0 && fov < 180 ? fov : 38) * Math.PI / 360
  const limiting = Math.min(vertical, Math.atan(Math.tan(vertical) * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)))
  // Anatomy fractions are art direction for this mature zelkova, not growth rules.
  const anchors = [
    { fraction: 0.25, radius: radius * 0.27, direction: [0.45, 0.08, 1] },
    { fraction: 0.72, radius: radius * 0.62, direction: [-0.45, 0.12, 1] },
    { fraction: 0.5, radius, direction: [0.85, 0.32, 1] },
  ].map(({ fraction, radius: focusRadius, direction }) => {
    const target = { ...center, y: bounds.min.y + size.y * fraction }
    const distance = focusRadius / Math.sin(limiting) * 1.12
    const length = Math.hypot(...direction)
    const position = Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, target[k] + direction[i] / length * distance]))
    return { target, position }
  })
  const segment = p < 0.5 ? 0 : 1
  const t = (p - segment * 0.5) * 2
  const eased = t * t * (3 - 2 * t)
  const result = { stage: p < 0.25 ? 'trunk' : p < 0.75 ? 'canopy' : 'whole' }
  for (const key of ['position', 'target']) {
    result[key] = Object.fromEntries(['x', 'y', 'z'].map(k => [k,
      anchors[segment][key][k] + (anchors[segment + 1][key][k] - anchors[segment][key][k]) * eased,
    ]))
  }
  return result
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
